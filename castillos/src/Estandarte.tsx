/*
 * Los estandartes sobre una loseta (caja de 100 × 100): dónde va cada uno y su dibujo.
 */

import type { Segmento, Sitio } from './losetas'

/** Color del mástil. */
const MADERA = '#7a4f2c'

const PUNTO_LADO = [
  { x: 50, y: 0 },
  { x: 100, y: 50 },
  { x: 50, y: 100 },
  { x: 0, y: 50 },
]
const DIRECCION = [
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
]
const ESQUINA: Record<string, { x: number; y: number }> = {
  '0,1': { x: 100, y: 0 },
  '1,2': { x: 100, y: 100 },
  '2,3': { x: 0, y: 100 },
  '0,3': { x: 0, y: 0 },
}

/** Dónde se dibuja el estandarte de un segmento. */
export function anclaje(s: Segmento): { x: number; y: number } {
  if (s.tipo === 'muralla') {
    if (s.lados.length === 4) return { x: 50, y: 50 }
    const pts = s.lados.map((l) => ({ x: PUNTO_LADO[l].x + DIRECCION[l].x * 15, y: PUNTO_LADO[l].y + DIRECCION[l].y * 15 }))
    return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length }
  }
  if (s.lados.length === 1) {
    const l = s.lados[0]
    return { x: PUNTO_LADO[l].x + DIRECCION[l].x * 30, y: PUNTO_LADO[l].y + DIRECCION[l].y * 30 }
  }
  const [a, b] = s.lados
  const p = PUNTO_LADO[a]
  const q = PUNTO_LADO[b]
  if (b - a === 2) return { x: 50, y: 50 }
  const e = ESQUINA[`${a},${b}`]
  const cx = 50 + (e.x - 50) * 0.3
  const cy = 50 + (e.y - 50) * 0.3
  return { x: 0.25 * p.x + 0.5 * cx + 0.25 * q.x, y: 0.25 * p.y + 0.5 * cy + 0.25 * q.y }
}

/** Punto de cada mitad de lado (0-7), en el sentido del reloj desde el noroeste. */
const PUNTO_MITAD = [
  { x: 25, y: 0 }, { x: 75, y: 0 }, { x: 100, y: 25 }, { x: 100, y: 75 },
  { x: 75, y: 100 }, { x: 25, y: 100 }, { x: 0, y: 75 }, { x: 0, y: 25 },
]

/** Dónde se dibuja el labriego de un campo (mitades ya giradas). */
export function anclajeCampo(mitades: number[]): { x: number; y: number } {
  const pts = mitades.map((x) => PUNTO_MITAD[x])
  const x = pts.reduce((a, p) => a + p.x, 0) / pts.length
  const y = pts.reduce((a, p) => a + p.y, 0) / pts.length
  return { x: x + (50 - x) * 0.25, y: y + (50 - y) * 0.25 }
}

/** Dónde se dibuja el estandarte de una ermita. */
export const ANCLAJE_ERMITA = { x: 70, y: 66 }


/** Un estandarte puesto en una loseta. */
export type Puesto = Sitio & { color: string }

/** El punto de dibujo y si va tumbado (labriego), con segmentos y campos ya girados. */
export function puntoDe(sitio: Sitio, segs: Segmento[], campos: { mitades: number[] }[]): { x: number; y: number; tumbado: boolean } {
  if ('segmento' in sitio) return { ...anclaje(segs[sitio.segmento]), tumbado: false }
  if ('campo' in sitio) return { ...anclajeCampo(campos[sitio.campo].mitades), tumbado: true }
  return { ...ANCLAJE_ERMITA, tumbado: false }
}

export function Estandarte({ x, y, color, tumbado = false }: { x: number; y: number; color: string; tumbado?: boolean }) {
  if (tumbado) {
    return (
      <g transform={`translate(${x} ${y})`}>
        <ellipse cx={1} cy={3} rx={11} ry={3} fill="rgba(0,0,0,0.25)" />
        <line x1={-10} y1={1} x2={10} y2={1} stroke={MADERA} strokeWidth={2} strokeLinecap="round" />
        <path d="M-9 0 L-5 -11 L0 0 Z" fill={color} stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} />
      </g>
    )
  }
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={0} cy={9} rx={7} ry={2.5} fill="rgba(0,0,0,0.25)" />
      <line x1={-4} y1={9} x2={-4} y2={-11} stroke={MADERA} strokeWidth={2} strokeLinecap="round" />
      <path d="M-3 -11 L9 -7 L-3 -2 Z" fill={color} stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} />
    </g>
  )
}
