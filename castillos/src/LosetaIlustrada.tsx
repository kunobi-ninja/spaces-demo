/*
 * Dibujo de una loseta con aspecto ilustrado (hierba con matices, árboles,
 * murallas de piedra con torres, casas con tejado, caminos de tierra y ríos con
 * reflejos, ermitas y escudos). Todo dibujado aquí en SVG, con una semilla por loseta para que el
 * adorno salga siempre igual.
 */

import { useId } from 'react'
import { Estandarte, puntoDe, type Puesto } from './Estandarte'
import { girarCampos, girarSegmentos, tipo, type Segmento } from './losetas'
import { useTextos } from './textos'

type P = { x: number; y: number }

const LADO: P[] = [
  { x: 50, y: 0 },
  { x: 100, y: 50 },
  { x: 50, y: 100 },
  { x: 0, y: 50 },
]
const DIR: P[] = [
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
]
const ESQ: Record<string, P> = {
  '0,1': { x: 100, y: 0 },
  '1,2': { x: 100, y: 100 },
  '2,3': { x: 0, y: 100 },
  '0,3': { x: 0, y: 0 },
}

const C = {
  hierba: '#93b964',
  hierbaClara: '#a9cb76',
  hierbaOscura: '#7fa553',
  brizna: '#6f9746',
  arbol: '#4b7431',
  arbolLuz: '#699a42',
  patio: '#d9b986',
  piedra: '#a39580',
  piedraLuz: '#cfc3ad',
  junta: '#6c604f',
  tierra: '#d6b77f',
  tierraBorde: '#94744a',
  tierraPiedra: '#b8955f',
  agua: '#4a8ec4',
  aguaLuz: '#b4dcf3',
  orilla: '#5f8a4a',
  pared: '#efe2c4',
  paredSombra: '#d2c19c',
  tejado: '#b8462f',
  tejadoSombra: '#8e3423',
  madera: '#6e4527',
}

const COLORES_FLOR = ['#fff6d8', '#f4d35e', '#e07a5f']

/* ---------- utilidades ---------- */

function semilla(texto: string): () => number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

/** Gira un punto `g` cuartos de vuelta en el sentido del reloj alrededor del centro. */
function girar(p: P, g: number): P {
  let q = p
  for (let i = 0; i < ((g % 4) + 4) % 4; i++) q = { x: 100 - q.y, y: q.x }
  return q
}
function desgirar(p: P, g: number): P {
  let q = p
  for (let i = 0; i < ((g % 4) + 4) % 4; i++) q = { x: q.y, y: 100 - q.x }
  return q
}
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)

/* ---------- murallas ---------- */

type Forma = 'uno' | 'esquina' | 'paso' | 'tres' | 'todo'

