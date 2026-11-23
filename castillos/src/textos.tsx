/*
 * Las palabras de la página (WORDS de index.mdx, ya en el idioma del lector) y los
 * nombres que salen de los datos (losetas y colores), para que cualquier
 * componente los lea sin pasarlos de mano en mano.
 */

import * as React from 'react'
import type { Nombres } from './preferencias'

/** WORDS de index.mdx tal como los da useI18n: textos, listas y funciones de sus valores. */
export type Palabras = Record<string, any>

export interface Textos {
  w: Palabras
  /** El nombre de una loseta por su id. */
  nombreLoseta: (id: string) => string
  /** Los colores de la paleta con su nombre. */
  paleta: { nombre: string; color: string }[]
  /** Para nombrar a quien no escribió nombre. */
  nombres: Nombres
}

const Contexto = React.createContext<Textos | null>(null)

export function ConTextos({ valor, children }: { valor: Textos; children: React.ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useTextos(): Textos {
  const t = React.useContext(Contexto)
  if (!t) throw new Error('useTextos fuera de <ConTextos>')
  return t
}

/** Un texto con **negrita** y `teclas`, como elementos de React. */
export function Rico({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
          <b key={i}>{p.slice(2, -2)}</b>
        ) : p.startsWith('`') && p.endsWith('`') && p.length > 2 ? (
          <span key={i} className="cas-tecla">
            {p.slice(1, -1)}
          </span>
        ) : (
          p
        ),
      )}
    </>
  )
}

/** "Ana y Luis", "Ana, Luis y Eva": une nombres con la palabra `y`. */
export function lista(nombres: string[], y: string): string {
  if (nombres.length < 2) return nombres.join('')
  return `${nombres.slice(0, -1).join(', ')} ${y} ${nombres[nombres.length - 1]}`
}
