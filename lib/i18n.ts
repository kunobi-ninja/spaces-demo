/**
 * A page in the reader's language. Each page is written in one language (front matter `lang`,
 * `en` when absent) and translated by `locales/<lang>.json` files next to it, listed in
 * `locales/index.ts`. See CONTRIBUTING.md ("Languages") for the files and their keys.
 *
 *   import { useI18n } from '../lib/i18n'
 *   import translations from './locales/index'
 *   export const WORDS = { title: 'Lisbon weekend', places_one: '{{count}} place', places_other: '{{count}} places' }
 *   const t = useI18n(WORDS, translations)
 *   t.w.title                      // 'Fin de semana en Lisboa'
 *   t.w.places({ count: 3 })       // '3 lugares'
 *   t.data('places', live)         // the store's rows, a field translated while it still holds the text it was translated from
 *
 * The language is `document.documentElement.lang` (Kunobi sets it to the app's language), else
 * `navigator.language`, else the page's own. Each text falls back from the exact tag to its base
 * language, to English, then to the page's own text.
 */
import * as React from 'react'

/** One translated text and the hash of the source text it was translated from. */
export interface Entry {
  text: string | string[]
  from: string
}
export type Locale = Record<string, Entry>
/** What a page's `locales/index.ts` exports. */
export interface Translations {
  source: string
  locales: Record<string, Locale>
}

/** The language the reader asked for, as a BCP 47 tag. */
export function readerTag(fallback = 'en'): string {
  if (typeof document !== 'undefined' && document.documentElement?.lang) return document.documentElement.lang
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language
  return fallback
}

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('languagechange', onChange)
  return () => window.removeEventListener('languagechange', onChange)
}

/** `readerTag()`, re-rendering when the window fires `languagechange`. */
export function useReaderTag(fallback = 'en'): string {
  return React.useSyncExternalStore(
    subscribe,
    () => readerTag(fallback),
    () => fallback
  )
}

const base = (tag: string) => tag.split('-')[0].toLowerCase()

/**
 * The locales to read, best first, for a reader's `tag`: the exact tag, its base language, another
 * locale of that language (`zh-Hans` for `zh-CN`), then English. Stops at the page's own language,
 * whose text is the last fallback.
 */
export function localeChain(tag: string, translations: Translations): string[] {
  const { source, locales } = translations
  const langs = Object.keys(locales)
  const find = (want: string) => langs.find((lang) => lang.toLowerCase() === want.toLowerCase())
  const candidates = [tag, base(tag), langs.find((lang) => base(lang) === base(tag)), 'en']
  const chain: string[] = []
  for (const candidate of candidates) {
    if (!candidate) continue
    const lang = find(candidate)
    if (lang && lang.toLowerCase() !== source.toLowerCase()) {
      if (!chain.includes(lang)) chain.push(lang)
    } else if (base(candidate) === base(source)) break
  }
  return chain
}

const PLURAL = /_(zero|one|two|few|many|other)$/
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g

/** `{{name}}` in `text` replaced by `vars.name`. */
export function format(text: string, vars: Record<string, unknown> = {}): string {
  return text.replace(PLACEHOLDER, (whole, name) => (name in vars ? String(vars[name]) : whole))
}

/**
 * A word as the page uses it: `text`, or a function of its values when the page's own text
 * (`source`) has `{{placeholders}}`. The source decides, so a translation cannot change the shape.
 */
function word(source: unknown, text: string | string[]): unknown {
  if (typeof source !== 'string' || !source.includes('{{')) return text
  return (vars?: Record<string, unknown>) => format(String(text), vars)
}

/** One path segment: an object key, or a list row (by its `id`, or by position when rows have none). */
type Segment = { key: string } | { row: string }

/** `roles[support].title` → segments. */
export function parsePath(path: string): Segment[] {
  const segments: Segment[] = []
  const pattern = /([^.[\]]+)|\[([^\]]*)\]/g
  for (const match of path.matchAll(pattern)) segments.push(match[1] !== undefined ? { key: match[1] } : { row: match[2] })
  return segments
}

