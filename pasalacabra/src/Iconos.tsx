// Iconos del juego, en SVG y del color del texto que los rodea.

import type { ReactNode } from 'react'

type Nombre = 'sonido' | 'silencio' | 'amigos' | 'pregunta' | 'volver' | 'pausa' | 'cerrar' | 'bien' | 'mal' | 'trofeo' | 'jugar'

const TRAZOS: Record<Nombre, ReactNode> = {
  sonido: <><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none" /><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" /></>,
  silencio: <><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none" /><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" /></>,
  amigos: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17" cy="9" r="2.6" /><path d="M16 13.6c2.9-.3 5 1.6 5 4.4" /></>,
  pregunta: <><circle cx="12" cy="12" r="9.5" /><path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.8v.6" /><circle cx="12" cy="17.2" r="0.6" fill="currentColor" /></>,
  volver: <path d="M15 5l-7 7 7 7" />,
  pausa: <><path d="M8.5 5.5v13M15.5 5.5v13" /></>,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  bien: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  mal: <path d="M7 7l10 10M17 7L7 17" />,
  trofeo: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11M12 14v3M8.5 20h7M9.5 17h5v3h-5z" /></>,
  jugar: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
}

export function Icono({ nombre, className }: { nombre: Nombre; className?: string }) {
  return (
    <svg className={`plc-icono ${className ?? ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRAZOS[nombre]}
    </svg>
  )
}
