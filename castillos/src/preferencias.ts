/*
 * Lo que el juego recuerda: los nombres y colores del inicio y la
 * partida a medias. Se guarda en este dispositivo si el navegador lo permite;
 * si no, dura lo que la página (el componente también lo tiene en memoria).
 */

import datosJugadores from '../data/jugadores.json'
import { reproducir, type Accion, type Config, type Partida } from './reglas'

/** Los colores que se pueden elegir (data/jugadores.json); los cuatro primeros son los de partida. */
export const PALETA: { nombre: string; color: string }[] = datosJugadores.colores

/** Cómo se llama un jugador sin nombre, en el idioma del lector: por su color o por su número. */
export interface Nombres {
  /** El nombre del color, o undefined si no es de la paleta. */
  color: (color: string) => string | undefined
  /** "Jugador n" (n empieza en 1). */
  jugador: (n: number) => string
}

export interface Inicio {
  cuantos: number
  /** Siempre 4: los que no juegan conservan lo que tenían. */
  jugadores: { nombre: string; color: string; ia: boolean }[]
}

export const INICIO_POR_DEFECTO: Inicio = {
  cuantos: 2,
  // De serie: tú contra la IA.
  jugadores: PALETA.slice(0, 4).map((c, i) => ({ nombre: '', color: c.color, ia: i > 0 })),
}

/** El nombre que se usa en la partida: el escrito o, si está vacío, el del color. */
export function nombreDe(j: { nombre: string; color: string }, i: number, nombres: Nombres): string {
  return j.nombre.trim() || nombres.color(j.color) || nombres.jugador(i + 1)
}

export interface Guardada {
  config: Config
  colores: string[]
  /** Quién juega con la IA (las partidas guardadas por versiones anteriores no lo traen). */
  ias?: boolean[]
  acciones: Accion[]
}

const CLAVE_INICIO = 'castillos.inicio'
const CLAVE_PARTIDA = 'castillos.partida'

function leer(clave: string): unknown {
  try {
    const t = window.localStorage.getItem(clave)
    return t ? JSON.parse(t) : null
  } catch {
    return null
  }
}

function escribir(clave: string, valor: unknown) {
  try {
    if (valor === null) window.localStorage.removeItem(clave)
    else window.localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* sin almacenamiento: dura lo que la página */
  }
}

/** Comprueba lo leído: cuatro jugadores con nombre y color de la paleta, sin repetir color. */
export function validarInicio(x: unknown): Inicio | null {
  const i = x as Inicio
  if (!i || typeof i !== 'object' || ![2, 3, 4].includes(i.cuantos) || !Array.isArray(i.jugadores) || i.jugadores.length !== 4) return null
  const colores = new Set<string>()
  for (const j of i.jugadores) {
    if (!j || typeof j.nombre !== 'string' || (j.ia !== undefined && typeof j.ia !== 'boolean') || !PALETA.some((c) => c.color === j.color) || colores.has(j.color)) return null
    colores.add(j.color)
  }
  return { cuantos: i.cuantos, jugadores: i.jugadores.map((j) => ({ nombre: j.nombre.slice(0, 20), color: j.color, ia: j.ia === true })) }
}

export const leerInicio = (): Inicio => validarInicio(leer(CLAVE_INICIO)) ?? INICIO_POR_DEFECTO
export const guardarInicio = (i: Inicio) => escribir(CLAVE_INICIO, i)

/** La partida guardada, rehecha desde sus acciones; null si no hay o no vale. */
export function abrirGuardada(g: unknown): { partida: Partida; colores: string[]; ias: boolean[] } | null {
  const x = g as Guardada
  try {
    if (!x || !x.config || !Array.isArray(x.acciones) || !Array.isArray(x.colores)) return null
    if (x.colores.length !== x.config.jugadores.length) return null
    const ias = Array.isArray(x.ias) && x.ias.length === x.colores.length ? x.ias.map((v) => v === true) : x.colores.map(() => false)
    const partida = reproducir(x.config, x.acciones)
    if (partida.fase === 'fin') return null
    return { partida, colores: x.colores, ias }
  } catch {
    return null
  }
}

export const leerPartida = () => abrirGuardada(leer(CLAVE_PARTIDA))
export function guardarPartida(p: Partida | null, colores: string[], ias: boolean[] = colores.map(() => false)) {
  escribir(CLAVE_PARTIDA, p && p.fase !== 'fin' && p.orden.length > 1 ? ({ config: p.config, colores, ias, acciones: p.acciones } satisfies Guardada) : null)
}

/** Sin sonido: se recuerda en este dispositivo. */
const CLAVE_SILENCIO = 'castillos.silencio'
export const leerSilencio = (): boolean => leer(CLAVE_SILENCIO) === true
export const guardarSilencio = (s: boolean) => escribir(CLAVE_SILENCIO, s)