const FORMAS: Record<Forma, { relleno: string; bordes: string[]; torres: P[]; casas: P[]; escudo: P }> = {
  uno: {
    relleno: 'M0 0 H100 C78 30 22 30 0 0 Z',
    bordes: ['M100 0 C78 30 22 30 0 0'],
    torres: [{ x: 72.9, y: 18.9 }, { x: 27.1, y: 18.9 }],
    casas: [{ x: 40, y: 6 }, { x: 52, y: 9 }, { x: 62, y: 5 }],
    escudo: { x: 50, y: 10 },
  },
  esquina: {
    relleno: 'M0 0 H100 V100 C72 62 38 28 0 0 Z',
    bordes: ['M100 100 C72 62 38 28 0 0'],
    torres: [{ x: 53.75, y: 46.25 }],
    casas: [{ x: 50, y: 8 }, { x: 68, y: 10 }, { x: 86, y: 12 }, { x: 72, y: 28 }, { x: 88, y: 32 }, { x: 88, y: 54 }, { x: 34, y: 6 }],
    escudo: { x: 76, y: 22 },
  },
  paso: {
    relleno: 'M0 0 H100 C68 30 68 70 100 100 H0 C32 70 32 30 0 0 Z',
    bordes: ['M100 100 C68 70 68 30 100 0', 'M0 0 C32 30 32 70 0 100'],
    torres: [{ x: 76, y: 50 }, { x: 24, y: 50 }],
    casas: [{ x: 50, y: 10 }, { x: 44, y: 28 }, { x: 56, y: 42 }, { x: 44, y: 58 }, { x: 56, y: 72 }, { x: 50, y: 90 }],
    escudo: { x: 50, y: 50 },
  },
  tres: {
    relleno: 'M0 0 H100 V100 C72 72 28 72 0 100 Z',
    bordes: ['M100 100 C72 72 28 72 0 100'],
    torres: [{ x: 81.5, y: 86.6 }, { x: 18.5, y: 86.6 }],
    casas: [
      { x: 13, y: 12 }, { x: 31, y: 10 }, { x: 50, y: 13 }, { x: 69, y: 10 }, { x: 87, y: 12 },
      { x: 22, y: 31 }, { x: 41, y: 29 }, { x: 60, y: 32 }, { x: 79, y: 30 },
      { x: 12, y: 50 }, { x: 31, y: 49 }, { x: 69, y: 49 }, { x: 88, y: 51 },
      { x: 10, y: 69 }, { x: 90, y: 70 },
    ],
    escudo: { x: 50, y: 44 },
  },
  todo: {
    relleno: 'M0 0 H100 V100 H0 Z',
    bordes: [],
    torres: [{ x: 50, y: 50 }],
    casas: [
      { x: 13, y: 12 }, { x: 31, y: 10 }, { x: 50, y: 13 }, { x: 69, y: 10 }, { x: 87, y: 12 },
      { x: 18, y: 32 }, { x: 82, y: 32 }, { x: 14, y: 52 }, { x: 86, y: 52 }, { x: 18, y: 72 }, { x: 82, y: 72 },
      { x: 13, y: 91 }, { x: 31, y: 89 }, { x: 50, y: 88 }, { x: 69, y: 90 }, { x: 87, y: 90 },
    ],
    escudo: { x: 50, y: 30 },
  },
}

function formaMuralla(lados: number[]): { forma: Forma; giro: number } {
  const n = lados.length
  if (n === 1) return { forma: 'uno', giro: lados[0] }
  if (n === 4) return { forma: 'todo', giro: 0 }
  if (n === 3) {
    const falta = [0, 1, 2, 3].find((l) => !lados.includes(l))!
    return { forma: 'tres', giro: (falta - 2 + 4) % 4 }
  }
  const [a, b] = lados
  if (b - a === 2) return { forma: 'paso', giro: a }
  return { forma: 'esquina', giro: b - a === 1 ? a : 3 }
}

/** ¿Está un punto (en la orientación de partida) dentro del castillo, con margen? */
function dentroDe(forma: Forma, p: P, margen: number): boolean {
  switch (forma) {
    case 'uno':
      return p.y < 22.5 * (1 - ((p.x - 50) / 50) ** 2) + margen
    case 'esquina':
      return p.y < p.x - 7 + margen * 1.4
    case 'paso':
      return p.x > 24 - margen && p.x < 76 + margen
    case 'tres':
      return p.y < 79 + margen
    case 'todo':
      return true
  }
}

/* ---------- caminos y ríos ---------- */

function largoHastaMuralla(lado: number, todos: Segmento[]): number {
  const opuesto = (lado + 2) % 4
  const muro = todos.find((s) => s.tipo === 'muralla' && s.lados.includes(opuesto))
  if (!muro) return 50
  return muro.lados.length === 3 ? 22 : 78
}

function geometria(s: Segmento, todos: Segmento[], alCentro: boolean): { d: string; pts: P[]; fin: P | null } {
  if (s.lados.length === 2) {
    const [a, b] = s.lados
    const p = LADO[a]
    const q = LADO[b]
    if (b - a === 2) {
      const pts = Array.from({ length: 13 }, (_, i) => ({ x: p.x + ((q.x - p.x) * i) / 12, y: p.y + ((q.y - p.y) * i) / 12 }))
      return { d: `M${p.x} ${p.y} L${q.x} ${q.y}`, pts, fin: null }
    }
    const e = ESQ[`${a},${b}`]
    const c = { x: 50 + (e.x - 50) * 0.3, y: 50 + (e.y - 50) * 0.3 }
    const pts = Array.from({ length: 13 }, (_, i) => {
      const t = i / 12
      return {
        x: (1 - t) ** 2 * p.x + 2 * (1 - t) * t * c.x + t * t * q.x,
        y: (1 - t) ** 2 * p.y + 2 * (1 - t) * t * c.y + t * t * q.y,
      }
    })
    return { d: `M${p.x} ${p.y} Q${c.x} ${c.y} ${q.x} ${q.y}`, pts, fin: null }
  }
  const l = s.lados[0]
  const p = LADO[l]
  const largo = alCentro ? 50 : largoHastaMuralla(l, todos)
  const q = { x: p.x + DIR[l].x * largo, y: p.y + DIR[l].y * largo }
  const pts = Array.from({ length: 9 }, (_, i) => ({ x: p.x + ((q.x - p.x) * i) / 8, y: p.y + ((q.y - p.y) * i) / 8 }))
  return { d: `M${p.x} ${p.y} L${q.x} ${q.y}`, pts, fin: q }
}

