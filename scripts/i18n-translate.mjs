#!/usr/bin/env node
/**
 * Fills in missing and stale translations: for every page and every language Kunobi speaks
 * (`LANGUAGES`, except the page's own), it sends only the texts without an up-to-date translation
 * to Claude, with the page's title and description and the glossary (`i18n-glossary.json`), and
 * writes the answers to the page's `locales/<lang>.json` (and `locales/index.ts`). Keys that point
 * at nothing are dropped. A translation whose placeholders or shape do not match its source is
 * left out and reported, so the page keeps its own text there.
 *
 *   ANTHROPIC_API_KEY=… node scripts/i18n-translate.mjs [--lang es,fr] [--page trip/index.mdx] [--dry-run]
 *
 * The Translate workflow runs it after each merge to main and opens a pull request for review.
 */

import Anthropic from '@anthropic-ai/sdk'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { LANGUAGES, compareLocale, extractPage, findPages, hash, readLocales, renderIndex, renderLocale } from './i18n.mjs'

export const MODEL = 'claude-sonnet-5-5'
/** Roughly how much source text one request carries. */
const BATCH_CHARS = 12000
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g

const LANGUAGE_NAMES = { en: 'English', es: 'Spanish', pt: 'Portuguese', it: 'Italian', fr: 'French', de: 'German', ja: 'Japanese', ko: 'Korean', 'zh-Hans': 'Simplified Chinese' }
const languageName = (lang) => LANGUAGE_NAMES[lang] ?? lang

/** The texts to send, split so no request carries much more than `BATCH_CHARS`. */
export function batches(items, limit = BATCH_CHARS) {
  const out = []
  let current = []
  let size = 0
  for (const item of items) {
    const length = JSON.stringify(item.text).length
    if (current.length && size + length > limit) {
      out.push(current)
      current = []
      size = 0
    }
    current.push(item)
    size += length
  }
  if (current.length) out.push(current)
  return out
}

const placeholders = (text) => [...[text].flat().join('\n').matchAll(PLACEHOLDER)].map((match) => match[1]).sort().join(',')

/** Why `text` cannot stand for `source`, or undefined when it can. */
export function problem(source, text) {
  if (Array.isArray(source) !== Array.isArray(text)) return Array.isArray(source) ? 'expected a list' : 'expected a string'
  if (Array.isArray(text) && (text.length !== source.length || !text.every((item) => typeof item === 'string'))) return `expected a list of ${source.length} strings`
  if (!Array.isArray(text) && (typeof text !== 'string' || !text.trim())) return 'empty'
  if (placeholders(source) !== placeholders(text)) return 'placeholders differ'
  return undefined
}

/**
 * Brings every page's locales up to date. `translate({ page, title, description, source, target,
 * items })` returns `[{ key, text }]` for the `items` (`{ key, text, previous? }`) it was given.
 * Returns what changed: `[{ page, lang, written, skipped }]`.
 */
export async function translateRepo(repo, { translate, langs = LANGUAGES, pages, dryRun = false, log = () => {} }) {
  const report = []
  for (const page of pages ?? (await findPages(repo))) {
    const extracted = await extractPage(repo, page)
    if (extracted.errors.length) {
      log(`${page}: skipped, ${extracted.errors[0]}`)
      continue
    }
    const locales = await readLocales(repo, extracted.dir)
    let added = false
    for (const lang of langs) {
      if (lang === extracted.source) continue
      const file = locales[lang]
      if (file?.errors.length) {
        log(`${page} ${lang}: skipped, ${file.errors[0]}`)
        continue
      }
      const entries = { ...(file?.entries ?? {}) }
      const state = compareLocale(extracted.texts, entries)
      const todo = [...state.missing, ...state.stale].map((key) => ({ key, text: extracted.texts.get(key), ...(entries[key] && { previous: entries[key].text }) }))
      if (!todo.length && !state.orphans.length) continue
      for (const key of state.orphans) delete entries[key]
      const skipped = []
      let written = 0
      for (const items of batches(todo)) {
        if (dryRun) break
        const answers = await translate({ page, title: extracted.title, description: extracted.description, source: extracted.source, target: lang, items })
        const byKey = new Map(answers.map((answer) => [answer.key, answer.text]))
        for (const item of items) {
          const text = byKey.get(item.key)
          const why = text === undefined ? 'no answer' : problem(item.text, text)
          if (why) skipped.push(`${item.key} (${why})`)
          else {
            entries[item.key] = { text, from: hash(item.text) }
            written++
          }
        }
      }
      log(`${page} ${lang}: ${dryRun ? `${todo.length} to translate` : `${written} translated`}${state.orphans.length ? `, ${state.orphans.length} dropped` : ''}${skipped.length ? `, skipped ${skipped.join(', ')}` : ''}`)
      report.push({ page, lang, todo: todo.length, written, skipped })
      if (dryRun || (!Object.keys(entries).length && !file)) continue
      await mkdir(join(repo, extracted.dir), { recursive: true })
      await writeFile(join(repo, extracted.dir, `${lang}.json`), renderLocale(extracted.texts, entries))
      if (!file) {
        locales[lang] = { entries, errors: [] }
        added = true
      }
    }
    const indexPath = join(repo, extracted.dir, 'index.ts')
    const imported = (await readFile(join(repo, page), 'utf8')).includes('locales/index')
    if (added && (imported || existsSync(indexPath))) {
      await writeFile(indexPath, renderIndex(extracted.source, Object.keys(locales).filter((lang) => lang !== extracted.source).sort()))
    }
  }
  return report
}

