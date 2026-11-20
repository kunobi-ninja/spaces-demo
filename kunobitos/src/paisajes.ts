/*
 * Ampliación ninja: los cuatro escenarios nuevos y sus elementos.
 * Cada escenario es una variante del fondo de formas de Kunobi (otros
 * colores) con siluetas propias, y los elementos (linterna vigía, viento,
 * cascada, placa, puerta y cuerda) se dibujan en una capa aparte, sin tocar
 * el terreno. Todo es dibujo propio en píxeles.
 */

import { fondoKunobi } from './fondo'
import { halo, type Cinta } from './sprites'
import { ruido } from './terreno'
import { anguloLinterna, enCono } from './motor'

export { anguloLinterna, enCono }

export type IdEscenario = 'bambu' | 'tejados' | 'montana' | 'maestro'

export const ESCENARIOS: Record<IdEscenario, { cinta: Cinta; cielo: string[]; tonos: string[]; fuerza: number }> = {
  bambu: {
    cinta: 'verde',
    cielo: ['#06201b', '#0f3a2c', '#1c4c36'], tonos: ['#5fd0a0', '#3fb68a', '#7fd3b0', '#2f8f6f'], fuerza: 0.55,
  },
  tejados: {
    cinta: 'morada',
    cielo: ['#060a22', '#121845', '#23295c'], tonos: ['#7f8fe0', '#a383f0', '#4a7fd0', '#c8b6ff'], fuerza: 0.45,
  },
  montana: {
    cinta: 'blanca',
    cielo: ['#18285a', '#3a5a90', '#8fb0d8'], tonos: ['#ffffff', '#cfe0ff', '#9fc0ef'], fuerza: 0.35,
  },
  maestro: {
    cinta: 'negra',
    cielo: ['#2a1d4a', '#7a3a6a', '#f08a5d', '#ffd08a'], tonos: ['#ffd08a', '#ff9a7a', '#f2b33c'], fuerza: 0.3,
  },
}

/** Pinta un píxel del mundo (x, y) a escala `e`. */
const pixel = (ctx: CanvasRenderingContext2D, e: number) => (x: number, y: number, c: string) => {
  ctx.fillStyle = c
  ctx.fillRect(Math.round(x) * e, Math.round(y) * e, e, e)
}

/* ---------- Fondos ---------- */

