// Reloj de ajedrez: cada jugador tiene un tiempo total que solo corre en su turno.
// Se guarda lo que quedaba al empezar el turno y la marca de tiempo de ese
// momento; el tiempo restante se calcula con el reloj real, no contando ticks.

export const TIEMPO_POR_DEFECTO_MS = 150_000

/** Tiempo que le queda a un jugador, en ms, nunca negativo. */
export function restante(restanteAlEmpezarMs: number, turnoEmpezoEn: number | null, ahora: number): number {
  if (turnoEmpezoEn === null) return Math.max(0, restanteAlEmpezarMs)
  return Math.max(0, restanteAlEmpezarMs - Math.max(0, ahora - turnoEmpezoEn))
}

/** "2:30" para 150 000 ms. Redondea hacia arriba: se ve 0:00 solo cuando se agota. */
export function formatear(ms: number): string {
  const segundos = Math.ceil(Math.max(0, ms) / 1000)
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
