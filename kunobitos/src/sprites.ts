/*
 * Kunobitos, arte v3: el kunobito es un ninja pequeño hecho de bloques,
 * inspirado en el ninja de Kunobi (la mascota de la propia persona): capucha
 * azul marino, ventana de la cara con dos ojos, cinta dorada con las puntas
 * al viento y cinturón azul claro. Las caras de los bloques llevan tres tonos
 * (arriba claro, delante medio, al lado oscuro) para que parezca de volumen.
 *
 * Cada pose es una función de unos pocos parámetros que dibuja cajas sobre
 * una rejilla de 24 × 30 y añade el contorno al final. Miran a la derecha y
 * se dibujan en espejo para la izquierda.
 */

export const PALETA: Record<string, string> = {
  o: '#0d1224', // contorno
  N: '#56699a', // capucha, cara de arriba
  n: '#2e3c63', // capucha, delante
  m: '#1f2a4a', // capucha, lado
  M: '#161e37', // sombra bajo la cabeza
  c: '#f7d8b6', // piel
  C: '#dcae86', // piel en sombra
  p: '#14131a', // ojos
  w: '#ffffff', // brillo del ojo
  y: '#ffe08a', // cinta, luz
  Y: '#f2b33c', // cinta
  z: '#c4831e', // cinta, sombra
  r: '#ff8a78', // cinta roja (Plantón), luz
  R: '#e5483d', // cinta roja
  Q: '#a8302a', // cinta roja, sombra
  b: '#7fd3ea', // cinturón, luz
  B: '#3f9cc4', // cinturón
  f: '#0f1530', // pies
  F: '#3b4a75', // pies, luz
  g: '#7cc94f', // hoja
  h: '#c3ef8f', // hoja, luz
  G: '#3f8f3a', // hoja, nervio
  D: '#2c6a2e', // hoja, borde
  // Ampliación ninja: cintas de colores (luz, cinta, sombra).
  j: '#c6f29a', J: '#5fbf4a', k: '#357a2d', // verde (Bambú)
  l: '#e3c2ff', L: '#9b5fd6', q: '#5c3790', // morada (Tejados)
  e: '#ffffff', E: '#e3eaf5', i: '#a3afc4', // blanca (Montaña)
  a: '#80869c', A: '#2c303f', d: '#15171f', // negra (Maestro)
  // Herramientas.
  s: '#c9a46a', // cuerda
  S: '#c7cfdc', // metal
  X: '#6f7a90', // metal, sombra
  x: '#f2f6fc', // metal, filo
  u: '#d9dfee', // humo
  U: '#8e9ab4', // humo, sombra
  I: '#f6ead2', // papel de la cometa
  K: '#d94b3f', // cometa roja
  O: '#6b4126', // varilla
}

export type Sprite = { filas: string[]; ancho: number; alto: number; pieX: number; antena?: [number, number, string] }

/** Crea un sprite a partir de filas de texto, comprobando medidas y colores. */
export function sprite(filas: string[], pieX?: number): Sprite {
  const ancho = filas[0].length
  for (const f of filas) {
    if (f.length !== ancho) throw new Error(`fila de ${f.length} en vez de ${ancho}: «${f}»`)
    for (const ch of f) if (ch !== '.' && !(ch in PALETA)) throw new Error(`color desconocido «${ch}»`)
  }
  return { filas, ancho, alto: filas.length, pieX: pieX ?? Math.floor(ancho / 2) }
}

/* ---------- Rejilla ---------- */

class Rejilla {
  px: string[][]
  constructor(public w: number, public h: number) {
    this.px = Array.from({ length: h }, () => Array(w).fill('.'))
  }
  get(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? '.' : this.px[y][x] }
  set(x: number, y: number, c: string) {
    x = Math.round(x); y = Math.round(y)
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y][x] = c
  }
  /** Caja de x0..x1 × y0..y1 (incluidos); `color` decide cada píxel. */
  caja(x0: number, y0: number, x1: number, y1: number, color: string | ((x: number, y: number) => string | null)) {
    for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      const c = typeof color === 'string' ? color : color(x, y)
      if (c) this.set(x, y, c)
    }
  }
  linea(x0: number, y0: number, x1: number, y1: number, c: string | ((u: number) => string)) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2
    for (let i = 0; i <= n; i++) {
      const u = i / n
      this.set(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, typeof c === 'string' ? c : c(u))
    }
  }
  contorno() {
    const marcar: [number, number][] = []
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.px[y][x] !== '.') continue
      const v = [this.get(x - 1, y), this.get(x + 1, y), this.get(x, y - 1), this.get(x, y + 1)]
      if (v.some((c) => c !== '.' && c !== 'o')) marcar.push([x, y])
    }
    for (const [x, y] of marcar) this.px[y][x] = 'o'
  }
  filas() { return this.px.map((f) => f.join('')) }
}

