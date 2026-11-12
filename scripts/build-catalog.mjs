#!/usr/bin/env node
/**
 * Builds the catalog Kunobi's gallery reads: the demos named in `gallery.json`,
 * each as its entry page, every file in its folder, the LiveStores its front
 * matter names (with their view and starting data) and the Fontsource CSS it
 * imports (Latin only, font inlined). Every file is written once to
 * `<out>/objects/<sha256>`; `<out>/catalog.json` lists them.
 *
 *   node scripts/build-catalog.mjs --out out --release v2026.11.12
 */

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { parse as parseYaml } from 'yaml'

export const CATALOG_VERSION = 1
/** The most one demo may weigh, cover included. */
export const DEMO_SIZE_CAP = 10 * 1024 * 1024
/** The oldest app that can run these demos. */
const MIN_APP_VERSION = '2.0.0'

const SKIPPED = [/\.DS_Store$/, /\.status\.json$/]
const SOURCE = /\.(mdx|md|tsx?|jsx?)$/
const FONT_IMPORT = /['"](@fontsource\/[a-z0-9-]+\/[a-z0-9-]+\.css)['"]/g

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

async function buildDemo(repo, id, objects) {
  const folder = join(repo, id)
  const entryPath = join(folder, 'index.mdx')
  if (id.endsWith('.mdx') || !(await stat(entryPath).catch(() => null))?.isFile()) {
    throw new Error(`${id}: not a page (a gallery demo is a folder with an index.mdx)`)
  }
  const entrySource = await readFile(entryPath, 'utf8')
  const meta = frontMatter(entrySource, id)
  for (const field of ['title', 'description']) {
    if (typeof meta[field] !== 'string' || !meta[field]) throw new Error(`${id}: front matter needs a ${field}`)
  }
  if (!Array.isArray(meta.prompts) || meta.prompts.length === 0) throw new Error(`${id}: front matter needs prompts`)

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

  const fonts = new Set()
  for (const [path, bytes] of contents) {
    if (!SOURCE.test(path)) continue
    for (const match of bytes.toString('utf8').matchAll(FONT_IMPORT)) fonts.add(match[1])
  }
  for (const specifier of [...fonts].sort()) contents.set(specifier, Buffer.from(await fontCss(repo, specifier)))

  const coverPath = `assets/covers/${id}.jpg`
  const cover = await readFile(join(repo, coverPath)).catch(() => {
    throw new Error(`${id}: no cover at ${coverPath}`)
  })

  const record = (path, bytes) => {
    const hash = sha256(bytes)
    objects.set(hash, bytes)
    return { path, sha256: hash, size: bytes.length }
  }
  const files = [...contents.keys()].sort().map((path) => record(path, contents.get(path)))
  const coverFile = record(coverPath, cover)

  const size = files.reduce((sum, file) => sum + file.size, coverFile.size)
  if (size > DEMO_SIZE_CAP) throw new Error(`${id}: ${size} bytes is over the ${DEMO_SIZE_CAP} byte cap`)

  return {
    id,
    name: meta.title,
    title: meta.title,
    description: meta.description,
    prompts: meta.prompts.map(String),
    entry: `${id}/index.mdx`,
    cover: coverFile,
    files,
    minAppVersion: MIN_APP_VERSION,
  }
}

export async function buildCatalog({ repo, out, release }) {
  const ids = JSON.parse(await readFile(join(repo, 'gallery.json'), 'utf8'))
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('gallery.json must list at least one demo id')
  const objects = new Map()
  const demos = []
  for (const id of ids) demos.push(await buildDemo(repo, id, objects))
  const catalog = { version: CATALOG_VERSION, release, demos }

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
