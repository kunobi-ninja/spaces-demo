/**
 * Seeded text in the reader's language. `translated` mirrors the store's starting data
 * (`data/*.start.json`) with only the words to translate (rows of a list keyed by their `id`).
 * A field still equal to its starting value is shown translated; anything people changed is
 * shown as saved. Display only: never write the result back to the store.
 */
export function localizeSeed<T>(live: T, seed: unknown, translated: unknown): T {
  if (!translated || typeof translated !== 'object' || !live || typeof live !== 'object') return live
  const tr = translated as Record<string, unknown>
  if (Array.isArray(live)) {
    const seedRows = Array.isArray(seed) ? seed : []
    return live.map((row) => {
      const id = row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined
      if (typeof id !== 'string') return row
      return localizeSeed(row, seedRows.find((s) => s && s.id === id), tr[id])
    }) as T
  }
  const out: Record<string, unknown> = { ...(live as Record<string, unknown>) }
  const from = (seed ?? {}) as Record<string, unknown>
  for (const [key, value] of Object.entries(tr)) {
    if (!(key in out)) continue
    if (typeof value === 'string') {
      if (out[key] === from[key]) out[key] = value
    } else out[key] = localizeSeed(out[key], from[key], value)
  }
  return out as T
}
