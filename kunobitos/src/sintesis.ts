/*
 * Efectos de sonido de Kunobitos, sintetizados con matemáticas: no hay
 * archivos de audio. Mismo sintetizador que Castillos y Pasalacabra, con un
 * ruido para golpes y estallidos. Las recetas son propias.
 */

export type NombreSonido =
  | 'elegir' | 'dar' | 'nada' | 'salida' | 'cavar' | 'tabla' | 'tic' | 'estallido'
  | 'aturdido' | 'agua' | 'llegada' | 'victoria' | 'derrota'
  | 'gancho' | 'salto' | 'humo' | 'kunai' | 'cometa' | 'pinchado' | 'alarma'
  | 'tema-bambu' | 'tema-tejados' | 'tema-montana' | 'tema-maestro'

type Forma = 'seno' | 'triangulo' | 'cuadrada' | 'ruido'

type Nota = {
  inicio: number
  dur: number
  frec: number
  frecFin?: number
  forma: Forma
  vol: number
  vibrato?: { frec: number; prof: number }
}

const DO5 = 523.25, MI5 = 659.25, SOL5 = 783.99, LA5 = 880, DO6 = 1046.5, MI6 = 1318.5
const LA3 = 220, LA4 = 440, RE5 = 587.33

/** Una frase de notas seguidas: [frecuencia, duración] a partir de `desde`. */
function frase(notas: [number, number][], forma: Forma, vol: number, desde = 0, vibrato?: Nota['vibrato']): Nota[] {
  let t = desde
  return notas.map(([frec, dur]) => {
    const n: Nota = { inicio: t, dur: dur * 1.25, frec, forma, vol, vibrato }
    t += dur
    return n
  })
}

