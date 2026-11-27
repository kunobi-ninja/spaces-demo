# Contributing a demo

Thanks for making something for Kunobi spaces. Every demo here is a page people can open, try and make their own.

## Add a demo

1. **One folder per demo**, named in lowercase with dashes (`garden-planner/`). The page is `index.mdx` inside it.
2. **Front matter** at the top of `index.mdx`:
   ```yaml
   ---
   title: Garden planner
   description: "What it is, in one sentence someone who will not read would still get."
   prompts:
     - "A first thing someone can ask their AI to change."
     - "A second one."
   kunobi:
     page-layout: wide
   ---
   ```
   The prompts are what people copy into their AI to make the demo theirs, so make them concrete.
   Write the page in the language you know best: everything (front matter, words, data) in that one language. If it is not English, say which with `lang: es` (any language tag). Translations come later, from `locales/` (see [Languages](#languages)).
3. **Data in files**: put what the page shows in `data/*.json`, so people and their AI can change it without touching code.
4. **If the page saves something** (replies, scores, a board), define a LiveStore in `.kunobi/stores/<name>/store.json`, with its starting data in a `*.start.json` file beside the data, and name it in the front matter (`kunobi.stores`). The page reads it with `useStore` and never imports the store's readable copy or its starting data: Kunobi refuses to open a page that does. The existing demos show the pattern.
5. **A cover** at `assets/covers/<folder>.jpg`, 16:9, under 200 KB.
6. **Add it to the gallery** in the root `index.mdx` (`EXAMPLES`), with its title and description in its `WORDS.items` (and any new tag in `WORDS.tags`).

## Rules

- **Made-up content only**: no real people, addresses, companies or data, and nothing private.
- **Credit what you did not make** (images, 3D models, music, fonts) in a `CREDITS.md` in the demo's folder. Only use material whose license allows reuse.
- **Keep it light**: a demo, cover included, stays under 10 MB (the build refuses one over 32 MB, and only demos under 10 MB can be picked for the gallery).
- **One language per page**, the one it is written in. Other languages are translations (see [Languages](#languages)); names of people, brands and places stay as they are.
- **No network calls** beyond what Kunobi pages already allow (map tiles).

## Languages

Kunobi shows each page in the reader's language (the app's language), falling back from the exact language (`pt-BR`) to its base (`pt`), to English, and then to the language the page is written in. Pages are translated into every language Kunobi speaks: en, es, pt, it, fr, de, ja, ko and zh-Hans.

**You never have to translate.** Write your page in one language; the maintainers translate it into the others after it is merged. To translate by hand, `node scripts/i18n-sync.mjs --export <lang>` lists what a language is missing or has stale, and `--import <file>` writes the translated list back into the locale files (with their hashes). Editing a locale file directly works too.

### What a page translates

- **Front matter**: `title`, `description` and `prompts`.
- **Words**: the page's interface text, in one plain object in the page, `export const WORDS = { … }`: strings, lists of strings and groups of them, nothing computed. A word with values in it uses placeholders, `seat: 'Seat {{name}} here'`, and the page calls it `w.seat({ name })`. A word that changes with a number has one key per plural form, `guests_one: '{{count}} guest'` and `guests_other: '{{count}} guests'`, called `w.guests({ count })`. Anything cleverer (number words, durations) stays in the page's code, built from words.
- **Data**: the fields of `data/*.json` that hold words people read, declared in the front matter, by data file name (`data/places.json`, or a store's starting `data/places.start.json`) and path:
  ```yaml
  i18n:
    data:
      places: [places.*.name, places.*.note]   # every place's name and note
      hiring: ['roles[*].title', 'roles[*].mustHaves']
  ```
  `*` matches every key of an object and every row of a list; quote a path with `[` in it, as YAML reads `[` as the start of a list. A list of strings is translated as one text. Ids, numbers and values the code compares are never declared: they stay as they are in every language.
- **Documents**: a Markdown file the page shows, listed in `i18n.docs` (`docs: [menu.md]`, relative to the page's folder), is translated whole.

The page reads all of it through the shared helper, `lib/i18n.ts`:

```mdx
import { useI18n } from '../lib/i18n'
import translations from './locales/index'

export const WORDS = { title: 'Lisbon weekend', places_one: '{{count}} place', places_other: '{{count}} places' }

export const Trip = () => {
  const t = useI18n(WORDS, translations)
  // t.w.title, t.w.places({ count: 3 }), t.data('places', live), t.doc('menu.md', menu), t.lang, t.locale (for number and date formats)
}
```

`t.data(name, value)` shows data with its translated fields, each only while it still holds the text its translation was made from (the entry's `from`): what people changed in a store shows as saved. It is for display only; never write it back to the store. Outside React (a timeline's constants), use `i18n(WORDS, translations)`.

### The locale files

Each page has a `locales/` folder: next to `index.mdx`, inside a timeline's `.mdx/` folder, or `<name>/locales/` for another page `<name>.mdx`. It holds one file per language and `index.ts`, which lists them for the page:

```
trip/
  index.mdx            the page, in its own language
  data/places.start.json
  locales/
    es.json            only translated text
    fr.json
    index.ts           generated: node scripts/i18n-check.mjs --fix
```

A locale file maps each key to its text and the hash of the source text it was translated from, so a translation whose source changed shows as stale:

```json
{
  "meta.title": { "text": "Fin de semana en Lisboa", "from": "4e352ca9" },
  "words.places_other": { "text": "{{count}} lugares", "from": "1c0e7a52" },
  "data.places.places.P1.note": { "text": "Directos desde el aeropuerto.", "from": "9b1f04de" },
  "data.hiring.roles[support].title": { "text": "Atención al cliente", "from": "0d4e9a11" }
}
```

Keys are `meta.<field>`, `words.<key>` (groups joined with `.`), `data.<name><path>` (a list row by its `id`, or by its position when rows have none) and `doc.<path>`. When you fix a translation by hand, keep `from` as it is.

`node scripts/i18n-check.mjs` reports what is missing or stale per page and language; every pull request gets that report. It fails only on a locale file that does not parse, a translation whose `{{placeholders}}` differ from its source's, a key that points at nothing (after you remove or rename source text; `--fix` drops those keys) or a `locales/index.ts` that does not list the files (`--fix` rewrites it). The translator's glossary, the names and terms it never translates, is `i18n-glossary.json`.

## Check it locally

```bash
npm install
npm test
node scripts/i18n-check.mjs
npm run build:catalog -- --out out --release check
```

Then open the repository in Kunobi with **From a Git URL…** (or open your fork) to try the page.

## What happens next

A maintainer reviews every pull request. Which demos appear on Kunobi's home and Get started is chosen in `gallery.json` by the maintainers; a page merged here and listed in the root `index.mdx` shows in Kunobi's Demos, and may later be picked for the gallery.

## Publishing (maintainers)

Kunobi reads the demos from this repository's GitHub releases, so a new version reaches people without a Kunobi release.

1. **Release**: push a version tag from `main`, e.g. `git tag v1.2.0 && git push origin v1.2.0`. The Release workflow builds the catalog, creates the `v1.2.0` release (the catalog plus one file per asset) and points the **dev** channel at it.
2. **Promote**: once checked in a dev build, run **Actions → Promote demos** with the tag and `unstable` or `stable`. The channel's environment asks its reviewers to approve.
3. **Roll back**: promote the previous tag.

Each channel is a `channel/<channel>` release holding only `catalog.json`; the files stay in the version release it names. Never delete a version release a channel still points at.
