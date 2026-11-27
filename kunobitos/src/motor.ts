/*
 * Motor de Kunobitos, sin pantalla. Simulación por pasos (17 por segundo),
 * determinista: el mismo nivel con las mismas órdenes en los mismos pasos
 * da siempre el mismo resultado. No usa azar ni la hora.
 *
 * Coordenadas: x crece a la derecha e y hacia abajo. La posición de un
 * kunobito es la de sus pies: la celda (x, y) es aire y, si está de pie,
 * (x, y + 1) es suelo.
 *
 * El estado se cambia en el sitio (el mapa es grande).
 */

import {
  AGUA, BAMBU, CRISTAL, HIELO, KUNAI, NIEVE, PAPEL, PELDANO, PINCHO, PUERTA, TEJA, TIERRA, VACIO,
  cavable, cavaTunel, celda, mapaVacio, poner, solido, type Mapa,
} from './terreno'

/* ---------- Constantes del juego ---------- */

export const PASOS_POR_SEGUNDO = 17
/** Alto del kunobito, para techos y túneles. */
export const ALTO_K = 20
/** Escalón más alto que sube andando. */
export const SUBIDA = 5
/** Bajada más honda que baja andando sin empezar a caer. */
export const BAJADA = 3
/** Caída a partir de la cual se aturde al llegar al suelo (sin Hoja). */
export const CAIDA_MORTAL = 56
/** Píxeles por paso al caer y al planear. */
export const VEL_CAIDA = 3
export const VEL_HOJA = 1
/** Píxeles que cae antes de abrir la Hoja. */
export const ABRE_HOJA = 12
/** Pasos de la cuenta atrás de la Chispa (5 s). */
export const CUENTA_CHISPA = 5 * PASOS_POR_SEGUNDO
export const RADIO_CHISPA = 11
/** Peldaños por cada Peldaño, y su ancho. */
export const PELDANOS = 12
export const ANCHO_PELDANO = 6
/** Distancia a la que un Plantón hace dar la vuelta. */
export const ALCANCE_PLANTON = 5
/** Pasos que un Túnel recién dado puede andar buscando tierra delante. */
export const ACERCARSE = 40
/** Intervalo mínimo entre salidas del Nido, en pasos. */
export const INTERVALO_MINIMO = 6
/** Pasos que tarda el Nido en soltar al primero. */
export const ESPERA_INICIAL = PASOS_POR_SEGUNDO

/* Ampliación ninja. */
/** Gancho: alcance hacia arriba y hacia delante, y velocidad al subir por la cuerda. */
export const GANCHO_ALTO = 48
export const GANCHO_LARGO = 40
export const GANCHO_LANZAR = 6
/** Salto: largo, alto del arco, pasos en el aire y pasos de impulso. */
export const SALTO_LARGO = 40
export const SALTO_ALTO = 16
export const SALTO_PASOS = 20
export const SALTO_IMPULSO = 3
/** Humo: muro más grueso que se atraviesa, distancia a la que busca el muro y pasos de la nube. */
export const HUMO_MURO = 12
export const HUMO_BUSCA = 8
export const HUMO_PASOS = 14
/** Kunai: cuántos, separación en alto, pasos entre uno y otro, y alto de pared que sirven para subir. */
export const KUNAIS = 4
export const KUNAI_SEPARA = 6
export const KUNAI_RITMO = 5
export const KUNAI_ALCANCE = 30
/** Sigilo: cuánto dura y a qué distancia detrás de él protege a los demás. */
export const SIGILO_PASOS = 10 * PASOS_POR_SEGUNDO
export const SIGILO_DETRAS = 8
/** Cometa: píxeles por paso con viento a favor. */
export const VEL_VIENTO = 2
/** Pasos de las animaciones de un kunobito descubierto o pinchado. */
export const DURA_DESCUBIERTO = 10
export const DURA_PINCHADO = 12

/* ---------- Tipos ---------- */

/** Las ocho habilidades de siempre (el panel de la partida y las teclas 1–8). */
export const HABILIDADES = ['trepa', 'hoja', 'planton', 'chispa', 'peldano', 'tunel', 'pico', 'pozo'] as const
/** Las seis de la ampliación ninja. */
export const NINJA = ['gancho', 'salto', 'humo', 'kunai', 'sigilo', 'cometa'] as const
/** Las catorce. */
export const TODAS = [...HABILIDADES, ...NINJA] as const
export type Habilidad = (typeof TODAS)[number]

export type EstadoK =
  | 'andar' | 'caer' | 'planear' | 'trepar'
  | 'planton' | 'peldano' | 'tunel' | 'pico' | 'pozo'
  | 'gancho' | 'salto' | 'humo' | 'kunai' | 'cometa'
  | 'aturdido' | 'ahogado' | 'chispa' | 'llegando' | 'pinchado' | 'descubierto'
  | 'salvado' | 'perdido'

