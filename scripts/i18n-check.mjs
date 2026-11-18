#!/usr/bin/env node
/**
 * Reports, for every page and every language Kunobi speaks, which translations are missing and
 * which are stale (their source text changed since). Missing and stale translations never fail:
 * pages fall back to their own language, and the maintainers translate them by hand (scripts/i18n-sync.mjs). It fails only
 * on what is broken: a locale file that does not parse or has the wrong shape, a key that points
 * at nothing, a `locales/index.ts` that does not list the locale files, or a page whose
 * translatable text cannot be read (WORDS, `i18n.data`, `i18n.docs`).
 *
 *   node scripts/i18n-check.mjs              # report; exit 1 on errors
 *   node scripts/i18n-check.mjs --fix        # also drop keys that point at nothing and rewrite locales/index.ts
 *   node scripts/i18n-check.mjs --markdown report.md
 *
 * In GitHub Actions the report is also the job summary.
 */

import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { LANGUAGES, compareLocale, extractPage, findPages, readLocales, renderIndex, renderLocale } from './i18n.mjs'

/** Every page's state: `[{ page, source, errors, warnings, langs: { lang: { missing, stale } } }]`. */
export async function checkRepo(repo, { fix = false } = {}) {
  const results = []
  for (const page of await findPages(repo)) {
    const extracted = await extractPage(repo, page)
    const errors = [...extracted.errors]
    const warnings = []
    const locales = await readLocales(repo, extracted.dir)
    const langs = {}
    for (const [lang, { entries, errors: fileErrors }] of Object.entries(locales)) {
      errors.push(...fileErrors.map((error) => `${extracted.dir}/${error}`))
      if (lang === extracted.source) errors.push(`${extracted.dir}/${lang}.json: the page is written in ${lang}; it needs no translation into it`)
      const state = compareLocale(extracted.texts, entries)
      errors.push(...state.invalid.map((error) => `${extracted.dir}/${lang}.json: ${error}`))
      warnings.push(...state.warnings.map((warning) => `${extracted.dir}/${lang}.json: ${warning}`))
      if (state.orphans.length && fix && !extracted.errors.length) {
        for (const key of state.orphans) delete entries[key]
        await writeFile(join(repo, extracted.dir, `${lang}.json`), renderLocale(extracted.texts, entries))
      } else {
        errors.push(...state.orphans.map((key) => `${extracted.dir}/${lang}.json: "${key}" points at nothing in ${page}`))
      }
      langs[lang] = { missing: state.missing, stale: state.stale }
    }
    for (const lang of LANGUAGES) {
      if (lang !== extracted.source && !langs[lang]) langs[lang] = { missing: [...extracted.texts.keys()], stale: [] }
    }

    const indexPath = join(repo, extracted.dir, 'index.ts')
    const imported = (await readFile(join(repo, page), 'utf8')).includes('locales/index')
    if (imported || existsSync(indexPath)) {
      const want = renderIndex(extracted.source, Object.keys(locales).filter((lang) => lang !== extracted.source))
      const have = existsSync(indexPath) ? await readFile(indexPath, 'utf8') : ''
      if (have !== want) {
        if (fix) await writeFile(indexPath, want)
        else errors.push(`${extracted.dir}/index.ts does not list the page's locale files: run node scripts/i18n-check.mjs --fix`)
      }
    }
    results.push({ page, source: extracted.source, total: extracted.texts.size, errors, warnings, langs })
  }
  return results
}

const MAX_KEYS = 12
const list = (keys) => (keys.length > MAX_KEYS ? `${keys.slice(0, MAX_KEYS).join(', ')} and ${keys.length - MAX_KEYS} more` : keys.join(', '))

/** The report as Markdown. */
export function renderReport(results) {
  const errors = results.flatMap((result) => result.errors.map((error) => `- \`${result.page}\`: ${error}`))
  const warnings = results.flatMap((result) => result.warnings.map((warning) => `- \`${result.page}\`: ${warning}`))
  const lines = ['## Translations', '']
  if (errors.length) lines.push(`**${errors.length} to fix** (these fail the check):`, '', ...errors, '')
  lines.push('Missing or stale translations never block a pull request: the page shows its own language, and the maintainers translate it after merge.', '')
  lines.push(`| Page | Written in | ${LANGUAGES.join(' | ')} |`, `| --- | --- | ${LANGUAGES.map(() => '---').join(' | ')} |`)
  for (const result of results) {
    const cells = LANGUAGES.map((lang) => {
      if (lang === result.source) return '·'
      const state = result.langs[lang]
      if (!state.missing.length && !state.stale.length) return '✓'
      return [state.missing.length && `${state.missing.length} missing`, state.stale.length && `${state.stale.length} stale`].filter(Boolean).join(', ')
    })
    lines.push(`| \`${result.page}\` | ${result.source} | ${cells.join(' | ')} |`)
  }
  const details = results.flatMap((result) =>
    Object.entries(result.langs)
      .filter(([, state]) => state.missing.length < result.total && (state.missing.length || state.stale.length))
      .map(([lang, state]) => `- \`${result.page}\` ${lang}: ${[state.missing.length && `missing ${list(state.missing)}`, state.stale.length && `stale ${list(state.stale)}`].filter(Boolean).join('; ')}`)
  )
  if (details.length) lines.push('', '<details><summary>Partly translated</summary>', '', ...details, '', '</details>')
  if (warnings.length) lines.push('', '<details><summary>Worth a look</summary>', '', ...warnings, '', '</details>')
  return `${lines.join('\n')}\n`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { fix: { type: 'boolean', default: false }, markdown: { type: 'string' } } })
  const repo = resolve(import.meta.dirname, '..')
  const results = await checkRepo(repo, { fix: values.fix })
  const report = renderReport(results)
  console.log(report)
  if (values.markdown) await writeFile(values.markdown, report)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report)
  const failed = results.reduce((sum, result) => sum + result.errors.length, 0)
  if (failed) {
    console.error(`${failed} translation ${failed === 1 ? 'problem' : 'problems'} to fix (listed above).`)
    process.exit(1)
  }
}
