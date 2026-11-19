#!/usr/bin/env node
/**
 * Copies the shared `lib/i18n.ts` into demos. "Make this mine" copies only a demo's
 * folder into the new space, so each demo carries its own copy at `<demo>/lib/i18n.ts`;
 * the root file is the original.
 *
 *   npm run sync:lib              # updates every existing copy
 *   npm run sync:lib -- my-demo   # also gives my-demo its first copy
 */

import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export const SHARED = 'lib/i18n.ts'

/** The folders, repository-relative, whose `lib/i18n.ts` is a copy of the shared one. */
export async function copies(repo) {
  const found = []
  const visit = async (dir) => {
    for (const entry of await readdir(join(repo, dir), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const folder = dir ? `${dir}/${entry.name}` : entry.name
      if (folder === 'lib') continue
      if ((await stat(join(repo, folder, SHARED)).catch(() => null))?.isFile()) found.push(folder)
      await visit(folder)
    }
  }
  await visit('')
  return found.sort()
}

export async function syncLib(repo, extra = []) {
  const folders = [...new Set([...(await copies(repo)), ...extra.map((folder) => folder.replace(/\/+$/, ''))])]
  for (const folder of folders) {
    await mkdir(join(repo, folder, 'lib'), { recursive: true })
    await copyFile(join(repo, SHARED), join(repo, folder, SHARED))
  }
  return folders
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repo = resolve(import.meta.dirname, '..')
  const folders = await syncLib(repo, process.argv.slice(2))
  console.log(`lib/i18n.ts copied into ${folders.length} demos`)
}
