/*
 * Terreno en píxeles. El nivel es una máscara (0 vacío, 1 tierra, 2 cristal,
 * 3 agua) y el color de cada píxel se calcula a partir de ella, de modo que
 * al cavar o construir basta con volver a pintar la zona tocada.
 *
 * Arte: tierra en vetas con más oscuridad en lo hondo, musgo con briznas
 * y flores (solo decoración: el hueco sigue vacío para el motor), cristal en
 * gemas talladas y agua translúcida con reflejos.
 */

export const VACIO = 0
export const TIERRA = 1
export const CRISTAL = 2
export const AGUA = 3
/** Peldaños que pone la habilidad Peldaño: se pisan y se cavan como la tierra. */
export const PELDANO = 4

/* Ampliación ninja (con sus reglas en el motor). */
/** Estacas de bambú afiladas: quien las pisa se pierde (Salto las cruza). */
export const PINCHO = 5
/** Cañas de bambú: se abren con Túnel, pero no con Pico ni Pozo. */
export const BAMBU = 6
/** Muro de papel (shoji): cualquier cavado lo abre de golpe. */
export const PAPEL = 7
/** Nieve: se cava el doble de rápido. */
export const NIEVE = 8
/** Hielo: no se cava y resbala (el Plantón no frena). */
export const HIELO = 9
/** Tejas de los tejados: no se cavan ni se suben andando (en pendiente, se baja). */
export const TEJA = 10
/** Puerta de reja que abre una placa: maciza mientras está cerrada. */
export const PUERTA = 11
/** Kunai clavados en una pared: solo se ven; los que suben usan la escala del motor. */
export const KUNAI = 12

/**
 * ¿Se puede pisar? (Las briznas y flores son solo dibujo: cuentan como aire.
 * Los pinchos tampoco se pisan: quien mete los pies en ellos se pierde.)
 */
export const solido = (v: number) =>
  v === TIERRA || v === CRISTAL || v === PELDANO || v === BAMBU || v === PAPEL || v === NIEVE || v === HIELO || v === TEJA || v === PUERTA
/** ¿Se puede cavar o romper con Pico, Pozo o Chispa? */
export const cavable = (v: number) => v === TIERRA || v === PELDANO || v === NIEVE || v === PAPEL
/** ¿Lo abre el Túnel? (Lo cavable y además el bambú.) */
export const cavaTunel = (v: number) => cavable(v) || v === BAMBU

export type Mapa = { ancho: number; alto: number; celdas: Uint8Array }

export function mapaVacio(ancho: number, alto: number): Mapa {
  return { ancho, alto, celdas: new Uint8Array(ancho * alto) }
}

export const celda = (m: Mapa, x: number, y: number) =>
  x < 0 || y < 0 || x >= m.ancho || y >= m.alto ? VACIO : m.celdas[y * m.ancho + x]

export function poner(m: Mapa, x: number, y: number, v: number) {
  if (x < 0 || y < 0 || x >= m.ancho || y >= m.alto) return
  m.celdas[y * m.ancho + x] = v
}

/** Número pseudoaleatorio estable en [0, 1) para un píxel (sin estado). */
export function ruido(x: number, y: number, semilla = 0): number {
  let n = (x * 374761393 + y * 668265263 + semilla * 2147483647) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  n ^= n >>> 16
  return (n >>> 0) / 4294967296
}

/** Color en RGBA (0–255). */
export type RGBA = [number, number, number, number]
const hex = (h: string, a = 255): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a]
const mezcla = (c1: RGBA, c2: RGBA, t: number): RGBA => [
  Math.round(c1[0] + (c2[0] - c1[0]) * t),
  Math.round(c1[1] + (c2[1] - c1[1]) * t),
  Math.round(c1[2] + (c2[2] - c1[2]) * t),
  c1[3],
]

const MUSGO = ['#c4ec7a', '#97d257', '#6fb043', '#4f8a37'].map((c) => hex(c))
const BRIZNA = ['#a9e061', '#7fc24a', '#5e9f3c'].map((c) => hex(c))
const FLOR = ['#ff9ad1', '#ffe066', '#c8b6ff'].map((c) => hex(c))
const VETAS = ['#8a5636', '#7a4a30', '#93603d', '#70432c'].map((c) => hex(c))
const HONDO = hex('#3c2219')
const PIEDRA = hex('#c2ab92'), PIEDRA_LUZ = hex('#e4d3bd'), PIEDRA_SOMBRA = hex('#8a7360')
const BORDE = hex('#4a2a1d')
const RAIZ = hex('#a8764c')

