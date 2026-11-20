// La cabra del juego, dibujada en SVG: mira la partida y reacciona a cada jugada.
// Las animaciones son de CSS (estilos.ts); cambiar `vez` vuelve a lanzar la reacción.

import { useId } from 'react'
import type { Evento } from './reglas'

export type Animo = 'atenta' | 'feliz' | 'triste' | 'bala'

/** Cómo reacciona la cabra a lo último que pasó. */
export function animoDe(evento: Evento | null | undefined, final = false): Animo {
  if (final) return 'feliz'
  switch (evento?.tipo) {
    case 'acierto':
    case 'rueda-completa':
      return 'feliz'
    case 'fallo':
    case 'tiempo':
      return 'triste'
    case 'pasa':
      return 'bala'
    default:
      return 'atenta'
  }
}

/** `bocadillo` se muestra mientras bala. */
export function Cabra({ animo, vez = 0, bocadillo, className = '' }: { animo: Animo; vez?: number; bocadillo?: string; className?: string }) {
  const id = useId().replace(/:/g, '')
  const pelo = `${id}-pelo`
  const cuerno = `${id}-cuerno`
  const sombra = `${id}-sombra`
  return (
    <div className={`plc-cabra-caja ${className}`} aria-hidden="true">
      {animo === 'bala' && bocadillo && <div key={`b${vez}`} className="plc-bocadillo">{bocadillo}</div>}
      <svg key={`${animo}${vez}`} className={`plc-cabra plc-cabra-${animo}`} viewBox="0 0 140 150">
        <defs>
          <radialGradient id={pelo} cx="45%" cy="35%" r="75%">
            <stop offset="0" stopColor="#fffaf0" />
            <stop offset="0.65" stopColor="#f6e6cc" />
            <stop offset="1" stopColor="#d9bf98" />
          </radialGradient>
          <linearGradient id={cuerno} x1="0" y1="1" x2="0.3" y2="0">
            <stop offset="0" stopColor="#c98a3a" />
            <stop offset="1" stopColor="#ffd98a" />
          </linearGradient>
          <radialGradient id={sombra} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#000" stopOpacity="0.45" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="70" cy="142" rx="38" ry="6" fill={`url(#${sombra})`} />
        <g className="plc-cabra-cuerpo">
          {/* Cuernos */}
          <path d="M52 40 C46 22 36 10 22 8 C34 16 40 28 42 44 Z" fill={`url(#${cuerno})`} stroke="#9a6326" strokeWidth="1.5" />
          <path d="M88 40 C94 22 104 10 118 8 C106 16 100 28 98 44 Z" fill={`url(#${cuerno})`} stroke="#9a6326" strokeWidth="1.5" />
          <path d="M44 26 l6 3 M40 18 l6 2" stroke="#9a6326" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <path d="M96 26 l-6 3 M100 18 l-6 2" stroke="#9a6326" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          {/* Orejas */}
          <g className="plc-oreja-i">
            <ellipse cx="28" cy="62" rx="20" ry="9" transform="rotate(-18 28 62)" fill={`url(#${pelo})`} stroke="#b89466" strokeWidth="1.5" />
            <ellipse cx="30" cy="62" rx="12" ry="4.5" transform="rotate(-18 30 62)" fill="#f4a3a8" />
          </g>
          <g className="plc-oreja-d">
            <ellipse cx="112" cy="62" rx="20" ry="9" transform="rotate(18 112 62)" fill={`url(#${pelo})`} stroke="#b89466" strokeWidth="1.5" />
            <ellipse cx="110" cy="62" rx="12" ry="4.5" transform="rotate(18 110 62)" fill="#f4a3a8" />
          </g>
          {/* Barba */}
          <path d="M60 112 C60 126 66 136 70 140 C74 136 80 126 80 112 Z" fill="#f2e2c6" stroke="#b89466" strokeWidth="1.5" />
          {/* Cara */}
          <path d="M70 34 C94 34 104 50 102 70 C100 92 88 116 70 118 C52 116 40 92 38 70 C36 50 46 34 70 34 Z" fill={`url(#${pelo})`} stroke="#b89466" strokeWidth="1.8" />
          <path d="M60 38 C64 46 76 46 80 38 C76 42 64 42 60 38 Z" fill="#e8d2ad" />
          <circle cx="50" cy="88" r="7" fill="#ff8f9a" opacity="0.35" />
          <circle cx="90" cy="88" r="7" fill="#ff8f9a" opacity="0.35" />
          {/* Ojos */}
          {animo === 'feliz' ? (
            <g fill="none" stroke="#2b1a10" strokeWidth="3.5" strokeLinecap="round">
              <path d="M48 70 Q56 61 64 70" />
              <path d="M76 70 Q84 61 92 70" />
            </g>
          ) : (
            <g className="plc-ojos">
              <ellipse cx="56" cy="70" rx="9" ry="10" fill="#fff" stroke="#b89466" strokeWidth="1.2" />
              <ellipse cx="84" cy="70" rx="9" ry="10" fill="#fff" stroke="#b89466" strokeWidth="1.2" />
              <g className="plc-pupilas">
                <ellipse cx="57" cy="71" rx="5.6" ry="6.6" fill="#2b1a10" />
                <ellipse cx="83" cy="71" rx="5.6" ry="6.6" fill="#2b1a10" />
                <circle cx="59" cy="68.5" r="2.1" fill="#fff" />
                <circle cx="85" cy="68.5" r="2.1" fill="#fff" />
                <circle cx="55.5" cy="74" r="0.9" fill="#fff" opacity="0.8" />
                <circle cx="81.5" cy="74" r="0.9" fill="#fff" opacity="0.8" />
              </g>
            </g>
          )}
          {animo === 'triste' && (
            <g stroke="#7a5532" strokeWidth="3" strokeLinecap="round">
              <path d="M47 57 L62 61" />
              <path d="M93 57 L78 61" />
            </g>
          )}
          {/* Hocico */}
          <ellipse cx="70" cy="98" rx="17" ry="13" fill="#f3d6c0" stroke="#b89466" strokeWidth="1.2" />
          <ellipse cx="64" cy="94" rx="2.4" ry="1.8" fill="#6b4630" />
          <ellipse cx="76" cy="94" rx="2.4" ry="1.8" fill="#6b4630" />
          {animo === 'bala' ? (
            <ellipse className="plc-boca-bala" cx="70" cy="104" rx="6" ry="5" fill="#7a2f3a" />
          ) : animo === 'triste' ? (
            <path d="M63 106 Q70 100 77 106" fill="none" stroke="#6b4630" strokeWidth="2.4" strokeLinecap="round" />
          ) : animo === 'feliz' ? (
            <path d="M61 101 Q70 112 79 101 Z" fill="#7a2f3a" stroke="#6b4630" strokeWidth="1.6" strokeLinejoin="round" />
          ) : (
            <path d="M64 102 Q70 107 76 102" fill="none" stroke="#6b4630" strokeWidth="2.4" strokeLinecap="round" />
          )}
          {/* Cencerro */}
          <path d="M58 118 Q70 124 82 118" fill="none" stroke="#ff5d73" strokeWidth="4" strokeLinecap="round" />
          <path d="M65 121 h10 l2 10 h-14 Z" fill="#ffc145" stroke="#a8641a" strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="70" cy="132" r="2" fill="#a8641a" />
        </g>
      </svg>
    </div>
  )
}