/** Fondo completo de un escenario: cielo, formas de Kunobi y siluetas. */
export function fondoEscenario(ctx: CanvasRenderingContext2D, id: IdEscenario, W: number, H: number, e: number, t: number, semilla = 7) {
  const d = ESCENARIOS[id]
  fondoKunobi(ctx, W, H, e, t, { densidad: 22, semilla, cielo: d.cielo, tonos: d.tonos, fuerza: d.fuerza })
  const px = pixel(ctx, e)
  if (id === 'bambu') {
    // Cañas lejanas, más oscuras, con nudos y alguna hoja.
    for (let i = 0; i * 13 < W + 13; i++) {
      const x0 = i * 13 + Math.floor(ruido(i, 0, 51) * 8)
      const lejos = ruido(i, 1, 51) < 0.5
      const c = lejos ? '#123d2c' : '#1b5a3c', nudo = lejos ? '#1d523b' : '#2c7a50'
      const ancho = lejos ? 2 : 3
      const fase = ruido(i, 2, 51) * 18
      for (let y = 0; y < H; y++) for (let k = 0; k < ancho; k++) px(x0 + k, y, (y + fase) % 18 < 1 ? nudo : c)
      for (let h = 0; h < 3; h++) {
        const y = Math.floor(ruido(i, h + 3, 51) * H * 0.7)
        for (let k = 0; k < 5; k++) px(x0 + ancho + k, y + Math.floor(k / 2), nudo)
      }
    }
    // Bancos de niebla que se mueven despacio.
    for (let b = 0; b < 3; b++) {
      const y0 = H * (0.35 + b * 0.18)
      ctx.fillStyle = '#d8f5e8'
      ctx.globalAlpha = 0.07
      for (let x = 0; x < W; x++) {
        const alto = 6 + Math.sin(x / 17 + t * 0.3 + b * 2) * 3 + Math.sin(x / 5 + b) * 1
        ctx.fillRect(x * e, Math.round(y0 - alto) * e, e, Math.round(alto * 2) * e)
      }
      ctx.globalAlpha = 1
    }
  } else if (id === 'tejados') {
    // Luna grande con su halo y dos manchas.
    const lx = Math.round(W * 0.8), ly = 24
    halo(ctx, lx * e, ly * e, 34 * e, '#d9dcff', 0.25)
    for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) {
      if (x * x + y * y > 121) continue
      const mancha = (x + 4) ** 2 + (y - 2) ** 2 < 8 || (x - 3) ** 2 + (y + 4) ** 2 < 5
      px(lx + x, ly + y, mancha ? '#cfd3f0' : x + y < -8 ? '#ffffff' : '#eef0ff')
    }
    // Dos filas de tejados lejanos, con alguna ventana encendida.
    for (const [capa, base, color, alto] of [[0, H * 0.55, '#121a44', 14], [1, H * 0.68, '#0c1233', 18]] as const) {
      let x = -10 + capa * 9
      let n = 0
      while (x < W) {
        const w = 26 + Math.floor(ruido(n, capa, 52) * 22)
        const h = alto + Math.floor(ruido(n, capa + 2, 52) * 10)
        const techo = base - h
        for (let xx = 0; xx < w; xx++) {
          // Tejado con los aleros hacia arriba en las puntas.
          const borde = Math.min(xx, w - 1 - xx)
          const sube = borde < 3 ? 3 - borde : 0
          const cima = techo - Math.min(6, borde * 0.45) - sube * 0.6
          for (let y = Math.round(cima); y < H; y++) px(x + xx, y, color)
        }
        for (let v = 0; v < 2; v++) if (ruido(n, v + 5, 52 + capa) < 0.45) {
          const vx = x + 6 + v * Math.floor(w / 2), vy = Math.round(base - h / 2 + 2)
          for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) px(vx + a, vy + b, a === 1 ? '#c98a3a' : '#ffd46a')
        }
        x += w + 2
        n++
      }
    }
    // Una cuerda de faroles cruzando el cielo.
    dibujarCuerda(ctx, e, 0, 34, W * 0.6, 30, 9, '#3a2c3c')
    for (let k = 1; k < 6; k++) {
      const u = k / 6, x = W * 0.6 * u, y = 34 + (30 - 34) * u + 9 * 4 * u * (1 - u)
      const b = 0.35 + 0.15 * Math.sin(t * 2 + k)
      halo(ctx, x * e, (y + 4) * e, 8 * e, '#ffb36a', b)
      for (let a = -1; a <= 1; a++) for (let c = 1; c <= 5; c++) px(x + a, y + c, c === 1 || c === 5 ? '#4a2a3a' : a === 0 ? '#ffd46a' : '#e5483d')
    }
  } else if (id === 'montana') {
    // Dos cordilleras con las cumbres nevadas.
    for (const [base, color, nieve, semilla2, escalaX] of [[H * 0.62, '#5a74a8', '#e9f1ff', 61, 70], [H * 0.8, '#3c5285', '#ffffff', 62, 52]] as const) {
      for (let x = 0; x < W; x++) {
        let cima = base
        for (let k = -1; k < W / escalaX + 2; k++) {
          const cx = k * escalaX + ruido(k, 0, semilla2) * escalaX * 0.6
          const alto = 24 + ruido(k, 1, semilla2) * 30
          cima = Math.min(cima, base - alto + Math.abs(x - cx) * (0.9 + ruido(k, 2, semilla2) * 0.5))
        }
        for (let y = Math.max(0, Math.round(cima)); y < H; y++) {
          const hondo = y - cima
          px(x, y, hondo < 5 + Math.sin(x * 0.7) * 2 ? nieve : color)
        }
      }
    }
  } else {
    // Amanecer: sol en el horizonte, nubes alargadas y una pagoda.
    const sx = Math.round(W * 0.62), sy = Math.round(H * 0.6)
    halo(ctx, sx * e, sy * e, 50 * e, '#ffe2a0', 0.4)
    for (let y = -16; y <= 0; y++) for (let x = -16; x <= 16; x++) if (x * x + y * y <= 256) px(sx + x, sy + y, y > -4 ? '#ffd27a' : '#fff0c0')
    for (let n = 0; n < 5; n++) {
      const cy = 18 + n * 11, cx = ((ruido(n, 0, 71) * W + t * (2 + n)) % (W + 80)) - 40, largo = 40 + ruido(n, 1, 71) * 40
      ctx.globalAlpha = 0.55
      for (let x = 0; x < largo; x++) {
        const grueso = Math.sin((x / largo) * Math.PI) * 3
        for (let y = -grueso; y <= grueso * 0.6; y++) px(cx + x, cy + y, y < 0 ? '#ffc4a0' : '#e8907a')
      }
      ctx.globalAlpha = 1
    }
    const pxg = Math.round(W * 0.2), base = Math.round(H * 0.72)
    for (let piso = 0; piso < 4; piso++) {
      const ancho = 26 - piso * 5, y = base - piso * 12
      for (let x = -ancho; x <= ancho; x++) {
        const sube = Math.abs(x) > ancho - 3 ? 2 : 0
        for (let yy = -3 - sube; yy <= 0; yy++) px(pxg + x, y + yy, '#3a2140')
      }
      for (let x = -ancho + 6; x <= ancho - 6; x++) for (let yy = 1; yy <= 8; yy++) px(pxg + x, y + yy, '#4a2a4e')
    }
    for (let yy = 0; yy < 8; yy++) px(pxg, base - 48 - yy, '#3a2140')
    for (let y = base + 9; y < H; y++) for (let x = pxg - 30; x <= pxg + 30; x++) px(x, y, '#4a2a4e')
  }
}

