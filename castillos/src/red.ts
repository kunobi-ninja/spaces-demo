/*
 * Partida en línea: cada jugador en su dispositivo, en una sala en vivo
 * de Kunobi (useSession). Este módulo es puro: lee el estado de la sala y rehace
 * la partida con el motor. La página (EnLinea.tsx) solo lo muestra y envía.
 *
 * Claves de la sala (modelo map), con las reglas de index.mdx (salas castillos-mesa2, -mesa3 y -mesa4):
 *   seat.<n>             quién ocupa el asiento n (regla turns)
 *   jugador.<actorId>    { nombre, color } de cada participante (regla own)
 *   mesa                 { id, semilla, previas? } de la partida en curso (regla host)
 *   jugada.<id>.<k>      la jugada k de esa partida (regla turns: solo el asiento al que le toca)
 *   turn                 a qué asiento le toca (lo lleva Kunobi; el anfitrión puede fijarlo)
 *
 * Un turno de Castillos es una sola jugada de la sala: colocar y, a la vez, el
 * estandarte (o ninguno). Girar y deshacer se quedan en la pantalla de quien juega.
 */

import { PALETA, type Nombres } from './preferencias'
import type { Sitio } from './losetas'
import { reproducir, type Accion, type Config, type Partida } from './reglas'

export const TAMANOS = [2, 3, 4] as const
export const salaDe = (n: number) => `castillos-mesa${n}`

export interface JugadaRed {
  x: number
  y: number
  giro: number
  estandarte: Sitio | null
}

export interface Mesa {
  /** Identifica la partida: las claves de sus jugadas lo llevan. */
  id: string
  semilla: number
  /** Jugadas de una partida anterior que se retomó (las primeras). */
  previas?: JugadaRed[]
}

export interface JugadorRed {
  nombre: string
  color: string
}

export type Estado = Record<string, unknown>

export const claveJugada = (mesa: string, k: number) => `jugada.${mesa}.${k}`

export interface Sala {
  n: number
  asientos: (string | null)[]
  jugadores: Record<string, JugadorRed>
  mesa: Mesa | null
  jugadas: JugadaRed[]
  turn: number
}

const esJugada = (j: unknown): j is JugadaRed => {
  const x = j as JugadaRed
  return !!x && Number.isInteger(x.x) && Number.isInteger(x.y) && Number.isInteger(x.giro) && 'estandarte' in x
}

/** Lee el estado de una sala de n asientos. Lo que no tiene la forma esperada se ignora. */
export function leerSala(estado: Estado, n: number): Sala {
  const asientos = Array.from({ length: n }, (_, i) => {
    const v = estado[`seat.${i}`]
    return typeof v === 'string' && v ? v : null
  })
  const jugadores: Record<string, JugadorRed> = {}
  for (const [k, v] of Object.entries(estado)) {
    if (!k.startsWith('jugador.')) continue
    const j = v as JugadorRed
    if (j && typeof j.nombre === 'string' && typeof j.color === 'string') jugadores[k.slice('jugador.'.length)] = { nombre: j.nombre.slice(0, 20), color: j.color }
  }
  const m = estado.mesa as Mesa
  const mesa = m && typeof m.id === 'string' && Number.isFinite(m.semilla) ? { id: m.id, semilla: m.semilla, previas: Array.isArray(m.previas) ? m.previas.filter(esJugada) : [] } : null
  const jugadas: JugadaRed[] = mesa ? [...(mesa.previas ?? [])] : []
  if (mesa) {
    for (let k = jugadas.length; ; k++) {
      const j = estado[claveJugada(mesa.id, k)]
      if (!esJugada(j)) break
      jugadas.push(j)
    }
  }
  const t = estado.turn
  return { n, asientos, jugadores, mesa, jugadas, turn: typeof t === 'number' ? t : 0 }
}

/** Nombres y colores por asiento: los que eligió cada uno; si dos coinciden en color, el segundo toma uno libre. */
export function nombresYColores(sala: Sala, nombres: Nombres): { nombre: string; color: string }[] {
  const usados = new Set<string>()
  return sala.asientos.map((id, i) => {
    const j = id ? sala.jugadores[id] : undefined
    let color = j && PALETA.some((c) => c.color === j.color) ? j.color : PALETA[i].color
    if (usados.has(color)) color = PALETA.find((c) => !usados.has(c.color))!.color
    usados.add(color)
    const nombre = j?.nombre.trim() || nombres.color(color) || nombres.jugador(i + 1)
    return { nombre, color }
  })
}

export const accionesDe = (jugadas: JugadaRed[]): Accion[] =>
  jugadas.flatMap((j) => [
    { tipo: 'colocar', x: j.x, y: j.y, giro: j.giro } as Accion,
    j.estandarte ? ({ tipo: 'estandarte', sitio: j.estandarte } as Accion) : ({ tipo: 'pasar' } as Accion),
  ])

/**
 * La partida de la sala, rehecha con el motor. Si una jugada no vale (no debería
 * pasar: cada pantalla solo envía jugadas legales), se para ahí y dice cuál
 * (`jugadaMala`, contando desde 1).
 */
export function partidaDeSala(sala: Sala, nombres: Nombres): { partida: Partida; config: Config; jugadaMala: number | null } | null {
  if (!sala.mesa || sala.asientos.some((a) => !a)) return null
  const config: Config = { jugadores: nombresYColores(sala, nombres).map((j) => j.nombre), semilla: sala.mesa.semilla }
  const acciones = accionesDe(sala.jugadas)
  try {
    return { partida: reproducir(config, acciones), config, jugadaMala: null }
  } catch {
    // Rehacer jugada a jugada para saber cuál falla y quedarse con las buenas.
    let buenas: Accion[] = []
    for (let k = 0; k < sala.jugadas.length; k++) {
      const prueba = [...buenas, ...accionesDe([sala.jugadas[k]])]
      try {
        reproducir(config, prueba)
        buenas = prueba
      } catch {
        return { partida: reproducir(config, buenas), config, jugadaMala: k + 1 }
      }
    }
    return { partida: reproducir(config, buenas), config, jugadaMala: null }
  }
}

/** En qué asiento está este participante (o null). */
export const miAsiento = (sala: Sala, actorId: string | undefined) => (actorId ? sala.asientos.indexOf(actorId) : -1)

/** Una mesa nueva (la pone el anfitrión). Con `previas`, retoma una partida guardada. */
export function mesaNueva(semilla: number, previas: JugadaRed[] = [], ahora = Date.now()): Mesa {
  return { id: ahora.toString(36) + Math.floor(semilla % 1296).toString(36), semilla, previas }
}

/** A qué asiento le toca tras estas jugadas (para fijar `turn` al retomar). */
export const turnoTras = (jugadas: number, n: number) => jugadas % n

/** Lo que un dispositivo guarda para poder retomar la partida si la sala se vacía. */
export interface Guardado {
  n: number
  semilla: number
  jugadas: JugadaRed[]
  asientos: (string | null)[]
}