/** The index a `[row]` selector picks in `list`: the row whose `id` matches, or the position when rows have no `id`. */
export function rowIndex(list: unknown[], row: string): number {
  const byId = list.some((item) => item && typeof item === 'object' && 'id' in (item as object))
  if (byId) return list.findIndex((item) => item && typeof item === 'object' && String((item as { id?: unknown }).id) === row)
  const index = Number(row)
  return Number.isInteger(index) && index >= 0 && index < list.length ? index : -1
}

function step(value: unknown, segment: Segment): unknown {
  if ('row' in segment) return Array.isArray(value) ? value[rowIndex(value, segment.row)] : undefined
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>)[segment.key] : undefined
}

export function getPath(value: unknown, segments: Segment[]): unknown {
  return segments.reduce(step, value)
}

/** `value` with `next` at `segments`, copying only what changes. */
function setPath(value: unknown, segments: Segment[], next: unknown): unknown {
  if (segments.length === 0) return next
  const [head, ...rest] = segments
  if ('row' in head) {
    if (!Array.isArray(value)) return value
    const index = rowIndex(value, head.row)
    if (index < 0) return value
    const copy = value.slice()
    copy[index] = setPath(value[index], rest, next)
    return copy
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !(head.key in value)) return value
  return { ...(value as Record<string, unknown>), [head.key]: setPath((value as Record<string, unknown>)[head.key], rest, next) }
}

/**
 * The 8-hex-digit hash a translation records of the source text it came from: the first 8 hex digits
 * of the SHA-1 of the text's JSON, as `scripts/i18n.mjs` writes it. Synchronous, so pages can compare
 * a live value with it while rendering.
 */
export function hash(text: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(text))
  const words = new Uint32Array((((bytes.length + 8) >> 6) + 1) * 16)
  bytes.forEach((byte, i) => (words[i >> 2] |= byte << (24 - (i % 4) * 8)))
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8)
  words[words.length - 1] = bytes.length * 8
  words[words.length - 2] = Math.floor((bytes.length * 8) / 2 ** 32)
  let [a, b, c, d, e] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n))
  const w = new Uint32Array(80)
  for (let block = 0; block < words.length; block += 16) {
    for (let i = 0; i < 80; i++) w[i] = i < 16 ? words[block + i] : rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let [h0, h1, h2, h3, h4] = [a, b, c, d, e]
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(h1 & h2) | (~h1 & h3), 0x5a827999] : i < 40 ? [h1 ^ h2 ^ h3, 0x6ed9eba1] : i < 60 ? [(h1 & h2) | (h1 & h3) | (h2 & h3), 0x8f1bbcdc] : [h1 ^ h2 ^ h3, 0xca62c1d6]
      const next = (rotl(h0, 5) + f + h4 + k + w[i]) | 0
      ;[h4, h3, h2, h1, h0] = [h3, h2, rotl(h1, 30), h0, next]
    }
    ;[a, b, c, d, e] = [(a + h0) | 0, (b + h1) | 0, (c + h2) | 0, (d + h3) | 0, (e + h4) | 0]
  }
  return [a, b].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('').slice(0, 8)
}

/** `hash`, remembered: a page hashes the same texts on every render. */
const hashes = new Map<string, string>()
function hashOf(text: unknown): string {
  const key = JSON.stringify(text)
  let found = hashes.get(key)
  if (found === undefined) {
    found = hash(text)
    if (hashes.size > 5000) hashes.clear()
    hashes.set(key, found)
  }
  return found
}

export interface I18n<W> {
  /** The language the page shows: the first locale used, or the page's own. */
  lang: string
  /** The reader's tag. */
  tag: string
  /** The locale for number and date formats: the reader's tag when it is of the shown language, else that language. */
  locale: string
  /** The page's words in the reader's language (see `useI18n`). */
  w: W & Record<string, any>
  /** A front matter field (`title`, `description`, `prompts`) in the reader's language, or `fallback`. */
  meta<T extends string | string[]>(field: 'title' | 'description' | 'prompts', fallback: T): T
  /**
   * The data `name` (the file `data/<name>.json`, or a store's data, started from
   * `data/<name>.start.json`) with its translated fields. A field shows translated only while it
   * still holds the text its translation was made from (the entry's `from` hash), so what people
   * changed in a store shows as saved. Display only: never write the result back.
   */
  data<T>(name: string, value: T): T
  /** A text file (`doc.<path>`, relative to the page) in the reader's language, or `source`. */
  doc(path: string, source: string): string
}

