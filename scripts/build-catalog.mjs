#!/usr/bin/env node
/**
 * Builds the catalog Kunobi reads: every page demo, the gallery's picks
 * (`gallery.json`, in its order) first and marked `gallery`, then the other
 * pages the root `index.mdx` lists (`EXAMPLES`, in its order; timelines, the
 * `*.mdx/` folders, are left out). Each demo is its entry page, every file in
 * its folder, the LiveStores its front matter names (with their view and
 * starting data) and the Fontsource CSS it imports (Latin only, font inlined).
 * A demo written in another language than English says so in `lang`
 * (front matter `lang`); its `translations` carry its title, description and
 * prompts per language, from the page's `locales/<lang>.json` (`meta.*`). A demo
 * imports nothing from outside its folder, as "Make this mine" copies only the
 * folder: the shared `lib/i18n.ts` lives in it as a copy, which must equal the
 * original (`npm run sync:lib`).
 * `home` is the root `index.mdx` with the files it imports. Every file is
 * written once to `<out>/objects/<sha256>`; `<out>/catalog.json` lists them.
 *
 *   node scripts/build-catalog.mjs --out out --release v2026.11.12
 */

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, posix as posixPath, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { parse as parseYaml } from 'yaml'
import { localeDir, readLocales } from './i18n.mjs'
import { copies, SHARED } from './sync-lib.mjs'

export const CATALOG_VERSION = 1
/** The most a gallery pick may weigh, cover included: the app downloads these ahead. */
export const DEMO_SIZE_CAP = 10 * 1024 * 1024
/** The most any other demo may weigh: the app downloads it when opened, and compiles under 32 MiB. */
export const PAGE_SIZE_CAP = 32 * 1024 * 1024
/** The oldest app that can run these demos. */
const MIN_APP_VERSION = '2.0.0'

const SKIPPED = [/\.DS_Store$/, /\.status\.json$/]
const SCRIPT = /\.(tsx?|jsx?)$/
const FONT_IMPORT = /['"](@fontsource\/[a-z0-9-]+\/[a-z0-9-]+\.css)['"]/g
const RELATIVE_IMPORT = /(?:from|import)\s+['"](\.{1,2}\/[^'"]+)['"]/g
/** How an import without an extension resolves, in order. */
const IMPORT_SUFFIXES = ['', '.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mdx', '.json', '/index.ts', '/index.tsx', '/index.js']
const EXAMPLE = /\{\s*id:\s*'([^']+)',\s*href:\s*'([^']+)'/g

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const posix = (path) => path.split(sep).join('/')

async function walk(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await walk(path)))
    else if (!SKIPPED.some((skip) => skip.test(entry.name))) found.push(path)
  }
  return found
}

function frontMatter(source, id) {
  const match = source.match(/^---\n([\s\S]*?)\n---/)
  if (!match) throw new Error(`${id}: the entry page has no front matter`)
  return parseYaml(match[1]) ?? {}
}

/**
 * A demo's `translations` from its locale files: `{ es: { title, description, prompts? } }`, for
 * each language whose file translates the title and description; undefined when none does.
 */
async function readTranslations(repo, entry, id) {
  const out = {}
  for (const [lang, { entries, errors }] of Object.entries(await readLocales(repo, localeDir(entry)))) {
    if (errors.length) throw new Error(`${id}: ${errors[0]}`)
    const title = entries['meta.title']?.text
    const description = entries['meta.description']?.text
    if (typeof title !== 'string' || typeof description !== 'string') continue
    out[lang] = { title, description }
    if (Array.isArray(entries['meta.prompts']?.text)) out[lang].prompts = entries['meta.prompts'].text.map(String)
  }
  return Object.keys(out).length ? out : undefined
}

/** `code` without its comments; strings, which may hold `/*` or `//`, are kept whole. */
export function stripComments(code) {
  let out = ''
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const start = i
      for (i++; i < code.length && code[i] !== ch && (ch === '`' || code[i] !== '\n'); i++) if (code[i] === '\\') i++
      out += code.slice(start, i + 1)
    } else if (ch === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i)
      i = end < 0 ? code.length : end - 1
    } else if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      i = end < 0 ? code.length : end + 1
    } else out += ch
  }
  return out
}

/**
 * The code of the file at `path` that can import: a script whole, and of an MDX page only its ESM
 * blocks (paragraphs starting with `import` or `export`, outside code fences), without comments.
 * Markdown and the page's prose import nothing, whatever they quote.
 */