/** Tonos de las gemas: [luz, cara alta, cara baja, sombra, filo]. */
const GEMAS = [
  ['#c9d2ff', '#7d8ff0', '#5a6bd8', '#3a449e', '#262c6e'],
  ['#e4c9ff', '#a383f0', '#8160d8', '#57409e', '#352a6e'],
  ['#c4f1ff', '#6fb6ec', '#4c8fd2', '#335f9b', '#213e6c'],
].map((g) => g.map((c) => hex(c)))
const DESTELLO = hex('#ffffff')

const TABLA = hex('#c98f55'), TABLA_LUZ = hex('#ecc28a'), TABLA_SOMBRA = hex('#8a5a2e')

const PUNTA = hex('#f4ecc8'), ESTACA_LUZ = hex('#e2cf8e'), ESTACA = hex('#b49a55'), ESTACA_SOMBRA = hex('#7a6632'), ATADURA = hex('#6b3a2a')
const CANA_LUZ = hex('#b6e27f'), CANA = hex('#76b24a'), CANA_SOMBRA = hex('#437f31'), CANA_HUECO = hex('#213f1e'), NUDO = hex('#d5ef9f')
const SHOJI = hex('#f4ead0'), SHOJI_LUZ = hex('#fff6de'), SHOJI_MARCO = hex('#5a3a26'), SHOJI_MARCO_LUZ = hex('#7d5434')
const NIEVE_ALTA = hex('#ffffff'), NIEVE_MEDIA = hex('#eaf1fc'), NIEVE_HONDA = hex('#c9d8ef'), NIEVE_BRILLO = hex('#b9d2ff')
const HIELO_LUZ = hex('#e6f8ff', 235), HIELO_ALTO = hex('#a9dcf5', 225), HIELO_HONDO = hex('#5f9fd0', 235), HIELO_GRIETA = hex('#ffffff', 240)
const TEJAS = ['#7d8fc2', '#56699a', '#2e3c63', '#1f2a4a', '#141c36'].map((c) => hex(c))
const TEJA_ORO = hex('#f2b33c')
const REJA = hex('#9c6a40'), REJA_LUZ = hex('#b98a55'), REJA_TRAVESANO = hex('#7a4e2e')
const KUNAI_HOJA = hex('#c7cfdc'), KUNAI_FILO = hex('#f2f6fc'), KUNAI_MANGO = hex('#c9a46a')

const AGUA_ALTA = hex('#59c3e6', 215), AGUA_HONDA = hex('#1c5f8f', 235)
const ESPUMA = hex('#dff8ff', 240), REFLEJO = hex('#9be3fa', 225)

/** Alto de las briznas sobre el musgo en la columna x (0 si no hay). */
const brizna = (x: number) => (ruido(x, 0, 13) < 0.5 ? 1 + Math.floor(ruido(x, 1, 13) * 2.6) : 0)

