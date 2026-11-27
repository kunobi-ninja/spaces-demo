/*
 * Las ilustraciones del tablero, pintadas con canvas: cada casilla especial (por su `id` en
 * data/tablero.json), la textura del tablero entero y la de la mesa. Todo se dibuja en una caja
 * de 100 × 100 y se escala; una casilla con un `id` nuevo usa su `icono` dentro de una medalla.
 */

export const TINTA = '#3b2414'
export const PAPEL = '#f6e9cc'
export const FUENTE_TITULO = "'Fraunces', Georgia, serif"

type Ctx = CanvasRenderingContext2D

function trazo(ctx: Ctx, ancho = 2.6) {
  ctx.lineWidth = ancho
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = TINTA
  ctx.stroke()
}

function rellenar(ctx: Ctx, color: string, ancho = 2.6) {
  ctx.fillStyle = color
  ctx.fill()
  trazo(ctx, ancho)
}

function elipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, giro = 0) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, giro, 0, Math.PI * 2)
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, r = 3) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function sombra(ctx: Ctx, x: number, y: number, rx: number) {
  elipse(ctx, x, y, rx, rx * 0.2)
  ctx.fillStyle = 'rgba(59, 36, 20, .16)'
  ctx.fill()
}

function oca(ctx: Ctx) {
  sombra(ctx, 50, 88, 30)
  ctx.strokeStyle = '#e48a1e'
  ctx.lineWidth = 3.4
  ctx.lineCap = 'round'
  for (const x of [44, 56]) {
    ctx.beginPath()
    ctx.moveTo(x, 72)
    ctx.lineTo(x - 1, 86)
    ctx.lineTo(x + 6, 87)
    ctx.stroke()
  }
  // cola
  ctx.beginPath()
  ctx.moveTo(30, 56)
  ctx.lineTo(13, 44)
  ctx.lineTo(28, 64)
  ctx.closePath()
  rellenar(ctx, '#fffaf0')
  // cuerpo
  elipse(ctx, 50, 62, 27, 16, -0.12)
  rellenar(ctx, '#fffaf0')
  // ala
  ctx.beginPath()
  ctx.moveTo(32, 58)
  ctx.quadraticCurveTo(46, 46, 62, 56)
  ctx.quadraticCurveTo(52, 70, 34, 66)
  ctx.closePath()
  rellenar(ctx, '#e9e1cf', 2.2)
  ctx.beginPath()
  ctx.moveTo(40, 60)
  ctx.quadraticCurveTo(47, 57, 54, 60)
  trazo(ctx, 1.6)
  // cuello
  ctx.beginPath()
  ctx.moveTo(66, 56)
  ctx.quadraticCurveTo(78, 40, 71, 24)
  ctx.lineWidth = 14
  ctx.strokeStyle = TINTA
  ctx.stroke()
  ctx.lineWidth = 9.4
  ctx.strokeStyle = '#fffaf0'
  ctx.stroke()
  // cabeza
  elipse(ctx, 71, 22, 9.5, 8.5)
  rellenar(ctx, '#fffaf0')
  ctx.beginPath()
  ctx.moveTo(78, 19)
  ctx.quadraticCurveTo(92, 21, 93, 25)
  ctx.quadraticCurveTo(86, 28, 78, 27)
  ctx.closePath()
  rellenar(ctx, '#f0962a', 2.2)
  elipse(ctx, 73, 19.5, 1.9, 1.9)
  ctx.fillStyle = TINTA
  ctx.fill()
  elipse(ctx, 66, 25, 3, 2)
  ctx.fillStyle = 'rgba(232, 120, 90, .35)'
  ctx.fill()
}