const RECETAS: Record<NombreSonido, Nota[]> = {
  // Elegir una habilidad en el panel: un clic suave.
  elegir: [{ inicio: 0, dur: 0.04, frec: 1500, frecFin: 1200, forma: 'seno', vol: 0.25 }],
  // Dar una habilidad: un «¡ya!» de dos notas que suben.
  dar: [
    { inicio: 0, dur: 0.06, frec: 700, frecFin: 760, forma: 'triangulo', vol: 0.4 },
    { inicio: 0.05, dur: 0.1, frec: 1050, frecFin: 1150, forma: 'triangulo', vol: 0.4 },
  ],
  // Tocar sin dar nada (no cabe o no quedan): un «bup» grave.
  nada: [{ inicio: 0, dur: 0.09, frec: 220, frecFin: 180, forma: 'triangulo', vol: 0.3 }],
  // Sale uno del Nido: un «pop» corto.
  salida: [{ inicio: 0, dur: 0.06, frec: 500, frecFin: 900, forma: 'seno', vol: 0.25 }],
  // Cavar: un roce de tierra.
  cavar: [{ inicio: 0, dur: 0.07, frec: 300, forma: 'ruido', vol: 0.18 }],
  // Poner una tabla: «toc» de madera.
  tabla: [
    { inicio: 0, dur: 0.05, frec: 900, frecFin: 700, forma: 'triangulo', vol: 0.3 },
    { inicio: 0, dur: 0.06, frec: 180, forma: 'seno', vol: 0.25 },
  ],
  // Cuenta atrás de la Chispa.
  tic: [{ inicio: 0, dur: 0.05, frec: 1800, forma: 'cuadrada', vol: 0.12 }],
  // Estallido: ruido que cae y un golpe grave.
  estallido: [
    { inicio: 0, dur: 0.45, frec: 1, forma: 'ruido', vol: 0.55 },
    { inicio: 0, dur: 0.3, frec: 120, frecFin: 45, forma: 'seno', vol: 0.6 },
    { inicio: 0.05, dur: 0.25, frec: SOL5, frecFin: DO6, forma: 'triangulo', vol: 0.15 },
  ],
  // Aturdido: un «boing» que baja.
  aturdido: [{ inicio: 0, dur: 0.35, frec: 520, frecFin: 160, forma: 'triangulo', vol: 0.4, vibrato: { frec: 14, prof: 0.06 } }],
  // Al agua: «blup».
  agua: [
    { inicio: 0, dur: 0.12, frec: 300, frecFin: 900, forma: 'seno', vol: 0.35 },
    { inicio: 0.1, dur: 0.12, frec: 400, frecFin: 1100, forma: 'seno', vol: 0.25 },
  ],
  // Llega al Dojo: campanilla.
  llegada: [
    { inicio: 0, dur: 0.1, frec: MI6, forma: 'seno', vol: 0.3 },
    { inicio: 0.06, dur: 0.3, frec: LA5 * 2, forma: 'seno', vol: 0.25, vibrato: { frec: 7, prof: 0.008 } },
  ],
  // Nivel superado: una pequeña fanfarria.
  victoria: [
    { inicio: 0, dur: 0.14, frec: DO5, forma: 'triangulo', vol: 0.4 },
    { inicio: 0.12, dur: 0.14, frec: MI5, forma: 'triangulo', vol: 0.4 },
    { inicio: 0.24, dur: 0.14, frec: SOL5, forma: 'triangulo', vol: 0.4 },
    { inicio: 0.36, dur: 0.6, frec: DO6, forma: 'triangulo', vol: 0.45, vibrato: { frec: 5.5, prof: 0.012 } },
    { inicio: 0.36, dur: 0.6, frec: MI6, forma: 'seno', vol: 0.2 },
  ],
  // Ampliación ninja.
  // Gancho: la cuerda silba y el garfio se clava con un «clinc».
  gancho: [
    { inicio: 0, dur: 0.14, frec: 1, forma: 'ruido', vol: 0.18 },
    { inicio: 0.11, dur: 0.07, frec: 2500, frecFin: 2100, forma: 'triangulo', vol: 0.25 },
    { inicio: 0.13, dur: 0.12, frec: 3300, forma: 'seno', vol: 0.12 },
  ],
  // Salto: un «boing» que sube.
  salto: [{ inicio: 0, dur: 0.18, frec: 300, frecFin: 820, forma: 'seno', vol: 0.35 }],
  // Humo: un «puf» de aire y un golpe sordo.
  humo: [
    { inicio: 0, dur: 0.32, frec: 1, forma: 'ruido', vol: 0.32 },
    { inicio: 0, dur: 0.2, frec: 210, frecFin: 80, forma: 'seno', vol: 0.22 },
  ],
  // Kunai: metal que se clava en la pared.
  kunai: [
    { inicio: 0, dur: 0.06, frec: 2600, frecFin: 2250, forma: 'triangulo', vol: 0.28 },
    { inicio: 0, dur: 0.05, frec: 4100, forma: 'seno', vol: 0.1 },
    { inicio: 0, dur: 0.04, frec: 140, forma: 'seno', vol: 0.2 },
  ],
  // Cometa: el papel aletea al abrirse.
  cometa: [{ inicio: 0, dur: 0.28, frec: 560, frecFin: 900, forma: 'triangulo', vol: 0.22, vibrato: { frec: 18, prof: 0.08 } }],
  // Pinchado: un golpe seco.
  pinchado: [
    { inicio: 0, dur: 0.18, frec: 170, frecFin: 60, forma: 'seno', vol: 0.45 },
    { inicio: 0, dur: 0.08, frec: 1, forma: 'ruido', vol: 0.22 },
  ],
  // Descubierto por la linterna: dos tonos de alarma y un gong.
  alarma: [
    { inicio: 0, dur: 0.11, frec: 880, forma: 'cuadrada', vol: 0.16 },
    { inicio: 0.12, dur: 0.11, frec: 660, forma: 'cuadrada', vol: 0.16 },
    { inicio: 0.24, dur: 0.45, frec: 330, frecFin: 320, forma: 'seno', vol: 0.3, vibrato: { frec: 5, prof: 0.01 } },
  ],
  // Melodías cortas de los escenarios, sobre una escala pentatónica. Propias.
  // Bambú: una flauta tranquila.
  'tema-bambu': frase([[LA4, 0.18], [DO5, 0.18], [RE5, 0.18], [MI5, 0.36], [RE5, 0.18], [DO5, 0.5]], 'seno', 0.3, 0, { frec: 5, prof: 0.01 }),
  // Tejados: cuerdas punteadas, rápidas y de noche.
  'tema-tejados': [
    ...frase([[MI5, 0.12], [RE5, 0.12], [LA4, 0.12], [DO5, 0.24], [LA4, 0.12], [MI5 / 2, 0.4]], 'triangulo', 0.32),
    { inicio: 0, dur: 0.9, frec: LA3, forma: 'seno', vol: 0.12 },
  ],
  // Montaña: notas amplias con su eco.
  'tema-montana': [
    ...frase([[RE5, 0.3], [LA5, 0.3], [SOL5, 0.3], [MI5, 0.6]], 'seno', 0.3),
    ...frase([[RE5, 0.3], [LA5, 0.3], [SOL5, 0.3], [MI5, 0.6]], 'seno', 0.1, 0.45),
  ],
  // Maestro: un gong grave y una subida.
  'tema-maestro': [
    { inicio: 0, dur: 1.3, frec: LA3 / 2, frecFin: LA3 / 2 * 0.98, forma: 'seno', vol: 0.4, vibrato: { frec: 3, prof: 0.015 } },
    { inicio: 0, dur: 0.9, frec: LA3 * 1.5, forma: 'seno', vol: 0.12 },
    ...frase([[LA4, 0.14], [DO5, 0.14], [MI5, 0.14], [LA5, 0.45]], 'triangulo', 0.28, 0.35),
  ],
  // Nivel no superado: tres notas que bajan.
  derrota: [
    { inicio: 0, dur: 0.2, frec: SOL5, forma: 'triangulo', vol: 0.35 },
    { inicio: 0.2, dur: 0.2, frec: MI5, forma: 'triangulo', vol: 0.35 },
    { inicio: 0.4, dur: 0.5, frec: DO5, frecFin: 480, forma: 'triangulo', vol: 0.35 },
  ],
}