/** Color de un píxel del terreno. `t` es el tiempo en segundos (solo mueve el agua). */
export function colorDe(m: Mapa, x: number, y: number, t = 0): RGBA | null {
  const v = celda(m, x, y)

  if (v === VACIO) {
    // Briznas y flores sobre la tierra con cielo encima (decoración).
    for (let k = 1; k <= 3; k++) {
      const abajo = celda(m, x, y + k)
      if (abajo === TIERRA) {
        const alto = brizna(x)
        if (k > alto) return null
        if (k === alto && alto >= 2 && ruido(x, 2, 17) < 0.12) return FLOR[Math.floor(ruido(x, 3, 17) * FLOR.length)]
        return BRIZNA[Math.min(BRIZNA.length - 1, alto - k)]
      }
      if (abajo !== VACIO) return null
    }
    return null
  }

  if (v === TIERRA) {
    // Profundidad desde la superficie (hasta 24).
    let prof = 0
    while (prof < 24 && celda(m, x, y - prof - 1) === TIERRA) prof++
    const cielo = prof < 24 && celda(m, x, y - prof - 1) === VACIO
    if (cielo && prof <= 3) {
      const grosor = 2 + Math.floor(ruido(x, 0, 7) * 2.2)
      if (prof < grosor) {
        if (prof === 0) return ruido(x, y, 3) < 0.3 ? MUSGO[0] : MUSGO[1]
        return prof === grosor - 1 ? MUSGO[3] : MUSGO[2]
      }
    }
    // Bordes de cuevas y túneles, algo más oscuros.
    if (celda(m, x, y + 1) === VACIO || celda(m, x - 1, y) === VACIO || celda(m, x + 1, y) === VACIO) return BORDE
    // Piedras de 3×3 con luz arriba a la izquierda.
    const px = Math.floor(x / 5), py = Math.floor(y / 5)
    if (ruido(px, py, 11) < 0.08) {
      const cx = px * 5 + 1 + Math.floor(ruido(px, py, 12) * 2), cy = py * 5 + 1
      const dx = x - cx, dy = y - cy
      if (dx >= 0 && dx <= 2 && dy >= 0 && dy <= 1 + (dx === 1 ? 1 : 0)) {
        if (dx + dy === 0) return PIEDRA_LUZ
        return dx + dy >= 3 ? PIEDRA_SOMBRA : PIEDRA
      }
    }
    // Raíces que bajan desde el musgo.
    if (cielo && prof < 9 && ruido(x + (prof >> 2), 1, 5) < 0.06) return RAIZ
    // Vetas onduladas, más oscuras cuanto más hondo.
    const veta = Math.floor((y + Math.sin(x / 9 + ruido(x >> 4, 0, 6) * 6) * 2.5) / 5)
    const base = VETAS[(veta % VETAS.length + VETAS.length) % VETAS.length]
    const grano = ruido(x >> 1, y >> 1, 2) < 0.2 ? 0.12 : 0
    return mezcla(base, HONDO, Math.min(0.55, (cielo ? prof : 24) / 48 + grano))
  }

  if (v === PINCHO) {
    // Estacas de 4 de ancho: punta arriba, más anchas abajo, con una atadura.
    let p = 0
    while (p < 8 && celda(m, x, y - p - 1) === PINCHO) p++
    const lx = x & 3
    if (p === 0) return lx === 1 ? PUNTA : null
    if (p === 1) return lx === 1 ? ESTACA_LUZ : lx === 2 ? ESTACA : null
    if (p === 3) return ATADURA
    return lx === 0 ? ESTACA_LUZ : lx === 3 ? ESTACA_SOMBRA : ESTACA
  }

  if (v === BAMBU) {
    // Cañas de 6 con un hueco oscuro entre ellas y un nudo cada 14 filas.
    const lx = x % 7, col = Math.floor(x / 7)
    if (lx === 6) return CANA_HUECO
    if ((y + Math.floor(ruido(col, 0, 9) * 14)) % 14 === 0) return NUDO
    return lx === 1 ? CANA_LUZ : lx >= 4 ? CANA_SOMBRA : CANA
  }

  if (v === PAPEL) {
    // Papel entre listones de madera cada 8 píxeles.
    if (x % 8 === 0 || y % 8 === 0) return (x + y) % 8 === 0 ? SHOJI_MARCO_LUZ : SHOJI_MARCO
    return (x % 8) + (y % 8) < 5 ? SHOJI_LUZ : SHOJI
  }

  if (v === NIEVE) {
    let prof = 0
    while (prof < 10 && celda(m, x, y - prof - 1) === NIEVE) prof++
    if (prof === 0) return NIEVE_ALTA
    if (ruido(x, y, 31) < 0.04) return NIEVE_BRILLO
    if (celda(m, x, y + 1) === VACIO) return NIEVE_HONDA
    return mezcla(NIEVE_MEDIA, NIEVE_HONDA, Math.min(1, prof / 10))
  }

  if (v === HIELO) {
    let prof = 0
    while (prof < 12 && celda(m, x, y - prof - 1) === HIELO) prof++
    if (prof === 0) return HIELO_LUZ
    // Alguna grieta corta en diagonal y un filo de luz en el borde izquierdo.
    if ((x + y * 2) % 19 === 0 && ruido(Math.floor((x + y * 2) / 19), y >> 3, 33) < 0.18) return HIELO_GRIETA
    if (celda(m, x - 1, y) !== HIELO && ruido(x, y >> 1, 34) < 0.6) return HIELO_LUZ
    const c = mezcla(HIELO_ALTO, HIELO_HONDO, Math.min(1, prof / 12))
    c[3] = 230
    return c
  }

  if (v === TEJA) {
    // Filas de tejas de 4 de alto, desplazadas cada fila, con la cumbrera dorada.
    if (celda(m, x, y - 1) === VACIO && ruido(x >> 3, y, 35) < 0.15) return TEJA_ORO
    const fila = Math.floor(y / 4), ly = y & 3
    const lx = (x + (fila % 2) * 3) % 6
    if (ly === 3) return TEJAS[4]
    if (lx === 0) return TEJAS[3]
    if (ly === 0) return celda(m, x, y - 1) === VACIO ? TEJAS[0] : TEJAS[1]
    return lx < 3 ? TEJAS[1] : TEJAS[2]
  }

  if (v === PUERTA) {
    // Reja de barrotes cada 3 píxeles y travesaños cada 8; el resto es aire.
    if (y % 8 === 0) return REJA_TRAVESANO
    if (x % 3 === 0) return x % 6 === 0 ? REJA_LUZ : REJA
    return null
  }

  if (v === KUNAI) {
    // Hoja de metal con filo y la anilla de cuerda en el extremo de fuera.
    const fuera = celda(m, x - 1, y) !== KUNAI || celda(m, x + 1, y) !== KUNAI
    const pared = solido(celda(m, x - 1, y)) || solido(celda(m, x + 1, y))
    if (fuera && !pared) return KUNAI_MANGO
    return (x + y) % 2 === 0 ? KUNAI_FILO : KUNAI_HOJA
  }

  if (v === PELDANO) {
    // Tablas de madera: luz arriba, sombra abajo y una junta cada 6 píxeles.
    if (celda(m, x, y - 1) !== PELDANO) return TABLA_LUZ
    if (celda(m, x, y + 1) !== PELDANO || x % 6 === 0) return TABLA_SOMBRA
    return TABLA
  }

  if (v === CRISTAL) {
    // Gemas de 8×8 talladas en cuatro caras, con filo oscuro entre ellas.
    const bx = x >> 3, by = y >> 3, lx = x & 7, ly = y & 7
    const g = GEMAS[Math.floor(ruido(bx, by, 4) * GEMAS.length)]
    if (lx === 7 || ly === 7) return g[4]
    if (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4) {
      if (ruido(x, y, 21) < 0.08) return DESTELLO
      return lx === 2 && ly === 2 ? g[0] : g[1]
    }
    const arriba = ly < lx && ly < 6 - lx
    const izquierda = lx <= ly && lx < 6 - ly
    if (arriba) return g[0]
    if (izquierda) return g[1]
    const derecha = lx > ly
    return derecha ? g[2] : g[3]
  }

  // Agua: translúcida, más clara arriba, con espuma y reflejos que se mueven.
  let hondo = 0
  while (hondo < 12 && celda(m, x, y - hondo - 1) === AGUA) hondo++
  const onda = Math.sin(x * 0.45 + t * 3) + Math.sin(x * 0.17 - t * 1.7)
  if (hondo === 0) return onda > 0.5 ? ESPUMA : REFLEJO
  const c = mezcla(AGUA_ALTA, AGUA_HONDA, Math.min(1, hondo / 10))
  c[3] = Math.round(AGUA_ALTA[3] + (AGUA_HONDA[3] - AGUA_ALTA[3]) * Math.min(1, hondo / 10))
  if (hondo < 6 && Math.sin(x * 0.6 + y * 1.3 + t * 2.2) > 0.93) return REFLEJO
  return c
}

