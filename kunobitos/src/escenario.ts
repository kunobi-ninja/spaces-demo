/*
 * Piezas del escenario dibujadas en píxeles: el Nido (de donde salen los
 * kunobitos) y el Dojo (su casa, la salida). Dibujo propio.
 * El Dojo sigue el estilo de la mascota de Kunobi.
 *
 * Arte: volumen con luz arriba a la izquierda, contorno automático y
 * puntos de luz (boca del Nido, puerta y linterna del Dojo) para los halos.
 */

type Pixel = (x: number, y: number, color: string) => void

const CONTORNO = '#2a1e33'

/** Rejilla pequeña para dibujar con formas y añadir el contorno al final. */
class Lamina {
  px: (string | null)[][]
  constructor(public w: number, public h: number) {
    this.px = Array.from({ length: h }, () => Array(w).fill(null))
  }
  set(x: number, y: number, c: string | null) {
    x = Math.round(x); y = Math.round(y)
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y][x] = c
  }
  get(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.px[y][x] }
  elipse(cx: number, cy: number, rx: number, ry: number, color: (nx: number, ny: number, x: number, y: number) => string | null) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry
        if (nx * nx + ny * ny > 1) continue
        const c = color(nx, ny, x, y)
        if (c) this.set(x, y, c)
      }
    }
  }
  caja(x0: number, y0: number, x1: number, y1: number, color: (x: number, y: number) => string | null) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = color(x, y); if (c) this.set(x, y, c) }
  }
  contorno(salvo: Set<string> = new Set()) {
    const marcar: [number, number][] = []
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.px[y][x]) continue
      const v = [this.get(x - 1, y), this.get(x + 1, y), this.get(x, y - 1), this.get(x, y + 1)]
      if (v.some((c) => c && c !== CONTORNO && !salvo.has(c))) marcar.push([x, y])
    }
    for (const [x, y] of marcar) this.px[y][x] = CONTORNO
  }
  volcar(px: Pixel) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = this.px[y][x]; if (c) px(x, y, c) }
  }
}

const luz = (nx: number, ny: number) => -nx * 0.4 - ny * 0.55 + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.3
const rampa = (l: number, tonos: string[]) => tonos[l > 0.55 ? 0 : l > 0.2 ? 1 : l > -0.2 ? 2 : l > -0.5 ? 3 : 4]

export const NIDO = { ancho: 30, alto: 26, salidaX: 15, salidaY: 22 }

const PAPEL_FAROL = ['#fff6e2', '#f6e6c4', '#e9d2a6', '#d4b885', '#b89a6a']
const AZUL = ['#56699a', '#2e3c63', '#1f2a4a']

/**
 * El Nido (con el estilo ninja del Dojo): un farol de papel
 * colgado de una viga, con tapas azul noche, costillas, un aro dorado y una
 * boca abajo que se abre (`abierto` de 0 a 1) y deja ver la luz turquesa de
 * dentro. Mismas medidas y misma boca que la vaina de antes.
 */
export function dibujarNido(px: Pixel, abierto: number) {
  const l = new Lamina(NIDO.ancho, NIDO.alto)
  // Viga de madera con dos clavos dorados.
  l.caja(0, 0, 29, 2, (x, y) => (y === 0 ? '#9c6a40' : (x === 6 || x === 23) && y === 1 ? '#f2b33c' : '#7a4e2e'))
  // Cuerda.
  l.caja(14, 3, 15, 4, (x) => (x === 14 ? '#c9b48a' : '#a8916a'))
  // Tapa de arriba.
  l.caja(10, 5, 20, 6, (x, y) => (y === 5 ? AZUL[0] : x < 13 ? AZUL[0] : AZUL[1]))
  // Cuerpo de papel: luz a la izquierda, costillas cada dos filas.
  const cx = 15, cy = 13, rx = 10.5, ry = 7
  l.elipse(cx, cy, rx, ry, (nx, ny, x, y) => {
    if (y < 7 || y > 19) return null
    const costilla = y % 2 === 0
    const l0 = -nx * 0.7 - ny * 0.2
    const tono = l0 > 0.45 ? 0 : l0 > 0.1 ? 1 : l0 > -0.3 ? 2 : 3
    return PAPEL_FAROL[Math.min(4, tono + (costilla ? 1 : 0))]
  })
  // Aro dorado en el centro.
  l.elipse(cx, cy, 3.4, 3.4, (nx, ny) => {
    const d = nx * nx + ny * ny
    if (d < 0.35) return null
    return nx + ny < -0.4 ? '#ffe08a' : '#f2b33c'
  })
  // Tapa de abajo.
  l.caja(10, 20, 20, 21, (x, y) => (y === 20 ? AZUL[0] : x < 13 ? AZUL[1] : AZUL[2]))
  // Boca: oscura por fuera y con luz turquesa dentro.
  const r = 1.5 + abierto * 4.5
  l.elipse(cx, 22.5, r, 0.9 + abierto * 1.8, (nx, ny) => (nx * nx + ny * ny < 0.35 && abierto > 0.3 ? '#7ff0dc' : '#1a1220'))
  l.contorno(new Set(['#7ff0dc']))
  l.volcar(px)
}

