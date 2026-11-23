import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { buildCatalog, importingCode, stripComments } from './build-catalog.mjs'

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

const GALLERY = ['dino-snack', 'week-quest', 'cat-chase', 'trip', 'event']

test('catalog lists the gallery picks first, then every other page in the index order', () => {
  assert.equal(catalog.version, 1)
  assert.equal(catalog.release, 'test')
  assert.deepEqual(
    catalog.demos.map((d) => d.id),
    [
      ...GALLERY,
      'home-hunt', 'team', 'expenses', 'meals', 'flat-tour', 'monthly-report', 'hiring', 'content-calendar',
      'projects', 'cluster-dashboard', 'runbook', 'incident', 'blast-radius', 'on-call-handover', 'quiz-night',
      'music-jam', 'scan-viewer', 'castillos', 'kunobitos', 'juego-de-la-oca', 'pasalacabra',
    ]
  )
  for (const d of catalog.demos) assert.equal(d.gallery, GALLERY.includes(d.id), d.id)
})

test('a page that is not its folder index keeps its own entry', () => {
  assert.equal(demo('projects').entry, 'team/projects.mdx')
  assert.ok(paths('projects').includes('team/projects.mdx'))
  assert.equal(demo('projects').cover.path, 'assets/covers/projects.jpg')
})

test('a page without prompts is listed with none; a large page stays out of the gallery', () => {
  assert.deepEqual(demo('hiring').prompts, [])
  assert.equal(demo('scan-viewer').gallery, false)
})

