/*
 * Iconos de píxeles, como el resto del juego: cada uno es una rejilla de
 * caracteres y un color por carácter, dibujada en SVG con bordes nítidos.
 */

import type { ReactElement } from 'react'

type Rejilla = { filas: string[]; colores: Record<string, string> }

function Pixeles({ r, tam = 3, className, titulo }: { r: Rejilla; tam?: number; className?: string; titulo?: string }) {
  const alto = r.filas.length, ancho = r.filas[0].length
  const rects: ReactElement[] = []
  r.filas.forEach((f, y) => {
    for (let x = 0; x < f.length; x++) {
      const c = r.colores[f[x]]
      if (c) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} />)
    }
  })
  return (
    <svg
      className={className}
      viewBox={`0 0 ${ancho} ${alto}`}
      width={ancho * tam}
      height={alto * tam}
      shapeRendering="crispEdges"
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      {rects}
    </svg>
  )
}

const ESTRELLA = [
  '....o....',
  '...oyo...',
  '...oyo...',
  'oooyYyooo',
  'oyyyYYyyo',
  '.oyyYYyo.',
  '..oyyyo..',
  '.oyyoyyo.',
  '.ooo.ooo.',
]
const LLENA = { o: '#5a2d0c', y: '#ffd75e', Y: '#fff2b0' }
const VACIA = { o: '#28345c', y: '#1b2547', Y: '#222e55' }

export function Estrella({ llena, tam = 3 }: { llena: boolean; tam?: number }) {
  return <Pixeles r={{ filas: ESTRELLA, colores: llena ? LLENA : VACIA }} tam={tam} className="kb-estrella" />
}

/** Tres estrellas, `n` llenas. */
export function Estrellas({ n, tam = 3, titulo }: { n: number; tam?: number; titulo?: string }) {
  return (
    <span className="kb-estrellas" role="img" aria-label={titulo}>
      {[0, 1, 2].map((i) => <Estrella key={i} llena={i < n} tam={tam} />)}
    </span>
  )
}

export function Candado({ tam = 3 }: { tam?: number }) {
  return (
    <Pixeles
      tam={tam}
      r={{
        filas: [
          '..ooo..',
          '.o...o.',
          '.o...o.',
          'ooooooo',
          'oyyYyyo',
          'oyyoyyo',
          'oyyoyyo',
          'ooooooo',
        ],
        colores: { o: '#0b1230', y: '#f2b33c', Y: '#ffe08a' },
      }}
    />
  )
}

export function IconoSonido({ on, tam = 2 }: { on: boolean; tam?: number }) {
  return (
    <Pixeles
      tam={tam}
      r={{
        filas: on
          ? ['....w.....', '...ww..w..', 'wwwww...w.', 'wwwww.w..w', 'wwwww.w..w', 'wwwww...w.', '...ww..w..', '....w.....']
          : ['....w.....', '...ww.....', 'wwwww.r..r', 'wwwww..rr.', 'wwwww..rr.', 'wwwww.r..r', '...ww.....', '....w.....'],
        colores: { w: '#f4f1e6', r: '#ff7a6a' },
      }}
    />
  )
}

/** Chispas: el botón que hace estallar a los que quedan y acaba el nivel. */
export function IconoTerminar({ tam = 2 }: { tam?: number }) {
  return (
    <Pixeles
      tam={tam}
      r={{
        filas: ['y...o...y', '.y..o..y.', '..y.y.y..', '....Y....', 'ooyYYYyoo', '....Y....', '..y.y.y..', '.y..o..y.', 'y...o...y'],
        colores: { y: '#ffd75e', Y: '#fff2b0', o: '#ff8a5a' },
      }}
    />
  )
}

export function IconoReloj({ tam = 2 }: { tam?: number }) {
  return (
    <Pixeles
      tam={tam}
      r={{
        filas: ['..www..', '.wcccw.', 'wccwccw', 'wccwccw', 'wcccwcw', '.wcccw.', '..www..'],
        colores: { w: '#7fd3ea', c: '#16244f' },
      }}
    />
  )
}

export function IconoCasa({ tam = 2 }: { tam?: number }) {
  return (
    <Pixeles
      tam={tam}
      r={{
        filas: ['....r....', '..rrrrr..', 'rrrrrrrrr', '.wwwwwww.', '.ww.y.ww.', '.ww.y.ww.', '.wwwwwww.'],
        colores: { r: '#ff7a6a', w: '#f4f1e6', y: '#ffd75e' },
      }}
    />
  )
}
