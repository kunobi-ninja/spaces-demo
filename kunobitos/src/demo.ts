/*
 * Partidas que se juegan solas en la pantalla de título: el motor de verdad
 * con una solución grabada como reglas («da esta habilidad al primer
 * kunobito que cumpla esto»). Son soluciones que superan el nivel con las
 * tres estrellas; si alguien cambia esos niveles en data/niveles.json, la
 * demo puede fallar y entonces simplemente pasa a la siguiente.
 */

import { admite, aplicar, nuevo, paso, type Estado, type Habilidad, type Kunobito } from './motor'
import { crearNivel, type DefNivel } from './niveles'

export type Regla = { h: Habilidad; c: (k: Kunobito) => boolean; veces: number }
export type Demo = { id: string; reglas: Regla[] }

const anda = (y: number, xa: number, xb: number) => (k: Kunobito) =>
  k.estado === 'andar' && k.dir === 1 && k.y === y && k.x >= xa && k.x <= xb
const todos = 99

/** Un escenario de cada: Bambú, Tejados y Montaña. */
export const DEMOS: Demo[] = [
  { id: 'pasarela-rota', reglas: [
    { h: 'salto', c: anda(79, 56, 64), veces: todos },
    { h: 'gancho', c: anda(79, 108, 130), veces: todos },
  ] },
  { id: 'el-barranco', reglas: [{ h: 'cometa', c: (k) => anda(43, 20, 56)(k) && !k.cometa, veces: todos }] },
  { id: 'puerta-de-cristal', reglas: [
    { h: 'humo', c: anda(79, 104, 110), veces: todos },
    { h: 'tunel', c: anda(79, 150, 162), veces: 1 },
  ] },
]

/** Una demo en marcha: su estado y cuántas veces puede usarse aún cada regla. */
export type Jugada = { def: DefNivel; e: Estado; quedan: number[]; reglas: Regla[] }

export function empezar(def: DefNivel, demo: Demo): Jugada {
  return { def, e: nuevo(crearNivel(def)), quedan: demo.reglas.map((r) => r.veces), reglas: demo.reglas }
}

/** Aplica las reglas que tocan y avanza un paso. */
export function avanzarDemo(j: Jugada) {
  const { e, reglas, quedan } = j
  if (e.fin) return
  reglas.forEach((r, i) => {
    if (quedan[i] <= 0) return
    const k = e.kunobitos.find((q) => admite(q, r.h) && r.c(q))
    if (k && aplicar(e, { tipo: 'habilidad', id: k.id, habilidad: r.h })) quedan[i]--
  })
  paso(e)
}