test('the home page carries the index, the covers it shows and its fonts', () => {
  assert.equal(catalog.home.entry, 'index.mdx')
  const files = catalog.home.files.map((f) => f.path)
  for (const path of ['index.mdx', 'assets/covers/trip.jpg', 'assets/covers/birthday-film.jpg', '@fontsource/parkinsans/800.css']) {
    assert.ok(files.includes(path), `missing ${path}`)
  }
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
    // An italic weight: Fontsource names its face `fraunces-latin-500-italic`, not `…-normal`.
    ['castillos', '@fontsource/fraunces/500-italic.css', 'Fraunces'],
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

test('rejects a module the gallery would not load as code', async () => {
  await withGallery(['esm'], async (copy) => {
    await mkdir(join(copy, 'esm'))
    await writeFile(join(copy, 'esm', 'index.mdx'), "---\ntitle: Esm\ndescription: Uses .mjs\nprompts: [Hi]\n---\n\nimport { x } from './rules.mjs'\n\n{x}\n")
    await writeFile(join(copy, 'esm', 'rules.mjs'), 'export const x = 1\n')
    await cp(join(copy, 'assets/covers/trip.jpg'), join(copy, 'assets/covers/esm.jpg'))
    await assert.rejects(buildCatalog({ repo: copy, out: join(copy, 'out'), release: 'x' }), /esm: esm\/rules\.mjs is not loaded as code/)
  })
})

test('rejects an id that is not a page', async () => {
  await withGallery(['pitch-deck'], async (copy) => {
    await assert.rejects(buildCatalog({ repo: copy, out: join(copy, 'out'), release: 'x' }), /pitch-deck: not a page/)
  })
})

test('translations come from the locale files, prompts only where the page has them', () => {
  assert.deepEqual(demo('trip').translations.es, {
    title: 'Fin de semana en Lisboa',
    description: demo('trip').translations.es.description,
    prompts: ['Añade el Oceanário el domingo a las 15:00, de parte de Leo', 'Marca las entradas de los Jerónimos como reservadas'],
  })
  assert.match(demo('trip').translations.es.description, /Lisboa/)
  assert.equal(demo('hiring').translations.es.title, 'Contratación en Linden & Co')
  assert.ok(!('prompts' in demo('hiring').translations.es))
  // English pages carry no lang; the pages written in Spanish say so.
  const spanish = ['castillos', 'kunobitos', 'juego-de-la-oca', 'pasalacabra']
  for (const d of catalog.demos) assert.equal(d.lang, spanish.includes(d.id) ? 'es' : undefined, d.id)
})

const published = (id, path) => readFileSync(join(out, 'objects', demo(id).files.find((f) => f.path === path).sha256), 'utf8')

test('the shared i18n helper ships inside every demo that imports it, which imports it from there', () => {
  assert.ok(paths('trip').includes('trip/lib/i18n.ts'))
  assert.ok(paths('trip').includes('trip/locales/es.json'))
  assert.match(published('trip', 'trip/index.mdx'), /from '\.\/lib\/i18n'/)
  assert.equal(published('trip', 'trip/lib/i18n.ts'), readFileSync(join(repo, 'lib/i18n.ts'), 'utf8'))
  // A page deeper in the folder reaches the same copy.
  assert.match(published('team', 'team/wiki/index.mdx'), /from '\.\.\/lib\/i18n'/)
  // The home page is the repository root: it keeps the original where it is.
  assert.ok(catalog.home.files.some((f) => f.path === 'lib/i18n.ts'))
})

test('every demo is its folder alone, as "Make this mine" copies only the folder', () => {
  for (const d of catalog.demos) {
    const folder = d.entry.slice(0, d.entry.lastIndexOf('/') + 1)
    for (const f of d.files) {
      assert.ok(f.path.startsWith(folder) || f.path.startsWith('.kunobi/') || f.path.startsWith('@fontsource/'), `${d.id}: ${f.path}`)
    }
  }
})

test('rejects a shared file that a demo file of the same path would hide', async () => {
  await withGallery(['trip'], async (copy) => {
    await mkdir(join(copy, 'trip', 'lib'))
    await writeFile(join(copy, 'trip', 'lib', 'i18n.ts'), 'export {}\n')
    await assert.rejects(buildCatalog({ repo: copy, out: join(copy, 'out'), release: 'x' }), /trip: trip\/lib\/i18n\.ts would hide the shared lib\/i18n\.ts/)
  })
})

async function withPage(frontMatter, locales, run) {
  await withGallery(['tiny'], async (copy) => {
    await mkdir(join(copy, 'tiny', 'locales'), { recursive: true })
    await writeFile(join(copy, 'tiny', 'index.mdx'), `---\ntitle: Tiny\ndescription: A tiny page\nprompts: [Hi]\n${frontMatter}---\n`)
    for (const [lang, entries] of Object.entries(locales)) await writeFile(join(copy, 'tiny', 'locales', `${lang}.json`), JSON.stringify(entries))
    await cp(join(copy, 'assets/covers/trip.jpg'), join(copy, 'assets/covers/tiny.jpg'))
    await run(() => buildCatalog({ repo: copy, out: join(copy, 'out'), release: 'x' }))
  })
}

const t = (text) => ({ text, from: '00000000' })

test('a page in another language says so; a language without a title and description is left out', async () => {
  await withPage('lang: es\n', { en: { 'meta.title': t('Tiny'), 'meta.description': t('A tiny page'), 'meta.prompts': t(['Hi']) }, fr: { 'meta.title': t('Petit') } }, async (build) => {
    const tiny = (await build()).demos.find((d) => d.id === 'tiny')
    assert.equal(tiny.lang, 'es')
    assert.deepEqual(tiny.translations, { en: { title: 'Tiny', description: 'A tiny page', prompts: ['Hi'] } })
  })
  await withPage('', {}, async (build) => {
    const tiny = (await build()).demos.find((d) => d.id === 'tiny')
    assert.ok(!('translations' in tiny) && !('lang' in tiny))
  })
})

test('rejects front matter translations, a bad lang and a broken locale file', async () => {
  for (const [yaml, locales, error] of [
    ['translations:\n  es:\n    title: Mini\n', {}, /tiny: front matter translations moved to tiny\/locales/],
    ['lang: Spanish\n', {}, /tiny: lang must be a language tag/],
    ['', { es: { 'meta.title': 'Mini' } }, /tiny: es.json: meta.title must be/],
  ]) {
    await withPage(yaml, locales, (build) => assert.rejects(build(), error))
  }
})

test('only code imports: an MDX page\'s ESM blocks and scripts, never prose, code fences or Markdown', () => {
  const page = [
    '---',
    'title: P',
    '---',
    "import a from './a.json'",
    "export { b } from './b'",
    '',
    "To use it, write import x from './prose' in your page.",
    '',
    '```js',
    "import c from './fenced'",
    '```',
    '',
    "{/* import d from './jsx-comment' */}",
  ].join('\n')
  const specifiers = (path, text) => [...importingCode(path, text).matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(specifiers('p/index.mdx', page), ['./a.json', './b'])
  assert.deepEqual(specifiers('p/notes.md', "import e from './e'"), [])
  assert.deepEqual(specifiers('p/src/x.ts', "// import f from './f'\nimport g from './g'"), ['./g'])
})

test('comments go, strings that look like comments stay', () => {
  const code = "const glob = 'src/**/*.ts'\nimport a from './a'\n/* import b from './b' */\nconst url = \"http://x\" // trailing\nimport c from './c' // */"
  assert.equal(stripComments(code), "const glob = 'src/**/*.ts'\nimport a from './a'\n\nconst url = \"http://x\" \nimport c from './c' ")
})