export type Kunobito = {
  id: number
  x: number
  y: number
  dir: 1 | -1
  estado: EstadoK
  /** Pasos en el estado actual (sirve para el ritmo de trabajo y la animación). */
  t: number
  /** Píxeles que lleva cayendo. */
  caida: number
  trepa: boolean
  hoja: boolean
  /** Pasos que le quedan a la Chispa, o null si no la lleva. */
  cuenta: number | null
  /** Peldaños que le quedan por poner. */
  peldanos: number
  /* Ampliación ninja (opcionales: los kunobitos de antes no los llevan). */
  /** Pasos de Sigilo que le quedan. */
  sigilo?: number
  /** Lleva la Cometa (se gasta al tocar el suelo). */
  cometa?: boolean
  /** Subiendo por una escala de kunai: hasta qué altura (y de los pies) llega. */
  escalaTop?: number | null
  /** Gancho: dónde se clavó el garfio. Salto: de dónde salió. */
  ax?: number
  ay?: number
  /** Gancho y Humo: adónde va. */
  tx?: number
  ty?: number
  /** Túnel: ya ha cavado algo (entonces, sin tierra delante, deja de cavar en vez de acercarse). */
  cavo?: boolean
}

export type Punto = { x: number; y: number }

/** Elementos de los escenarios ninja, fuera del mapa de píxeles. */
export type Objeto =
  /** Linterna vigía colgada en (x, y): su cono va y viene. Ángulos en radianes (π/2 = hacia abajo). */
  | { tipo: 'linterna'; x: number; y: number; centro?: number; barrido?: number; largo?: number; abre?: number }
  /** Corriente de viento: mueve en horizontal a quien lleva la Cometa. */
  | { tipo: 'viento'; x: number; y: number; w: number; h: number; dir: 1 | -1 }
  /** Cascada: tira hacia abajo a quien vuela, planea, trepa o sube por la cuerda. */
  | { tipo: 'cascada'; x: number; y: number; w: number; h: number }
  /** Placa: mientras alguien la pisa (pies en la fila y, entre x y x + w - 1), su puerta está abierta. */
  | { tipo: 'placa'; x: number; y: number; w: number; puerta: string }
  /** Puerta de reja de w × h: maciza mientras está cerrada. */
  | { tipo: 'puerta'; id: string; x: number; y: number; w: number; h: number }

/** Escala de kunai clavada en una pared: quien llega a la pared por ese lado sube por ella. */
export type Escala = { x: number; dir: 1 | -1; arriba: number; abajo: number }

export type Nivel = {
  nombre: string
  mapa: Mapa
  /** Boca del Nido: los kunobitos aparecen aquí, cayendo. */
  nido: Punto
  /** Puerta del Dojo, a la altura de los pies. */
  dojo: Punto
  total: number
  minimo: number
  /** Pasos entre salidas al empezar (el jugador puede acortarlo, no alargarlo). */
  intervalo: number
  /** Segundos de tiempo. */
  tiempo: number
  habilidades: Partial<Record<Habilidad, number>>
  /** Linternas, viento, cascadas, placas y puertas (ampliación ninja). */
  objetos?: Objeto[]
}

export type Resultado = { ganado: boolean; salvados: number; perdidos: number; estrellas: 0 | 1 | 2 | 3 }

export type Estado = {
  nivel: Nivel
  mapa: Mapa
  paso: number
  kunobitos: Kunobito[]
  salidos: number
  salvados: number
  perdidos: number
  intervalo: number
  /** Paso de la próxima salida del Nido. */
  proximaSalida: number
  habilidades: Record<Habilidad, number>
  fuegos: boolean
  fin: Resultado | null
  /** Zona del mapa cambiada desde la última vez que la pantalla la repintó (x0, y0, x1, y1), o null. */
  sucio: [number, number, number, number] | null
  /** Escalas de kunai clavadas. */
  escalas: Escala[]
  /** Puertas abiertas, por id. */
  puertas: Record<string, boolean>
}

export type Orden =
  | { tipo: 'habilidad'; id: number; habilidad: Habilidad }
  | { tipo: 'ritmo'; delta: number }
  | { tipo: 'fuegos' }

/* ---------- Crear y copiar ---------- */

export function nuevo(nivel: Nivel): Estado {
  const habilidades = Object.fromEntries(TODAS.map((h) => [h, nivel.habilidades[h] ?? 0])) as Record<Habilidad, number>
  const mapa = { ancho: nivel.mapa.ancho, alto: nivel.mapa.alto, celdas: nivel.mapa.celdas.slice() }
  const puertas: Record<string, boolean> = {}
  for (const o of nivel.objetos ?? []) {
    if (o.tipo !== 'puerta') continue
    puertas[o.id] = false
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) poner(mapa, x, y, PUERTA)
  }
  return {
    nivel,
    mapa,
    paso: 0,
    kunobitos: [],
    salidos: 0,
    salvados: 0,
    perdidos: 0,
    intervalo: nivel.intervalo,
    proximaSalida: ESPERA_INICIAL,
    habilidades,
    fuegos: false,
    fin: null,
    sucio: null,
    escalas: [],
    puertas,
  }
}

/** Pasos totales del nivel. */
export const pasosTotales = (n: Nivel) => n.tiempo * PASOS_POR_SEGUNDO

/* ---------- Consultas ---------- */

const FINALES: EstadoK[] = ['salvado', 'perdido']
const DE_PASO: EstadoK[] = ['aturdido', 'ahogado', 'chispa', 'llegando', 'pinchado', 'descubierto']

/** Sigue en juego (ni ha llegado ni se ha perdido, ni está a punto de hacerlo). */
export const activo = (k: Kunobito) => !FINALES.includes(k.estado) && !DE_PASO.includes(k.estado)
/** Aún en pantalla (incluye los que se están aturdiendo, ahogando, estallando o entrando). */
export const visible = (k: Kunobito) => !FINALES.includes(k.estado)

const EN_SUELO: EstadoK[] = ['andar', 'peldano', 'tunel', 'pico', 'pozo', 'kunai']

