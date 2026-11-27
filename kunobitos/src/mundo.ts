/*
 * El mundo de una partida dibujado en un lienzo: fondo, terreno, elementos,
 * Nido, Dojo, kunobitos, ambiente y linternas. Lo usan la partida y la
 * pantalla de título (que juega sola). Todo en coordenadas del mundo: quien
 * llama pone antes la transformación (zoom y desplazamiento).
 */

import { GANCHO_LANZAR, HUMO_PASOS, PASOS_POR_SEGUNDO, visible, type Estado, type EstadoK, type Kunobito, type Nivel } from './motor'
import { indicesAgua, pintar, pintarAgua, pintarZona } from './terreno'
import { fondoKunobi } from './fondo'
import { DOJO, NIDO, dibujarDojo, dibujarNido } from './escenario'
import {
  ANDAR, ATURDIDO, CAER, COMETA, GANCHO, HOJA, HUMO, KUNAI, LLEGAR, MANO_GANCHO, PELDANO, PICO, PLANTON, POZO,
  SALTO, SIGILO, TREPAR, TUNEL,
  conCinta, halo, lienzoDe, type Cinta, type Sprite,
} from './sprites'
import {
  ambiente, anguloLinterna, dibujarCascada, dibujarCuerda, dibujarGarfio, dibujarLinterna, dibujarPlaca, dibujarPuerta,
  dibujarViento, fondoEscenario, type IdEscenario,
} from './paisajes'

/* ---------- Fotograma de cada kunobito ---------- */

const FOTOS: Partial<Record<EstadoK, [Sprite[], number]>> = {
  andar: [ANDAR, 0.6], caer: [CAER, 0.5], planear: [HOJA, 0.15], trepar: [TREPAR, 0.25],
  planton: [PLANTON, 0.05], peldano: [PELDANO, 0.5], tunel: [TUNEL, 0.5], pico: [PICO, 0.34],
  pozo: [POZO, 0.5], aturdido: [ATURDIDO, 0.3], llegando: [LLEGAR, 0.3], ahogado: [CAER, 0.5],
  kunai: [KUNAI, 0.2], cometa: [COMETA, 0.15], pinchado: [ATURDIDO, 0.3], descubierto: [CAER, 0.5],
}

export function spriteDe(k: Kunobito): Sprite {
  if (k.estado === 'andar' && (k.sigilo ?? 0) > 0) return SIGILO[Math.floor(k.t * 0.5) % SIGILO.length]
  if (k.estado === 'gancho') return k.t < GANCHO_LANZAR ? GANCHO[0] : GANCHO[1 + (Math.floor(k.t / 3) % 2)]
  if (k.estado === 'salto') return k.t < 3 ? SALTO[0] : SALTO[1]
  if (k.estado === 'humo') return HUMO[k.t < 4 ? 0 : k.t < HUMO_PASOS - 4 ? 1 : 2]
  const [lista, vel] = FOTOS[k.estado] ?? [ANDAR, 0.6]
  if (k.estado === 'planton') return lista[k.t % 50 < 3 ? 1 : 0]
  return lista[Math.floor(k.t * vel) % lista.length]
}

/* ---------- Capas: fondo, terreno y agua ---------- */

export type Capas = { fondo: HTMLCanvasElement; tierra: HTMLCanvasElement; img: ImageData; agua: number[]; cajaAgua: number[] }