/* ---------- El ninja ---------- */

export const ANCHO = 24
export const ALTO = 30
const SUELO = ALTO - 1
const PIE_X = 12

type Pose = {
  /** De frente (Plantón, Pozo) o de tres cuartos mirando a la derecha. */
  frente?: boolean
  /** Desplazamiento vertical de cabeza y cuerpo (negativo: más arriba). */
  bote?: number
  /** Inclinación de la cabeza hacia delante, en píxeles. */
  cabezaX?: number
  ojo?: 'normal' | 'abierto' | 'cerrado' | 'decidido' | 'mareado' | 'entornado'
  /** Pies: x respecto al centro y cuánto se levantan. */
  pies: [number, number][]
  /** Brazos: desde el hombro (dx, dy) hasta la mano (dx, dy), respecto al centro del cuerpo. */
  brazos?: [number, number, number, number][]
  /** Puntas de la cinta: ángulo (0 = hacia atrás, positivo = hacia arriba) y ondulación. */
  cinta?: { angulo: number; onda: number }
  roja?: boolean
}

function dibujar(p: Pose): Sprite {
  const g = new Rejilla(ANCHO, ALTO)
  const bote = p.bote ?? 0
  const [cy0, cy1] = [19 + bote, 25 + bote] // cuerpo
  const [hy0, hy1] = [5 + bote, 18 + bote] // cabeza
  const hx = (p.cabezaX ?? 0) + (p.frente ? 0 : 1)
  const [hx0, hx1] = [5 + hx, 18 + hx]
  const lado = p.frente ? 0 : 3 // ancho de la cara lateral visible (tres cuartos)
  const [cinta, cintaL, cintaS] = p.roja ? ['R', 'r', 'Q'] : ['Y', 'y', 'z']

  // Puntas de la cinta, detrás de todo: salen del nudo y ondean.
  const ang = p.cinta?.angulo ?? 0.25, onda = p.cinta?.onda ?? 0
  const nudoX = p.frente ? hx1 + 1 : hx0 - 1, nudoY = hy0 + 4
  const atras = p.frente ? 1 : -1
  for (const [largo, desv] of [[7, 0], [5, 0.45]] as const) {
    for (let i = 1; i <= largo; i++) {
      const a = ang - desv + Math.sin(i * 0.9 + onda) * 0.18
      const x = nudoX + atras * Math.cos(a) * i
      const y = nudoY - Math.sin(a) * i
      g.set(x, y, i === largo ? cintaS : cinta)
      g.set(x, y + 1, cintaS)
    }
  }

  // Piernas y pies.
  for (const [i, [px, alza]] of p.pies.entries()) {
    const x = PIE_X + px
    const delante = !p.frente && i === 1
    g.caja(x - 1, cy1 + 1, x + 1, SUELO - 1 - alza, delante ? 'n' : 'm')
    g.caja(x - 1, SUELO - alza, x + 2, SUELO - alza, (xx) => (xx === x - 1 ? 'F' : 'f'))
  }

  // Cuerpo: cara de delante, lado oscuro, sombra bajo la cabeza y cinturón.
  const [bx0, bx1] = [7 + (p.frente ? 0 : 1), 16 + (p.frente ? 0 : 1)]
  g.caja(bx0, cy0, bx1, cy1, (x, y) => {
    if (y === cy0) return 'M'
    if (y === cy1 - 2) return x === bx0 + 2 ? 'b' : 'B'
    if (!p.frente && x < bx0 + 2) return 'm'
    if (p.frente && (x === bx0 || x === bx1)) return 'm'
    return 'n'
  })
  // Pliegue del traje en diagonal.
  g.linea(bx0 + (p.frente ? 3 : 4), cy0 + 1, bx0 + (p.frente ? 6 : 7), cy1 - 3, 'm')

  // Cabeza (capucha): arriba clara, lado oscuro y delante medio.
  g.caja(hx0, hy0, hx1, hy1, (x, y) => {
    if (y <= hy0 + 1) return 'N'
    if (!p.frente && x < hx0 + lado) return 'm'
    if (p.frente && (x === hx0 || x === hx1)) return 'm'
    if (y === hy1) return 'm'
    return 'n'
  })
  // Cinta en la frente, con su lado en sombra y el nudo detrás.
  g.caja(hx0, hy0 + 3, hx1, hy0 + 5, (x, y) => {
    const ladoSombra = !p.frente && x < hx0 + lado
    if (y === hy0 + 3) return ladoSombra ? cinta : cintaL
    return ladoSombra || y === hy0 + 5 ? cintaS : cinta
  })
  g.caja(nudoX - (p.frente ? 0 : 1), nudoY - 1, nudoX + (p.frente ? 1 : 0), nudoY + 1, cinta)

  // Ventana de la cara y ojos.
  const [fx0, fx1] = p.frente ? [hx0 + 3, hx1 - 3] : [hx0 + lado + 2, hx1 - 1]
  const [fy0, fy1] = [hy0 + 7, hy0 + 10]
  g.caja(fx0, fy0, fx1, fy1, (x, y) => (x === fx0 || y === fy1 ? 'C' : 'c'))
  const ojosX = p.frente ? [fx0 + 2, fx1 - 2] : [fx0 + 3, fx1 - 1]
  for (const ox of ojosX) {
    const ojo = p.ojo ?? 'normal'
    if (ojo === 'cerrado') { g.set(ox, fy0 + 2, 'p'); g.set(ox - 1, fy0 + 2, 'p'); continue }
    if (ojo === 'entornado') {
      // Sigilo: la capucha baja sobre los ojos, que miran de lado.
      g.set(ox, fy0 + 1, 'n'); g.set(ox - 1, fy0 + 1, 'n'); g.set(ox - 1, fy0, 'n'); g.set(ox, fy0, 'n')
      g.set(ox, fy0 + 2, 'p'); g.set(ox - 1, fy0 + 2, 'p')
      continue
    }
    if (ojo === 'mareado') { for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [-1, 2], [1, 2]]) g.set(ox + dx, fy0 + dy, 'p'); continue }
    if (ojo === 'abierto') { g.caja(ox - 1, fy0 + 1, ox, fy0 + 2, 'p'); g.set(ox - 1, fy0 + 1, 'w'); continue }
    g.caja(ox, fy0 + 1, ox, fy0 + 2, 'p')
    if (ojo === 'decidido') {
      // Ceño: la sombra de la capucha baja hacia el centro.
      const haciaDentro = p.frente ? (ox < PIE_X ? 1 : -1) : -1
      g.set(ox + haciaDentro, fy0, 'n')
      g.set(ox, fy0, 'n')
    }
  }

  // Brazos (delante del cuerpo): manga azul y guante oscuro.
  const ccx = (bx0 + bx1) / 2
  for (const [x0, y0, x1, y1] of p.brazos ?? []) {
    // La manga lleva un filo claro para que se vea sobre el traje.
    g.linea(ccx + x0, cy0 + 1 + y0, ccx + x1, cy0 + 1 + y1, 'N')
    g.linea(ccx + x0 + 1, cy0 + 1 + y0, ccx + x1 + 1, cy0 + 1 + y1, 'm')
    g.caja(ccx + x1, cy0 + 1 + y1, ccx + x1 + 1, cy0 + 2 + y1, (x, y) => (x === Math.round(ccx + x1) && y === Math.round(cy0 + 1 + y1) ? 'F' : 'f'))
  }

  g.contorno()
  return sprite(g.filas(), PIE_X)
}

