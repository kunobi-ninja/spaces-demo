/*
 * El tablero: dónde hay losetas, qué casillas están libres y si una loseta
 * encaja en una casilla con un giro dado. También las normas del río.
 *
 * Coordenadas: x crece hacia el este y y hacia el sur. Lados: 0 norte, 1 este,
 * 2 sur, 3 oeste.
 */

import { girarSegmentos, ladosGirados, tipo } from './losetas'

export interface Colocada {
  id: string
  giro: number
  x: number
  y: number
}

/** Las losetas puestas, por clave "x,y". */
export type Tablero = Record<string, Colocada>

export const PASO = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
]

export const clave = (x: number, y: number) => `${x},${y}`

export function vecina(t: Tablero, x: number, y: number, lado: number): Colocada | undefined {
  return t[clave(x + PASO[lado].dx, y + PASO[lado].dy)]
}

/** Casillas libres junto a alguna loseta. */
export function huecos(t: Tablero): { x: number; y: number }[] {
  const vistos = new Set<string>()
  const r: { x: number; y: number }[] = []
  for (const p of Object.values(t)) {
    for (const d of PASO) {
      const x = p.x + d.dx
      const y = p.y + d.dy
      const k = clave(x, y)
      if (t[k] || vistos.has(k)) continue
      vistos.add(k)
      r.push({ x, y })
    }
  }
  return r.sort((a, b) => a.y - b.y || a.x - b.x)
}

/** ¿Coinciden todos los lados con las vecinas, y hay al menos una vecina? */
export function encaja(t: Tablero, id: string, giro: number, x: number, y: number): boolean {
  if (t[clave(x, y)]) return false
  const mios = ladosGirados(id, giro)
  let vecinas = 0
  for (let l = 0; l < 4; l++) {
    const v = vecina(t, x, y, l)
    if (!v) continue
    vecinas++
    if (ladosGirados(v.id, v.giro)[(l + 2) % 4] !== mios[l]) return false
  }
  return vecinas > 0
}

/** Hacia dónde gira el río: 1 a la derecha, -1 a la izquierda, 0 recto o sin giro. */
export type GiroRio = 1 | -1 | 0

/**
 * Normas extra de una loseta de río: el agua tiene que continuar el río por
 * exactamente uno de sus lados, y un meandro no puede girar hacia el mismo
 * lado que el meandro anterior. Devuelve el giro que da o null si no vale.
 */
export function giroDelRio(t: Tablero, id: string, giro: number, x: number, y: number, ultimo: GiroRio): GiroRio | null {
  const rio = girarSegmentos(tipo(id).segmentos, giro).find((s) => s.tipo === 'rio')
  if (!rio) return null
  const unidos = rio.lados.filter((l) => vecina(t, x, y, l))
  if (unidos.length !== 1) return null
  if (rio.lados.length !== 2) return 0
  const entra = unidos[0]
  const sale = rio.lados.find((l) => l !== entra)!
  const vuelta = (((sale - (entra + 2)) % 4) + 4) % 4
  if (vuelta === 0) return 0
  const g: GiroRio = vuelta === 1 ? 1 : -1
  return g === ultimo ? null : g
}

export interface Hueco {
  x: number
  y: number
  giro: number
}

/** Todas las formas legales de colocar una loseta (casilla y giro). */
export function huecosLegales(t: Tablero, id: string, ultimoGiroRio: GiroRio = 0): Hueco[] {
  const esRio = tipo(id).familia === 'Río'
  const r: Hueco[] = []
  for (const h of huecos(t)) {
    for (let g = 0; g < 4; g++) {
      if (!encaja(t, id, g, h.x, h.y)) continue
      if (esRio && giroDelRio(t, id, g, h.x, h.y, ultimoGiroRio) === null) continue
      r.push({ x: h.x, y: h.y, giro: g })
    }
  }
  return r
}
