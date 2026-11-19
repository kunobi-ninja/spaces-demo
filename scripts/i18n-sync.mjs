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
 * of a text whose source changed) and import the same list with `text` translated. An import
 * writes only the keys in the file, so a file may cover part of the work; keys that point at
 * nothing are dropped from the files it writes. A translation whose placeholders or shape do not
 * match its source is left out and reported, so the page keeps its own text there. Names and
 * terms that stay as written are in `i18n-glossary.json`.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { LANGUAGES, compareLocale, extractPage, findPages, hash, readLocales, renderIndex, renderLocale, samePlaceholders } from './i18n.mjs'

/** Why `text` cannot stand for `source` (the text of `key`), or undefined when it can. */
export function problem(key, source, text) {
  if (Array.isArray(source) !== Array.isArray(text)) return Array.isArray(source) ? 'expected a list' : 'expected a string'
  if (Array.isArray(text) && (text.length !== source.length || !text.every((item) => typeof item === 'string'))) return `expected a list of ${source.length} strings`
  if (!Array.isArray(text) && (typeof text !== 'string' || !text.trim())) return 'empty'
  if (!samePlaceholders(key, source, text)) return 'placeholders differ'
  return undefined
}

/** What every page is missing or has stale in `langs`: `[{ page, lang, key, text, previous? }]`. */
export async function exportTodo(repo, { langs = LANGUAGES, pages } = {}) {
  const items = []
  for (const page of pages ?? (await findPages(repo))) {
    const extracted = await extractPage(repo, page)
    if (extracted.errors.length) continue
    const locales = await readLocales(repo, extracted.dir)
    for (const lang of langs) {
      if (lang === extracted.source || locales[lang]?.errors.length) continue
      const entries = locales[lang]?.entries ?? {}
      const state = compareLocale(extracted.texts, entries)
      for (const key of [...state.missing, ...state.stale]) {
        items.push({ page, lang, key, text: extracted.texts.get(key), ...(entries[key] && { previous: entries[key].text }) })
      }
    }
  }
  return items
}

/**
 * Writes the translations in `answers` (`[{ page, lang, key, text }]`) into their pages' locale
 * files, each with the hash of its current source text. Keys not in `answers` stay as they are.
 * Returns `{ written, skipped }`, `skipped` naming each answer left out and why.
 */
export async function importAnswers(repo, answers, { log = () => {} } = {}) {
  let written = 0
  const skipped = []
  for (const [page, pageAnswers] of Map.groupBy(answers, (answer) => answer.page)) {
    const extracted = await extractPage(repo, page)
    if (extracted.errors.length) {
      skipped.push(...pageAnswers.map(({ lang, key }) => `${page} ${lang} ${key} (${extracted.errors[0]})`))
      continue
    }
    const locales = await readLocales(repo, extracted.dir)
    let added = false
    for (const [lang, langAnswers] of Map.groupBy(pageAnswers, (answer) => answer.lang)) {
      const file = locales[lang]
      const unusable = lang === extracted.source ? `the page is written in ${lang}` : file?.errors[0]
      if (unusable) {
        skipped.push(...langAnswers.map(({ key }) => `${page} ${lang} ${key} (${unusable})`))
        continue
      }
      const entries = { ...(file?.entries ?? {}) }
      for (const key of compareLocale(extracted.texts, entries).orphans) delete entries[key]
      let count = 0
      for (const { key, text } of langAnswers) {
        const source = extracted.texts.get(key)
        const why = source === undefined ? 'points at nothing' : problem(key, source, text)
        if (why) skipped.push(`${page} ${lang} ${key} (${why})`)
        else {
          entries[key] = { text, from: hash(source) }
          count++
        }
      }
      written += count
      log(`${page} ${lang}: ${count} imported`)
      if (!count && !file) continue
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
  return { written, skipped }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { export: { type: 'string' }, import: { type: 'string' }, page: { type: 'string', multiple: true } } })
  const repo = resolve(import.meta.dirname, '..')
  if (values.export) {
    const items = await exportTodo(repo, { langs: values.export.split(',').map((lang) => lang.trim()), pages: values.page })
    process.stdout.write(`${JSON.stringify(items, null, 1)}\n`)
    console.error(`${items.length} texts to translate.`)
  } else if (values.import) {
    const answers = JSON.parse(await readFile(values.import, 'utf8'))
    // Only languages Kunobi speaks and pages that exist: the file decides nothing else, such as a path.
    const known = new Set(await findPages(repo))
    const unknown = answers.filter((item) => !LANGUAGES.includes(item.lang) || !known.has(item.page))
    if (unknown.length) throw new Error(`${unknown.length} items name an unknown language or page, e.g. ${JSON.stringify(unknown[0].lang)} ${JSON.stringify(unknown[0].page)}`)
    const { written, skipped } = await importAnswers(repo, answers, { log: (line) => console.log(line) })
    for (const line of skipped) console.log(`skipped ${line}`)
    console.log(`${written} texts imported, ${skipped.length} skipped.`)
    if (skipped.length) process.exitCode = 1
  } else {
    console.error('Usage: node scripts/i18n-sync.mjs --export <lang[,lang]> [--page <page>] | --import <file>')
    process.exitCode = 2
  }
}