/**
 * The page in the reader's language `tag`. Works outside React (timelines); pages use `useI18n`.
 * `words` is the page's own words: strings, lists of strings and nested groups. A string with
 * `{{name}}` becomes a function of its values (`w.seat({ name })`), and `x_one`/`x_other` (any
 * plural category) become `w.x({ count })`.
 */
export function i18n<W extends Record<string, unknown>>(words: W, translations: Translations, tag = readerTag(translations.source)): I18n<W> {
  const chain = localeChain(tag, translations)
  const lookup = (key: string): Entry['text'] | undefined => {
    for (const lang of chain) {
      const entry = translations.locales[lang][key]
      if (entry && typeof entry === 'object') return entry.text
    }
    return undefined
  }
  const lang = chain[0] ?? translations.source

  /** The plural forms of `key` in the first locale (or the source) that has any. */
  const plural = (prefix: string, group: Record<string, unknown>, name: string) => (vars: Record<string, unknown> = {}) => {
    const count = Number(vars.count ?? 0)
    for (const locale of chain) {
      const forms = translations.locales[locale]
      if (!Object.keys(forms).some((key) => key.startsWith(`${prefix}${name}_`) && PLURAL.test(key))) continue
      const category = new Intl.PluralRules(locale).select(count)
      const text = forms[`${prefix}${name}_${category}`]?.text ?? forms[`${prefix}${name}_other`]?.text
      if (typeof text === 'string') return format(text, vars)
    }
    const category = new Intl.PluralRules(translations.source).select(count)
    const text = group[`${name}_${category}`] ?? group[`${name}_other`]
    return format(String(text ?? ''), vars)
  }

  const translateWords = (group: Record<string, unknown>, prefix: string): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(group)) {
      const match = key.match(PLURAL)
      if (match) {
        const name = key.slice(0, -match[0].length)
        if (!(name in out)) out[name] = plural(prefix, group, name)
        continue
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) out[key] = translateWords(value as Record<string, unknown>, `${prefix}${key}.`)
      else out[key] = word(value, (lookup(`${prefix}${key}`) ?? value) as string | string[])
    }
    return out
  }

  return {
    lang,
    tag,
    locale: base(tag) === base(lang) ? tag : lang,
    w: translateWords(words, 'words.') as W & Record<string, any>,
    meta: (field, fallback) => (lookup(`meta.${field}`) ?? fallback) as typeof fallback,
    data: (name, value) => {
      const prefix = `data.${name}`
      const keys = new Set<string>()
      for (const locale of chain) for (const key of Object.keys(translations.locales[locale])) {
        if (key.startsWith(`${prefix}.`) || key.startsWith(`${prefix}[`)) keys.add(key)
      }
      let out: unknown = value
      for (const key of keys) {
        const path = parsePath(key.slice(prefix.length))
        const current = getPath(value, path)
        if (current === undefined) continue
        // The first locale whose translation was made from the text the field holds now.
        const from = hashOf(current)
        const entry = chain.map((lang) => translations.locales[lang][key]).find((found) => found && typeof found === 'object' && found.from === from)
        if (entry) out = setPath(out, path, entry.text)
      }
      return out as typeof value
    },
    doc: (path, source) => {
      const text = lookup(`doc.${path}`)
      return typeof text === 'string' ? text : source
    },
  }
}

/** `i18n` for the reader's current language, re-rendering when it changes. */
export function useI18n<W extends Record<string, unknown>>(words: W, translations: Translations): I18n<W> {
  const tag = useReaderTag(translations.source)
  return React.useMemo(() => i18n(words, translations, tag), [words, translations, tag])
}