function puente(ctx: Ctx) {
  rect(ctx, 8, 64, 84, 24, 6)
  rellenar(ctx, '#6aa5bd')
  ctx.strokeStyle = 'rgba(255, 255, 255, .75)'
  ctx.lineWidth = 2
  for (const [x, y] of [[18, 74], [56, 80], [70, 72]]) {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + 5, y - 3, x + 10, y)
    ctx.quadraticCurveTo(x + 15, y + 3, x + 20, y)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(6, 70)
  ctx.lineTo(6, 44)
  ctx.lineTo(94, 44)
  ctx.lineTo(94, 70)
  ctx.lineTo(72, 70)
  ctx.arc(50, 70, 22, 0, Math.PI, true)
  ctx.lineTo(28, 70)
  ctx.closePath()
  rellenar(ctx, '#d4b285')
  ctx.strokeStyle = 'rgba(59, 36, 20, .35)'
  ctx.lineWidth = 1.6
  for (const [x1, y1, x2, y2] of [[12, 52, 22, 52], [12, 60, 18, 60], [80, 54, 90, 54], [84, 62, 90, 62], [36, 50, 46, 50], [58, 50, 66, 50]]) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  rect(ctx, 3, 36, 94, 9, 3)
  rellenar(ctx, '#b88d5a')
  for (const x of [14, 50, 86]) {
    rect(ctx, x - 2, 22, 4, 15, 1)
    rellenar(ctx, '#6b4a2b', 1.8)
    elipse(ctx, x, 21, 4.5, 4.5)
    rellenar(ctx, '#ffd36b', 1.8)
  }
}

function posada(ctx: Ctx) {
  sombra(ctx, 50, 89, 34)
  rect(ctx, 62, 18, 9, 20, 1)
  rellenar(ctx, '#a0573a')
  ctx.fillStyle = 'rgba(120, 110, 100, .35)'
  for (const [x, y, r] of [[67, 12, 4], [72, 6, 5], [79, 2, 4]]) {
    elipse(ctx, x, y, r, r)
    ctx.fill()
  }
  rect(ctx, 22, 46, 56, 41, 2)
  rellenar(ctx, '#f3dfb4')
  ctx.beginPath()
  ctx.moveTo(13, 49)
  ctx.lineTo(50, 17)
  ctx.lineTo(87, 49)
  ctx.closePath()
  rellenar(ctx, '#bf4f33')
  ctx.strokeStyle = 'rgba(59, 36, 20, .3)'
  ctx.lineWidth = 1.4
  for (const y of [30, 38, 44]) {
    ctx.beginPath()
    ctx.moveTo(50 - (y - 17) * 1.12, y)
    ctx.lineTo(50 + (y - 17) * 1.12, y)
    ctx.stroke()
  }
  rect(ctx, 43, 64, 14, 23, 7)
  rellenar(ctx, '#7a4a2a')
  elipse(ctx, 54, 76, 1.3, 1.3)
  ctx.fillStyle = '#ffd36b'
  ctx.fill()
  for (const x of [28, 61]) {
    rect(ctx, x, 55, 11, 11, 1.5)
    rellenar(ctx, '#ffd36b', 2.2)
    ctx.beginPath()
    ctx.moveTo(x + 5.5, 55)
    ctx.lineTo(x + 5.5, 66)
    ctx.moveTo(x, 60.5)
    ctx.lineTo(x + 11, 60.5)
    trazo(ctx, 1.6)
  }
  ctx.beginPath()
  ctx.moveTo(78, 52)
  ctx.lineTo(92, 52)
  trazo(ctx, 2.4)
  rect(ctx, 82, 55, 12, 10, 2)
  rellenar(ctx, '#e7b45a', 2)
}

function dado(ctx: Ctx, x: number, y: number, lado: number, giro: number, puntos: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(giro)
  rect(ctx, -lado / 2, -lado / 2, lado, lado, lado * 0.22)
  rellenar(ctx, '#fdf8ec')
  const p = lado * 0.26
  const pos: Record<number, number[][]> = {
    1: [[0, 0]], 2: [[-p, -p], [p, p]], 3: [[-p, -p], [0, 0], [p, p]],
    4: [[-p, -p], [p, -p], [-p, p], [p, p]], 5: [[-p, -p], [p, -p], [0, 0], [-p, p], [p, p]],
    6: [[-p, -p], [p, -p], [-p, 0], [p, 0], [-p, p], [p, p]],
  }
  ctx.fillStyle = puntos === 1 ? '#c0392b' : TINTA
  for (const [px, py] of pos[puntos]) {
    elipse(ctx, px, py, lado * 0.075, lado * 0.075)
    ctx.fill()
  }
  ctx.restore()
}

