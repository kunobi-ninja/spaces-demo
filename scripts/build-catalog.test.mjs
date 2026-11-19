import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { buildCatalog, CATEGORIES, importingCode, readPlayers, stripComments } from './build-catalog.mjs'

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
      'music-jam', 'scan-viewer',
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
    await writeFile(join(copy, 'big', 'index.mdx'), '---\ntitle: Big\ndescription: Too big\ncategory: play\nprompts: [Hi]\n---\n')
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

test('translations come from the locale files, prompts only where the page has them', () => {
  assert.deepEqual(demo('trip').translations.es, {
    title: 'Fin de semana en Lisboa',
    description: demo('trip').translations.es.description,
    prompts: ['Añade el Oceanário el domingo a las 15:00, de parte de Leo', 'Marca las entradas de los Jerónimos como reservadas'],
  })
  assert.match(demo('trip').translations.es.description, /Lisboa/)
  assert.equal(demo('hiring').translations.es.title, 'Contratación en Linden & Co')
  assert.ok(!('prompts' in demo('hiring').translations.es))
  // English pages carry no lang.
  for (const d of catalog.demos) assert.ok(!('lang' in d), d.id)
})

test('the shared i18n helper ships with every page that imports it', () => {
  assert.ok(paths('trip').includes('lib/i18n.ts'))
  assert.ok(paths('trip').includes('trip/locales/es.json'))
  assert.ok(catalog.home.files.some((f) => f.path === 'lib/i18n.ts'))
})

async function withPage(frontMatter, locales, run) {
  await withGallery(['tiny'], async (copy) => {
    await mkdir(join(copy, 'tiny', 'locales'), { recursive: true })
    await writeFile(join(copy, 'tiny', 'index.mdx'), `---\ntitle: Tiny\ndescription: A tiny page\ncategory: play\nprompts: [Hi]\n${frontMatter}---\n`)
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

test('every demo has a category, the same as its kind in the index', async () => {
  const index = await readFile(join(repo, 'index.mdx'), 'utf8')
  for (const d of catalog.demos) {
    assert.ok(CATEGORIES.includes(d.category), d.id)
    const kind = index.match(new RegExp(`id: '${d.id}',[^}]*?kind: '([a-z]+)'`))?.[1]
    if (kind) assert.equal(d.category, kind, d.id)
  }
  assert.equal(demo('week-quest').category, 'play')
  assert.equal(demo('cluster-dashboard').category, 'ninja')
})

test('only demos made for several people at once carry players', () => {
  const multiplayer = Object.fromEntries(catalog.demos.filter((d) => d.players).map((d) => [d.id, d.players]))
  assert.deepEqual(multiplayer, {
    'cat-chase': { min: 2 },
    'home-hunt': { min: 2, max: 2 },
    'flat-tour': { min: 2 },
    'quiz-night': { min: 2 },
    'music-jam': { min: 2 },
  })
})

test('players must be a sensible range', () => {
  assert.equal(readPlayers(undefined, 'x'), undefined)
  assert.deepEqual(readPlayers({ min: 2, max: 4 }, 'x'), { min: 2, max: 4 })
  for (const bad of [null, {}, { min: 1 }, { min: 3, max: 2 }, { min: 2.5 }, { min: 2, people: 3 }]) {
    assert.throws(() => readPlayers(bad, 'x'), /x: players must be/, JSON.stringify(bad))
  }
})

test('rejects a demo whose category is missing or differs from the index', async () => {
  await withGallery(['trip'], async (copy) => {
    const page = join(copy, 'trip', 'index.mdx')
    const source = await readFile(page, 'utf8')
    await writeFile(page, source.replace('category: life\n', ''))
    await assert.rejects(buildCatalog({ repo: copy, out: join(copy, 'out'), release: 'x' }), /trip: front matter needs a category/)
    await writeFile(page, source.replace('category: life', 'category: work'))
    await assert.rejects(buildCatalog({ repo: copy, out: join(copy, 'out'), release: 'x' }), /trip: category work is not its kind life/)
  })
})
