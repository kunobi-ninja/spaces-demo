import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { checkRepo, renderReport } from './i18n-check.mjs'
import { exportTodo, importAnswers, problem } from './i18n-sync.mjs'
import { compareLocale, expandPattern, extractPage, hash, localeDir, renderIndex, renderLocale } from './i18n.mjs'

// lib/i18n.ts imports React for its hook; the tests use the plain functions, so a stub will do.
register(
  `data:text/javascript,${encodeURIComponent(
    `export async function resolve(specifier, context, next) {
      if (specifier === 'react') return { url: 'data:text/javascript,export const useSyncExternalStore = () => {}; export const useMemo = (f) => f()', shortCircuit: true }
      return next(specifier, context)
    }`
  )}`
)
const { i18n, localeChain } = await import(resolve(import.meta.dirname, '../lib/i18n.ts'))

const entry = (text, source = text) => ({ text, from: hash(source) })

/** A throwaway repository with `files` (path → string or JSON value). */
async function repoWith(files) {
  const repo = await mkdtemp(join(tmpdir(), 'i18n-'))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(repo, path)), { recursive: true })
    await writeFile(join(repo, path), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`)
  }
  return repo
}

const PAGE = `---
title: Trip
description: A weekend away
prompts: [Add a museum]
i18n:
  data:
    places: [places.*.note]
    plan: ['days[*].title', 'days[*].stops']
  docs: [notes.md]
---

export const WORDS = {
  title: 'Weekend',
  seat: 'Seat {{name}} here',
  places_one: '{{count}} place',
  places_other: '{{count}} places',
  kinds: { food: 'Food' },
}
`
const FILES = {
  'trip/index.mdx': PAGE,
  'trip/data/places.start.json': { places: { P1: { name: 'Café', note: 'Lunch first' }, P2: { name: 'Park', note: '' } } },
  'trip/data/places.json': { places: { P1: { name: 'Café', note: 'Lunch first' } } },
  'trip/data/plan.json': { days: [{ id: 'fri', title: 'Friday', stops: ['Café', 'Park'] }, { id: 'sat', title: 'Saturday' }] },
  'trip/notes.md': '# Notes\n\nBring a coat.\n',
}

test('a page in a folder keeps its locales there; another page gets a folder of its own', () => {
  assert.equal(localeDir('trip/index.mdx'), 'trip/locales')
  assert.equal(localeDir('index.mdx'), 'locales')
  assert.equal(localeDir('team/projects.mdx'), 'team/projects/locales')
  assert.equal(localeDir('birthday-film.mdx/full.mdx'), 'birthday-film.mdx/locales')
})

test('patterns select rows by id, by position when rows have none, and every key of an object', () => {
  const data = { roles: [{ id: 'a', title: 'Baker', tags: ['early', 'bread'] }], months: [{ note: 'Slow' }, { note: 'Busy' }], map: { x: { label: 'X' }, y: {} } }
  assert.deepEqual(expandPattern(data, 'roles[*].title'), [['.roles[a].title', 'Baker']])
  assert.deepEqual(expandPattern(data, 'roles[*].tags'), [['.roles[a].tags', ['early', 'bread']]])
  assert.deepEqual(expandPattern(data, 'months.*.note'), [['.months[0].note', 'Slow'], ['.months[1].note', 'Busy']])
  assert.deepEqual(expandPattern(data, 'map.*.label'), [['.map.x.label', 'X']])
  assert.deepEqual(expandPattern([{ id: 'H1', note: 'Bright' }], '[*].note'), [['[H1].note', 'Bright']])
  assert.throws(() => expandPattern(data, 'roles[*]'), /is not text/)
})

test('a page yields its front matter, words, declared data and documents', async () => {
  const repo = await repoWith(FILES)
  try {
    const page = await extractPage(repo, 'trip/index.mdx')
    assert.deepEqual(page.errors, [])
    assert.equal(page.source, 'en')
    assert.deepEqual([...page.texts.keys()], [
      'meta.title', 'meta.description', 'meta.prompts',
      'words.title', 'words.seat', 'words.places_one', 'words.places_other', 'words.kinds.food',
      'data.places.places.P1.note',
      'data.plan.days[fri].title', 'data.plan.days[fri].stops', 'data.plan.days[sat].title',
      'doc.notes.md',
    ])
    assert.deepEqual(page.texts.get('data.plan.days[fri].stops'), ['Café', 'Park'])
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('words must be plain text and declared data must select something', async () => {
  const repo = await repoWith({
    'p/index.mdx': `---\ntitle: P\ndescription: D\ni18n:\n  data:\n    nope: [a]\n    plan: [missing.*]\n---\n\nexport const WORDS = { hi: (name) => \`Hi \${name}\` }\n`,
    'p/data/plan.json': { days: [] },
  })
  try {
    const { errors } = await extractPage(repo, 'p/index.mdx')
    assert.match(errors[0], /WORDS: WORDS.hi must be a string/)
    assert.match(errors[1], /i18n.data.nope: no data\/nope.json/)
    assert.match(errors[2], /"missing.\*" selects no text/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('a locale is missing, stale or broken key by key', () => {
  const texts = new Map([['words.a', 'One'], ['words.b', 'Two {{n}}'], ['words.c_one', 'One guest'], ['words.c_other', '{{count}} guests'], ['meta.prompts', ['x']]])
  const state = compareLocale(texts, {
    'words.a': entry('Uno', 'One (old)'),
    'words.b': entry('Dos', 'Two {{n}}'),
    'words.c_one': entry('{{count}} invitado', 'One guest'),
    'words.c_few': entry('Pocos', '{{count}} guests'),
    'meta.prompts': entry('x', ['x']),
    'words.gone': entry('Nada'),
  })
  assert.deepEqual(state.missing, ['words.c_other'])
  assert.deepEqual(state.stale, ['words.a'])
  assert.deepEqual(state.orphans, ['words.gone'])
  // A lost placeholder breaks the page like a list for a string does; a plural form may spell its number out.
  assert.deepEqual(state.invalid, ['words.b: placeholders differ from the source ({{n}})', 'meta.prompts: the source is a list'])
})

test('locale files list one entry per line in page order; the index imports each', () => {
  const texts = new Map([['words.a', 'A'], ['words.b', 'B']])
  assert.equal(renderLocale(texts, { 'words.b': entry('Be', 'B'), 'words.a': entry(['x', 'y'], 'A') }), `{\n  "words.a": { "text": ["x", "y"], "from": "${hash('A')}" },\n  "words.b": { "text": "Be", "from": "${hash('B')}" }\n}\n`)
  assert.match(renderIndex('en', ['es', 'zh-Hans']), /import es from '.\/es.json'\nimport zhHans from '.\/zh-Hans.json'\n\nexport default \{ source: 'en', locales: \{ es, 'zh-Hans': zhHans \} \}/)
})

test('the check reports missing translations without failing, and fails on what is broken', async () => {
  const repo = await repoWith({
    ...FILES,
    'trip/locales/es.json': { 'meta.title': entry('Viaje', 'Trip'), 'words.title': entry('Finde', 'Weekend (old)') },
    'trip/locales/index.ts': renderIndex('en', ['es']),
  })
  try {
    let [result] = await checkRepo(repo)
    assert.deepEqual(result.errors, [])
    assert.equal(result.langs.es.missing.length, 11)
    assert.deepEqual(result.langs.es.stale, ['words.title'])
    assert.equal(result.langs.fr.missing.length, 13)
    assert.match(renderReport([result]), /\| `trip\/index.mdx` \| en \| · \| 11 missing, 1 stale \| 13 missing/)

    await writeFile(join(repo, 'trip/locales/fr.json'), JSON.stringify({ 'data.places.places.P9.note': entry('x') }))
    ;[result] = await checkRepo(repo)
    assert.deepEqual(result.errors, [
      'trip/locales/fr.json: "data.places.places.P9.note" points at nothing in trip/index.mdx',
      "trip/locales/index.ts does not list the page's locale files: run node scripts/i18n-check.mjs --fix",
    ])
    ;[result] = await checkRepo(repo, { fix: true })
    assert.deepEqual(result.errors, [])
    assert.equal(await readFile(join(repo, 'trip/locales/fr.json'), 'utf8'), '{}\n')
    assert.equal(await readFile(join(repo, 'trip/locales/index.ts'), 'utf8'), renderIndex('en', ['es', 'fr']))

    await writeFile(join(repo, 'trip/locales/fr.json'), '{ nope')
    ;[result] = await checkRepo(repo)
    assert.match(result.errors[0], /trip\/locales\/fr.json: .*JSON/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('the export lists only missing and stale texts; an import writes only the keys it holds', async () => {
  const repo = await repoWith({
    ...FILES,
    'trip/locales/es.json': { 'meta.title': entry('Viaje', 'Trip'), 'words.title': entry('Finde', 'Weekend (old)'), 'words.gone': entry('Nada') },
    'trip/locales/index.ts': renderIndex('en', ['es']),
  })
  try {
    const todo = await exportTodo(repo, { langs: ['es', 'fr'] })
    const es = todo.filter((item) => item.lang === 'es')
    assert.ok(!es.some((item) => item.key === 'meta.title'))
    assert.deepEqual(es.find((item) => item.key === 'words.title'), { page: 'trip/index.mdx', lang: 'es', key: 'words.title', text: 'Weekend', previous: 'Finde' })
    assert.equal(todo.filter((item) => item.lang === 'fr').length, 13)

    // Part of the work: three Spanish answers (one with a lost placeholder) and two French ones.
    const { written, skipped } = await importAnswers(repo, [
      { page: 'trip/index.mdx', lang: 'es', key: 'words.title', text: 'Fin de semana' },
      { page: 'trip/index.mdx', lang: 'es', key: 'words.seat', text: 'Sienta aquí' },
      { page: 'trip/index.mdx', lang: 'es', key: 'data.plan.days[fri].stops', text: ['Café', 'Parque'] },
      { page: 'trip/index.mdx', lang: 'fr', key: 'words.title', text: 'Week-end' },
      { page: 'trip/index.mdx', lang: 'fr', key: 'words.nope', text: 'Rien' },
    ])
    assert.equal(written, 3)
    assert.deepEqual(skipped, ['trip/index.mdx es words.seat (placeholders differ)', 'trip/index.mdx fr words.nope (points at nothing)'])

    const locale = JSON.parse(await readFile(join(repo, 'trip/locales/es.json'), 'utf8'))
    assert.deepEqual(locale['meta.title'], entry('Viaje', 'Trip'))
    assert.deepEqual(locale['words.title'], entry('Fin de semana', 'Weekend'))
    assert.deepEqual(locale['data.plan.days[fri].stops'], entry(['Café', 'Parque'], ['Café', 'Park']))
    assert.ok(!('words.gone' in locale) && !('words.seat' in locale))
    assert.deepEqual(JSON.parse(await readFile(join(repo, 'trip/locales/fr.json'), 'utf8')), { 'words.title': entry('Week-end', 'Weekend') })
    assert.equal(await readFile(join(repo, 'trip/locales/index.ts'), 'utf8'), renderIndex('en', ['es', 'fr']))

    const [result] = await checkRepo(repo)
    assert.deepEqual(result.errors, [])
    assert.ok(result.langs.es.missing.includes('words.seat'))
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test('an answer must keep the shape and placeholders of its source', () => {
  assert.equal(problem('words.seat', 'Hi {{name}}', 'Hola {{name}}'), undefined)
  assert.equal(problem('words.seat', 'Hi {{name}}', 'Hola'), 'placeholders differ')
  assert.equal(problem('words.guests_one', 'One guest', '{{count}} invitado'), undefined)
  assert.equal(problem('words.days', ['a', 'b'], ['x']), 'expected a list of 2 strings')
  assert.equal(problem('words.a', 'a', ['a']), 'expected a string')
})

const WORDS = { title: 'Weekend', seat: 'Seat {{name}} here', places_one: '{{count}} place', places_other: '{{count}} places', kinds: { food: 'Food' }, days: ['Fri', 'Sat'] }
const TRANSLATIONS = {
  source: 'en',
  locales: {
    es: {
      'meta.title': entry('Viaje'),
      'words.title': entry('Finde'),
      'words.seat': entry('Sienta aquí a {{name}}'),
      'words.places_one': entry('{{count}} lugar'),
      'words.places_other': entry('{{count}} lugares'),
      'words.days': entry(['Vie', 'Sáb']),
      'data.places.places.P1.note': entry('Comer primero'),
      'data.plan.days[fri].title': entry('Viernes'),
      'doc.notes.md': entry('# Notas'),
    },
    'es-AR': { 'words.title': entry('Finde largo') },
    'zh-Hans': { 'words.title': entry('周末') },
  },
}

test('the reader gets the exact tag, then the base language, then English, then the page', () => {
  assert.deepEqual(localeChain('es-AR', TRANSLATIONS), ['es-AR', 'es'])
  assert.deepEqual(localeChain('es-MX', TRANSLATIONS), ['es'])
  assert.deepEqual(localeChain('zh-CN', TRANSLATIONS), ['zh-Hans'])
  assert.deepEqual(localeChain('en-GB', TRANSLATIONS), [])
  assert.deepEqual(localeChain('fr', TRANSLATIONS), [])
  assert.deepEqual(localeChain('fr', { source: 'es', locales: { en: {} } }), ['en'])

  const t = i18n(WORDS, TRANSLATIONS, 'es-AR')
  assert.equal(t.lang, 'es-AR')
  assert.equal(t.locale, 'es-AR')
  assert.equal(i18n(WORDS, TRANSLATIONS, 'zh-CN').locale, 'zh-CN')
  // A reader whose language the page lacks gets numbers and dates in the language it shows.
  assert.equal(i18n(WORDS, { source: 'es', locales: { en: {} } }, 'fr').locale, 'en')
  assert.equal(t.w.title, 'Finde largo')
  assert.equal(t.w.kinds.food, 'Food')
  assert.equal(i18n(WORDS, TRANSLATIONS, 'de').w.title, 'Weekend')
})

test('words with placeholders and plurals become functions in the reader language', () => {
  const es = i18n(WORDS, TRANSLATIONS, 'es').w
  assert.equal(es.seat({ name: 'Ana' }), 'Sienta aquí a Ana')
  assert.equal(es.places({ count: 1 }), '1 lugar')
  assert.equal(es.places({ count: 3 }), '3 lugares')
  assert.deepEqual(es.days, ['Vie', 'Sáb'])
  const en = i18n(WORDS, TRANSLATIONS, 'en').w
  assert.equal(en.places({ count: 1 }), '1 place')
  assert.equal(en.seat({ name: 'Ana' }), 'Seat Ana here')
  assert.equal(i18n(WORDS, TRANSLATIONS, 'es').meta('title', 'Trip'), 'Viaje')
  // Whether a word is a function comes from the page's text, not from a translation that lost its placeholders.
  const lost = { source: 'en', locales: { es: { 'words.seat': entry('Siéntate aquí', 'Seat {{name}} here'), 'words.title': entry('Finde {{x}}', 'Weekend') } } }
  assert.equal(i18n(WORDS, lost, 'es').w.seat({ name: 'Ana' }), 'Siéntate aquí')
  assert.equal(i18n(WORDS, lost, 'es').w.title, 'Finde {{x}}')
  assert.deepEqual(i18n(WORDS, TRANSLATIONS, 'es').meta('prompts', ['Add']), ['Add'])
})

test('data shows translated while it still equals its start, and is never changed in place', () => {
  const t = i18n(WORDS, TRANSLATIONS, 'es')
  const start = { places: { P1: { note: 'Lunch first' }, P2: { note: 'x' } } }
  const live = { places: { P1: { note: 'Lunch first' }, P2: { note: 'x' }, P3: { note: 'New' } } }
  const shown = t.data('places', live, start)
  assert.equal(shown.places.P1.note, 'Comer primero')
  assert.equal(shown.places.P3, live.places.P3)
  assert.equal(live.places.P1.note, 'Lunch first')
  const edited = { places: { P1: { note: 'Dinner instead' } } }
  assert.equal(t.data('places', edited, start).places.P1.note, 'Dinner instead')

  const plan = { days: [{ id: 'sat', title: 'Saturday' }, { id: 'fri', title: 'Friday' }] }
  assert.deepEqual(t.data('plan', plan).days.map((d) => d.title), ['Saturday', 'Viernes'])
  assert.equal(t.doc('notes.md', '# Notes'), '# Notas')
  assert.equal(t.doc('other.md', 'Other'), 'Other')
})