function dados(ctx: Ctx) {
  sombra(ctx, 50, 84, 30)
  dado(ctx, 37, 60, 36, -0.28, 5)
  dado(ctx, 65, 42, 31, 0.32, 3)
}

function pozo(ctx: Ctx) {
  sombra(ctx, 50, 88, 30)
  for (const x of [27, 68]) {
    rect(ctx, x, 24, 5, 38, 1)
    rellenar(ctx, '#7a4a2a', 2)
  }
  ctx.beginPath()
  ctx.moveTo(18, 30)
  ctx.lineTo(50, 10)
  ctx.lineTo(82, 30)
  ctx.closePath()
  rellenar(ctx, '#9c4a32')
  ctx.beginPath()
  ctx.moveTo(30, 34)
  ctx.lineTo(70, 34)
  trazo(ctx, 3)
  ctx.beginPath()
  ctx.moveTo(50, 34)
  ctx.lineTo(50, 46)
  trazo(ctx, 1.4)
  ctx.beginPath()
  ctx.moveTo(45, 46)
  ctx.lineTo(55, 46)
  ctx.lineTo(54, 53)
  ctx.lineTo(46, 53)
  ctx.closePath()
  rellenar(ctx, '#6d8fa6', 1.8)
  ctx.beginPath()
  ctx.moveTo(24, 60)
  ctx.lineTo(24, 82)
  ctx.ellipse(50, 82, 26, 7, 0, Math.PI, 0, true)
  ctx.lineTo(76, 60)
  ctx.closePath()
  rellenar(ctx, '#bdb3a0')
  ctx.strokeStyle = 'rgba(59, 36, 20, .35)'
  ctx.lineWidth = 1.4
  for (const [y, desfase] of [[68, 0], [76, 7]]) {
    ctx.beginPath()
    ctx.moveTo(24, y)
    ctx.lineTo(76, y)
    ctx.stroke()
    for (let x = 30 + desfase; x < 76; x += 13) {
      ctx.beginPath()
      ctx.moveTo(x, y - 8)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }
  elipse(ctx, 50, 60, 26, 7)
  rellenar(ctx, '#d6ccb8')
  elipse(ctx, 50, 60, 20, 4.6)
  ctx.fillStyle = '#2a2320'
  ctx.fill()
}

function laberinto(ctx: Ctx) {
  rect(ctx, 12, 12, 76, 76, 10)
  rellenar(ctx, '#ead9ad')
  ctx.strokeStyle = '#4d6b33'
  ctx.lineCap = 'round'
  ctx.lineWidth = 6.5
  const anillos: [number, number][] = [[32, 0], [22, 2], [12, 1]]
  for (const [r, hueco] of anillos) {
    const a = 50 - r
    const b = 50 + r
    const lados = [[a, a, b, a], [b, a, b, b], [b, b, a, b], [a, b, a, a]]
    lados.forEach(([x1, y1, x2, y2], lado) => {
      ctx.beginPath()
      if (lado === hueco) {
        const mx = (x1 + x2) / 2
        const my = (y1 + y2) / 2
        const dx = Math.sign(x2 - x1) * 5
        const dy = Math.sign(y2 - y1) * 5
        ctx.moveTo(x1, y1)
        ctx.lineTo(mx - dx, my - dy)
        ctx.moveTo(mx + dx, my + dy)
        ctx.lineTo(x2, y2)
      } else {
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
      }
      ctx.stroke()
    })
  }
  ctx.strokeStyle = '#6f9150'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(18, 18)
  ctx.lineTo(82, 18)
  ctx.stroke()
  elipse(ctx, 50, 50, 4, 4)
  rellenar(ctx, '#c0392b', 1.8)
  rect(ctx, 12, 12, 76, 76, 10)
  trazo(ctx)
}

function carcel(ctx: Ctx) {
  rect(ctx, 14, 14, 72, 74, 6)
  rellenar(ctx, '#a39c90')
  ctx.strokeStyle = 'rgba(59, 36, 20, .3)'
  ctx.lineWidth = 1.4
  for (let y = 24, fila = 0; y < 88; y += 10, fila++) {
    ctx.beginPath()
    ctx.moveTo(14, y)
    ctx.lineTo(86, y)
    ctx.stroke()
    for (let x = 22 + (fila % 2) * 8; x < 86; x += 16) {
      ctx.beginPath()
      ctx.moveTo(x, y - 10)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }
  rect(ctx, 28, 26, 44, 40, 20)
  rellenar(ctx, '#2c2521')
  ctx.save()
  rect(ctx, 28, 26, 44, 40, 20)
  ctx.clip()
  for (const x of [36, 45, 55, 64]) {
    rect(ctx, x - 2.4, 20, 4.8, 50, 2)
    rellenar(ctx, '#cfc8bb', 1.8)
  }
  rect(ctx, 26, 44, 48, 4.5, 2)
  rellenar(ctx, '#cfc8bb', 1.8)
  ctx.restore()
  ctx.beginPath()
  ctx.arc(50, 72, 6, Math.PI, 0)
  ctx.lineWidth = 6
  ctx.strokeStyle = TINTA
  ctx.stroke()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#b8bcc0'
  ctx.stroke()
  rect(ctx, 41, 72, 18, 14, 3)
  rellenar(ctx, '#e0a83a')
  elipse(ctx, 50, 78, 1.8, 1.8)
  ctx.fillStyle = TINTA
  ctx.fill()
}

function muerte(ctx: Ctx) {
  ctx.lineCap = 'round'
  for (const [x1, y1, x2, y2] of [[20, 62, 80, 88], [80, 62, 20, 88]]) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.lineWidth = 11
    ctx.strokeStyle = TINTA
    ctx.stroke()
    ctx.lineWidth = 6.5
    ctx.strokeStyle = '#efe5cf'
    ctx.stroke()
    for (const [x, y] of [[x1, y1], [x2, y2]]) {
      elipse(ctx, x, y, 5, 5)
      rellenar(ctx, '#efe5cf', 2.2)
    }
  }
  ctx.beginPath()
  ctx.arc(50, 42, 24, Math.PI * 0.82, Math.PI * 2.18)
  ctx.lineTo(62, 70)
  ctx.lineTo(38, 70)
  ctx.closePath()
  rellenar(ctx, '#f5ecd8')
  for (const x of [40, 60]) {
    elipse(ctx, x, 46, 7, 8)
    ctx.fillStyle = TINTA
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(50, 53)
  ctx.lineTo(46, 60)
  ctx.lineTo(54, 60)
  ctx.closePath()
  ctx.fillStyle = TINTA
  ctx.fill()
  ctx.beginPath()
  for (const x of [44, 50, 56]) {
    ctx.moveTo(x, 64)
    ctx.lineTo(x, 70)
  }
  trazo(ctx, 1.8)
}

function meta(ctx: Ctx) {
  const rayos = 18
  for (let i = 0; i < rayos; i++) {
    const a0 = (i / rayos) * Math.PI * 2
    const a1 = ((i + 0.5) / rayos) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(50, 50)
    ctx.lineTo(50 + Math.cos(a0) * 47, 50 + Math.sin(a0) * 47)
    ctx.lineTo(50 + Math.cos(a1) * 47, 50 + Math.sin(a1) * 47)
    ctx.closePath()
    ctx.fillStyle = i % 2 ? 'rgba(224, 154, 43, .55)' : 'rgba(242, 193, 78, .7)'
    ctx.fill()
  }
  elipse(ctx, 50, 50, 27, 27)
  rellenar(ctx, '#fff3d1')
  // corona
  ctx.beginPath()
  ctx.moveTo(33, 58)
  ctx.lineTo(31, 38)
  ctx.lineTo(41, 47)
  ctx.lineTo(50, 33)
  ctx.lineTo(59, 47)
  ctx.lineTo(69, 38)
  ctx.lineTo(67, 58)
  ctx.closePath()
  rellenar(ctx, '#f0b43c')
  rect(ctx, 33, 57, 34, 6, 2)
  rellenar(ctx, '#e09a2b', 2.2)
  for (const [x, y, c] of [[31, 37, '#c0392b'], [50, 32, '#2f7fb8'], [69, 37, '#c0392b']] as const) {
    elipse(ctx, x, y, 3, 3)
    rellenar(ctx, c, 1.6)
  }
}

function salida(ctx: Ctx) {
  sombra(ctx, 36, 88, 16)
  rect(ctx, 32, 16, 5, 72, 2)
  rellenar(ctx, '#7a4a2a', 2.2)
  elipse(ctx, 34.5, 15, 4, 4)
  rellenar(ctx, '#f0b43c', 2)
  ctx.beginPath()
  ctx.moveTo(37, 20)
  ctx.bezierCurveTo(52, 14, 62, 30, 84, 22)
  ctx.lineTo(80, 44)
  ctx.bezierCurveTo(62, 52, 52, 36, 37, 44)
  ctx.closePath()
  rellenar(ctx, '#3f7a4d')
  ctx.beginPath()
  ctx.moveTo(37, 32)
  ctx.bezierCurveTo(52, 26, 62, 42, 82, 33)
  ctx.lineWidth = 4
  ctx.strokeStyle = '#f6e9cc'
  ctx.stroke()
}

function medalla(ctx: Ctx, icono: string) {
  elipse(ctx, 50, 52, 32, 32)
  rellenar(ctx, '#fff3d1')
  ctx.font = '38px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(icono, 50, 54)
}

const ARTE: Record<string, (ctx: Ctx) => void> = { oca, puente, posada, dados, pozo, laberinto, carcel, muerte, meta, salida }

/** La ilustración de una casilla especial en `ctx`, en la caja (x, y, lado). */
export function pintarArte(ctx: Ctx, id: string, icono: string, x: number, y: number, lado: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(lado / 100, lado / 100)
  ;(ARTE[id] ?? ((c: Ctx) => medalla(c, icono)))(ctx)
  ctx.restore()
}

/** Una ilustración suelta como imagen (para el panel de reglas). */
export function arteComoImagen(id: string, icono: string, lado = 160): string {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = lado
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  pintarArte(ctx, id, icono, 0, 0, lado)
  return canvas.toDataURL()
}

function ruido(ctx: Ctx, w: number, h: number, cuantos: number, alfa: number, semilla = 7) {
  let s = semilla
  const azar = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < cuantos; i++) {
    ctx.fillStyle = azar() > 0.5 ? `rgba(255,255,255,${alfa})` : `rgba(40,20,5,${alfa})`
    ctx.fillRect(azar() * w, azar() * h, 1 + azar() * 2, 1 + azar() * 2)
  }
}

export const LADO_TEXTURA = 2048
export const MARGEN_TEXTURA = 70
const LADO_CELDA = (LADO_TEXTURA - 2 * MARGEN_TEXTURA) / 8

export interface CasillaEspecial { id: string; name: string; icon: string; kind: string }
export interface Celda { position: number; row: number; column: number; arrow?: string }

const FONDO_CASILLA: Record<string, [string, string]> = {
  oca: ['#e6edc9', '#d3ddb0'],
  salto: ['#dcecef', '#c3dce1'],
  castigo: ['#f6dcc8', '#ebc3a6'],
  pozo: ['#e7e1d1', '#d4cbb5'],
  borde: ['#f8d989', '#eebf55'],
}

/** La textura del tablero: tapete verde, casillas de papel en espiral y su arte. */
export function pintarTablero(canvas: HTMLCanvasElement, celdas: Celda[], especiales: Record<number, CasillaEspecial>, salida: string) {
  const T = LADO_TEXTURA
  const M = MARGEN_TEXTURA
  canvas.width = canvas.height = T
  const ctx = canvas.getContext('2d')!
  const fondo = ctx.createRadialGradient(T / 2, T / 2, T * 0.1, T / 2, T / 2, T * 0.75)
  fondo.addColorStop(0, '#2f5a45')
  fondo.addColorStop(1, '#1d3a2c')
  ctx.fillStyle = fondo
  ctx.fillRect(0, 0, T, T)
  ruido(ctx, T, T, 60000, 0.05)
  ctx.strokeStyle = '#d8b25c'
  ctx.lineWidth = 6
  ctx.strokeRect(M * 0.45, M * 0.45, T - M * 0.9, T - M * 0.9)
  ctx.lineWidth = 2
  ctx.strokeRect(M * 0.62, M * 0.62, T - M * 1.24, T - M * 1.24)

  const hueco = 12
  for (const { position, row, column, arrow } of celdas) {
    const x = M + (column - 1) * LADO_CELDA + hueco / 2
    const y = M + (row - 1) * LADO_CELDA + hueco / 2
    const lado = LADO_CELDA - hueco
    const especial = especiales[position]
    const [c0, c1] = (especial && FONDO_CASILLA[especial.kind]) || ['#fbf1da', '#efdfbd']

    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, .45)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 6
    rect(ctx, x, y, lado, lado, 22)
    const g = ctx.createLinearGradient(x, y, x + lado * 0.4, y + lado)
    g.addColorStop(0, c0)
    g.addColorStop(1, c1)
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()

    rect(ctx, x + 7, y + 7, lado - 14, lado - 14, 16)
    ctx.strokeStyle = 'rgba(59, 36, 20, .18)'
    ctx.lineWidth = 2
    ctx.stroke()

    if (especial && position !== 0) {
      const arte = lado * (position === 63 ? 0.86 : 0.7)
      pintarArte(ctx, especial.id, especial.icon, x + (lado - arte) / 2, y + lado - arte - (position === 63 ? 6 : 10), arte)
    } else if (position === 0) {
      pintarArte(ctx, 'salida', '', x + lado * 0.2, y + lado * 0.28, lado * 0.66)
    }

    ctx.fillStyle = TINTA
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    if (position === 0) {
      ctx.font = `800 34px ${FUENTE_TITULO}`
      ctx.fillText(salida.toUpperCase(), x + 18, y + 16)
    } else if (position === 63) {
      ctx.font = `900 64px ${FUENTE_TITULO}`
      ctx.textAlign = 'center'
      ctx.fillText('63', x + lado / 2, y + 14)
    } else {
      ctx.font = `800 50px ${FUENTE_TITULO}`
      ctx.fillText(String(position), x + 18, y + 12)
    }
    if (arrow) {
      ctx.font = `700 34px ${FUENTE_TITULO}`
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(59, 36, 20, .45)'
      ctx.fillText(arrow, x + lado - 16, y + 14)
    }
  }
}

