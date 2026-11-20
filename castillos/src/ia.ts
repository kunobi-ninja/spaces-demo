/*
 * Rival automático. Prueba cada colocación legal de la loseta de la
 * mano y, en cada una, no poner estandarte o ponerlo en cada sitio libre.
 * Se queda con la jugada que deja mejor la diferencia de puntos esperados
 * entre la IA y la media de los rivales.
 *
 * Puntos esperados de un jugador = los que ya tiene + lo que valdrían las
 * zonas donde tiene mayoría (las cerradas, enteras; las abiertas, según lo
 * probable que sea cerrarlas con las losetas que quedan) + lo que valen los
 * estandartes que le quedan en la mano.
 *
 * Es pura y determinista: con la misma partida (y el mismo `azar`) elige lo mismo.
 */

import { PUNTOS, type Sitio } from './losetas'
import { sitiosLibres, type Accion, type Partida, type Puesto } from './reglas'
import { clave, type Hueco } from './tablero'
import { colocaciones } from './reglas'
import { analizar, nodo, type Analisis, type Zona } from './zonas'

export interface Jugada {
  colocar: Hueco
  /** Dónde poner el estandarte; null para no poner. */
  estandarte: Sitio | null
  /** Lo que la IA espera ganar con ella. */
  valor: number
}

const limitar = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))

/** Probabilidad de cerrar una zona con estos bordes abiertos y estas losetas por robar. */
function probCerrar(abiertos: number, quedan: number): number {
  if (abiertos === 0) return 1
  if (quedan === 0) return 0
  return limitar(0.82 ** abiertos * Math.min(1, quedan / (6 * abiertos)), 0.02, 0.9)
}

/** Lo que vale una zona para quien tenga la mayoría. */
export function valorZona(z: Zona, a: Analisis, quedan: number): number {
  switch (z.tipo) {
    case 'castillo': {
      const cerrado = PUNTOS.castilloCerrado.loseta * z.losetas.length + PUNTOS.castilloCerrado.escudo * z.escudos
      if (z.cerrada) return cerrado
      const abierto = PUNTOS.castilloAbierto.loseta * z.losetas.length + PUNTOS.castilloAbierto.escudo * z.escudos
      const p = probCerrar(z.abiertos, quedan)
      return p * cerrado + (1 - p) * abierto
    }
    case 'camino':
      return PUNTOS.camino * z.losetas.length + (z.cerrada ? 0 : 0.3 * Math.min(z.abiertos, 2) * Math.min(1, quedan / 10))
    case 'ermita': {
      if (z.cerrada) return PUNTOS.ermitaCerrada
      const q = limitar(quedan / 30, 0, 0.85)
      return 1 + z.vecinas + q * z.abiertos
    }
    case 'campo': {
      let v = 0
      for (const id of z.castillos) {
        const c = a.zonas.get(id)
        if (c) v += PUNTOS.campoPorCastilloCerrado * (c.cerrada ? 1 : 0.7 * probCerrar(c.abiertos, quedan))
      }
      return v
    }
    default:
      return 0
  }
}

/** Lo que vale tener un estandarte en la mano: mucho al principio, nada al final. */
const valorEnMano = (quedan: number) => 2 * Math.min(1, quedan / 25)

/** Puntos esperados de cada jugador con este tablero y estos estandartes. */
function esperados(p: Partida, a: Analisis, puestos: Puesto[], quedan: number): number[] {
  const r = p.jugadores.map((j) => j.puntos)
  const mano = p.jugadores.map((j) => j.enMano)
  const porZona = new Map<string, Puesto[]>()
  for (const e of puestos) {
    const z = a.zonaDe(nodo(e.en, e.sitio))
    porZona.set(z, [...(porZona.get(z) ?? []), e])
  }
  for (const [id, aqui] of porZona) {
    const z = a.zonas.get(id)!
    const n = new Map<number, number>()
    for (const e of aqui) n.set(e.jugador, (n.get(e.jugador) ?? 0) + 1)
    const max = Math.max(...n.values())
    const v = valorZona(z, a, quedan)
    for (const [j, k] of n) if (k === max) r[j] += v
    // Los estandartes de una zona que se cierra ahora vuelven a la mano.
    if (z.cerrada && z.tipo !== 'campo') for (const e of aqui) mano[e.jugador]++
  }
  const vm = valorEnMano(quedan)
  return r.map((x, j) => x + vm * mano[j])
}

/** Ventaja de `yo`: sus puntos esperados menos la media de los rivales. */
function ventaja(e: number[], yo: number): number {
  const otros = e.filter((_, j) => j !== yo)
  return e[yo] - otros.reduce((s, x) => s + x, 0) / otros.length
}

/** Con la loseta ya colocada (fase estandarte): la mejor opción, sin estandarte o en un sitio libre. */
function mejorEstandarte(tras: Partida, a: Analisis, azar?: () => number): { estandarte: Sitio | null; valor: number } {
  const yo = tras.turno
  const k = tras.orden[tras.orden.length - 1]
  const quedan = tras.mazoRio.length + tras.mazo.length
  let mejor: { estandarte: Sitio | null; valor: number } | null = null
  for (const s of [null, ...sitiosLibres(tras, a)]) {
    const puestos = s ? [...tras.puestos, { jugador: yo, en: k, sitio: s }] : tras.puestos
    const conMano = s ? { ...tras, jugadores: tras.jugadores.map((j, i) => (i === yo ? { ...j, enMano: j.enMano - 1 } : j)) } : tras
    const valor = ventaja(esperados(conMano, a, puestos, quedan), yo) + (azar ? azar() * 0.05 : 0)
    if (!mejor || valor > mejor.valor) mejor = { estandarte: s, valor }
  }
  return mejor!
}

/** La mejor jugada para quien tiene el turno. `azar` (opcional) desempata con un poco de ruido. */
export function elegirJugada(p: Partida, azar?: () => number): Jugada {
  if (p.fase !== 'colocar' || !p.actual) throw new Error('La IA solo juega con una loseta en la mano')
  let mejor: Jugada | null = null
  for (const h of colocaciones(p)) {
    const k = clave(h.x, h.y)
    const tablero = { ...p.tablero, [k]: { id: p.actual, giro: h.giro, x: h.x, y: h.y } }
    const tras: Partida = { ...p, tablero, orden: [...p.orden, k], fase: 'estandarte', actual: null }
    const m = mejorEstandarte(tras, analizar(tablero), azar)
    if (!mejor || m.valor > mejor.valor) mejor = { colocar: h, ...m }
  }
  return mejor!
}

/** En la fase de estandarte: dónde lo pone la IA (null: no lo pone). Sin `azar` coincide con `elegirJugada`. */
export function elegirEstandarte(p: Partida, azar?: () => number): Sitio | null {
  if (p.fase !== 'estandarte') throw new Error('Ahora no toca poner estandarte')
  return mejorEstandarte(p, analizar(p.tablero), azar).estandarte
}

/** Las dos acciones del turno de la IA: colocar y después estandarte o pasar. */
export function accionesIA(p: Partida, azar?: () => number): [Accion, Accion] {
  const j = elegirJugada(p, azar)
  return [{ tipo: 'colocar', ...j.colocar }, j.estandarte ? { tipo: 'estandarte', sitio: j.estandarte } : { tipo: 'pasar' }]
}