/** Andar: ocho fotogramas; pasos, bote, brazo que se balancea y cinta al viento. */
export const ANDAR: Sprite[] = Array.from({ length: 8 }, (_, i) => {
  const f = (i / 8) * Math.PI * 2
  const pie = (fase: number, lado: number): [number, number] => [Math.round(Math.sin(fase) * 3 + lado), Math.round(Math.max(0, Math.cos(fase)) * 1.4)]
  return dibujar({
    bote: -Math.round(Math.abs(Math.cos(f)) * 0.9),
    pies: [pie(f + Math.PI, -1), pie(f, 1)],
    brazos: [[1, 0, 1 + Math.round(Math.sin(f) * 2), 4]],
    cinta: { angulo: 0.2, onda: f },
  })
})

/** Caer: brazos arriba, ojos muy abiertos y la cinta hacia arriba. */
export const CAER: Sprite[] = [0, 1].map((i) =>
  dibujar({
    bote: -1,
    ojo: 'abierto',
    pies: [[-3, 1 + i], [3, 2 - i]],
    brazos: [[-4, 0, -7, -6 + i], [4, 0, 7, -6 + (1 - i)]],
    cinta: { angulo: 1.2, onda: i * 2 },
  }),
)

/** Hoja: colgado de una hoja grande con una mano; ojos cerrados y tranquilos. */
export const HOJA: Sprite[] = [0, 1].map((i) => {
  const s = dibujar({
    bote: 0,
    ojo: 'cerrado',
    pies: [[-2, 2 + i], [2, 1 + (1 - i)]],
    brazos: [[3, -1, 4, -21]],
    cinta: { angulo: -0.5, onda: i * 1.5 },
  })
  // La hoja va encima, alargada, inclinada y con la punta a la derecha.
  const g = s.filas.map((f) => f.split(''))
  const ang = (i === 0 ? -10 : -6) * (Math.PI / 180)
  const ca = Math.cos(ang), sa = Math.sin(ang)
  const cxh = 12.5, cyh = 3.5
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < ANCHO; x++) {
      const dx = x + 0.5 - cxh, dy = y + 0.5 - cyh
      const v = (dx * ca + dy * sa) / 22
      const n = -dx * sa + dy * ca
      if (Math.abs(v) > 0.5) continue
      let w = 3.4 * Math.pow(Math.max(0, 1 - (2 * v) ** 2), 0.55)
      if (v > 0) w *= Math.pow(1 - 2 * v, 0.25)
      if (Math.abs(n) > w) continue
      let c = Math.abs(n) > w - 0.9 ? 'D' : Math.abs(n) < 0.5 ? 'G' : n < 0 ? 'h' : 'g'
      if (c !== 'D' && c !== 'G' && Math.abs(((v + 0.5) * 22 - Math.abs(n) * 1.1) % 4) < 0.6) c = 'G'
      g[y][x] = c
    }
  }
  return sprite(g.map((f) => f.join('')), PIE_X)
})

