/*
 * Reglas de Castillos como máquina de estados pura:
 *   nueva(config) → partida
 *   aplicar(partida, acción) → partida nueva (la de entrada no cambia)
 *
 * Todo es determinista: el azar sale de la semilla al barajar al empezar, así
 * que reproducir(config, acciones) da exactamente la misma partida.
 */

import { barajar, generador } from './azar'
import {
  ESTANDARTES_POR_JUGADOR,
  LOSETA_FINAL_RIO,
  LOSETA_INICIAL,
  PUNTOS,
  girarSegmentos,
  mazoPrincipal,
  mazoRio,
  tipo,
  type Sitio,
} from './losetas'
import { clave, giroDelRio, huecosLegales, type GiroRio, type Hueco, type Tablero } from './tablero'
import { analizar, nodo, type Analisis, type TipoZona, type Zona } from './zonas'

export interface Config {
  jugadores: string[]
  semilla: number
}

export interface Puesto {
  jugador: number
  /** Loseta "x,y" donde está. */
  en: string
  sitio: Sitio
}

export interface Anotacion {
  /** Turno (número de loseta colocada) en que se anotó; las del final llevan final: true. */
  turno: number
  final: boolean
  zona: TipoZona
  ganadores: number[]
  puntos: number
  losetas: number
  escudos: number
  /** Campos: castillos cerrados con los que linda. */
  castillos: number
}

export type Accion =
  | { tipo: 'girar'; sentido?: 1 | -1 }
  | { tipo: 'colocar'; x: number; y: number; giro?: number }
  | { tipo: 'estandarte'; sitio: Sitio }
  | { tipo: 'pasar' }
  | { tipo: 'deshacer' }
  | { tipo: 'pausar' }
  | { tipo: 'reanudar' }

export interface Jugador {
  nombre: string
  puntos: number
  enMano: number
}

export interface Partida {
  config: Config
  jugadores: Jugador[]
  /** A quién le toca. */
  turno: number
  /** colocar: tiene la loseta en la mano; estandarte: ya la colocó y decide si pone estandarte; fin: se acabó. */
  fase: 'colocar' | 'estandarte' | 'fin'
  pausada: boolean
  /** Losetas por robar: primero el río (el lago al final) y después el mazo principal. */
  mazoRio: string[]
  mazo: string[]
  /** La loseta en la mano y cómo está girada. */
  actual: string | null
  giro: number
  tablero: Tablero
  /** Claves "x,y" en el orden en que se colocaron. */
  orden: string[]
  puestos: Puesto[]
  /** Losetas que no cabían en ningún sitio. */
  descartadas: string[]
  ultimoGiroRio: GiroRio
  anotaciones: Anotacion[]
  /** Las acciones que han llevado hasta aquí (sin las deshechas). */
  acciones: Accion[]
}

export class JugadaIlegal extends Error {}

const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/* ---------- empezar ---------- */

export function nueva(config: Config): Partida {
  if (config.jugadores.length < 2 || config.jugadores.length > 4) throw new JugadaIlegal('Hacen falta entre 2 y 4 jugadores')
  const azar = generador(config.semilla)
  const rio = mazoRio()
  rio.splice(rio.indexOf(LOSETA_INICIAL), 1)
  rio.splice(rio.indexOf(LOSETA_FINAL_RIO), 1)
  const p: Partida = {
    config: copia(config),
    jugadores: config.jugadores.map((nombre) => ({ nombre, puntos: 0, enMano: ESTANDARTES_POR_JUGADOR })),
    turno: 0,
    fase: 'colocar',
    pausada: false,
    mazoRio: [...barajar(rio, azar), LOSETA_FINAL_RIO],
    mazo: barajar(mazoPrincipal(), azar),
    actual: null,
    giro: 0,
    tablero: { [clave(0, 0)]: { id: LOSETA_INICIAL, giro: 0, x: 0, y: 0 } },
    orden: [clave(0, 0)],
    puestos: [],
    descartadas: [],
    ultimoGiroRio: 0,
    anotaciones: [],
    acciones: [],
  }
  robar(p)
  return p
}

export function reproducir(config: Config, acciones: Accion[]): Partida {
  return acciones.reduce(aplicar, nueva(config))
}

/* ---------- consultas ---------- */

/** Dónde se puede colocar la loseta de la mano. */
export function colocaciones(p: Partida): Hueco[] {
  if (p.fase !== 'colocar' || !p.actual) return []
  return huecosLegales(p.tablero, p.actual, p.ultimoGiroRio)
}