/** ¿Se le puede dar esta habilidad ahora? (No mira si quedan.) */
export function admite(k: Kunobito, h: Habilidad): boolean {
  if (!activo(k)) return false
  switch (h) {
    case 'trepa': return !k.trepa
    case 'hoja': return !k.hoja
    case 'chispa': return k.cuenta === null
    case 'planton': return EN_SUELO.includes(k.estado)
    case 'sigilo': return !((k.sigilo ?? 0) > 0)
    case 'cometa': return !k.cometa
    default: return EN_SUELO.includes(k.estado) && k.estado !== h
  }
}

/**
 * El kunobito que hay en el punto (x, y), para tocarlo en pantalla: el más
 * cercano cuyo cuerpo contiene el punto, con preferencia por los que admiten
 * la habilidad elegida.
 */
export function kunobitoEn(e: Estado, x: number, y: number, h?: Habilidad, margen = 3): Kunobito | null {
  let mejor: Kunobito | null = null
  let mejorD = Infinity
  for (const k of e.kunobitos) {
    if (!activo(k)) continue
    if (Math.abs(x - k.x) > 7 + margen || y < k.y - ALTO_K - margen || y > k.y + margen) continue
    const d = Math.hypot(x - k.x, y - (k.y - ALTO_K / 2)) - (h && admite(k, h) ? 100 : 0)
    if (d < mejorD) { mejorD = d; mejor = k }
  }
  return mejor
}

/* ---------- Órdenes ---------- */

/** Aplica una orden. Devuelve si tuvo efecto (una habilidad que no cabe no se gasta). */
export function aplicar(e: Estado, o: Orden): boolean {
  if (e.fin) return false
  if (o.tipo === 'ritmo') {
    const nuevo = Math.max(INTERVALO_MINIMO, Math.min(e.nivel.intervalo, e.intervalo + o.delta))
    if (nuevo === e.intervalo) return false
    e.intervalo = nuevo
    return true
  }
  if (o.tipo === 'fuegos') {
    if (e.fuegos) return false
    e.fuegos = true
    for (const k of e.kunobitos) if (activo(k) && k.cuenta === null) k.cuenta = CUENTA_CHISPA
    return true
  }
  const k = e.kunobitos.find((q) => q.id === o.id)
  const h = o.habilidad
  if (!k || !(e.habilidades[h] > 0) || !admite(k, h)) return false
  // Gancho y Humo miran el mapa: si no hay dónde engancharse o el muro es grueso, no se gastan.
  const destino = h === 'gancho' ? buscarGancho(e, k) : h === 'humo' ? buscarHumo(e, k) : null
  if ((h === 'gancho' || h === 'humo') && !destino) return false
  e.habilidades[h]--
  switch (h) {
    case 'trepa': k.trepa = true; break
    case 'hoja': k.hoja = true; break
    case 'chispa': k.cuenta = CUENTA_CHISPA; break
    case 'peldano': cambiar(k, 'peldano'); k.peldanos = PELDANOS; break
    case 'sigilo': k.sigilo = SIGILO_PASOS; break
    case 'cometa': k.cometa = true; break
    case 'salto': cambiar(k, 'salto'); k.ax = k.x; k.ay = k.y; break
    case 'kunai': cambiar(k, 'kunai'); k.ax = -1; k.ay = -1; break
    case 'gancho': case 'humo': {
      const [ax, ay, tx, ty] = destino!
      cambiar(k, h); k.ax = ax; k.ay = ay; k.tx = tx; k.ty = ty
      break
    }
    default: cambiar(k, h)
  }
  return true
}

function cambiar(k: Kunobito, estado: EstadoK) {
  k.estado = estado
  k.t = 0
  if (estado === 'tunel') k.cavo = false
  if (estado === 'caer') k.caida = 0
}

/* ---------- Un paso ---------- */

export function paso(e: Estado) {
  if (e.fin) return
  // Salidas del Nido.
  if (!e.fuegos && e.salidos < e.nivel.total && e.paso >= e.proximaSalida) {
    e.kunobitos.push({
      id: e.salidos, x: e.nivel.nido.x, y: e.nivel.nido.y, dir: 1, estado: 'caer', t: 0,
      caida: 0, trepa: false, hoja: false, cuenta: null, peldanos: 0, sigilo: 0, cometa: false, escalaTop: null,
    })
    e.salidos++
    e.proximaSalida = e.paso + e.intervalo
  }
  for (const k of e.kunobitos) {
    if (!visible(k)) continue
    mover(e, k)
    k.t++
  }
  if (e.nivel.objetos?.length) objetos(e)
  e.paso++
  comprobarFin(e)
}

function comprobarFin(e: Estado) {
  const quedan = e.kunobitos.some(visible)
  const sinSalir = !e.fuegos && e.salidos < e.nivel.total
  const tiempo = e.paso >= pasosTotales(e.nivel)
  if (!tiempo && (quedan || sinSalir)) return
  // Al acabar el tiempo, los que quedan se pierden.
  for (const k of e.kunobitos) if (visible(k)) perder(e, k)
  const total = e.nivel.total
  const ganado = e.salvados >= e.nivel.minimo
  const estrellas = !ganado ? 0 : e.salvados === total ? 3 : total - e.salvados <= 2 ? 2 : 1
  e.fin = { ganado, salvados: e.salvados, perdidos: total - e.salvados, estrellas }
}