/** Plantón: de frente, brazos abiertos, ceño y la cinta en rojo, como un semáforo. */
export const PLANTON: Sprite[] = [0, 1].map((i) =>
  dibujar({
    frente: true,
    ojo: i === 1 ? 'cerrado' : 'decidido',
    pies: [[-3, 0], [3, 0]],
    brazos: [[-5, 1, -10, 1], [4, 1, 9, 1]],
    cinta: { angulo: 0.1, onda: i },
    roja: true,
  }),
)

/** Pozo: de frente, agachado, cavando con una mano y luego con la otra. */
export const POZO: Sprite[] = [0, 1, 2, 3].map((i) =>
  dibujar({
    frente: true,
    bote: 1 + (i % 2),
    ojo: 'decidido',
    pies: [[-3, 0], [3, 0]],
    brazos: i < 2 ? [[-4, 2, -6, 7 - i * 3], [4, 2, 5, 3]] : [[-4, 2, -5, 3], [4, 2, 6, 7 - (i - 2) * 3]],
    cinta: { angulo: 0.3 + (i % 2) * 0.3, onda: i },
  }),
)

/** Trepar: de cara a la pared (a la derecha), manos arriba y pies que suben alternando. */
export const TREPAR: Sprite[] = [0, 1].map((i) =>
  dibujar({
    cabezaX: 1,
    ojo: 'decidido',
    pies: [[2, 2 + i * 2], [4, 4 - i * 2]],
    brazos: [[3, 0, 6, -6 - i * 2], [2, 1, 6, -3 + i * 2]],
    cinta: { angulo: -0.3, onda: i },
  }),
)

/** Peldaño: agachado, deja una tabla delante con las dos manos. */
export const PELDANO: Sprite[] = [0, 1].map((i) =>
  dibujar({
    bote: 1 + i,
    pies: [[-2, 0], [2, 0]],
    brazos: [[2, 1, 7, 4 + i], [1, 1, 6, 5 + i]],
    cinta: { angulo: 0.15, onda: i },
  }),
)