/** Dónde puede poner estandarte el jugador en la loseta que acaba de colocar. */
export function sitiosLibres(p: Partida, a: Analisis = analizar(p.tablero)): Sitio[] {
  if (p.fase !== 'estandarte' || p.jugadores[p.turno].enMano === 0) return []
  const k = p.orden[p.orden.length - 1]
  const c = p.tablero[k]
  const tl = tipo(c.id)
  const ocupadas = new Set(p.puestos.map((e) => a.zonaDe(nodo(e.en, e.sitio))))
  const r: Sitio[] = []
  tl.segmentos.forEach((s, i) => {
    if (s.tipo !== 'rio' && !ocupadas.has(a.zonaDe(nodo(k, { segmento: i })))) r.push({ segmento: i })
  })
  tl.campos.forEach((_, i) => {
    if (!ocupadas.has(a.zonaDe(nodo(k, { campo: i })))) r.push({ campo: i })
  })
  if (tl.ermita && !ocupadas.has(nodo(k, { ermita: true }))) r.push({ ermita: true })
  return r
}

/** Las zonas de la partida, con los estandartes que hay en cada una. */
export function zonasConEstandartes(p: Partida): { zona: Zona; puestos: Puesto[] }[] {
  const a = analizar(p.tablero)
  const por = new Map<string, Puesto[]>()
  for (const e of p.puestos) {
    const z = a.zonaDe(nodo(e.en, e.sitio))
    por.set(z, [...(por.get(z) ?? []), e])
  }
  return [...a.zonas.values()].map((zona) => ({ zona, puestos: por.get(zona.id) ?? [] }))
}

/** Quién gana: el ganador o ganadores, por puntos. */
export function ganadores(p: Partida): number[] {
  const max = Math.max(...p.jugadores.map((j) => j.puntos))
  return p.jugadores.flatMap((j, i) => (j.puntos === max ? [i] : []))
}

/* ---------- acciones ---------- */

export function aplicar(p0: Partida, accion: Accion): Partida {
  if (accion.tipo === 'pausar' || accion.tipo === 'reanudar') {
    if (p0.fase === 'fin') throw new JugadaIlegal('La partida ya ha terminado')
    return { ...p0, pausada: accion.tipo === 'pausar' }
  }
  if (p0.pausada) throw new JugadaIlegal('La partida está en pausa')
  if (p0.fase === 'fin') throw new JugadaIlegal('La partida ya ha terminado')

  if (accion.tipo === 'deshacer') {
    if (p0.fase !== 'estandarte') throw new JugadaIlegal('Solo se puede deshacer la colocación de este turno')
    const i = p0.acciones.map((a) => a.tipo).lastIndexOf('colocar')
    return { ...reproducir(p0.config, p0.acciones.slice(0, i)), pausada: p0.pausada }
  }

  const p = copia(p0)
  switch (accion.tipo) {
    case 'girar': {
      if (p.fase !== 'colocar') throw new JugadaIlegal('Ahora no hay loseta que girar')
      p.giro = (((p.giro + (accion.sentido ?? 1)) % 4) + 4) % 4
      break
    }
    case 'colocar': {
      if (p.fase !== 'colocar' || !p.actual) throw new JugadaIlegal('Ahora no toca colocar')
      const giro = accion.giro ?? p.giro
      if (!colocaciones(p).some((h) => h.x === accion.x && h.y === accion.y && h.giro === giro)) {
        throw new JugadaIlegal('La loseta no encaja ahí')
      }
      if (tipo(p.actual).familia === 'Río') {
        const g = giroDelRio(p.tablero, p.actual, giro, accion.x, accion.y, p.ultimoGiroRio)!
        if (g !== 0) p.ultimoGiroRio = g
      }
      const k = clave(accion.x, accion.y)
      p.tablero[k] = { id: p.actual, giro, x: accion.x, y: accion.y }
      p.orden.push(k)
      p.actual = null
      p.giro = giro
      p.fase = 'estandarte'
      break
    }
    case 'estandarte': {
      if (p.fase !== 'estandarte') throw new JugadaIlegal('Ahora no toca poner estandarte')
      const libres = sitiosLibres(p)
      if (!libres.some((s) => JSON.stringify(s) === JSON.stringify(accion.sitio))) throw new JugadaIlegal('Ahí no se puede poner estandarte')
      p.puestos.push({ jugador: p.turno, en: p.orden[p.orden.length - 1], sitio: accion.sitio })
      p.jugadores[p.turno].enMano--
      terminarTurno(p)
      break
    }
    case 'pasar': {
      if (p.fase !== 'estandarte') throw new JugadaIlegal('Ahora no se puede pasar')
      terminarTurno(p)
      break
    }
  }
  p.acciones.push(accion)
  return p
}