/* ---------- piezas ---------- */

function Casa({ x, y, t = 1, tejado = C.tejado }: P & { t?: number; tejado?: string }) {
  const w = 9 * t
  const h = 6 * t
  return (
    <g transform={`translate(${x - w / 2} ${y - h / 2})`}>
      <ellipse cx={w / 2 + 1.5 * t} cy={h + 1.2 * t} rx={w * 0.6} ry={1.8 * t} fill="rgba(0,0,0,0.22)" />
      <rect x={0} y={h * 0.25} width={w} height={h * 0.75} fill={C.pared} stroke={C.junta} strokeWidth={0.4} />
      <rect x={w * 0.62} y={h * 0.25} width={w * 0.38} height={h * 0.75} fill={C.paredSombra} />
      <path d={`M${-0.8 * t} ${h * 0.3} L${w / 2} ${-h * 0.45} L${w + 0.8 * t} ${h * 0.3} Z`} fill={tejado} stroke={C.tejadoSombra} strokeWidth={0.5} strokeLinejoin="round" />
      <path d={`M${w / 2} ${-h * 0.45} L${w + 0.8 * t} ${h * 0.3} L${w / 2} ${h * 0.3} Z`} fill={C.tejadoSombra} opacity={0.55} />
      <rect x={w * 0.3} y={h * 0.6} width={w * 0.18} height={h * 0.4} fill={C.madera} />
    </g>
  )
}

function Torre({ x, y, r = 6.5 }: P & { r?: number }) {
  return (
    <g>
      <circle cx={x + 1.5} cy={y + 2.2} r={r} fill="rgba(0,0,0,0.25)" />
      <circle cx={x} cy={y} r={r} fill={C.piedra} stroke={C.junta} strokeWidth={0.9} />
      <circle cx={x} cy={y} r={r * 0.62} fill="#8b7e69" />
      <path
        d={Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4
          return `M${(x + Math.cos(a) * r * 0.82 - 1).toFixed(1)} ${(y + Math.sin(a) * r * 0.82 - 1).toFixed(1)}h2v2h-2z`
        }).join('')}
        fill={C.piedraLuz}
      />
      <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.25} fill={C.piedraLuz} opacity={0.5} />
    </g>
  )
}

function Arbol({ x, y, r }: P & { r: number }) {
  return (
    <g>
      <ellipse cx={x + r * 0.45} cy={y + r * 0.75} rx={r} ry={r * 0.55} fill="rgba(0,0,0,0.2)" />
      <circle cx={x} cy={y} r={r} fill={C.arbol} />
      <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.6} fill={C.arbolLuz} />
      <circle cx={x - r * 0.45} cy={y - r * 0.45} r={r * 0.22} fill="#86b45a" />
    </g>
  )
}

function Ermita() {
  return (
    <g>
      <ellipse cx={53} cy={66} rx={18} ry={4.5} fill="rgba(0,0,0,0.25)" />
      <rect x={36} y={44} width={28} height={20} fill={C.pared} stroke={C.junta} strokeWidth={0.8} />
      <rect x={54} y={44} width={10} height={20} fill={C.paredSombra} />
      <path d="M33 45 L50 31 L67 45 Z" fill={C.tejado} stroke={C.tejadoSombra} strokeWidth={0.8} strokeLinejoin="round" />
      <path d="M50 31 L67 45 L50 45 Z" fill={C.tejadoSombra} opacity={0.5} />
      <rect x={45.5} y={21} width={9} height={13} fill={C.pared} stroke={C.junta} strokeWidth={0.8} />
      <path d="M47.8 31 v-4.5 a2.2 2.2 0 0 1 4.4 0 v4.5 z" fill="#3b2d22" />
      <circle cx={50} cy={28.6} r={1.3} fill="#d9a441" />
      <path d="M44.5 21.5 L50 17.5 L55.5 21.5 Z" fill={C.tejado} stroke={C.tejadoSombra} strokeWidth={0.6} strokeLinejoin="round" />
      <path d="M50 17.5 V10.5 M47.6 13 H52.4" stroke={C.madera} strokeWidth={1.2} strokeLinecap="round" />
      <circle cx={50} cy={50} r={2.4} fill="#7aa5c9" stroke={C.junta} strokeWidth={0.6} />
      <path d="M46.5 64 v-6 a3.5 3.5 0 0 1 7 0 v6 z" fill={C.madera} />
    </g>
  )
}