/** Túnel: golpes hacia delante, un puño y luego el otro. */
export const TUNEL: Sprite[] = [0, 1, 2, 3].map((i) =>
  dibujar({
    ojo: 'decidido',
    pies: [[-3, 0], [3, 0]],
    brazos: i % 2 === 0 ? [[2, 0, 9, 1], [1, 1, 3, 4]] : [[2, 0, 4, 3], [1, 1, 9, 2]],
    cinta: { angulo: 0.25, onda: i },
  }),
)

/** Pico: golpes en diagonal hacia abajo, con los brazos de arriba abajo. */
export const PICO: Sprite[] = [0, 1, 2, 3].map((i) => {
  const arriba = i < 2
  return dibujar({
    bote: arriba ? 0 : 1,
    cabezaX: arriba ? 0 : 1,
    ojo: 'decidido',
    pies: [[-3, 0], [3, 0]],
    brazos: arriba ? [[2, 0, 6, -5 + i], [1, 0, 5, -4 + i]] : [[2, 0, 8, 6 - (i - 2)], [1, 0, 7, 7 - (i - 2)]],
    cinta: { angulo: 0.25, onda: i },
  })
})

/** Aturdido: tumbado de espaldas no; sentado y mareado, con los ojos en cruz. */
export const ATURDIDO: Sprite[] = [0, 1].map((i) =>
  dibujar({
    frente: true,
    bote: 3,
    ojo: 'mareado',
    pies: [[-5, 0], [5, 0]],
    brazos: [[-4, 3, -8, 6], [4, 3, 8, 6]],
    cinta: { angulo: -0.6 + i * 0.2, onda: i },
  }),
)

/** Llegar: saluda con la mano al entrar en el Dojo. */
export const LLEGAR: Sprite[] = [0, 1].map((i) =>
  dibujar({
    frente: true,
    ojo: 'cerrado',
    pies: [[-3, 0], [3, 0]],
    brazos: [[-4, 1, -6, 5], [4, 0, 8 + i, -6 + i]],
    cinta: { angulo: 0.6, onda: i },
  }),
)

/* ---------- Ampliación ninja (A0): seis habilidades nuevas ---------- */

/** Copia las filas de un sprite para pintar encima (herramientas, humo). */
const capa = (s: Sprite) => s.filas.map((f) => f.split(''))
const pon = (g: string[][], x: number, y: number, c: string) => {
  x = Math.round(x); y = Math.round(y)
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c
}

/** Dónde está la mano del Gancho respecto al pie (para tender la cuerda en pantalla). */
export const MANO_GANCHO: [number, number] = [9, -26]

/** Gancho: lanza la cuerda hacia arriba y delante; luego sube colgado de ella. */
export const GANCHO: Sprite[] = [0, 1, 2].map((i) => {
  const s = dibujar(i === 0
    ? { ojo: 'decidido', pies: [[-3, 0], [3, 0]], brazos: [[4, 0, 8, -2], [8, -2, 8, -16], [1, 1, 4, 4]], cinta: { angulo: 0.5, onda: i } }
    : { bote: -1, ojo: 'decidido', pies: [[-2, 2 + i], [3, 4 - i]], brazos: [[4, 0, 8, -2], [8, -2, 8, -16], [2, 1, 7, -1 + i]], cinta: { angulo: -0.2 + i * 0.3, onda: i } })
  const g = capa(s)
  // La cuerda sale de la mano hacia arriba (en pantalla sigue hasta el garfio).
  const top = i === 0 ? 3 : 2
  for (let y = 0; y <= top; y++) pon(g, 21, y, 's')
  if (i === 0) {
    // Garfio de tres puntas, aún en la mano.
    for (const [x, y, c] of [[21, 0, 'S'], [20, 1, 'X'], [22, 1, 'S'], [19, 0, 'X'], [23, 0, 'x']] as const) pon(g, x, y, c)
  }
  return sprite(g.map((f) => f.join('')), PIE_X)
})