export function importingCode(path, text) {
  if (SCRIPT.test(path)) return stripComments(text)
  if (!path.endsWith('.mdx')) return ''
  const blocks = []
  let fence = null
  let block = null
  for (const line of text.split(/\r?\n/)) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1]
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null
    } else if (marker) {
      fence = marker
      block = null
    } else if (!line.trim()) block = null
    else if (block) block.push(line)
    else if (/^(import|export)\b/.test(line)) blocks.push((block = [line]))
  }
  return blocks.map((lines) => stripComments(lines.join('\n'))).join('\n')
}

/** Where `specifier`, imported from `from`, lives (repository-relative), or undefined. */
async function resolveImport(repo, from, specifier) {
  const path = posixPath.normalize(posixPath.join(posixPath.dirname(from), specifier))
  for (const suffix of IMPORT_SUFFIXES) {
    if ((await stat(join(repo, path + suffix)).catch(() => null))?.isFile()) return path + suffix
  }
  return undefined
}

/** Adds to `contents` every file its sources import from outside them, and what those import. */
async function addImports(repo, contents) {
  const pending = [...contents.keys()]
  while (pending.length) {
    const path = pending.pop()
    for (const [, specifier] of importingCode(path, contents.get(path).toString('utf8')).matchAll(RELATIVE_IMPORT)) {
      const target = await resolveImport(repo, path, specifier.replace(/\?raw$/, ''))
      if (!target) throw new Error(`${path}: ${specifier} is imported but missing`)
      if (contents.has(target)) continue
      contents.set(target, await readFile(join(repo, target)))
      pending.push(target)
    }
  }
}

/** One `@fontsource/<family>/<weight>.css`, keeping its Latin face with the woff2 inlined. */
async function fontCss(repo, specifier) {
  const [, family, file] = specifier.split('/')
  const dir = join(repo, 'node_modules', '@fontsource', family)
  const css = await readFile(join(dir, file), 'utf8').catch(() => {
    throw new Error(`${specifier} is not installed: add @fontsource/${family} to package.json`)
  })
  const weight = file.replace(/\.css$/, '')
  const marker = `/* ${family}-latin-${weight}-normal */`
  const start = css.indexOf(marker)
  if (start < 0) throw new Error(`${specifier} has no Latin face`)
  const block = css.slice(start + marker.length, css.indexOf('}', start) + 1)
  const woff2 = block.match(/url\(\.\/(files\/[^)]+\.woff2)\)/)?.[1]
  if (!woff2) throw new Error(`${specifier} has no woff2 file`)
  const data = (await readFile(join(dir, woff2))).toString('base64')
  const face = block.replace(/src:[^;]+;/, `src: url(data:font/woff2;base64,${data}) format('woff2');`)
  return `/* ${family} ${weight}, Latin subset, from @fontsource/${family} (SIL Open Font License 1.1). */\n${face.trim()}\n`
}

/** The Fontsource CSS the sources among `contents` import, added to it. */
async function addFonts(repo, contents) {
  const fonts = new Set()
  for (const [path, bytes] of contents) {
    for (const match of importingCode(path, bytes.toString('utf8')).matchAll(FONT_IMPORT)) fonts.add(match[1])
  }
  for (const specifier of [...fonts].sort()) contents.set(specifier, Buffer.from(await fontCss(repo, specifier)))
}

function recorder(objects) {
  return (path, bytes) => {
    const hash = sha256(bytes)
    objects.set(hash, bytes)
    return { path, sha256: hash, size: bytes.length }
  }
}

/** The demos to build, in catalog order: `{ id, entry, gallery }`. */
async function listDemos(repo) {
  const picks = JSON.parse(await readFile(join(repo, 'gallery.json'), 'utf8'))
  if (!Array.isArray(picks) || picks.length === 0) throw new Error('gallery.json must list at least one demo id')
  const demos = picks.map((id) => ({ id, entry: `${id}/index.mdx`, gallery: true }))
  const index = await readFile(join(repo, 'index.mdx'), 'utf8')
  for (const [, id, href] of index.matchAll(EXAMPLE)) {
    if (demos.some((demo) => demo.id === id) || href.endsWith('.mdx/')) continue
    demos.push({ id, entry: href.endsWith('/') ? `${href}index.mdx` : href, gallery: false })
  }
  return demos
}

