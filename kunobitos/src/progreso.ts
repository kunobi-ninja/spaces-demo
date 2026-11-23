/*
 * Progreso de la persona en este dispositivo: las mejores estrellas de cada
 * nivel. Se guarda en localStorage (con try/catch: si el navegador no deja
 * guardar) y, por si acaso, también en memoria mientras dure la página.
 */

import { TODOS_NIVELES } from './catalogo'

const CLAVE = 'kunobitos.progreso.v1'

export type Progreso = Record<string, 0 | 1 | 2 | 3>

let enMemoria: Progreso = {}

export function leerProgreso(): Progreso {
  try {
    const t = localStorage.getItem(CLAVE)
    if (t) {
      const p = JSON.parse(t)
      if (p && typeof p === 'object') enMemoria = { ...enMemoria, ...p }
    }
  } catch { /* sin almacenamiento: queda lo de memoria */ }
  return { ...enMemoria }
}

/** Apunta un resultado si mejora lo que había. Devuelve el progreso nuevo. */
export function apuntar(id: string, estrellas: 0 | 1 | 2 | 3): Progreso {
  const p = leerProgreso()
  if ((p[id] ?? 0) >= estrellas && id in p) return p
  p[id] = Math.max(p[id] ?? 0, estrellas) as 0 | 1 | 2 | 3
  enMemoria = p
  try { localStorage.setItem(CLAVE, JSON.stringify(p)) } catch { /* sin almacenamiento */ }
  return { ...p }
}

export function borrarProgreso(): Progreso {
  enMemoria = {}
  try { localStorage.removeItem(CLAVE) } catch { /* sin almacenamiento */ }
  return {}
}

/** Un nivel está abierto si es el primero o si el anterior se superó (al menos una estrella). */
export function abierto(p: Progreso, indice: number): boolean {
  return indice === 0 || (p[TODOS_NIVELES[indice - 1].id] ?? 0) > 0
}
