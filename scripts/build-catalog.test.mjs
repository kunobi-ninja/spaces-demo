import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { buildCatalog } from './build-catalog.mjs'

const repo = resolve(import.meta.dirname, '..')
let out
let catalog

before(async () => {
  out = await mkdtemp(join(tmpdir(), 'catalog-'))
  catalog = await buildCatalog({ repo, out, release: 'test' })
})
after(() => rm(out, { recursive: true, force: true }))

const demo = (id) => catalog.demos.find((d) => d.id === id)
const paths = (id) => demo(id).files.map((f) => f.path)

test('catalog lists gallery.json ids in order', () => {
  assert.equal(catalog.version, 1)
  assert.equal(catalog.release, 'test')
  assert.deepEqual(
    catalog.demos.map((d) => d.id),
    ['dino-snack', 'week-quest', 'cat-chase', 'trip', 'event']
  )
})

test('metadata comes from the entry front matter', () => {
  const trip = demo('trip')
  assert.equal(trip.entry, 'trip/index.mdx')
  assert.equal(trip.name, 'Lisbon weekend')
  assert.equal(trip.title, 'Lisbon weekend')
  assert.match(trip.description, /Lisbon/)
  assert.ok(trip.prompts.length >= 2)
  assert.equal(trip.cover.path, 'assets/covers/trip.jpg')
  // A page whose front matter was added for the gallery.
  assert.equal(demo('week-quest').title, 'Week Quest')
})

test('files include the entry folder, named stores and their starting data', () => {
  const files = paths('event')
  for (const path of [
    'event/index.mdx',
    'event/src/EventPlan.tsx',
    '.kunobi/stores/event-guests/store.json',
    'event/data/guests.start.json',
    'event/data/guests.json',
  ]) {
    assert.ok(files.includes(path), `missing ${path}`)
  }
  assert.ok(!files.some((p) => p.endsWith('.DS_Store') || p.endsWith('.status.json')))
})

test('fontsource imports are resolved to a Latin css with the font inlined', async () => {
  for (const [id, specifier, family] of [
    ['trip', '@fontsource/figtree/400.css', 'Figtree'],
    ['week-quest', '@fontsource/press-start-2p/400.css', 'Press Start 2P'],
    ['dino-snack', '@fontsource/fredoka/700.css', 'Fredoka'],
  ]) {
    const font = demo(id).files.find((f) => f.path === specifier)
    assert.ok(font, `${id}: ${specifier} missing`)
    const css = await readFile(join(out, 'objects', font.sha256), 'utf8')
    assert.match(css, new RegExp(`font-family: '${family}'`))
    assert.match(css, /url\(data:font\/woff2;base64,/)
    assert.doesNotMatch(css, /latin-ext/)
  }
})

test('objects are content addressed', async () => {
  for (const d of catalog.demos) {
    for (const file of [d.cover, ...d.files]) {
      const bytes = await readFile(join(out, 'objects', file.sha256))
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256)
      assert.equal(bytes.length, file.size)
    }
  }
  const written = JSON.parse(await readFile(join(out, 'catalog.json'), 'utf8'))
  assert.deepEqual(written, catalog)
})

async function withGallery(ids, run) {
  const copy = await mkdtemp(join(tmpdir(), 'demo-repo-'))
  try {
    await cp(repo, copy, { recursive: true, filter: (src) => !src.includes(`${repo}/out`) })
    await writeFile(join(copy, 'gallery.json'), JSON.stringify(ids))
    await run(copy)
  } finally {
    await rm(copy, { recursive: true, force: true })
  }
}

test('rejects a demo over 10 MB', async () => {
  await withGallery(['big'], async (copy) => {
    await mkdir(join(copy, 'big'))
    await writeFile(join(copy, 'big', 'index.mdx'), '---\ntitle: Big\ndescription: Too big\nprompts: [Hi]\n---\n')
    await writeFile(join(copy, 'big', 'blob.json'), Buffer.alloc(11 * 1024 * 1024))
    await cp(join(copy, 'assets/covers/trip.jpg'), join(copy, 'assets/covers/big.jpg'))
    await assert.rejects(buildCatalog({ repo: copy, out: join(copy, 'out'), release: 'x' }), /big: \d+ bytes is over the/)
  })
})

test('rejects an id that is not a page', async () => {
  await withGallery(['pitch-deck'], async (copy) => {
    await assert.rejects(buildCatalog({ repo: copy, out: join(copy, 'out'), release: 'x' }), /pitch-deck: not a page/)
  })
})