async function buildDemo(repo, { id, entry, gallery }, objects) {
  const folder = join(repo, dirname(entry))
  const entryPath = join(repo, entry)
  if (!entry.endsWith('.mdx') || dirname(entry).endsWith('.mdx') || !(await stat(entryPath).catch(() => null))?.isFile()) {
    throw new Error(`${id}: not a page (a demo is a folder with an index.mdx, or an .mdx page in one)`)
  }
  const entrySource = await readFile(entryPath, 'utf8')
  const meta = frontMatter(entrySource, id)
  for (const field of ['title', 'description']) {
    if (typeof meta[field] !== 'string' || !meta[field]) throw new Error(`${id}: front matter needs a ${field}`)
  }
  const prompts = meta.prompts ?? []
  if (!Array.isArray(prompts) || (gallery && prompts.length === 0)) throw new Error(`${id}: front matter needs prompts`)
  if (meta.translations !== undefined) throw new Error(`${id}: front matter translations moved to ${localeDir(entry)}/<lang>.json`)
  const lang = meta.lang ?? 'en'
  if (typeof lang !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) throw new Error(`${id}: lang must be a language tag`)
  const translations = await readTranslations(repo, entry, id)

  /** Repository-relative path → bytes. */
  const contents = new Map()
  for (const path of await walk(folder)) contents.set(posix(relative(repo, path)), await readFile(path))

  for (const store of meta.kunobi?.stores ?? []) {
    const storePath = `.kunobi/stores/${store}/store.json`
    const storeBytes = await readFile(join(repo, storePath)).catch(() => {
      throw new Error(`${id}: store ${store} has no ${storePath}`)
    })
    contents.set(storePath, storeBytes)
    const definition = JSON.parse(storeBytes.toString('utf8'))
    for (const key of ['view', 'data', 'types']) {
      const path = definition[key]
      if (typeof path === 'string' && !contents.has(path)) contents.set(path, await readFile(join(repo, path)))
    }
  }

  await addImports(repo, contents)
  await addFonts(repo, contents)
  const own = posix(relative(repo, folder))
  for (const path of contents.keys()) {
    if (path.startsWith(`${own}/`) || path.startsWith('.kunobi/') || path.startsWith('@fontsource/')) continue
    const fix = path === SHARED ? `: import its copy, ./lib/i18n (npm run sync:lib -- ${own})` : ': move it into the folder'
    throw new Error(`${id}: ${path} is outside the demo's folder, and "Make this mine" copies only the folder${fix}`)
  }

  const coverPath = `assets/covers/${id}.jpg`
  const cover = await readFile(join(repo, coverPath)).catch(() => {
    throw new Error(`${id}: no cover at ${coverPath}`)
  })

  const record = recorder(objects)
  const files = [...contents.keys()].sort().map((path) => record(path, contents.get(path)))
  const coverFile = record(coverPath, cover)

  const size = files.reduce((sum, file) => sum + file.size, coverFile.size)
  const cap = gallery ? DEMO_SIZE_CAP : PAGE_SIZE_CAP
  if (size > cap) throw new Error(`${id}: ${size} bytes is over the ${cap} byte cap`)

  return {
    id,
    name: meta.title,
    title: meta.title,
    description: meta.description,
    prompts: prompts.map(String),
    ...(lang !== 'en' && { lang }),
    ...(translations && { translations }),
    entry,
    gallery,
    cover: coverFile,
    files,
    minAppVersion: MIN_APP_VERSION,
  }
}

/** The root `index.mdx` and every file it reaches through relative imports, with its fonts. */
async function buildHome(repo, objects) {
  const contents = new Map([['index.mdx', await readFile(join(repo, 'index.mdx'))]])
  await addImports(repo, contents)
  await addFonts(repo, contents)
  const record = recorder(objects)
  return { entry: 'index.mdx', files: [...contents.keys()].sort().map((path) => record(path, contents.get(path))) }
}

export async function buildCatalog({ repo, out, release }) {
  const original = await readFile(join(repo, SHARED))
  for (const folder of await copies(repo)) {
    if (!original.equals(await readFile(join(repo, folder, SHARED)))) {
      throw new Error(`${folder}/${SHARED} differs from ${SHARED}: edit the original and run npm run sync:lib`)
    }
  }
  const objects = new Map()
  const demos = []
  for (const demo of await listDemos(repo)) demos.push(await buildDemo(repo, demo, objects))
  const catalog = { version: CATALOG_VERSION, release, home: await buildHome(repo, objects), demos }

  await rm(out, { recursive: true, force: true })
  await mkdir(join(out, 'objects'), { recursive: true })
  for (const [hash, bytes] of objects) await writeFile(join(out, 'objects', hash), bytes)
  await writeFile(join(out, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`)
  return catalog
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { out: { type: 'string', default: 'out' }, release: { type: 'string' } } })
  if (!values.release) {
    console.error('Usage: node scripts/build-catalog.mjs --out out --release <tag>')
    process.exit(2)
  }
  const repo = resolve(import.meta.dirname, '..')
  const catalog = await buildCatalog({ repo, out: resolve(values.out), release: values.release })
  console.log(`Built ${catalog.demos.length} demos for ${catalog.release} into ${values.out}`)
}