/** Pinta una vez el fondo y el terreno del estado `e` en lienzos del tamaño del mundo. */
export function prepararCapas(e: Estado, escenario?: IdEscenario): Capas {
  const { ancho, alto } = e.mapa
  const fondo = document.createElement('canvas')
  fondo.width = ancho; fondo.height = alto
  if (escenario) fondoEscenario(fondo.getContext('2d')!, escenario, ancho, alto, 1, 0, 11)
  else fondoKunobi(fondo.getContext('2d')!, ancho, alto, 1, 0, { densidad: 24, semilla: 11 })
  const tierra = document.createElement('canvas')
  tierra.width = ancho; tierra.height = alto
  const img = tierra.getContext('2d')!.createImageData(ancho, alto)
  pintar(e.mapa, img, 0)
  tierra.getContext('2d')!.putImageData(img, 0, 0)
  const agua = indicesAgua(e.mapa)
  let x0 = ancho, y0 = alto, x1 = 0, y1 = 0
  for (const i of agua) { const x = i % ancho, y = (i - x) / ancho; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return { fondo, tierra, img, agua, cajaAgua: [x0, y0, x1, y1] }
}

/** Repinta lo que cambió del terreno y, cada pocos cuadros, el agua. */
export function actualizarCapas(e: Estado, cp: Capas, segundos: number, aguaToca: boolean) {
  const tctx = cp.tierra.getContext('2d')!
  if (e.sucio) {
    const [x0, y0, x1, y1] = pintarZona(e.mapa, cp.img, ...e.sucio)
    tctx.putImageData(cp.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1)
    e.sucio = null
  }
  if (cp.agua.length && aguaToca) {
    pintarAgua(e.mapa, cp.img, segundos, cp.agua)
    const [x0, y0, x1, y1] = cp.cajaAgua
    tctx.putImageData(cp.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1)
  }
}

/* ---------- Nido y Dojo, pintados una vez por paso de luz ---------- */

const PASOS_LUZ = 12
const cacheNido: HTMLCanvasElement[] = [], cacheDojo: HTMLCanvasElement[] = []

function enLienzo(ancho: number, alto: number, pintar: (px: (x: number, y: number, c: string) => void) => void) {
  const cv = document.createElement('canvas')
  cv.width = ancho; cv.height = alto
  const c = cv.getContext('2d')!
  pintar((x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1) })
  return cv
}
const nidoEn = (abierto: number) => {
  const i = Math.round(Math.min(1, Math.max(0, abierto)) * PASOS_LUZ)
  return (cacheNido[i] ??= enLienzo(NIDO.ancho, NIDO.alto + 4, (px) => dibujarNido(px, i / PASOS_LUZ)))
}
const dojoEn = (brillo: number) => {
  const i = Math.round(Math.min(1, Math.max(0, brillo)) * PASOS_LUZ)
  return (cacheDojo[i] ??= enLienzo(DOJO.ancho, DOJO.alto + 2, (px) => dibujarDojo(px, i / PASOS_LUZ)))
}

/* ---------- El mundo ---------- */

/**
 * Dibuja el mundo entero. `t` en segundos (animaciones), `brilloDojo` de 0 a 1
 * suma luz al Dojo (cuando llega alguien), `ambienteOn` las partículas del escenario.
 */