/* ---------- Elementos ---------- */

/** Cuerda combada de (x0, y0) a (x1, y1); `comba` es cuánto cuelga en el centro. */
export function dibujarCuerda(ctx: CanvasRenderingContext2D, e: number, x0: number, y0: number, x1: number, y1: number, comba = 0, color = '#c9a46a') {
  const px = pixel(ctx, e)
  const n = Math.max(4, Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2)
  for (let i = 0; i <= n; i++) {
    const u = i / n
    px(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + comba * 4 * u * (1 - u), color)
  }
}

/** Garfio de tres puntas clavado en (x, y). */
export function dibujarGarfio(ctx: CanvasRenderingContext2D, e: number, x: number, y: number) {
  const px = pixel(ctx, e)
  for (const [dx, dy, c] of [[0, 0, '#c7cfdc'], [-1, -1, '#6f7a90'], [1, -1, '#c7cfdc'], [-2, -1, '#6f7a90'], [2, -2, '#f2f6fc'], [0, 1, '#6f7a90']] as const) px(x + dx, y + dy, c)
}

/** Linterna vigía colgada en (x, y), con su cono de luz; `alerta` la pone roja. */
export function dibujarLinterna(ctx: CanvasRenderingContext2D, e: number, x: number, y: number, ang: number, alerta = false, largo = 80, abre = 0.26) {
  const px = pixel(ctx, e)
  // Cono de luz: un abanico de píxeles translúcidos, más claro cerca.
  ctx.fillStyle = alerta ? '#ff7a6a' : '#fff2a8'
  for (let yy = Math.round(y); yy < y + largo; yy++) for (let xx = Math.round(x - largo); xx < x + largo; xx++) {
    if (!enCono(x, y + 4, ang, xx, yy, largo, abre)) continue
    ctx.globalAlpha = 0.32 * (1 - Math.hypot(xx - x, yy - y) / largo) + 0.07
    ctx.fillRect(xx * e, yy * e, e, e)
  }
  ctx.globalAlpha = 1
  halo(ctx, x * e, (y + 4) * e, 10 * e, alerta ? '#ff7a6a' : '#ffd46a', 0.5)
  // Gancho, tapa, papel con luz y borla.
  px(x, y - 3, '#3a2c3c'); px(x, y - 2, '#3a2c3c')
  for (let dy = -1; dy <= 7; dy++) for (let dx = -2; dx <= 2; dx++) {
    if ((dy === -1 || dy === 7) && Math.abs(dx) === 2) continue
    const c = dy === -1 || dy === 7 ? '#1f2a4a' : dy === 3 ? '#f2b33c' : Math.abs(dx) === 2 ? '#a8302a' : dx === -1 ? (alerta ? '#ffb0a0' : '#fff3c0') : alerta ? '#ff6a5a' : '#e5483d'
    px(x + dx, y + dy, c)
  }
  px(x, y + 8, '#f2b33c'); px(x, y + 9, '#c4831e')
}