/** Escudo del castillo: vale 2 puntos más al cerrarlo. */
function Escudo({ x, y }: P) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-5.6 -6.2 H6.4 V0.8 Q6.4 6.8 0.4 9 Q-5.6 6.8 -5.6 0.8 Z" fill="rgba(0,0,0,0.3)" transform="translate(1 1.2)" />
      <path d="M-6 -7 H6 V0 Q6 6 0 8.2 Q-6 6 -6 0 Z" fill="#2f5d82" stroke="#f3e3b0" strokeWidth={1.3} strokeLinejoin="round" />
      <path d="M-6 -1.2 H6 V1.6 H-6 Z" fill="#e2b541" />
      <circle cx={0} cy={-4} r={1.5} fill="#e2b541" />
    </g>
  )
}

/* ---------- loseta ---------- */

type Props = {
  id: string
  giro?: number
  tam?: number
  titulo?: string
  /** Estandartes puestos: sitio y color. */
  estandartes?: Puesto[]
  /** Se pone como data-loseta del SVG (para encontrarlo y rasterizarlo). */
  marca?: string
}

export function LosetaIlustrada({ id, giro = 0, tam = 96, titulo, estandartes = [], marca }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const { nombreLoseta } = useTextos()
  const t = tipo(id)
  const segs = girarSegmentos(t.segmentos, giro)
  const murallas = segs.filter((s) => s.tipo === 'muralla').map((s) => ({ s, ...formaMuralla(s.lados) }))
  const campos = girarCampos(t.campos, giro)
  const ermita = !!t.ermita
  const caminos = segs.filter((s) => s.tipo === 'camino').map((s) => geometria(s, segs, ermita))
  const rios = segs.filter((s) => s.tipo === 'rio').map((s) => geometria(s, segs, true))
  const centroOcupado = ermita ? 40 : t.adorno === 'cruce' ? 22 : t.adorno === 'lago' ? 34 : t.adorno === 'manantial' ? 16 : 0
  const centro = ermita ? { x: 50, y: 42 } : { x: 50, y: 52 }

  const enCastillo = (p: P, margen: number) => murallas.some((m) => dentroDe(m.forma, desgirar(p, m.giro), margen))
  const cercaDe = (p: P, sep: number) => [...caminos, ...rios].some((g) => g.pts.some((q) => dist(p, q) < sep))
  const libre = (p: P, sep: number, margenCastillo = 6) =>
    p.x > 6 && p.x < 94 && p.y > 6 && p.y < 94 && !enCastillo(p, margenCastillo) && !cercaDe(p, sep) && (centroOcupado === 0 || dist(p, centro) > centroOcupado)

  // Adornos del campo, siempre iguales para la misma loseta y el mismo giro.
  const azar = semilla(`${id}:${giro}`)
  const briznas: P[] = []
  for (let i = 0; i < 70 && briznas.length < 28; i++) {
    const p = { x: 3 + azar() * 94, y: 3 + azar() * 94 }
    if (!enCastillo(p, 1) && !cercaDe(p, 8)) briznas.push(p)
  }
  const flores: (P & { c: string })[] = []
  for (let i = 0; i < 60 && flores.length < 9; i++) {
    const p = { x: 4 + azar() * 92, y: 4 + azar() * 92 }
    if (libre(p, 9)) flores.push({ ...p, c: COLORES_FLOR[Math.floor(azar() * 3)] })
  }
  const arboles: (P & { r: number })[] = []
  for (let i = 0; i < 80 && arboles.length < 4; i++) {
    const p = { x: 10 + azar() * 80, y: 10 + azar() * 80 }
    const r = 4.5 + azar() * 3
    if (libre(p, 13 + r, 12 + r) && arboles.every((a) => dist(a, p) > a.r + r + 3)) arboles.push({ ...p, r })
  }

  return (
    <svg viewBox="0 0 100 100" width={tam} height={tam} role="img" aria-label={titulo ?? nombreLoseta(id)} style={{ display: 'block' }} data-loseta={marca}>
      <defs>
        <radialGradient id={`h${uid}`} cx="45%" cy="40%" r="75%">
          <stop offset="0%" stopColor={C.hierbaClara} />
          <stop offset="70%" stopColor={C.hierba} />
          <stop offset="100%" stopColor={C.hierbaOscura} />
        </radialGradient>
        <radialGradient id={`l${uid}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#7ab6e0" />
          <stop offset="100%" stopColor={C.agua} />
        </radialGradient>
      </defs>

      {/* Campo */}
      <rect width={100} height={100} fill={`url(#h${uid})`} />
      <path
        d={briznas.map((b) => `M${(b.x - 1.2).toFixed(1)} ${(b.y - 1.6).toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}L${(b.x + 1.1).toFixed(1)} ${(b.y - 1.9).toFixed(1)}`).join('')}
        stroke={C.brizna}
        strokeWidth={0.7}
        strokeLinecap="round"
        fill="none"
        opacity={0.8}
      />
      {COLORES_FLOR.map((color) => {
        const d = flores
          .filter((f) => f.c === color)
          .map((f) => `M${(f.x - 0.9).toFixed(1)} ${f.y.toFixed(1)}a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0`)
          .join('')
        return d ? <path key={color} d={d} fill={color} /> : null
      })}

      {/* Ríos */}
      {rios.map((g, i) => (
        <g key={`r${i}`} fill="none" strokeLinecap="round">
          <path d={g.d} stroke={C.orilla} strokeWidth={17} opacity={0.55} />
          <path d={g.d} stroke={C.agua} strokeWidth={12} />
          <path d={g.d} stroke={C.aguaLuz} strokeWidth={1.4} strokeDasharray="5 11" transform="translate(-2 -1)" opacity={0.9} />
          <path d={g.d} stroke={C.aguaLuz} strokeWidth={1} strokeDasharray="3 13" strokeDashoffset={7} transform="translate(2 1)" opacity={0.7} />
        </g>
      ))}
      {t.adorno === 'lago' && (
        <g>
          <ellipse cx={50} cy={55} rx={30} ry={21} fill={C.orilla} opacity={0.55} />
          <ellipse cx={50} cy={55} rx={27} ry={18.5} fill={`url(#l${uid})`} />
          <path d="M34 52 q4 -2 8 0 M52 62 q4 -2 8 0 M44 46 q3 -1.5 6 0" stroke={C.aguaLuz} strokeWidth={1} fill="none" strokeLinecap="round" />
          <path d="M26 64 l-1 -6 M28 65 l0 -7 M30 64 l1 -5 M71 47 l0 -6 M73 48 l1 -6" stroke="#4f6e2c" strokeWidth={0.9} strokeLinecap="round" />
        </g>
      )}
      {t.adorno === 'manantial' && (
        <g>
          <circle cx={50} cy={51} r={9} fill={`url(#l${uid})`} stroke={C.orilla} strokeWidth={2} />
          {[[40, 46, 4], [58, 44, 3.5], [60, 56, 4.2], [42, 58, 3.2], [50, 62, 2.8]].map(([x, y, r], i) => (
            <g key={i}>
              <circle cx={x + 0.8} cy={y + 1} r={r} fill="rgba(0,0,0,0.2)" />
              <circle cx={x} cy={y} r={r} fill="#b1a796" stroke="#7d7363" strokeWidth={0.5} />
            </g>
          ))}
        </g>
      )}

      {/* Castillos: patio, casas, muralla y torres */}
      {murallas.map((m, i) => (
        <g key={`p${i}`} transform={`rotate(${m.giro * 90} 50 50)`}>
          <path d={FORMAS[m.forma].relleno} fill={C.patio} />
          <path d={FORMAS[m.forma].relleno} fill="none" stroke="#c9a46e" strokeWidth={0.6} strokeDasharray="2 4" />
        </g>
      ))}
      {murallas.flatMap((m, i) =>
        FORMAS[m.forma].casas.map((c, j) => {
          const p = girar(c, m.giro)
          return <Casa key={`c${i}-${j}`} x={p.x} y={p.y} t={m.forma === 'uno' ? 1.05 : 1.4} tejado={j % 3 === 1 ? '#c86a36' : j % 3 === 2 ? '#a83e2c' : C.tejado} />
        }),
      )}
      {murallas.map((m, i) => (
        <g key={`m${i}`} transform={`rotate(${m.giro * 90} 50 50)`} fill="none">
          {FORMAS[m.forma].bordes.map((b, j) => (
            <g key={j}>
              <path d={b} stroke="rgba(0,0,0,0.32)" strokeWidth={11} transform="translate(1.4 2)" />
              <path d={b} stroke="#857762" strokeWidth={10} />
              <path d={b} stroke={C.junta} strokeWidth={10} strokeDasharray="0.7 3.3" opacity={0.75} />
              <path d={b} stroke={C.piedraLuz} strokeWidth={3} strokeDasharray="3.3 0.7" transform="translate(-1.2 -1.2)" />
            </g>
          ))}
        </g>
      ))}
      {murallas.flatMap((m, i) =>
        FORMAS[m.forma].torres.map((p0, j) => {
          const p = girar(p0, m.giro)
          return <Torre key={`t${i}-${j}`} x={p.x} y={p.y} r={m.forma === 'todo' ? 10 : 8} />
        }),
      )}

      {/* Caminos */}
      {caminos.map((g, i) => (
        <g key={`c${i}`} fill="none" strokeLinecap="butt">
          <path d={g.d} stroke={C.tierraBorde} strokeWidth={10.5} opacity={0.85} />
          <path d={g.d} stroke={C.tierra} strokeWidth={7.5} />
          <path d={g.d} stroke={C.tierraPiedra} strokeWidth={2.2} strokeDasharray="0.8 6" transform="translate(1.6 0.8)" strokeLinecap="round" />
          <path d={g.d} stroke={C.tierraPiedra} strokeWidth={1.8} strokeDasharray="0.8 7" strokeDashoffset={3} transform="translate(-1.8 -0.6)" strokeLinecap="round" />
          {g.fin && murallas.length > 0 && !ermita && t.adorno !== 'cruce' && (
            <path
              d={`M${g.fin.x - 4} ${g.fin.y + 2.5} v-3 a4 4 0 0 1 8 0 v3 z`}
              fill="#3b2d22"
              stroke={C.junta}
              strokeWidth={0.8}
              transform={`rotate(${[180, 270, 0, 90][segs.find((s) => s.tipo === 'camino' && s.lados.length === 1)!.lados[0]]} ${g.fin.x} ${g.fin.y})`}
            />
          )}
        </g>
      ))}
      {t.adorno === 'puente' && (
        <g>
          <rect x={35} y={41} width={30} height={18} fill={C.tierra} />
          <rect x={35} y={39} width={30} height={3} fill={C.piedraLuz} stroke={C.junta} strokeWidth={0.6} />
          <rect x={35} y={58} width={30} height={3} fill={C.piedra} stroke={C.junta} strokeWidth={0.6} />
          <rect x={35} y={61} width={30} height={1.5} fill="rgba(0,0,0,0.25)" />
        </g>
      )}
      {t.adorno === 'cruce' && (
        <g>
          <Casa x={50} y={52} t={1.9} />
          <circle cx={66} cy={64} r={3.2} fill={C.piedra} stroke={C.junta} strokeWidth={0.7} />
          <circle cx={66} cy={64} r={1.8} fill="#2f5d82" />
        </g>
      )}

      {t.escudo && murallas[0] && (() => {
        const p = girar(FORMAS[murallas[0].forma].escudo, murallas[0].giro)
        return <Escudo x={p.x} y={p.y} />
      })()}

      {/* Árboles y ermita, encima de todo */}
      {arboles.map((a, i) => (
        <Arbol key={i} x={a.x} y={a.y} r={a.r} />
      ))}
      {ermita && <Ermita />}

      {estandartes.map((e, i) => {
        const p = puntoDe(e, segs, campos)
        return <Estandarte key={`e${i}`} x={p.x} y={p.y} color={e.color} tumbado={p.tumbado} />
      })}
    </svg>
  )
}
