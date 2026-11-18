/**
 * The translatable text of every page and its translations, shared by the catalog builder,
 * `i18n-check.mjs` and `i18n-translate.mjs`. The page side is `lib/i18n.ts`; CONTRIBUTING.md
 * ("Languages") describes the files.
 *
 * A page is an `.mdx` file with front matter. It is written in one language (`lang`, default `en`)
 * and its translations are `locales/<lang>.json` in the page's folder (see `localeDir`), each
 * mapping a key to `{ text, from }`: the translated text and the hash of the source text it was
 * translated from (`hash`). Keys:
 *   meta.title, meta.description, meta.prompts   the front matter
 *   words.<key>                                   the page's `export const WORDS = { … }`
 *   data.<name><path>                             fields of data/<name>.json (or a store's
 *                                                 data/<name>.start.json) the front matter's
 *                                                 `i18n.data` declares translatable
 *   doc.<path>                                    a text file the front matter's `i18n.docs` lists
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join, posix } from 'node:path'
import vm from 'node:vm'
import { parse as parseYaml } from 'yaml'

/** The languages Kunobi's interface speaks; each page is translated into all of them but its own. */
export const LANGUAGES = ['en', 'es', 'pt', 'it', 'fr', 'de', 'ja', 'ko', 'zh-Hans']
export const DEFAULT_LANG = 'en'

const LANG_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/
const PLURAL = /_(zero|one|two|few|many|other)$/
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'out'])

/** The 8-hex-digit hash a translation records of the source text it came from. */
export const hash = (text) => createHash('sha1').update(JSON.stringify(text)).digest('hex').slice(0, 8)

/** Every page in `repo`, as repository-relative paths, sorted. */
export async function findPages(repo) {
  const pages = []
  const visit = async (dir) => {
    for (const entry of await readdir(join(repo, dir), { withFileTypes: true })) {
      if (SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      const path = dir ? `${dir}/${entry.name}` : entry.name
      if (entry.isDirectory()) await visit(path)
      else if (entry.name.endsWith('.mdx') && (await readFile(join(repo, path), 'utf8')).startsWith('---\n')) pages.push(path)
    }
  }
  await visit('')
  return pages.sort()
}

/**
 * Where a page's translations live: `<dir>/locales` for `<dir>/index.mdx` and for the files of a
 * timeline (`<name>.mdx/`), `<dir>/<name>/locales` for any other page `<dir>/<name>.mdx`.
 */
export function localeDir(page) {
  const dir = posix.dirname(page)
  const prefix = dir === '.' ? '' : `${dir}/`
  if (posix.basename(page) === 'index.mdx' || dir.endsWith('.mdx')) return `${prefix}locales`
  return `${prefix}${posix.basename(page, '.mdx')}/locales`
}

export function frontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/)
  return match ? (parseYaml(match[1]) ?? {}) : {}
}

/** The source text of the object literal after `export const <name> =` in `source`, or undefined. */
export function objectLiteral(source, name) {
  const start = source.search(new RegExp(`export const ${name}\\s*=\\s*\\{`))
  if (start < 0) return undefined
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const ch = source[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i++; i < source.length && source[i] !== ch; i++) if (source[i] === '\\') i++
    } else if (ch === '/' && source[i + 1] === '/') i = source.indexOf('\n', i)
    else if (ch === '/' && source[i + 1] === '*') i = source.indexOf('*/', i) + 1
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return source.slice(open, i + 1)
  }
  throw new Error(`export const ${name} is not closed`)
}

/** `{ a: { b: 'x' }, c: ['y'] }` → `[['a.b', 'x'], ['c', ['y']]]`; texts are strings or lists of strings. */
export function flattenWords(words, prefix = '') {
  const out = []
  for (const [key, value] of Object.entries(words)) {
    if (key.includes('.') || key.includes('[')) throw new Error(`WORDS key "${prefix}${key}" may not contain "." or "["`)
    if (typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'))) out.push([`${prefix}${key}`, value])
    else if (value && typeof value === 'object' && !Array.isArray(value)) out.push(...flattenWords(value, `${prefix}${key}.`))
    else throw new Error(`WORDS.${prefix}${key} must be a string, a list of strings or a group of them (put logic in the page, words in WORDS)`)
  }
  return out
}

/** One path segment: `{ key }`, `{ row }` (a list row by `id`, or by position when rows have none) or a `*` wildcard. */
export function parsePath(path) {
  const segments = []
  let rest = path
  while (rest) {
    const match = rest.match(/^\.?([^.[\]]+)/) ?? rest.match(/^\[([^\]]*)\]/)
    if (!match) throw new Error(`cannot read the path "${path}"`)
    segments.push(match[0].startsWith('[') ? { row: match[1] } : { key: match[1] })
    rest = rest.slice(match[0].length)
  }
  return segments
}