/** Corriente de viento en la zona dada: rayas que avanzan hacia `dir`. */
export function dibujarViento(ctx: CanvasRenderingContext2D, e: number, x: number, y: number, w: number, h: number, t: number, dir: 1 | -1 = 1) {
  ctx.fillStyle = '#eaf8ff'
  for (let k = 0; k < Math.max(6, (w * h) / 220); k++) {
    const fila = y + 2 + Math.floor(ruido(k, 0, 81) * (h - 4))
    const largo = 6 + Math.floor(ruido(k, 1, 81) * 9)
    const vel = 40 + ruido(k, 2, 81) * 30
    const avance = (ruido(k, 3, 81) * (w + largo) + t * vel) % (w + largo)
    const x0 = dir === 1 ? x - largo + avance : x + w - avance
    for (let i = 0; i < largo; i++) {
      const xx = Math.round(x0 + i)
      if (xx < x || xx >= x + w) continue
      ctx.globalAlpha = 0.15 + 0.35 * Math.sin((i / largo) * Math.PI)
      ctx.fillRect(xx * e, Math.round(fila + Math.sin(xx / 6 + k) * 1.2) * e, e, e)
    }
  }
  ctx.globalAlpha = 1
}

/** Cascada de `ancho` píxeles entre y0 e y1, con franjas que bajan y espuma abajo. */
export function dibujarCascada(ctx: CanvasRenderingContext2D, e: number, x: number, y0: number, y1: number, ancho: number, t: number) {
  const px = pixel(ctx, e)
  for (let xx = 0; xx < ancho; xx++) for (let y = y0; y < y1; y++) {
    const franja = (y - t * 70 + ruido(x + xx, 0, 91) * 20) % 12
    ctx.globalAlpha = 0.85
    px(x + xx, y, xx === 0 || xx === ancho - 1 ? '#3f8fc8' : franja < 2 ? '#e6f8ff' : franja < 5 ? '#9be3fa' : '#59c3e6')
  }
  ctx.globalAlpha = 1
  for (let k = 0; k < 10; k++) {
    const fx = x - 3 + ruido(k, 1, 92) * (ancho + 6), fy = y1 - 1 - Math.abs(Math.sin(t * 5 + k)) * 3
    px(fx, fy, '#ffffff')
  }
}

/** Placa en el suelo con el centro en (x, y) (y = el suelo); `pisada` la hunde y la enciende. */
export function dibujarPlaca(ctx: CanvasRenderingContext2D, e: number, x: number, y: number, pisada: boolean) {
  const px = pixel(ctx, e)
  if (pisada) halo(ctx, x * e, y * e, 10 * e, '#7ff0dc', 0.45)
  const alto = pisada ? 1 : 2
  for (let dx = -6; dx <= 6; dx++) for (let dy = 0; dy < alto; dy++) {
    px(x + dx, y - alto + dy, Math.abs(dx) === 6 ? '#c4831e' : dy === 0 ? (pisada ? '#bff8ec' : '#cfc6ba') : '#8f877d')
  }
  if (!pisada) px(x, y - 2, '#f2b33c')
}