/** Salto: se agacha, toma impulso y salta encogido con la cinta hacia arriba. */
export const SALTO: Sprite[] = [
  dibujar({ bote: 2, ojo: 'decidido', pies: [[-3, 0], [3, 0]], brazos: [[-1, 1, -6, 4], [0, 1, -5, 5]], cinta: { angulo: 0.1, onda: 0 } }),
  dibujar({ bote: -2, cabezaX: 1, ojo: 'abierto', pies: [[-1, 4], [3, 3]], brazos: [[2, 0, 8, -3], [0, 1, 5, 2]], cinta: { angulo: 0.9, onda: 1 } }),
]

/** Humo: tira la bomba a sus pies, desaparece en una nube y vuelve a salir. */
export const HUMO: Sprite[] = [0, 1, 2].map((i) => {
  const s = dibujar({ frente: true, ojo: i === 0 ? 'decidido' : 'cerrado', pies: [[-3, 0], [3, 0]],
    brazos: i === 0 ? [[-4, 1, -6, 5], [4, 1, 7, 7]] : [[-4, 1, -6, 3], [4, 1, 6, 3]], cinta: { angulo: 0.4, onda: i } })
  const g = capa(s)
  if (i === 0) {
    // La bomba, redonda y con mecha, a punto de tocar el suelo.
    for (const [x, y, c] of [[20, 27, 'A'], [21, 27, 'd'], [20, 28, 'd'], [21, 28, 'd'], [20, 26, 's'], [19, 25, 'y']] as const) pon(g, x, y, c)
    return sprite(g.map((f) => f.join('')), PIE_X)
  }
  // Nube: bolas de humo que tapan al ninja (más en el fotograma 1).
  const bolas: [number, number, number][] = i === 1
    ? [[12, 20, 8], [6, 24, 5.5], [18, 24, 5.5], [10, 12, 5.5], [16, 13, 5], [12, 27, 4]]
    : [[5, 25, 3.5], [19, 25, 3.5], [8, 10, 3], [17, 8, 2.5], [12, 28, 2.5]]
  for (const [cx, cy, r] of bolas) for (let y = 0; y < ALTO; y++) for (let x = 0; x < ANCHO; x++) {
    const d = Math.hypot(x - cx, y - cy)
    if (d > r) continue
    g[y][x] = d > r - 1.1 ? 'U' : (x - cx) + (y - cy) < -r * 0.5 ? 'w' : 'u'
  }
  return sprite(g.map((f) => f.join('')), PIE_X)
})

/** Kunai: echa el brazo atrás y clava un kunai delante, en la pared. */
export const KUNAI: Sprite[] = [0, 1].map((i) => {
  const s = dibujar({ ojo: 'decidido', pies: [[-3, 0], [3, 0]],
    brazos: i === 0 ? [[-1, 0, -7, 2], [1, 1, 4, 3]] : [[2, 0, 9, 0], [1, 1, 3, 4]], cinta: { angulo: 0.25 + i * 0.2, onda: i } })
  const g = capa(s)
  // Kunai en la mano: anilla de cuerda, mango y hoja con filo.
  const [hx, hy] = i === 0 ? [5, 21] : [22, 20]
  const pts: [number, number, string][] = i === 0
    ? [[hx, hy - 1, 'X'], [hx, hy - 2, 'S'], [hx, hy - 3, 'x'], [hx, hy + 2, 's']]
    : [[hx, hy, 'X'], [hx + 1, hy, 'S'], [hx + 1, hy - 1, 'x'], [hx - 2, hy + 1, 's']]
  for (const [x, y, c] of pts) pon(g, x, y, c)
  return sprite(g.map((f) => f.join('')), PIE_X)
})

/** Sigilo: agachado, la capucha sobre los ojos y pasos cortos, de puntillas. */
export const SIGILO: Sprite[] = Array.from({ length: 4 }, (_, i) => {
  const f = (i / 4) * Math.PI * 2
  return dibujar({
    bote: 3, cabezaX: 2, ojo: 'entornado',
    pies: [[Math.round(Math.sin(f + Math.PI) * 2) - 1, 0], [Math.round(Math.sin(f) * 2) + 2, 0]],
    brazos: [[2, 0, 7, 2], [0, 1, -3, 3]],
    cinta: { angulo: 0.05, onda: f },
  })
})