/** The index `[row]` picks in `list`: the row whose `id` is `row`, or position `row` when rows have no `id`. */
export function rowIndex(list, row) {
  const byId = list.some((item) => item && typeof item === 'object' && 'id' in item)
  if (byId) return list.findIndex((item) => item && typeof item === 'object' && String(item.id) === row)
  const index = Number(row)
  return Number.isInteger(index) && index >= 0 && index < list.length ? index : -1
}

/** The row selector of `list[index]`: its `id`, or its position when rows have none. */
const rowOf = (list, index) => {
  const byId = list.some((item) => item && typeof item === 'object' && 'id' in item)
  return byId ? String(list[index]?.id) : String(index)
}

const isText = (value) => (typeof value === 'string' && value.trim() !== '') || (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string'))

/**
 * The texts a declared pattern selects in `value`, as `[path, text]`: `*` (or `[*]`) matches every
 * key of an object and every row of a list. Missing fields under a wildcard are skipped.
 */
export function expandPattern(value, pattern) {
  const found = []
  if (pattern === '**') {
    const all = (node, path) => {
      if (isText(node)) found.push([path, node])
      else if (Array.isArray(node)) node.forEach((item, index) => all(item, `${path}[${rowOf(node, index)}]`))
      else if (node && typeof node === 'object') for (const key of Object.keys(node)) all(node[key], `${path}.${key}`)
    }
    all(value, '')
    return found
  }
  const walk = (node, segments, path) => {
    if (segments.length === 0) {
      if (isText(node)) found.push([path, node])
      else if (node !== undefined && node !== '' && node !== null) throw new Error(`"${path || pattern}" is not text (a string or a list of strings)`)
      return
    }
    const [head, ...rest] = segments
    const wildcard = head.key === '*' || head.row === '*'
    if (Array.isArray(node)) {
      if (wildcard) node.forEach((item, index) => walk(item, rest, `${path}[${rowOf(node, index)}]`))
      else if (head.row !== undefined) {
        const index = rowIndex(node, head.row)
        if (index >= 0) walk(node[index], rest, `${path}[${head.row}]`)
      }
    } else if (node && typeof node === 'object') {
      if (wildcard) for (const key of Object.keys(node)) walk(node[key], rest, `${path}.${key}`)
      else if (head.key !== undefined && head.key in node) walk(node[head.key], rest, `${path}.${head.key}`)
    }
  }
  walk(value, parsePath(pattern), '')
  return found
}

/** The data file a declared name reads, relative to the page's folder: a store's start, else the file. */
export function dataFile(repo, page, name) {
  const dir = posix.dirname(page)
  for (const file of [`data/${name}.start.json`, `data/${name}.json`]) {
    const path = dir === '.' ? file : `${dir}/${file}`
    if (existsSync(join(repo, path))) return path
  }
  return undefined
}

/**
 * A page's source language and its translatable texts, in page order:
 * `{ page, dir, source, title, description, texts: Map<key, text>, errors: string[] }`.
 */
export async function extractPage(repo, page) {
  const content = await readFile(join(repo, page), 'utf8')
  const meta = frontMatter(content)
  const errors = []
  const texts = new Map()
  const source = meta.lang ?? DEFAULT_LANG
  if (typeof source !== 'string' || !LANG_TAG.test(source)) errors.push(`lang "${source}" is not a language tag`)
  for (const field of ['title', 'description']) if (isText(meta[field])) texts.set(`meta.${field}`, meta[field])
  if (Array.isArray(meta.prompts) && meta.prompts.length) texts.set('meta.prompts', meta.prompts.map(String))
  if (meta.translations !== undefined) errors.push('front matter `translations` is replaced by locales/<lang>.json (meta.title, meta.description, meta.prompts)')

  try {
    const literal = objectLiteral(content, 'WORDS')
    if (literal !== undefined) {
      const words = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 })
      for (const [key, text] of flattenWords(words)) texts.set(`words.${key}`, text)
    }
  } catch (error) {
    errors.push(`WORDS: ${error.message} (WORDS must be a plain object of strings)`)
  }

  const i18n = meta.i18n ?? {}
  for (const [name, patterns] of Object.entries(i18n.data ?? {})) {
    const file = dataFile(repo, page, name)
    if (!file) {
      errors.push(`i18n.data.${name}: no data/${name}.json or data/${name}.start.json next to the page`)
      continue
    }
    if (!Array.isArray(patterns)) {
      errors.push(`i18n.data.${name} must be a list of paths`)
      continue
    }
    const value = JSON.parse(await readFile(join(repo, file), 'utf8'))
    const selected = new Map()
    for (const pattern of patterns) {
      try {
        const found = expandPattern(value, String(pattern))
        if (found.length === 0) errors.push(`i18n.data.${name}: "${pattern}" selects no text in ${file}`)
        for (const [path, text] of found) selected.set(path, text)
      } catch (error) {
        errors.push(`i18n.data.${name}: ${error.message} in ${file}`)
      }
    }
    // In the file's order, so a row's fields stay together.
    for (const path of expandPattern(value, '**').map(([path]) => path)) {
      if (selected.has(path)) texts.set(`data.${name}${path}`, selected.get(path))
    }
  }
  for (const doc of i18n.docs ?? []) {
    const dir = posix.dirname(page)
    const path = dir === '.' ? doc : `${dir}/${doc}`
    if (!existsSync(join(repo, path))) errors.push(`i18n.docs: ${doc} does not exist`)
    else texts.set(`doc.${doc}`, await readFile(join(repo, path), 'utf8'))
  }
  return { page, dir: localeDir(page), source, title: meta.title, description: meta.description, texts, errors }
}