/** Centro de la casilla (fila, columna) en unidades del plano de lado `lado`, origen en el centro. */
export function centroCasilla(row: number, column: number, lado: number) {
  const px = (v: number) => (MARGEN_TEXTURA + (v - 0.5) * LADO_CELDA - LADO_TEXTURA / 2) * (lado / LADO_TEXTURA)
  return { x: px(column), z: px(row) }
}

export const TAMANO_CASILLA = (plano: number) => LADO_CELDA * (plano / LADO_TEXTURA)

/** Vetas de madera para la mesa y el marco. */
export function pintarMadera(canvas: HTMLCanvasElement, base: string, veta: string, lado = 1024) {
  canvas.width = canvas.height = lado
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = base
  ctx.fillRect(0, 0, lado, lado)
  let s = 11
  const azar = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 140; i++) {
    const y0 = azar() * lado
    const amp = 4 + azar() * 14
    const frec = 0.004 + azar() * 0.01
    const fase = azar() * 10
    ctx.beginPath()
    for (let x = 0; x <= lado; x += 16) {
      const y = y0 + Math.sin(x * frec + fase) * amp + Math.sin(x * frec * 3.1) * amp * 0.25
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = veta
    ctx.globalAlpha = 0.08 + azar() * 0.22
    ctx.lineWidth = 1 + azar() * 3
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ruido(ctx, lado, lado, 20000, 0.04, 3)
  return canvas
}