const ATAQUE = 0.004
const SATURACION = Math.tanh(3)

function onda(forma: Forma, fase: number, i: number): number {
  if (forma === 'ruido') {
    // Ruido estable (sin Math.random): el mismo efecto suena siempre igual.
    let n = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b)
    n ^= n >>> 13
    n = Math.imul(n, 0xc2b2ae35)
    n ^= n >>> 16
    return ((n >>> 0) / 4294967296) * 2 - 1
  }
  const s = Math.sin(fase)
  if (forma === 'seno') return s
  if (forma === 'triangulo') return (2 / Math.PI) * Math.asin(s)
  return Math.tanh(3 * s) / SATURACION
}

function sumarNota(salida: Float32Array, nota: Nota, muestreo: number) {
  const desde = Math.round(nota.inicio * muestreo)
  const n = Math.round(nota.dur * muestreo)
  const frecFin = nota.frecFin ?? nota.frec
  let fase = 0
  for (let i = 0; i < n && desde + i < salida.length; i++) {
    const t = i / muestreo
    const avance = t / nota.dur
    let frec = nota.frec * Math.pow(frecFin / nota.frec, avance)
    if (nota.vibrato) frec *= 1 + nota.vibrato.prof * Math.sin(2 * Math.PI * nota.vibrato.frec * t)
    fase += (2 * Math.PI * frec) / muestreo
    const env = Math.min(1, t / ATAQUE) * Math.pow(1 - avance, nota.forma === 'ruido' ? 2.5 : 1.5)
    salida[desde + i] += nota.vol * env * onda(nota.forma, fase, i)
  }
}

/** Muestras mono del efecto, entre -1 y 1, a la frecuencia de muestreo dada. */
export function muestras(nombre: NombreSonido, muestreo: number): Float32Array {
  const notas = RECETAS[nombre]
  const duracion = Math.max(...notas.map((n) => n.inicio + n.dur)) + 0.02
  const salida = new Float32Array(Math.ceil(duracion * muestreo))
  for (const nota of notas) sumarNota(salida, nota, muestreo)
  let pico = 0
  for (const v of salida) pico = Math.max(pico, Math.abs(v))
  if (pico > 0.95) for (let i = 0; i < salida.length; i++) salida[i] *= 0.95 / pico
  return salida
}