function perder(e: Estado, k: Kunobito) {
  if (FINALES.includes(k.estado)) return
  k.estado = 'perdido'
  e.perdidos++
}

/* ---------- Movimiento ---------- */

const sol = (e: Estado, x: number, y: number) => solido(celda(e.mapa, x, y))
const fuera = (e: Estado, k: Kunobito) => k.x < 0 || k.x >= e.mapa.ancho || k.y >= e.mapa.alto

/** Pasos que duran las animaciones de salida. */
const DURA: Partial<Record<EstadoK, number>> = { aturdido: 14, ahogado: 12, chispa: 6, llegando: 10, pinchado: DURA_PINCHADO, descubierto: DURA_DESCUBIERTO }

function mover(e: Estado, k: Kunobito) {
  // Animaciones de salida: al acabar, el kunobito se pierde o se salva.
  if (DE_PASO.includes(k.estado)) {
    if (k.t + 1 >= DURA[k.estado]!) {
      if (k.estado === 'llegando') { k.estado = 'salvado'; e.salvados++ }
      else if (k.estado === 'descubierto') volverAlNido(e, k)
      else perder(e, k)
    }
    return
  }
  if ((k.sigilo ?? 0) > 0) k.sigilo!--
  // Cuenta atrás de la Chispa.
  if (k.cuenta !== null) {
    k.cuenta--
    if (k.cuenta <= 0) { estallar(e, k); return }
  }
  switch (k.estado) {
    case 'andar': andar(e, k); break
    case 'caer': case 'planear': caer(e, k); break
    case 'trepar': trepar(e, k); break
    case 'planton': planton(e, k); break
    case 'peldano': peldano(e, k); break
    case 'tunel': tunel(e, k); break
    case 'pico': pico(e, k); break
    case 'pozo': pozo(e, k); break
    case 'gancho': gancho(e, k); break
    case 'salto': salto(e, k); break
    case 'humo': humo(e, k); break
    case 'kunai': kunai(e, k); break
    case 'cometa': volar(e, k); break
  }
  if (!activo(k)) return
  if (fuera(e, k)) { perder(e, k); return }
  if (celda(e.mapa, k.x, k.y) === AGUA) { cambiar(k, 'ahogado'); return }
  if (celda(e.mapa, k.x, k.y) === PINCHO) { cambiar(k, 'pinchado'); return }
  if (llega(e, k)) cambiar(k, 'llegando')
}

function llega(e: Estado, k: Kunobito) {
  const f = e.nivel.dojo
  return Math.abs(k.x - f.x) <= 2 && k.y >= f.y - 4 && k.y <= f.y + 1
}

function andar(e: Estado, k: Kunobito) {
  // Un Plantón cerca, delante: media vuelta.
  for (const b of e.kunobitos) {
    if (b === k || b.estado !== 'planton') continue
    const d = (b.x - k.x) * k.dir
    if (d >= 1 && d <= ALCANCE_PLANTON && Math.abs(b.y - k.y) < ALTO_K / 2) { k.dir = -k.dir as 1 | -1; return }
  }
  const nx = k.x + k.dir
  if (sol(e, nx, k.y)) {
    // Escalón: lo sube si no es más alto que SUBIDA (las tejas no se suben andando).
    if (celda(e.mapa, nx, k.y) !== TEJA) {
      for (let s = 1; s <= SUBIDA; s++) {
        if (!sol(e, nx, k.y - s)) { k.x = nx; k.y -= s; return }
      }
    }
    // Pared: con Trepa, o por una escala de kunai, sube; si no, media vuelta.
    const escala = e.escalas.find((s) => s.dir === k.dir && Math.abs(s.x - k.x) <= 1 && k.y <= s.abajo + 1 && k.y > s.arriba)
    if (k.trepa) cambiar(k, 'trepar')
    else if (escala && celda(e.mapa, nx, k.y) !== TEJA) { cambiar(k, 'trepar'); k.escalaTop = escala.arriba }
    else k.dir = -k.dir as 1 | -1
    return
  }
  k.x = nx
  if (sol(e, k.x, k.y + 1)) return
  // Bajada pequeña: la baja andando.
  for (let s = 1; s <= BAJADA; s++) {
    if (sol(e, k.x, k.y + 1 + s)) { k.y += s; return }
  }
  cambiar(k, 'caer')
}

function caer(e: Estado, k: Kunobito) {
  const vel = k.estado === 'planear' ? VEL_HOJA : VEL_CAIDA
  for (let i = 0; i < vel; i++) {
    if (sol(e, k.x, k.y + 1)) {
      if (k.caida > CAIDA_MORTAL && k.estado !== 'planear') cambiar(k, 'aturdido')
      else cambiar(k, 'andar')
      return
    }
    k.y++
    k.caida++
    if (k.y >= e.mapa.alto || celda(e.mapa, k.x, k.y) === AGUA) return
  }
  if (k.cometa && k.estado === 'caer' && k.caida >= 4) { k.estado = 'cometa'; return }
  if (k.hoja && k.estado === 'caer' && k.caida >= ABRE_HOJA) { k.estado = 'planear' }
}

