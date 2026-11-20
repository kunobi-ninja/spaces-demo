/*
 * Todos los niveles del juego, en orden (los 12 de siempre y los 16 de la
 * ampliación ninja), con sus grupos y la cinta que da cada grupo ninja.
 */

import datos from '../data/niveles.json'
import { defNivel, type DatosNiveles, type DefNivel } from './niveles'
import { ESCENARIOS } from './paisajes'
import type { Cinta } from './sprites'

export type InfoGrupo = { grupo: string; nombre: string; texto: string; cinta?: Cinta }
export type Catalogo = { niveles: DefNivel[]; grupos: InfoGrupo[] }

/** Los niveles y grupos de unos datos (los de data/niveles.json, o esos mismos traducidos). */
export function catalogo(d: DatosNiveles): Catalogo {
  const niveles = d.grupos.flatMap((g) => d.niveles.filter((n) => n.grupo === g.id).map((n) => defNivel(n, g)))
  const grupos = d.grupos.map(({ id, nombre, texto, escenario }) => ({
    grupo: id, nombre, texto, ...(escenario ? { cinta: ESCENARIOS[escenario].cinta } : {}),
  }))
  return { niveles, grupos }
}

export const DATOS = datos as DatosNiveles
const { niveles: TODOS_NIVELES, grupos: TODOS_GRUPOS } = catalogo(DATOS)
export { TODOS_NIVELES, TODOS_GRUPOS }

/**
 * La cinta del kunobito: la del último grupo ninja superado entero (todos sus
 * niveles con al menos una estrella), siguiendo el orden. Al empezar, dorada.
 */
export function cintaDe(progreso: Record<string, number>): Cinta {
  let cinta: Cinta = 'dorada'
  for (const g of TODOS_GRUPOS) {
    if (!g.cinta) continue
    const niveles = TODOS_NIVELES.filter((d) => d.grupo === g.grupo)
    if (!niveles.every((d) => (progreso[d.id] ?? 0) > 0)) break
    cinta = g.cinta
  }
  return cinta
}