export function dibujarMundo(
  ctx: CanvasRenderingContext2D, e: Estado, cp: Capas,
  { cinta, t, escenario, ambienteOn = true, brilloDojo = 0, conFondo = true }: {
    cinta: Cinta; t: number; escenario?: IdEscenario; ambienteOn?: boolean; brilloDojo?: number
    /** Sin él, quien llama pinta antes el fondo (la pantalla de título lo mueve más despacio). */
    conFondo?: boolean
  },
) {
  if (conFondo) ctx.drawImage(cp.fondo, 0, 0)
  ctx.drawImage(cp.tierra, 0, 0)
  // Elementos de los escenarios ninja (las rejas cerradas y los kunai están en el terreno).
  for (const o of e.nivel.objetos ?? []) {
    if (o.tipo === 'viento') dibujarViento(ctx, 1, o.x, o.y, o.w, o.h, t, o.dir)
    else if (o.tipo === 'cascada') dibujarCascada(ctx, 1, o.x, o.y, o.y + o.h, o.w, t)
    else if (o.tipo === 'placa') dibujarPlaca(ctx, 1, o.x + Math.floor(o.w / 2), o.y + 1, !!e.puertas[o.puerta])
    else if (o.tipo === 'puerta') dibujarPuerta(ctx, 1, o.x - 3, o.y, o.h, 1)
  }
  const n: Nivel = e.nivel
  const abierto = Math.min(1, e.paso / 12)
  halo(ctx, n.nido.x, n.nido.y - 1, 4 + abierto * 8, '#7ff0dc', 0.35)
  ctx.drawImage(nidoEn(abierto), n.nido.x - NIDO.salidaX, n.nido.y - NIDO.salidaY)
  const brillo = Math.min(1, (Math.sin(t * 4) + 1) / 2 + brilloDojo)
  const dx0 = n.dojo.x - DOJO.puertaX, dy0 = n.dojo.y + 1 - DOJO.sueloY
  halo(ctx, n.dojo.x, n.dojo.y - 5, 16 + brillo * 3 + brilloDojo * 14, '#ffd75e', 0.35 + brilloDojo * 0.3)
  ctx.drawImage(dojoEn(brillo), dx0, dy0)
  halo(ctx, dx0 + DOJO.linterna[0], dy0 + DOJO.linterna[1], 6 + brillo * 2, '#fff2a8', 0.45)

  // La cuerda del Gancho, de la mano al garfio (mientras la lanza, a medio camino).
  for (const k of e.kunobitos) {
    if (k.estado !== 'gancho') continue
    const mx = k.x + k.dir * MANO_GANCHO[0], my = k.y + 1 + MANO_GANCHO[1]
    const u = Math.min(1, (k.t + 1) / GANCHO_LANZAR)
    const gx = mx + (k.ax! - mx) * u, gy = my + (k.ay! - my) * u
    dibujarCuerda(ctx, 1, mx, my, gx, gy, u < 1 ? 3 : 0)
    dibujarGarfio(ctx, 1, Math.round(gx), Math.round(gy))
  }
  for (const k of e.kunobitos) {
    if (!visible(k)) continue
    if (k.estado === 'chispa') {
      for (let i = 0; i < 16; i++) {
        const a = i * 0.8, r = 3 + k.t * 2.4
        ctx.fillStyle = ['#ffe08a', '#ff8a5a', '#5fd0e0'][i % 3]
        ctx.fillRect(Math.round(k.x + Math.cos(a) * r), Math.round(k.y - 6 + Math.sin(a) * r), 2, 2)
      }
      continue
    }
    const s = spriteDe(k)
    const desvio = k.estado === 'trepar' ? -k.dir * 5 : 0
    const desvanece = k.estado === 'llegando' || k.estado === 'ahogado'
    if (desvanece) ctx.globalAlpha = Math.max(0, 1 - k.t / 10)
    ctx.drawImage(lienzoDe(conCinta(s, cinta), k.dir), k.x - s.pieX + desvio, k.y + 1 - s.alto)
    ctx.globalAlpha = 1
    if (k.estado === 'aturdido') {
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + i * 2.1
        ctx.fillStyle = '#ffe08a'
        ctx.fillRect(Math.round(k.x + Math.cos(a) * 7), Math.round(k.y - 24 + Math.sin(a) * 2), 2, 2)
      }
    }
    if (k.estado === 'ahogado' && k.t % 3 === 0) {
      ctx.fillStyle = '#dff8ff'
      ctx.fillRect(k.x + ((k.t * 7) % 9) - 4, k.y - 2 - (k.t % 6), 1, 1)
    }
    if (k.cuenta !== null) {
      ctx.fillStyle = '#ffe08a'
      ctx.font = 'bold 9px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(String(Math.ceil(k.cuenta / PASOS_POR_SEGUNDO)), k.x, k.y - 30)
    }
  }
  // Ambiente del escenario (hojas, brasas, nieve o pétalos).
  if (escenario && ambienteOn) ambiente(ctx, escenario, n.mapa.ancho, n.mapa.alto, t)
  // Linternas vigía, encima de todo: se ve a quién alcanza su luz.
  const alerta = e.kunobitos.some((k) => k.estado === 'descubierto')
  for (const o of e.nivel.objetos ?? []) {
    if (o.tipo !== 'linterna') continue
    dibujarCuerda(ctx, 1, o.x, 0, o.x, o.y - 3, 0, '#3a2c3c')
    dibujarLinterna(ctx, 1, o.x, o.y, anguloLinterna(e.paso / PASOS_POR_SEGUNDO, o.centro, o.barrido), alerta, o.largo ?? 80, o.abre ?? 0.26)
  }
}

/* ---------- Partículas (en coordenadas del mundo) ---------- */

export type Particula = { x: number; y: number; vx: number; vy: number; vida: number; max: number; color: string; tam: number; peso: number }

export const reducido = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Número estable a partir de una semilla (las partículas no usan Math.random). */
const azar = (n: number) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 15; return (h >>> 0) / 4294967296 }

export function chorro(ps: Particula[], x: number, y: number, n: number, colores: string[], fuerza: number, semilla: number, peso = 60) {
  if (reducido()) return
  for (let i = 0; i < n; i++) {
    const a = azar(semilla + i * 3) * Math.PI * 2, v = fuerza * (0.4 + azar(semilla + i * 3 + 1) * 0.8)
    ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - fuerza * 0.4, vida: 0, max: 0.5 + azar(semilla + i * 3 + 2) * 0.6, color: colores[i % colores.length], tam: i % 3 === 0 ? 2 : 1, peso })
  }
}

/** Mueve y dibuja las partículas `dt` segundos; devuelve las que siguen vivas. */
export function dibujarParticulas(ctx: CanvasRenderingContext2D, ps: Particula[], dt: number): Particula[] {
  for (const q of ps) {
    q.vida += dt; q.vy += q.peso * dt; q.x += q.vx * dt; q.y += q.vy * dt
    ctx.globalAlpha = Math.max(0, 1 - q.vida / q.max)
    ctx.fillStyle = q.color
    ctx.fillRect(Math.round(q.x), Math.round(q.y), q.tam, q.tam)
  }
  ctx.globalAlpha = 1
  return ps.filter((q) => q.vida < q.max)
}