function trepar(e: Estado, k: Kunobito) {
  if (k.t % 2 === 1) return // trepa a medio ritmo
  const porEscala = !k.trepa && k.escalaTop != null
  if (sol(e, k.x, k.y - ALTO_K) || (porEscala && k.y <= k.escalaTop!)) {
    // Techo, o se acabó la escala de kunai: se suelta de espaldas.
    k.dir = -k.dir as 1 | -1
    k.escalaTop = null
    cambiar(k, 'caer')
    return
  }
  k.y--
  if (!sol(e, k.x + k.dir, k.y)) {
    // Arriba del todo: pasa por encima del borde.
    k.x += k.dir
    k.escalaTop = null
    cambiar(k, 'andar')
  }
}

/** Cambia una celda y apunta la zona para que la pantalla la repinte. */
function cambiarCelda(e: Estado, x: number, y: number, v: number) {
  if (x < 0 || y < 0 || x >= e.mapa.ancho || y >= e.mapa.alto) return
  poner(e.mapa, x, y, v)
  const z = e.sucio
  if (!z) e.sucio = [x, y, x, y]
  else { z[0] = Math.min(z[0], x); z[1] = Math.min(z[1], y); z[2] = Math.max(z[2], x); z[3] = Math.max(z[3], y) }
}

/** Herramienta que cava: el Túnel abre también el bambú. */
type Herramienta = 'tunel' | 'otra'
const puedeCavar = (v: number, h: Herramienta) => (h === 'tunel' ? cavaTunel(v) : cavable(v))
/** Lo que para a quien cava: macizo y que su herramienta no abre (cristal, hielo, tejas, puertas; bambú salvo con Túnel). */
const duro = (v: number, h: Herramienta) => solido(v) && !puedeCavar(v, h)

/** Quita lo cavable de un rectángulo; devuelve cuántos píxeles quitó. Un muro de papel cae entero. */
function cavar(e: Estado, x0: number, y0: number, x1: number, y1: number, h: Herramienta = 'otra') {
  let quitados = 0
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      const v = celda(e.mapa, x, y)
      if (v === PAPEL) quitados += romperPapel(e, x, y)
      else if (puedeCavar(v, h)) { cambiarCelda(e, x, y, VACIO); quitados++ }
    }
  }
  return { quitados }
}

/** Quita todo el papel unido al píxel (x, y), de golpe. */
function romperPapel(e: Estado, x: number, y: number) {
  const pila: [number, number][] = [[x, y]]
  let n = 0
  while (pila.length && n < 20000) {
    const [px, py] = pila.pop()!
    if (celda(e.mapa, px, py) !== PAPEL) continue
    cambiarCelda(e, px, py, VACIO)
    n++
    pila.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1])
  }
  return n
}

function hayDuro(e: Estado, x0: number, y0: number, x1: number, y1: number, h: Herramienta = 'otra') {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (duro(celda(e.mapa, x, y), h)) return true
  return false
}

function hayCavable(e: Estado, x0: number, y0: number, x1: number, y1: number, h: Herramienta = 'otra') {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (puedeCavar(celda(e.mapa, x, y), h)) return true
  return false
}

/** ¿Lo que hay que cavar en el rectángulo es todo nieve? (La nieve se cava el doble de rápido.) */
function soloNieve(e: Estado, x0: number, y0: number, x1: number, y1: number) {
  let nieve = false
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      const v = celda(e.mapa, x, y)
      if (v === NIEVE) nieve = true
      else if (solido(v)) return false
    }
  return nieve
}

function peldano(e: Estado, k: Kunobito) {
  if (k.t % 4 !== 3) return
  // Pone una tabla a la altura de los pies, delante.
  for (let i = 0; i < ANCHO_PELDANO; i++) {
    const x = k.x + k.dir * i
    if (celda(e.mapa, x, k.y) === VACIO) cambiarCelda(e, x, k.y, PELDANO)
  }
  k.peldanos--
  // Sube a la tabla: dos adelante y uno arriba, si no hay pared ni techo.
  const nx = k.x + k.dir * 2, ny = k.y - 1
  if (sol(e, k.x + k.dir, ny) || sol(e, nx, ny) || sol(e, nx, ny - ALTO_K + 1)) {
    cambiar(k, 'andar')
    return
  }
  k.x = nx
  k.y = ny
  if (k.peldanos <= 0) cambiar(k, 'andar')
}

function tunel(e: Estado, k: Kunobito) {
  if (!sol(e, k.x, k.y + 1)) { cambiar(k, 'caer'); return }
  const x0 = k.x + k.dir, x1 = k.x + k.dir * 3, y0 = k.y - ALTO_K + 1
  if (k.t % 2 === 0 && !soloNieve(e, x0, y0, x1, k.y)) return
  if (hayDuro(e, x0, y0, x1, k.y, 'tunel')) { cambiar(k, 'andar'); return }
  const { quitados } = cavar(e, x0, y0, x1, k.y, 'tunel')
  if (quitados > 0) k.cavo = true
  if (quitados === 0 && !hayCavable(e, x1 + k.dir, y0, x1 + k.dir * 3, k.y, 'tunel')) {
    // Recién dado y sin tierra delante: se acerca andando un poco antes de rendirse
    // (solo si aún no ha cavado: al salir de la tierra, vuelve a andar enseguida).
    if (k.t < ACERCARSE && !k.cavo) { andar(e, k); return }
    // Fuera de la tierra: vuelve a andar.
    cambiar(k, 'andar')
    return
  }
  k.x += k.dir
}