export const DOJO = { ancho: 36, alto: 36, puertaX: 18, sueloY: 35, linterna: [31, 20] as [number, number], puerta: [18, 29] as [number, number] }

const TEJA = ['#56699a', '#3c4d7c', '#2e3c63', '#1f2a4a']
const PAPEL = '#f4ead2', REJILLA = '#b89a6a', MADERA = '#7a4e2e', MADERA_LUZ = '#9c6a40'
const ORO = '#f2b33c', ORO_LUZ = '#ffe08a'
const NOREN = '#3fb6c8', NOREN_SOMBRA = '#2f8fbf'

/**
 * El Dojo: la casa de los kunobitos, con tejado de tejas azul noche y
 * remates dorados, paredes de papel con rejilla, una cortina turquesa en la
 * puerta y una linterna colgada. `brillo` (0 a 1) hace latir la luz de la
 * puerta y de la linterna.
 */
export function dibujarDojo(px: Pixel, brillo: number) {
  const l = new Lamina(DOJO.ancho, DOJO.alto)
  const luz = brillo > 0.5 ? '#fff3b8' : '#ffd970'
  // Basamento de piedra y escalón.
  l.caja(3, 33, 32, 35, (x, y) => (y === 33 ? '#cfc6ba' : (x + y) % 7 === 0 ? '#8f877d' : '#aaa196'))
  l.caja(14, 32, 22, 32, () => '#bdb4a8')
  // Paredes de papel con rejilla, entre postes de madera.
  l.caja(5, 19, 30, 31, (x, y) => {
    if (x === 5 || x === 30 || x === 12 || x === 23) return x === 5 ? MADERA_LUZ : MADERA
    if (y === 19 || y === 31) return MADERA
    return (x - 6) % 3 === 0 || (y - 19) % 4 === 0 ? REJILLA : PAPEL
  })
  // Puerta abierta con luz y cortina turquesa con un círculo.
  l.caja(14, 23, 22, 31, () => luz)
  l.caja(13, 22, 23, 22, () => MADERA)
  l.caja(13, 23, 13, 31, () => MADERA)
  l.caja(23, 23, 23, 31, () => MADERA)
  l.caja(14, 23, 22, 26, (x, y) => (x === 18 ? NOREN_SOMBRA : y === 26 && x % 2 === 0 ? null : NOREN))
  for (const [x, y] of [[16, 24], [17, 24], [16, 25], [17, 25]]) l.set(x, y, '#e9fbf6')
  // Viga bajo el tejado.
  l.caja(3, 17, 32, 18, (x, y) => (y === 17 ? MADERA_LUZ : MADERA))
  // Tejado: aleros anchos con las puntas hacia arriba y tejas en franjas.
  for (let y = 8; y <= 16; y++) {
    const ancho = 7 + (y - 8) * 1.4 + (y >= 14 ? (y - 13) * 1.5 : 0)
    const x0 = Math.round(18 - ancho), x1 = Math.round(17 + ancho)
    for (let x = x0; x <= x1; x++) {
      const borde = x <= x0 + 1 || x >= x1 - 1
      l.set(x, y, borde ? TEJA[0] : TEJA[(y % 2) + (x < 18 ? 1 : 2) - 1])
    }
  }
  // Puntas del alero que suben.
  for (const [x, y] of [[0, 14], [0, 13], [1, 15], [35, 14], [35, 13], [34, 15]]) l.set(x, y, TEJA[0])
  l.caja(1, 16, 34, 16, () => TEJA[3])
  // Cumbrera dorada con remates.
  l.caja(10, 7, 25, 7, () => ORO)
  l.caja(11, 6, 24, 6, () => ORO_LUZ)
  for (const [x, y] of [[9, 6], [9, 5], [26, 6], [26, 5]]) l.set(x, y, ORO)
  // Placa dorada sobre la puerta.
  l.caja(15, 20, 21, 21, (x) => (x === 15 || x === 21 ? ORO : ORO_LUZ))
  // Linterna colgada del alero, a la derecha.
  l.caja(31, 17, 31, 18, () => '#4a3a52')
  l.caja(30, 19, 32, 22, (_x, y) => (y === 19 || y === 22 ? '#c4402f' : luz))
  l.contorno(new Set([luz]))
  l.volcar(px)
}