/** Puerta de reja de madera de 10 de ancho y `alto`, que sube al abrirse (`abierta` de 0 a 1). */
export function dibujarPuerta(ctx: CanvasRenderingContext2D, e: number, x: number, y: number, alto: number, abierta: number) {
  const px = pixel(ctx, e)
  const visible = Math.round(alto * (1 - abierta))
  // Pórtico de madera: dos postes, una viga baja y un dintel con las puntas hacia arriba.
  for (let dy = -10; dy < alto; dy++) for (const [dx, c] of [[-3, '#9c6a40'], [-2, '#7a4e2e'], [11, '#9c6a40'], [12, '#7a4e2e']] as const) px(x + dx, y + dy, c)
  for (let dx = -4; dx <= 13; dx++) for (let dy = -4; dy < -2; dy++) px(x + dx, y + dy, dy === -4 ? '#9c6a40' : '#5a3a26')
  for (let dx = -8; dx <= 17; dx++) {
    const punta = dx < -5 || dx > 14 ? 1 : 0
    for (let dy = -12 - punta; dy < -9; dy++) px(x + dx, y + dy, dy === -12 - punta ? '#f2b33c' : '#3a2140')
  }
  for (let dx = 3; dx <= 6; dx++) for (let dy = -9; dy < -4; dy++) px(x + dx, y + dy, dy === -9 || dy === -5 ? '#5a3a26' : '#f2b33c')
  for (let dy = 0; dy < visible; dy++) for (let dx = 0; dx < 10; dx++) {
    const barra = dx % 3 === 0, travesano = (dy + alto - visible) % 8 === 0
    if (!barra && !travesano) continue
    px(x + dx, y + dy, travesano ? '#7a4e2e' : dx === 0 ? '#b98a55' : '#9c6a40')
  }
  // Puntas de hierro abajo.
  if (visible > 0) for (let dx = 0; dx < 10; dx += 3) px(x + dx, y + visible, '#6f7a90')
}

/* ---------- Ambiente ---------- */

/**
 * Partículas de ambiente de cada escenario, sin estado: salen de `ruido` y del
 * tiempo, así que se dibujan igual en cada fotograma sin guardar nada.
 * Bambú: hojas que caen; Tejados: brasas de los faroles que suben;
 * Montaña: copos de nieve; Maestro: pétalos al viento.
 */
export function ambiente(ctx: CanvasRenderingContext2D, id: IdEscenario, W: number, H: number, t: number, e = 1) {
  const px = pixel(ctx, e)
  const n = Math.round((W * H) / (id === 'montana' ? 900 : 2200))
  for (let i = 0; i < n; i++) {
    const a = ruido(i, 0, 101), b = ruido(i, 1, 101), c = ruido(i, 2, 101)
    if (id === 'tejados') {
      // Brasas: suben despacio y parpadean.
      const x = (a * W + Math.sin(t * 0.9 + i) * 6) % W
      const y = H - ((b * H + t * (6 + c * 6)) % H)
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 4 + i * 1.7)
      px(x, y, c < 0.5 ? '#ffb36a' : '#ffd46a')
      continue
    }
    const vel = id === 'montana' ? 10 + c * 10 : 7 + c * 5
    const deriva = id === 'maestro' ? t * 9 : t * 3
    const x = ((a * W + Math.sin(t * 0.8 + i) * 8 + deriva) % W + W) % W
    const y = (b * H + t * vel) % H
    ctx.globalAlpha = id === 'montana' ? 0.55 + c * 0.45 : 0.85
    if (id === 'montana') { px(x, y, '#ffffff'); if (c > 0.7) px(x + 1, y, '#e9f1ff'); continue }
    // Hoja de bambú o pétalo: dos o tres píxeles que giran.
    const giro = Math.sin(t * 2 + i) > 0
    const [luz, sombra] = id === 'bambu' ? ['#b6e27f', '#5f9f3c'] : ['#ffd1e0', '#f29ab8']
    px(x, y, luz)
    px(x + (giro ? 1 : 0), y + (giro ? 0 : 1), sombra)
    if (id === 'bambu' && c > 0.5) px(x + (giro ? 2 : 0), y + (giro ? 0 : 2), sombra)
  }
  ctx.globalAlpha = 1
}