/* ---------- turno y puntos ---------- */

function robar(p: Partida) {
  for (;;) {
    const id = p.mazoRio.length ? p.mazoRio.shift() : p.mazo.shift()
    if (!id) {
      p.actual = null
      puntuarFinal(p)
      p.fase = 'fin'
      return
    }
    if (huecosLegales(p.tablero, id, p.ultimoGiroRio).length) {
      p.actual = id
      p.giro = 0
      p.fase = 'colocar'
      return
    }
    p.descartadas.push(id)
  }
}

function terminarTurno(p: Partida) {
  puntuarCerradas(p)
  p.turno = (p.turno + 1) % p.jugadores.length
  robar(p)
}

/** Quién tiene más estandartes en la zona (todos los empatados). */
function mayoria(puestos: Puesto[]): number[] {
  const n = new Map<number, number>()
  for (const e of puestos) n.set(e.jugador, (n.get(e.jugador) ?? 0) + 1)
  const max = Math.max(...n.values())
  return [...n.entries()].filter(([, v]) => v === max).map(([j]) => j).sort()
}

function anotar(p: Partida, zona: Zona, puestos: Puesto[], puntos: number, final: boolean, castillos = 0) {
  const g = mayoria(puestos)
  for (const j of g) p.jugadores[j].puntos += puntos
  p.anotaciones.push({
    turno: p.orden.length,
    final,
    zona: zona.tipo,
    ganadores: g,
    puntos,
    losetas: zona.losetas.length,
    escudos: zona.escudos,
    castillos,
  })
}

/** Puntúa las zonas que la última loseta acaba de cerrar y devuelve sus estandartes. */
function puntuarCerradas(p: Partida) {
  const a = analizar(p.tablero)
  const k = p.orden[p.orden.length - 1]
  const c = p.tablero[k]
  const candidatas = new Set<string>()
  girarSegmentos(tipo(c.id).segmentos, c.giro).forEach((_, i) => candidatas.add(a.zonaDe(nodo(k, { segmento: i }))))
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const v = p.tablero[clave(c.x + dx, c.y + dy)]
      if (v && tipo(v.id).ermita) candidatas.add(nodo(clave(v.x, v.y), { ermita: true }))
    }
  }
  for (const id of [...candidatas].sort()) {
    const z = a.zonas.get(id)!
    if (!z.cerrada || z.tipo === 'rio' || z.tipo === 'campo') continue
    const aqui = p.puestos.filter((e) => a.zonaDe(nodo(e.en, e.sitio)) === id)
    if (!aqui.length) continue
    const puntos =
      z.tipo === 'castillo'
        ? PUNTOS.castilloCerrado.loseta * z.losetas.length + PUNTOS.castilloCerrado.escudo * z.escudos
        : z.tipo === 'camino'
          ? PUNTOS.camino * z.losetas.length
          : PUNTOS.ermitaCerrada
    anotar(p, z, aqui, puntos, false)
    for (const e of aqui) p.jugadores[e.jugador].enMano++
    p.puestos = p.puestos.filter((e) => !aqui.includes(e))
  }
}

/** Al acabar: lo que sigue abierto y los campos. Los estandartes se quedan en el tablero. */
function puntuarFinal(p: Partida) {
  const a = analizar(p.tablero)
  const por = new Map<string, Puesto[]>()
  for (const e of p.puestos) {
    const z = a.zonaDe(nodo(e.en, e.sitio))
    por.set(z, [...(por.get(z) ?? []), e])
  }
  for (const [id, aqui] of [...por.entries()].sort(([x], [y]) => (x < y ? -1 : 1))) {
    const z = a.zonas.get(id)!
    if (z.tipo === 'campo') {
      const cerrados = z.castillos.filter((cid) => a.zonas.get(cid)!.cerrada).length
      anotar(p, z, aqui, PUNTOS.campoPorCastilloCerrado * cerrados, true, cerrados)
    } else if (z.tipo === 'castillo') {
      anotar(p, z, aqui, PUNTOS.castilloAbierto.loseta * z.losetas.length + PUNTOS.castilloAbierto.escudo * z.escudos, true)
    } else if (z.tipo === 'camino') {
      anotar(p, z, aqui, PUNTOS.camino * z.losetas.length, true)
    } else if (z.tipo === 'ermita') {
      anotar(p, z, aqui, 1 + z.vecinas, true)
    }
  }
}

