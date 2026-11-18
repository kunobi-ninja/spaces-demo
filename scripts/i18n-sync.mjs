#!/usr/bin/env node
/**
 * Translating by hand: exports what each page is missing (or has stale) in a language, and imports
 * the translations back into the pages' `locales/<lang>.json` (and `locales/index.ts`).
 *
 *   node scripts/i18n-sync.mjs --export fr [--page trip/index.mdx] > fr.todo.json
 *   node scripts/i18n-sync.mjs --import fr.done.json
 *
 * The exported file is a list of `{ page, lang, key, text, previous? }`: translate each `text`
 * (keep `{{placeholders}}`, lists stay lists of the same length; `previous` is the old translation
 * of a text whose source changed) and import the same list with `text` translated. Keys that point
 * at nothing are dropped. A translation whose placeholders or shape do not match its source is left
 * out and reported, so the page keeps its own text there. Names and terms that stay as written are
 * in `i18n-glossary.json`.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { LANGUAGES, compareLocale, extractPage, findPages, hash, readLocales, renderIndex, renderLocale } from './i18n.mjs'

/** Roughly how much source text one batch carries. */
const BATCH_CHARS = 12000
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g


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
 * items })` returns `[{ key, text }]` for the `items` (`{ key, text, previous? }`) it was given:
 * for an import, the translations read from a file. Returns what changed:
 * `[{ page, lang, todo, items, written, skipped }]` (`items` only on a dry run, for an export).
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
      report.push({ page, lang, todo: todo.length, ...(dryRun && { items: todo }), written, skipped })
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


if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { export: { type: 'string' }, import: { type: 'string' }, page: { type: 'string', multiple: true } } })
  const repo = resolve(import.meta.dirname, '..')
  if (values.export) {
    const report = await translateRepo(repo, { translate: async () => [], langs: values.export.split(',').map((lang) => lang.trim()), pages: values.page, dryRun: true })
    const items = report.flatMap(({ page, lang, items: todo }) => todo.map((item) => ({ page, lang, ...item })))
    process.stdout.write(`${JSON.stringify(items, null, 1)}\n`)
    console.error(`${items.length} texts to translate.`)
  } else if (values.import) {
    const done = JSON.parse(await readFile(values.import, 'utf8'))
    const answers = new Map(done.map((item) => [`${item.page}\u0000${item.lang}\u0000${item.key}`, item.text]))
    const langs = [...new Set(done.map((item) => item.lang))]
    const pages = [...new Set(done.map((item) => item.page))]
    const translate = async ({ page, target, items }) =>
      items.flatMap((item) => {
        const text = answers.get(`${page}\u0000${target}\u0000${item.key}`)
        return text === undefined ? [] : [{ key: item.key, text }]
      })
    const report = await translateRepo(repo, { translate, langs, pages, log: (line) => console.log(line) })
    const written = report.reduce((sum, entry) => sum + entry.written, 0)
    const skipped = report.reduce((sum, entry) => sum + entry.skipped.length, 0)
    console.log(`${written} texts imported, ${skipped} skipped.`)
    if (skipped) process.exitCode = 1
  } else {
    console.error('Usage: node scripts/i18n-sync.mjs --export <lang[,lang]> [--page <page>] | --import <file>')
    process.exitCode = 2
  }
}
