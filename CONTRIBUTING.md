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
   Add the same in each other language under `translations` (prompts only if the page has them):
   ```yaml
   translations:
     es:
       title: Planificador del huerto
       description: "Lo que es, en una frase."
       prompts:
         - "Lo primero que alguien puede pedir a su IA que cambie."
   ```
3. **Data in files**: put what the page shows in `data/*.json`, so people and their AI can change it without touching code.
4. **If the page saves something** (replies, scores, a board), define a LiveStore in `.kunobi/stores/<name>/store.json`, with its starting data in a `*.start.json` file beside the data, and name it in the front matter (`kunobi.stores`). The existing demos show the pattern.
5. **A cover** at `assets/covers/<folder>.jpg`, 16:9, under 200 KB.
6. **Add it to the gallery** in the root `index.mdx` (`EXAMPLES`), with its title and description in `WORDS` for each language (and any new tag in `WORDS.<lang>.tags`).

## Rules

- **Made-up content only**: no real people, addresses, companies or data, and nothing private.
- **Credit what you did not make** (images, 3D models, music, fonts) in a `CREDITS.md` in the demo's folder. Only use material whose license allows reuse.
- **Keep it light**: a demo, cover included, stays under 10 MB (the build refuses one over 32 MB, and only demos under 10 MB can be picked for the gallery).
- **English first, then every language the page speaks.** The page follows the system language and falls back to English:
  - Interface words go in the page's `WORDS` object, next to English.
  - Title, description and prompts go in the front matter's `translations`.
  - Data in another language is a full copy beside the English file, `data/<name>.es.json`, with the same ids, keys and values the code compares; only the words people read change. Change both files together.
  - Starting data a LiveStore holds stays as it is (ids, keys and saved values never change). Its words go in an overlay, `data/<name>.es.json`, keyed like the starting data (list rows by their `id`); the page shows a field translated while it still matches its starting value (see `trip/src/seed.ts`).
  - Names of people, brands and places stay as they are.
- **No network calls** beyond what Kunobi pages already allow (map tiles).

## Check it locally

```bash
npm install
npm test
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