/** The instructions for one page and language. */
export function systemPrompt({ page, title, description, source, target }, glossary) {
  return [
    `You translate the text of an interactive page in Kunobi Spaces from ${languageName(source)} (${source}) into ${languageName(target)} (${target}).`,
    `The page is "${title ?? page}" (${page}): ${description ?? ''}`,
    'Each item is one piece of the page: an interface label or sentence (words.*), the page title, description or the prompts people copy to their AI (meta.*), text from the page\'s data such as names of things, notes and descriptions (data.*), or a whole Markdown document (doc.*). Translate each item on its own but keep terms consistent across items. When an item has a `previous` translation, its source changed: update that translation, keeping what still fits.',
    'A text that is a list stays a list with the same number of entries. A key ending in _one, _other (or another plural category) is that plural form of the same text.',
    `Rules:\n${glossary.rules.map((rule) => `- ${rule}`).join('\n')}`,
    `Write these exactly as they are: ${glossary.keep.join(', ')}.`,
    'Answer with every key you were given and its translation.',
  ].join('\n\n')
}

const SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          text: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        },
        required: ['key', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
}

/** A `translate` function backed by the Anthropic API. */
export function claudeTranslator({ client = new Anthropic(), glossary, model = MODEL }) {
  return async (request) => {
    const message = await client.beta.messages
      .stream({
        model,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        system: systemPrompt(request, glossary),
        messages: [{ role: 'user', content: JSON.stringify(request.items.map(({ key, text, previous }) => ({ key, text, ...(previous !== undefined && { previous }) })), null, 1) }],
      })
      .finalMessage()
    if (message.stop_reason === 'refusal') throw new Error(`${request.page} ${request.target}: the model declined (${message.stop_details?.category ?? 'no category'})`)
    if (message.stop_reason === 'max_tokens') throw new Error(`${request.page} ${request.target}: the answer was cut off`)
    const text = message.content.find((block) => block.type === 'text')?.text
    if (!text) throw new Error(`${request.page} ${request.target}: no answer`)
    return JSON.parse(text).translations
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { lang: { type: 'string' }, page: { type: 'string', multiple: true }, 'dry-run': { type: 'boolean', default: false } } })
  const repo = resolve(import.meta.dirname, '..')
  const glossary = JSON.parse(await readFile(join(repo, 'i18n-glossary.json'), 'utf8'))
  const langs = values.lang ? values.lang.split(',').map((lang) => lang.trim()) : LANGUAGES
  const dryRun = values['dry-run']
  const translate = dryRun ? async () => [] : claudeTranslator({ glossary })
  const report = await translateRepo(repo, { translate, langs, pages: values.page, dryRun, log: (line) => console.log(line) })
  const written = report.reduce((sum, entry) => sum + entry.written, 0)
  const skipped = report.reduce((sum, entry) => sum + entry.skipped.length, 0)
  console.log(dryRun ? `${report.reduce((sum, entry) => sum + entry.todo, 0)} texts to translate.` : `${written} texts translated, ${skipped} skipped.`)
}
