/*
 * Las losetas de Castillos. Cuáles hay y cuántas está en data/losetas.json.
 *
 * Lados: 0 = norte, 1 = este, 2 = sur, 3 = oeste.
 * Cada loseta se define por sus segmentos: los trozos de muralla, camino o río
 * que hay en ella y los lados que tocan. Un lado sin segmento es campo.
 * Un segmento de camino o río con un solo lado es un extremo: el camino acaba
 * en un cruce, una puerta o una ermita; el río, en un manantial o un lago.
 *
 * Campos: cada lado tiene dos mitades (8 en total), numeradas en el sentido del
 * reloj desde la esquina noroeste:
 *   0 norte-oeste, 1 norte-este, 2 este-norte, 3 este-sur,
 *   4 sur-este, 5 sur-oeste, 6 oeste-sur, 7 oeste-norte.
 * Un campo es el conjunto de mitades que se tocan dentro de la loseta, más los
 * castillos (índices de segmento) con los que linda. Los caminos y los ríos
 * parten el campo en dos; las murallas lo cierran.
 */

import datosLosetas from '../data/losetas.json'
import datosPuntos from '../data/puntos.json'

export type Lado = 'muralla' | 'camino' | 'rio' | 'campo'
export type TipoSegmento = 'muralla' | 'camino' | 'rio'
export type Adorno = 'cruce' | 'manantial' | 'lago' | 'puente'
export type Familia = 'Castillos' | 'Caminos' | 'Ermitas' | 'Río'

export interface Segmento {
  tipo: TipoSegmento
  lados: number[]
}

export interface Campo {
  /** Mitades de lado (0-7) que forman el campo. */
  mitades: number[]
  /** Índices de los segmentos de muralla con los que linda. */
  castillos: number[]
}

/** Dónde va un estandarte: en un segmento, en un campo (labriego) o en la ermita. */
export type Sitio = { segmento: number } | { campo: number } | { ermita: true }

export interface TipoLoseta {
  id: string
  nombre: string
  familia: Familia
  segmentos: Segmento[]
  campos: Campo[]
  cantidad: number
  /** El castillo de la loseta lleva escudo, que suma puntos (data/puntos.json). */
  escudo?: boolean
  ermita?: boolean
  adorno?: Adorno
}

/** Las losetas (data/losetas.json): sus lados, campos, cuántas hay de cada una y con cuál empieza y acaba el río. */
export const TIPOS = datosLosetas.tipos as unknown as TipoLoseta[]

/** La partida empieza con el manantial en el centro. */
export const LOSETA_INICIAL = datosLosetas.inicial
/** El lago es siempre la última loseta del río. */
export const LOSETA_FINAL_RIO = datosLosetas.finalRio
export const ESTANDARTES_POR_JUGADOR = datosPuntos.estandartesPorJugador

/** Puntos (data/puntos.json). */
export const PUNTOS = {
  castilloCerrado: datosPuntos.castilloCerrado,
  castilloAbierto: datosPuntos.castilloAbierto,
  camino: datosPuntos.camino,
  ermitaCerrada: datosPuntos.ermitaCerrada,
  campoPorCastilloCerrado: datosPuntos.campoPorCastilloCerrado,
}

export function tipo(id: string): TipoLoseta {
  const t = TIPOS.find((x) => x.id === id)
  if (!t) throw new Error(`Loseta desconocida: ${id}`)
  return t
}

/** Los cuatro lados de una loseta (sin girar). */
export function ladosDe(t: Pick<TipoLoseta, 'segmentos'>): [Lado, Lado, Lado, Lado] {
  const lados: [Lado, Lado, Lado, Lado] = ['campo', 'campo', 'campo', 'campo']
  for (const s of t.segmentos) for (const l of s.lados) lados[l] = s.tipo
  return lados
}

/** Gira una lista de segmentos `giro` cuartos de vuelta en el sentido del reloj. */
export function girarSegmentos(segmentos: Segmento[], giro: number): Segmento[] {
  const g = ((giro % 4) + 4) % 4
  return segmentos.map((s) => ({ tipo: s.tipo, lados: s.lados.map((l) => (l + g) % 4).sort() }))
}

/** Gira los campos: cada cuarto de vuelta mueve cada mitad dos posiciones. */
export function girarCampos(campos: Campo[], giro: number): Campo[] {
  const g = ((giro % 4) + 4) % 4
  return campos.map((k) => ({ mitades: k.mitades.map((x) => (x + 2 * g) % 8).sort((a, b) => a - b), castillos: k.castillos }))
}

/** Lados de una loseta girada. */
export function ladosGirados(id: string, giro: number): [Lado, Lado, Lado, Lado] {
  return ladosDe({ segmentos: girarSegmentos(tipo(id).segmentos, giro) })
}

/** La mitad que toca a la mitad `x` en la loseta vecina por ese lado. */
export function mitadOpuesta(x: number): number {
  const otra = ((x >> 1) + 2) % 4
  return 2 * otra + (1 - (x & 1))
}

const ids = (filtro: (t: TipoLoseta) => boolean) =>
  TIPOS.filter(filtro).flatMap((t) => Array.from({ length: t.cantidad }, () => t.id))

/** Las losetas de río, sin barajar: el manantial, el tramo del medio y el lago. */
export function mazoRio(): string[] {
  return ids((t) => t.familia === 'Río')
}

/** El resto de losetas, sin barajar: un id por loseta. */
export function mazoPrincipal(): string[] {
  return ids((t) => t.familia !== 'Río')
}