/** The texts a key may hold: a source key, or another plural form of a source plural (`x_few` for `x_other`). */
function sourceOf(texts, key) {
  if (texts.has(key)) return texts.get(key)
  const plural = key.match(PLURAL)
  if (plural && texts.has(`${key.slice(0, -plural[0].length)}_other`)) return texts.get(`${key.slice(0, -plural[0].length)}_other`)
  return undefined
}

const placeholders = (text) => [...[text].flat().join('\n').matchAll(PLACEHOLDER)].map((match) => match[1]).sort().join(',')

/** Reads `<dir>/<lang>.json` for every language present: `{ lang: { entries, errors } }`. */
export async function readLocales(repo, dir) {
  const locales = {}
  const files = existsSync(join(repo, dir)) ? await readdir(join(repo, dir)) : []
  for (const file of files.filter((name) => name.endsWith('.json')).sort()) {
    const lang = basename(file, '.json')
    const errors = []
    let entries = {}
    if (!LANG_TAG.test(lang)) errors.push(`${file}: "${lang}" is not a language tag`)
    try {
      entries = JSON.parse(await readFile(join(repo, dir, file), 'utf8'))
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('must be an object of keys')
      for (const [key, entry] of Object.entries(entries)) {
        const ok = entry && typeof entry === 'object' && typeof entry.from === 'string' && (typeof entry.text === 'string' || (Array.isArray(entry.text) && entry.text.every((item) => typeof item === 'string')))
        if (!ok) errors.push(`${file}: ${key} must be { "text": string or list of strings, "from": hash }`)
      }
    } catch (error) {
      errors.push(`${file}: ${error.message}`)
      entries = {}
    }
    locales[lang] = { entries, errors }
  }
  return locales
}

/**
 * How a locale stands against its page: `missing` and `stale` keys (still usable), `orphans` (keys
 * that point at nothing) and `invalid` entries (wrong shape against the source: errors), and
 * `warnings` (placeholders that differ).
 */
export function compareLocale(texts, entries) {
  const result = { missing: [], stale: [], orphans: [], invalid: [], warnings: [] }
  for (const [key, text] of texts) {
    const entry = entries[key]
    if (!entry) result.missing.push(key)
    else if (entry.from !== hash(text)) result.stale.push(key)
  }
  for (const [key, entry] of Object.entries(entries)) {
    const text = sourceOf(texts, key)
    if (text === undefined) {
      result.orphans.push(key)
      continue
    }
    if (Array.isArray(text) !== Array.isArray(entry.text)) result.invalid.push(`${key}: the source is ${Array.isArray(text) ? 'a list' : 'a string'}`)
    else if (placeholders(text) !== placeholders(entry.text)) result.warnings.push(`${key}: placeholders differ from the source ({{${placeholders(text)}}})`)
  }
  return result
}

/** The `locales/index.ts` a page imports: its source language and one import per locale file. */
export function renderIndex(source, langs) {
  const ident = (lang) => lang.replace(/-(\w)/g, (_, ch) => ch.toUpperCase())
  const imports = langs.map((lang) => `import ${ident(lang)} from './${lang}.json'\n`).join('')
  const map = langs.map((lang) => (ident(lang) === lang ? lang : `'${lang}': ${ident(lang)}`)).join(', ')
  return `// This page's translations, one import per locale file (scripts/i18n-check.mjs --fix rewrites it).\n${imports}${imports ? '\n' : ''}export default { source: '${source}', locales: { ${map} } }\n`
}

/** A locale file's text: one entry per line, in the page's order (unknown keys last). */
export function renderLocale(texts, entries) {
  const order = [...texts.keys()]
  const keys = Object.keys(entries).sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || a.localeCompare(b)
  })
  const text = (value) => (Array.isArray(value) ? `[${value.map((item) => JSON.stringify(item)).join(', ')}]` : JSON.stringify(value))
  const line = (key) => `  ${JSON.stringify(key)}: { "text": ${text(entries[key].text)}, "from": ${JSON.stringify(entries[key].from)} }`
  return keys.length ? `{\n${keys.map(line).join(',\n')}\n}\n` : '{}\n'
}
