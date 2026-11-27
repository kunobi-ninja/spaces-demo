/*
 * Iconos dibujados para Castillos (24 × 24, trazo del color del texto).
 */

import type * as React from 'react'

const TRAZOS: Record<string, React.ReactNode> = {
  ayuda: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.2a2.5 2.5 0 1 1 3.6 2.3c-.7.3-1.2 1-1.2 1.8v.6" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </>
  ),
  sonido: (
    <>
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" fillOpacity="0.15" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  mudo: (
    <>
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" fillOpacity="0.15" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  pausa: <path d="M8.5 5.5v13M15.5 5.5v13" />,
  jugar: <path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor" />,
  robot: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="3" />
      <path d="M12 4.5V8M9.5 15.5h5" />
      <circle cx="9.3" cy="12.3" r="1.1" fill="currentColor" />
      <circle cx="14.7" cy="12.3" r="1.1" fill="currentColor" />
      <circle cx="12" cy="4" r="1" fill="currentColor" />
    </>
  ),
  persona: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  amigos: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="16.5" cy="8" r="2.5" />
      <path d="M15.5 13.2a5 5 0 0 1 5.5 5" />
    </>
  ),
  reloj: <path d="M7 4h10M7 20h10M8 4c0 4.5 8 4.5 8 8s-8 3.5-8 8M16 4c0 4.5-8 4.5-8 8s8 3.5 8 8" />,
  estandarte: <path d="M6.5 21V3.5M6.5 4h11l-3 4 3 4h-11" />,
  cerrar: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  atras: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  girarIzq: <path d="M5 12a7 7 0 1 0 2.1-5M5 4.5v3.5h3.5" />,
  girarDer: <path d="M19 12a7 7 0 1 1-2.1-5M19 4.5v3.5h-3.5" />,
  mas: <path d="M12 5.5v13M5.5 12h13" />,
  menos: <path d="M5.5 12h13" />,
  centrar: (
    <>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </>
  ),
  corona: <path d="M4 18.5h16L19 8.5l-4.2 4L12 6l-2.8 6.5L5 8.5z" fill="currentColor" fillOpacity="0.2" />,
  ajustes: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  chispas: (
    <>
      <path d="M10 3.5l1.7 4.8 4.8 1.7-4.8 1.7L10 16.5l-1.7-4.8L3.5 10l4.8-1.7z" fill="currentColor" fillOpacity="0.2" />
      <path d="M17.5 13.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
    </>
  ),
  libro: <path d="M4 5.5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1zM12 6.5v13" />,
}

export type NombreIcono = keyof typeof TRAZOS

export function Icono({ nombre, tam = 20 }: { nombre: NombreIcono; tam?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tam}
      height={tam}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'block', flex: 'none' }}
    >
      {TRAZOS[nombre]}
    </svg>
  )
}