function pico(e: Estado, k: Kunobito) {
  if (!sol(e, k.x, k.y + 1)) { cambiar(k, 'caer'); return }
  const x0 = k.x + k.dir, x1 = k.x + k.dir * 3, y0 = k.y - ALTO_K + 2, y1 = k.y + 1
  if (k.t % 3 !== 2 && !(k.t % 3 === 0 && soloNieve(e, x0, y0, x1, y1))) return
  if (hayDuro(e, x0, y1, x1, y1) || hayDuro(e, x0, y0, x0, k.y)) { cambiar(k, 'andar'); return }
  const { quitados } = cavar(e, x0, y0, x1, y1)
  if (quitados === 0) { cambiar(k, 'andar'); return }
  k.x += k.dir
  k.y += 1
}

function pozo(e: Estado, k: Kunobito) {
  const y = k.y + 1
  if (k.t % 2 === 0 && !soloNieve(e, k.x - 4, y, k.x + 4, y)) return
  if (hayDuro(e, k.x - 4, y, k.x + 4, y)) { cambiar(k, 'andar'); return }
  const { quitados } = cavar(e, k.x - 4, y, k.x + 4, y)
  if (quitados === 0) {
    if (!sol(e, k.x, y)) cambiar(k, 'caer')
    else cambiar(k, 'andar')
    return
  }
  k.y = y
  if (!sol(e, k.x, k.y + 1) && !hayCavable(e, k.x - 4, k.y + 1, k.x + 4, k.y + 1)) cambiar(k, 'caer')
}

function estallar(e: Estado, k: Kunobito) {
  k.cuenta = null
  const cx = k.x, cy = k.y - 6
  for (let y = cy - RADIO_CHISPA; y <= cy + RADIO_CHISPA; y++) {
    for (let x = cx - RADIO_CHISPA; x <= cx + RADIO_CHISPA; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > RADIO_CHISPA ** 2) continue
      const v = celda(e.mapa, x, y)
      if (v === PAPEL) romperPapel(e, x, y)
      else if (cavable(v)) cambiarCelda(e, x, y, VACIO)
    }
  }
  cambiar(k, 'chispa')
}

/* ---------- Mapas desde texto ---------- */

/**
 * Crea un mapa a partir de filas de texto, cada carácter un bloque de
 * `escala` × `escala` píxeles: '.' aire, '#' tierra, '=' cristal, '~' agua,
 * '_' peldaño; y de la ampliación ninja: '^' pinchos, 'b' bambú, 'p' papel,
 * 's' nieve, 'h' hielo y 't' tejas. 'N' marca la boca del Nido y 'F' la puerta del Dojo (aire,
 * con los pies en el borde de abajo del bloque).
 */
export function mapaDeTexto(filas: string[], escala = 4): { mapa: Mapa; nido: Punto; dojo: Punto } {
  const ancho = Math.max(...filas.map((f) => f.length)) * escala
  const mapa = mapaVacio(ancho, filas.length * escala)
  let nido: Punto = { x: 0, y: 0 }, dojo: Punto = { x: 0, y: 0 }
  const tipo: Record<string, number> = {
    '#': TIERRA, '=': CRISTAL, '~': AGUA, '_': PELDANO,
    '^': PINCHO, 'b': BAMBU, 'p': PAPEL, 's': NIEVE, 'h': HIELO, 't': TEJA,
  }
  filas.forEach((f, j) => {
    for (let i = 0; i < f.length; i++) {
      const ch = f[i]
      const cx = i * escala + Math.floor(escala / 2), pie = (j + 1) * escala - 1
      if (ch === 'N') nido = { x: cx, y: j * escala }
      if (ch === 'F') dojo = { x: cx, y: pie }
      const v = tipo[ch]
      if (v === undefined) continue
      for (let y = 0; y < escala; y++) for (let x = 0; x < escala; x++) poner(mapa, i * escala + x, j * escala + y, v)
    }
  })
  return { mapa, nido, dojo }
}


/* ---------- Ampliación ninja ---------- */

/** Plantón: sobre hielo no frena y sigue deslizando hasta chocar. */
function planton(e: Estado, k: Kunobito) {
  if (!sol(e, k.x, k.y + 1)) { cambiar(k, 'caer'); return }
  if (celda(e.mapa, k.x, k.y + 1) !== HIELO) return
  const nx = k.x + k.dir
  if (!sol(e, nx, k.y) && !sol(e, nx, k.y - ALTO_K + 1)) k.x = nx
}

/**
 * Gancho: busca, delante y hacia arriba, el borde de un saliente o de una
 * pared (una superficie con aire encima) al que se pueda subir colgado de la
 * cuerda: en vertical hasta su altura y luego en horizontal hasta pisarlo.
 * Devuelve [garfio x, garfio y, destino x, destino y] o null.
 */
function buscarGancho(e: Estado, k: Kunobito): [number, number, number, number] | null {
  for (let dx = 2; dx <= GANCHO_LARGO; dx++) {
    const x = k.x + k.dir * dx
    for (let y = k.y - SUBIDA - 1; y >= k.y - GANCHO_ALTO; y--) {
      if (!sol(e, x, y) || sol(e, x, y - 1) || sol(e, x, y - 2)) continue
      // Camino libre: subir por la columna del kunobito y pasar por encima hasta el borde.
      let libre = true
      for (let yy = k.y - 1; yy >= y - 1 && libre; yy--) if (sol(e, k.x, yy)) libre = false
      for (let xx = k.x; libre && xx !== x; xx += k.dir) if (sol(e, xx, y - 1)) libre = false
      if (libre) return [x, y, x, y - 1]
    }
  }
  return null
}

