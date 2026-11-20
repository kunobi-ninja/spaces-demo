/*
 * Zonas del reino: castillos, caminos, ríos, campos y ermitas.
 *
 * Cada trozo de una loseta es un nodo: "x,y#s0" para el segmento 0, "x,y#c1"
 * para el campo 1 y "x,y#e" para la ermita. Los nodos que se tocan a través de
 * un borde se unen (union-find) y cada grupo es una zona.
 */

import { girarCampos, girarSegmentos, mitadOpuesta, tipo, type Sitio } from './losetas'
import { PASO, clave, type Tablero } from './tablero'

export type TipoZona = 'castillo' | 'camino' | 'rio' | 'campo' | 'ermita'

export interface Zona {
  id: string
  tipo: TipoZona
  /** Claves "x,y" de las losetas de la zona, sin repetir. */
  losetas: string[]
  /** Losetas con escudo (solo castillos). */
  escudos: number
  /** Cerrada: castillo o camino sin bordes abiertos, o ermita con sus 8 vecinas. Los campos nunca se cierran. */
  cerrada: boolean
  /** Ermitas: cuántas de sus 8 casillas vecinas tienen loseta. */
  vecinas: number
  /** Campos: zonas de castillo con las que linda. */
  castillos: string[]
  /** Castillos, caminos y ríos: bordes que siguen abiertos. Ermitas: casillas vecinas vacías. */
  abiertos: number
}

export interface Analisis {
  zonas: Map<string, Zona>
  /** La zona de cada nodo. */
  zonaDe: (nodo: string) => string
}

const TIPO_SEGMENTO = { muralla: 'castillo', camino: 'camino', rio: 'rio' } as const

export function nodo(k: string, sitio: Sitio): string {
  if ('segmento' in sitio) return `${k}#s${sitio.segmento}`
  if ('campo' in sitio) return `${k}#c${sitio.campo}`
  return `${k}#e`
}

export function analizar(t: Tablero): Analisis {
  const padre = new Map<string, string>()
  const raiz = (n: string): string => {
    let r = n
    while (padre.get(r) !== r) r = padre.get(r)!
    let a = n
    while (a !== r) {
      const sig = padre.get(a)!
      padre.set(a, r)
      a = sig
    }
    return r
  }
  const unir = (a: string, b: string) => {
    const ra = raiz(a)
    const rb = raiz(b)
    if (ra !== rb) padre.set(ra < rb ? rb : ra, ra < rb ? ra : rb)
  }

  const piezas = Object.entries(t).map(([k, p]) => {
    const tl = tipo(p.id)
    return { k, p, tl, segs: girarSegmentos(tl.segmentos, p.giro), campos: girarCampos(tl.campos, p.giro) }
  })
  const porClave = new Map(piezas.map((x) => [x.k, x]))

  for (const { k, tl, segs, campos } of piezas) {
    segs.forEach((_, i) => padre.set(`${k}#s${i}`, `${k}#s${i}`))
    campos.forEach((_, i) => padre.set(`${k}#c${i}`, `${k}#c${i}`))
    if (tl.ermita) padre.set(`${k}#e`, `${k}#e`)
  }

  // Uniones a través del borde este y del sur de cada loseta (los otros dos los hace la vecina).
  const abiertos = new Map<string, number>()
  for (const { k, p, segs, campos } of piezas) {
    for (let l = 0; l < 4; l++) {
      const v = porClave.get(clave(p.x + PASO[l].dx, p.y + PASO[l].dy))
      const i = segs.findIndex((s) => s.lados.includes(l))
      if (!v) {
        if (i >= 0) abiertos.set(`${k}#s${i}`, (abiertos.get(`${k}#s${i}`) ?? 0) + 1)
        continue
      }
      if (l !== 1 && l !== 2) continue
      const op = (l + 2) % 4
      const j = v.segs.findIndex((s) => s.lados.includes(op))
      if (i >= 0 && j >= 0) unir(`${k}#s${i}`, `${v.k}#s${j}`)
      for (const x of [2 * l, 2 * l + 1]) {
        const a = campos.findIndex((c) => c.mitades.includes(x))
        const b = v.campos.findIndex((c) => c.mitades.includes(mitadOpuesta(x)))
        if (a >= 0 && b >= 0) unir(`${k}#c${a}`, `${v.k}#c${b}`)
      }
    }
  }

  const zonas = new Map<string, Zona>()
  const losetas = new Map<string, Set<string>>()
  const escudos = new Map<string, Set<string>>()
  const castillos = new Map<string, Set<string>>()
  const zona = (id: string, tipoZona: TipoZona): Zona => {
    let z = zonas.get(id)
    if (!z) {
      z = { id, tipo: tipoZona, losetas: [], escudos: 0, cerrada: false, vecinas: 0, castillos: [], abiertos: 0 }
      zonas.set(id, z)
      losetas.set(id, new Set())
      escudos.set(id, new Set())
      castillos.set(id, new Set())
    }
    return z
  }

  for (const { k, p, tl, segs, campos } of piezas) {
    segs.forEach((s, i) => {
      const id = raiz(`${k}#s${i}`)
      zona(id, TIPO_SEGMENTO[s.tipo])
      losetas.get(id)!.add(k)
      if (s.tipo === 'muralla' && tl.escudo) escudos.get(id)!.add(k)
    })
    campos.forEach((c, i) => {
      const id = raiz(`${k}#c${i}`)
      zona(id, 'campo')
      losetas.get(id)!.add(k)
      for (const ci of c.castillos) castillos.get(id)!.add(raiz(`${k}#s${ci}`))
    })
    if (tl.ermita) {
      const id = `${k}#e`
      const z = zona(id, 'ermita')
      losetas.get(id)!.add(k)
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && t[clave(p.x + dx, p.y + dy)]) z.vecinas++
      z.cerrada = z.vecinas === 8
      z.abiertos = 8 - z.vecinas
    }
  }

  const abiertosPorZona = new Map<string, number>()
  for (const [n, a] of abiertos) abiertosPorZona.set(raiz(n), (abiertosPorZona.get(raiz(n)) ?? 0) + a)

  for (const z of zonas.values()) {
    z.losetas = [...losetas.get(z.id)!].sort()
    z.escudos = escudos.get(z.id)!.size
    z.castillos = [...castillos.get(z.id)!].sort()
    if (z.tipo === 'castillo' || z.tipo === 'camino' || z.tipo === 'rio') {
      z.abiertos = abiertosPorZona.get(z.id) ?? 0
      z.cerrada = z.abiertos === 0
    }
  }

  return { zonas, zonaDe: (n) => (n.endsWith('#e') ? n : raiz(n)) }
}
