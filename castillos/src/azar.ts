/*
 * Azar con semilla: la misma semilla da siempre el mismo orden de losetas,
 * así que una partida se puede rehacer exactamente igual desde sus jugadas.
 */

/** Generador mulberry32: números en [0, 1). */
export function generador(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Baraja una copia de la lista (Fisher-Yates). */
export function barajar<T>(lista: T[], azar: () => number): T[] {
  const r = [...lista]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

/** Una semilla nueva para empezar una partida. */
export function semillaNueva(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0
}
