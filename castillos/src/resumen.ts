/*
 * Lo que la pantalla cuenta de una partida, sacado solo del motor:
 *   historial(p) → una jugada por loseta colocada, con su estandarte y sus puntos
 *   desglose(p)  → los puntos de cada jugador por tipo de zona, en la partida y al final
 */

import { tipo, type Sitio } from './losetas'
import type { Anotacion, Partida } from './reglas'

export type ZonaPuntos = 'castillo' | 'camino' | 'ermita' | 'campo'
export const ZONAS_PUNTOS: ZonaPuntos[] = ['castillo', 'camino', 'ermita', 'campo']

export interface Jugada {
  /** Número de la loseta colocada (1 = la primera tras el manantial). */
  n: number
  jugador: number
  loseta: string
  /** Dónde puso el estandarte; null si no puso; undefined si aún no ha decidido. */
  estandarte?: ZonaPuntos | null
  /** Zonas que se puntuaron al acabar esta jugada. */
  puntos: Anotacion[]
}

/** En qué tipo de zona cae un estandarte. */
export function zonaDeSitio(s: Sitio, id: string): ZonaPuntos {
  if ('ermita' in s) return 'ermita'
  if ('campo' in s) return 'campo'
  return tipo(id).segmentos[s.segmento].tipo === 'muralla' ? 'castillo' : 'camino'
}

export function historial(p: Partida): Jugada[] {
  const n = p.jugadores.length
  const r: Jugada[] = []
  for (const a of p.acciones) {
    if (a.tipo === 'colocar') {
      const k = r.length + 1
      const loseta = p.tablero[p.orden[k]].id
      r.push({ n: k, jugador: (k - 1) % n, loseta, puntos: [] })
    } else if (a.tipo === 'estandarte') {
      const j = r[r.length - 1]
      j.estandarte = zonaDeSitio(a.sitio, j.loseta)
    } else if (a.tipo === 'pasar') {
      r[r.length - 1].estandarte = null
    }
  }
  for (const an of p.anotaciones) {
    if (!an.final && r[an.turno - 2]) r[an.turno - 2].puntos.push(an)
  }
  return r
}

export interface Desglose {
  partida: Record<ZonaPuntos, number>
  final: Record<ZonaPuntos, number>
  total: number
}

const ceros = (): Record<ZonaPuntos, number> => ({ castillo: 0, camino: 0, ermita: 0, campo: 0 })

export function desglose(p: Partida): Desglose[] {
  const r = p.jugadores.map(() => ({ partida: ceros(), final: ceros(), total: 0 }))
  for (const a of p.anotaciones) {
    if (a.zona === 'rio') continue
    for (const j of a.ganadores) {
      r[j][a.final ? 'final' : 'partida'][a.zona as ZonaPuntos] += a.puntos
      r[j].total += a.puntos
    }
  }
  return r
}

/** Puestos 1, 2, 3… por puntos; los empatados comparten puesto. */
export function clasificacion(p: Partida): { jugador: number; puesto: number }[] {
  const orden = p.jugadores.map((_, i) => i).sort((a, b) => p.jugadores[b].puntos - p.jugadores[a].puntos || a - b)
  return orden.map((jugador, i) => ({
    jugador,
    puesto: orden.findIndex((o) => p.jugadores[o].puntos === p.jugadores[jugador].puntos) + 1,
  }))
}