/** Pinta el mapa entero en un ImageData (1 píxel por celda). */
export function pintar(m: Mapa, img: ImageData, t = 0) {
  const d = img.data
  for (let y = 0; y < m.alto; y++) {
    for (let x = 0; x < m.ancho; x++) {
      const i = (y * m.ancho + x) * 4
      const c = colorDe(m, x, y, t)
      if (c) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] } else d[i + 3] = 0
    }
  }
}

/**
 * Repinta solo una zona (tras cavar o construir). Se amplía porque el color
 * de un píxel depende de lo que tiene encima (musgo, profundidad) y alrededor.
 */
export function pintarZona(m: Mapa, img: ImageData, x0: number, y0: number, x1: number, y1: number, t = 0) {
  const d = img.data
  const xa = Math.max(0, x0 - 2), xb = Math.min(m.ancho - 1, x1 + 2)
  const ya = Math.max(0, y0 - 4), yb = Math.min(m.alto - 1, y1 + 26)
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const i = (y * m.ancho + x) * 4
      const c = colorDe(m, x, y, t)
      if (c) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] } else d[i + 3] = 0
    }
  }
  return [xa, ya, xb, yb] as const
}

/** Índices de las celdas de agua (el agua no cambia durante la partida). */
export function indicesAgua(m: Mapa): number[] {
  const r: number[] = []
  for (let i = 0; i < m.celdas.length; i++) if (m.celdas[i] === AGUA) r.push(i)
  return r
}

/** Vuelve a pintar solo el agua (para animarla sin recalcular el resto). */
export function pintarAgua(m: Mapa, img: ImageData, t: number, indices = indicesAgua(m)) {
  const d = img.data
  for (const j of indices) {
    const x = j % m.ancho, y = (j - x) / m.ancho
    const c = colorDe(m, x, y, t)!
    const i = j * 4
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3]
  }
}