function gancho(e: Estado, k: Kunobito) {
  if (k.t < GANCHO_LANZAR) return // lanza la cuerda
  const tx = k.tx!, ty = k.ty!
  if (k.y > ty) {
    // Sube por la cuerda, dos píxeles por paso.
    const ny = Math.max(ty, k.y - 2)
    for (let y = k.y - 1; y >= ny; y--) if (sol(e, k.x, y)) { cambiar(k, 'caer'); return }
    k.y = ny
    return
  }
  if (k.x !== tx) {
    const nx = k.x + Math.sign(tx - k.x)
    if (sol(e, nx, k.y)) { cambiar(k, 'caer'); return }
    k.x = nx
    return
  }
  cambiar(k, sol(e, k.x, k.y + 1) ? 'andar' : 'caer')
}

/** Salto: impulso y arco de SALTO_LARGO × SALTO_ALTO; aterriza de pie donde encuentra suelo. */
function salto(e: Estado, k: Kunobito) {
  if (k.t < SALTO_IMPULSO) return
  const i = k.t - SALTO_IMPULSO + 1
  const u = i / SALTO_PASOS
  const nx = k.ax! + k.dir * Math.round(SALTO_LARGO * u)
  const ny = k.ay! - Math.round(SALTO_ALTO * 4 * u * (1 - u))
  const subiendo = ny < k.y
  // Paso a paso por el camino, para no atravesar paredes finas.
  const pasos = Math.max(Math.abs(nx - k.x), Math.abs(ny - k.y), 1)
  const x0 = k.x, y0 = k.y
  for (let s = 1; s <= pasos; s++) {
    const x = Math.round(x0 + ((nx - x0) * s) / pasos), y = Math.round(y0 + ((ny - y0) * s) / pasos)
    if (subiendo && sol(e, x, y - ALTO_K + 1)) { k.caida = 0; cambiar(k, 'caer'); return }
    if (sol(e, x, y)) {
      // Choca: si el escalón es bajo, se sube a él; si no, cae junto a la pared.
      for (let a = 1; a <= SUBIDA; a++) if (!sol(e, x, y - a)) { k.x = x; k.y = y - a; cambiar(k, 'andar'); return }
      cambiar(k, 'caer')
      return
    }
    k.x = x; k.y = y
    if (!subiendo && sol(e, x, y + 1)) { cambiar(k, 'andar'); return }
    if (celda(e.mapa, x, y) === AGUA || celda(e.mapa, x, y) === PINCHO) return
  }
  if (i >= SALTO_PASOS) cambiar(k, sol(e, k.x, k.y + 1) ? 'andar' : 'caer')
}

/** ¿Hay un muro en la columna x a la altura del cuerpo? */
const muroEn = (e: Estado, x: number, y: number) => sol(e, x, y - 2) || sol(e, x, y - ALTO_K / 2)

/**
 * Humo: busca un muro a menos de HUMO_BUSCA delante; si no es más grueso que
 * HUMO_MURO y al otro lado cabe, devuelve [x del muro, y, destino x, destino y].
 */
function buscarHumo(e: Estado, k: Kunobito): [number, number, number, number] | null {
  let muro = 0
  for (let d = 1; d <= HUMO_BUSCA; d++) if (muroEn(e, k.x + k.dir * d, k.y)) { muro = k.x + k.dir * d; break }
  if (!muro) return null
  let grueso = 0
  while (grueso <= HUMO_MURO && muroEn(e, muro + k.dir * grueso, k.y)) grueso++
  if (grueso > HUMO_MURO) return null
  const tx = muro + k.dir * (grueso + 2)
  for (const y of [k.y, k.y - ALTO_K / 2, k.y - ALTO_K + 1]) if (sol(e, tx, y)) return null
  return [muro, k.y, tx, k.y]
}

function humo(e: Estado, k: Kunobito) {
  if (k.t === Math.floor(HUMO_PASOS / 2)) { k.x = k.tx!; k.y = k.ty! }
  if (k.t + 1 >= HUMO_PASOS) cambiar(k, sol(e, k.x, k.y + 1) ? 'andar' : 'caer')
}

/**
 * Kunai: anda hasta la pared de delante (como mucho ACERCARSE pasos), clava
 * KUNAIS kunai escalonados y deja una escala por la que suben los que llegan
 * a esa pared por ese lado. Él también sube.
 */
function kunai(e: Estado, k: Kunobito) {
  if (!sol(e, k.x, k.y + 1)) { cambiar(k, 'caer'); return }
  const nx = k.x + k.dir
  const pared = sol(e, nx, k.y) && Array.from({ length: SUBIDA }, (_, s) => sol(e, nx, k.y - s - 1)).every(Boolean)
  if (!pared) {
    if (k.t >= ACERCARSE) { cambiar(k, 'andar'); return }
    const antes = [k.x, k.y]
    andar(e, k)
    if (k.estado === 'kunai' && antes[0] === k.x && antes[1] === k.y) cambiar(k, 'andar')
    else if (k.estado === 'andar' || k.estado === 'kunai') k.estado = 'kunai'
    return
  }
  // En la pared: el reloj vuelve a contar desde aquí.
  if (k.ax !== k.x || k.ay !== k.y) { k.ax = k.x; k.ay = k.y; k.t = 0; return }
  if (k.t % KUNAI_RITMO !== KUNAI_RITMO - 1) return
  const n = Math.floor(k.t / KUNAI_RITMO)
  const fila = k.y - 3 - n * KUNAI_SEPARA
  for (let i = 0; i < 4; i++) {
    const x = k.x - k.dir * i
    if (celda(e.mapa, x, fila) === VACIO) cambiarCelda(e, x, fila, KUNAI)
  }
  if (n + 1 >= KUNAIS) {
    e.escalas.push({ x: k.x, dir: k.dir, arriba: k.y - KUNAI_ALCANCE, abajo: k.y })
    cambiar(k, 'trepar')
    k.escalaTop = k.y - KUNAI_ALCANCE
  }
}