/** Cometa: colgado de una cometa de papel roja, con los ojos muy abiertos. */
export const COMETA: Sprite[] = [0, 1].map((i) => {
  const s = dibujar({ bote: 0, ojo: 'abierto', pies: [[-2, 2 + i], [2, 1 + (1 - i)]], brazos: [[3, -1, 4, -21]], cinta: { angulo: -0.4, onda: i * 1.5 } })
  const g = capa(s)
  // Rombo de papel con borde rojo, dos varillas y una cola que ondea.
  const cx = 14 + i * 0.5, cy = 3.6, rx = 8, ry = 3.9
  for (let y = 0; y < 10; y++) for (let x = 0; x < ANCHO; x++) {
    const d = Math.abs(x + 0.5 - cx) / rx + Math.abs(y + 0.5 - cy) / ry
    if (d > 1) continue
    const c = d > 0.78 ? 'K' : Math.abs(x + 0.5 - cx) < 0.6 || Math.abs(y + 0.5 - cy) < 0.6 ? 'O' : x + 0.5 < cx ? 'I' : 'E'
    g[y][x] = c
  }
  for (let k = 0; k < 5; k++) pon(g, cx - 9 - k, cy + 1 + Math.round(Math.sin(k + i * 2)), k % 2 ? 'K' : 'y')
  return sprite(g.map((f) => f.join('')), PIE_X)
})

/** Las cintas de colores que gana el kunobito al superar cada escenario. */
export const CINTAS = {
  dorada: ['y', 'Y', 'z'],
  verde: ['j', 'J', 'k'],
  morada: ['l', 'L', 'q'],
  blanca: ['e', 'E', 'i'],
  negra: ['a', 'A', 'd'],
} as const
export type Cinta = keyof typeof CINTAS

const cacheCinta = new Map<Sprite, Map<Cinta, Sprite>>()

/** El mismo sprite con la cinta de otro color (la roja del Plantón no cambia). */
export function conCinta(s: Sprite, cinta: Cinta): Sprite {
  if (cinta === 'dorada') return s
  let m = cacheCinta.get(s)
  if (!m) { m = new Map(); cacheCinta.set(s, m) }
  let r = m.get(cinta)
  if (!r) {
    const [y, Y, z] = CINTAS[cinta]
    const cambio: Record<string, string> = { y, Y, z }
    r = { ...s, filas: s.filas.map((f) => f.replace(/[yYz]/g, (c) => cambio[c])) }
    m.set(cinta, r)
  }
  return r
}

/* ---------- Copias en lienzo (para dibujar rápido muchos a la vez) ---------- */

const cache = new Map<Sprite, [HTMLCanvasElement, HTMLCanvasElement]>()

/** El sprite pintado una vez en un lienzo de 1 píxel por píxel, mirando a cada lado. */
export function lienzoDe(s: Sprite, dir: 1 | -1): HTMLCanvasElement {
  let par = cache.get(s)
  if (!par) {
    const hacer = (d: 1 | -1) => {
      const cv = document.createElement('canvas')
      cv.width = s.ancho; cv.height = s.alto
      dibujarSprite(cv.getContext('2d')!, s, s.pieX, s.alto, 1, d === 1 ? 1 : -1)
      return cv
    }
    par = [hacer(1), hacer(-1)]
    cache.set(s, par)
  }
  return par[dir === 1 ? 0 : 1]
}

/** Halo suave alrededor de un punto (sin filtros de canvas). */
export function halo(ctx: CanvasRenderingContext2D, x: number, y: number, radio: number, color: string, fuerza = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radio)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = fuerza
  ctx.fillStyle = g
  ctx.fillRect(x - radio, y - radio, radio * 2, radio * 2)
  ctx.globalAlpha = 1
}

/**
 * Dibuja un sprite con su pie en (x, y) del lienzo, a `escala` píxeles por
 * píxel. `dir` 1 mira a la derecha y -1 a la izquierda (en espejo).
 */
export function dibujarSprite(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  x: number,
  y: number,
  escala: number,
  dir: 1 | -1 = 1,
) {
  const x0 = x - s.pieX
  const y0 = y - s.alto
  for (let fy = 0; fy < s.alto; fy++) {
    const fila = s.filas[fy]
    for (let fx = 0; fx < s.ancho; fx++) {
      const ch = fila[dir === 1 ? fx : s.ancho - 1 - fx]
      if (ch === '.') continue
      ctx.fillStyle = PALETA[ch]
      ctx.fillRect((x0 + fx) * escala, (y0 + fy) * escala, escala, escala)
    }
  }
}
