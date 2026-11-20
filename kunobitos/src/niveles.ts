/*
 * Niveles de Kunobitos. Los niveles y sus grupos están en data/niveles.json;
 * aquí se convierten en lo que juega el motor.
 *
 * Cada nivel es una rejilla de `ancho` × `alto` bloques de 4 × 4 píxeles con
 * paredes a los lados y unas piezas encima, en orden (las de después tapan a
 * las de antes). Una pieza es [carácter, columna, fila, columna final, fila
 * final], con los extremos incluidos. Caracteres (ver `mapaDeTexto` en
 * motor.ts): '.' aire, '#' tierra, '=' cristal, '~' agua, '^' pinchos,
 * 'b' bambú, 'p' papel, 's' nieve, 'h' hielo y 't' tejas. `nido` y `dojo`
 * son [columna, fila] de la boca del Nido y de la puerta del Dojo.
 *
 * Ayuda para medir: la columna i va de x = 4i a 4i + 3 y la fila j de
 * y = 4j a 4j + 3; quien pisa una fila j tiene los pies en y = 4j − 1.
 * Desde el Nido hasta el suelo no debe haber más de 56 píxeles de caída.
 */

import { mapaDeTexto, type Habilidad, type Nivel, type Objeto } from './motor'
import type { IdEscenario } from './paisajes'

/** Pieza de un nivel: carácter y rectángulo de bloques (columna y fila de inicio y fin, incluidas). */
export type Pieza = [string, number, number, number, number]

/** Un grupo de niveles tal como está en data/niveles.json. */
export type DatosGrupo = {
  id: string
  nombre: string
  texto: string
  /** Escenario de la ampliación ninja (fondo, colores, música y cinta); sin él, el fondo de siempre. */
  escenario?: IdEscenario
  /** Lo que conviene saber del terreno y los elementos del escenario (sale en la ayuda). */
  aviso?: string
}

/** Un nivel tal como está en data/niveles.json. */
export type DatosNivel = {
  id: string
  grupo: string
  nombre: string
  pista: string
  ancho: number
  alto: number
  nido: [number, number]
  dojo: [number, number]
  piezas: Pieza[]
  /** Linternas, viento, cascadas, placas y puertas. */
  objetos?: Objeto[]
  total: number
  minimo: number
  intervalo: number
  tiempo: number
  habilidades: Partial<Record<Habilidad, number>>
}

export type DatosNiveles = { grupos: DatosGrupo[]; niveles: DatosNivel[] }

/** Un nivel listo para jugar. */
export type DefNivel = {
  id: string
  grupo: string
  nombre: string
  pista: string
  filas: string[]
  total: number
  minimo: number
  intervalo: number
  tiempo: number
  habilidades: Partial<Record<Habilidad, number>>
  /** El de su grupo, si es de la ampliación ninja. */
  escenario?: IdEscenario
  objetos?: Objeto[]
  /** Nombre del grupo y aviso del escenario, para la ayuda. */
  nombreGrupo: string
  aviso?: string
}

export function crearNivel(d: DefNivel): Nivel {
  const { mapa, nido, dojo } = mapaDeTexto(d.filas)
  return {
    nombre: d.nombre, mapa, nido, dojo, total: d.total, minimo: d.minimo, intervalo: d.intervalo, tiempo: d.tiempo,
    habilidades: d.habilidades, objetos: d.objetos,
  }
}

const entre = (v: number, a: number, b: number) => v >= a && v <= b

/**
 * Construye las filas de un nivel: paredes a los lados, las piezas en orden
 * (las de después tapan a las de antes), el Nido y el Dojo.
 */
export function construir(ancho: number, alto: number, piezas: Pieza[], nido: [number, number], dojo: [number, number]): string[] {
  return Array.from({ length: alto }, (_, j) => Array.from({ length: ancho }, (_, i) => {
    if (i === nido[0] && j === nido[1]) return 'N'
    if (i === dojo[0] && j === dojo[1]) return 'F'
    let c = i === 0 || i === ancho - 1 ? '#' : '.'
    for (const [ch, i0, j0, i1, j1] of piezas) if (entre(i, i0, i1) && entre(j, j0, j1)) c = ch
    return c
  }).join(''))
}

/** Un nivel de los datos, listo para jugar, con lo que toma de su grupo. */
export function defNivel(d: DatosNivel, g: DatosGrupo): DefNivel {
  const { ancho, alto, piezas, nido, dojo, objetos, ...resto } = d
  return {
    ...resto,
    filas: construir(ancho, alto, piezas, nido, dojo),
    ...(objetos ? { objetos } : {}),
    ...(g.escenario ? { escenario: g.escenario } : {}),
    nombreGrupo: g.nombre,
    ...(g.aviso ? { aviso: g.aviso } : {}),
  }
}