/** Corriente de viento en la que está el kunobito (por el centro del cuerpo), o null. */
function vientoEn(e: Estado, x: number, y: number) {
  for (const o of e.nivel.objetos ?? []) {
    if (o.tipo === 'viento' && x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) return o
  }
  return null
}

/** Cometa: con viento vuela en horizontal; sin viento planea despacio. Al tocar el suelo, se gasta. */
function volar(e: Estado, k: Kunobito) {
  if (sol(e, k.x, k.y + 1)) { k.cometa = false; cambiar(k, 'andar'); return }
  const v = vientoEn(e, k.x, k.y - ALTO_K / 2)
  if (v) {
    k.dir = v.dir
    let movido = false
    for (let i = 0; i < VEL_VIENTO; i++) {
      const nx = k.x + v.dir
      if (sol(e, nx, k.y) || sol(e, nx, k.y - ALTO_K / 2) || sol(e, nx, k.y - ALTO_K + 1)) break
      k.x = nx
      movido = true
    }
    if (movido) return
    // Contra una pared, el viento no lo sostiene: baja despacio.
  }
  k.y += VEL_HOJA
  k.caida++
}

function volverAlNido(e: Estado, k: Kunobito) {
  Object.assign(k, {
    x: e.nivel.nido.x, y: e.nivel.nido.y, dir: 1, estado: 'caer', t: 0, caida: 0,
    trepa: false, hoja: false, cuenta: null, peldanos: 0, sigilo: 0, cometa: false, escalaTop: null,
  })
}

/** Ángulo del cono de una linterna vigía a los `s` segundos (va y viene). */
export const anguloLinterna = (s: number, centro = Math.PI / 2, barrido = 0.55) => centro + Math.sin(s * 0.7) * barrido

/** ¿Está (x, y) dentro del cono que sale de (lx, ly) con ese ángulo? */
export function enCono(lx: number, ly: number, ang: number, x: number, y: number, largo = 80, abre = 0.26) {
  const dx = x - lx, dy = y - ly
  const d = Math.hypot(dx, dy)
  if (d > largo || d < 1) return false
  let a = Math.atan2(dy, dx) - ang
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return Math.abs(a) < abre
}

/** ¿Lo tapa el Sigilo, suyo o de uno que va delante, pegado? */
function oculto(e: Estado, k: Kunobito) {
  if ((k.sigilo ?? 0) > 0) return true
  return e.kunobitos.some((s) => {
    if (s === k || !((s.sigilo ?? 0) > 0) || !activo(s) || Math.abs(s.y - k.y) > 4) return false
    const detras = (k.x - s.x) * s.dir
    return detras < 0 && detras >= -SIGILO_DETRAS
  })
}

/** Linternas, cascadas, placas y puertas: se miran después de mover a todos. */
function objetos(e: Estado) {
  const os = e.nivel.objetos!
  const s = e.paso / PASOS_POR_SEGUNDO
  for (const o of os) {
    if (o.tipo === 'linterna') {
      const ang = anguloLinterna(s, o.centro, o.barrido)
      for (const k of e.kunobitos) {
        if (!activo(k) || oculto(e, k)) continue
        if (enCono(o.x, o.y + 4, ang, k.x, k.y - 8, o.largo, o.abre)) cambiar(k, 'descubierto')
      }
    } else if (o.tipo === 'cascada') {
      for (const k of e.kunobitos) {
        if (!activo(k) || k.x < o.x || k.x >= o.x + o.w || k.y < o.y || k.y >= o.y + o.h) continue
        if (k.estado === 'cometa' || k.estado === 'planear' || k.estado === 'trepar' || k.estado === 'gancho') {
          k.escalaTop = null
          cambiar(k, 'caer')
        }
      }
    }
  }
  // Placas: cada puerta está abierta mientras alguien pisa una de sus placas.
  const pisadas = new Set<string>()
  for (const o of os) {
    if (o.tipo !== 'placa') continue
    const en = e.kunobitos.some((k) => activo(k) && k.y === o.y && k.x >= o.x && k.x < o.x + o.w && sol(e, k.x, k.y + 1))
    if (en) pisadas.add(o.puerta)
  }
  for (const o of os) {
    if (o.tipo !== 'puerta') continue
    const abrir = pisadas.has(o.id)
    if (abrir === e.puertas[o.id]) continue
    if (!abrir) {
      // No se cierra encima de nadie.
      const debajo = e.kunobitos.some((k) => visible(k) && k.x >= o.x - 1 && k.x <= o.x + o.w && k.y >= o.y && k.y - ALTO_K < o.y + o.h)
      if (debajo) continue
    }
    e.puertas[o.id] = abrir
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) {
      const v = celda(e.mapa, x, y)
      if (abrir && v === PUERTA) cambiarCelda(e, x, y, VACIO)
      else if (!abrir && v === VACIO) cambiarCelda(e, x, y, PUERTA)
    }
  }
}
