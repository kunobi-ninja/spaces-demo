/*
 * Efectos de sonido de Castillos, sintetizados con matemáticas: no hay archivos
 * de audio. Funciones puras que devuelven muestras; sonidos.ts las convierte en
 * AudioBuffer.
 */

export type NombreSonido = 'giro' | 'colocar' | 'estandarte' | 'puntos' | 'puntosGrandes' | 'fin'

type Forma = 'seno' | 'triangulo' | 'cuadrada'

type Nota = {
  /** Segundos desde el comienzo del efecto. */
  inicio: number
  dur: number
  frec: number
  /** Si se da, la frecuencia se desliza hasta aquí. */
  frecFin?: number
  forma: Forma
  vol: number
  /** Oscilación de la altura (proporción, p. ej. 0.03 = ±3 %). */
  vibrato?: { frec: number; prof: number }
}

const DO5 = 523.25
const MI5 = 659.25
const SOL5 = 783.99
const DO6 = 1046.5
const MI6 = 1318.5

const RECETAS: Record<NombreSonido, Nota[]> = {
  // Un clic corto de madera al girar la loseta.
  giro: [{ inicio: 0, dur: 0.035, frec: 1400, frecFin: 1100, forma: 'seno', vol: 0.3 }],
  // «Toc»: la loseta se apoya en la mesa. Un golpe grave que cae.
  colocar: [
    { inicio: 0, dur: 0.13, frec: 210, frecFin: 120, forma: 'triangulo', vol: 0.65 },
    { inicio: 0, dur: 0.09, frec: 95, forma: 'seno', vol: 0.45 },
  ],
  // El estandarte que se clava: dos notas rápidas que suben, como un tirón de tela.
  estandarte: [
    { inicio: 0, dur: 0.07, frec: 620, frecFin: 700, forma: 'triangulo', vol: 0.4 },
    { inicio: 0.06, dur: 0.12, frec: 930, frecFin: 1000, forma: 'triangulo', vol: 0.4 },
  ],
  // Puntos: dos monedas.
  puntos: [
    { inicio: 0, dur: 0.12, frec: SOL5, forma: 'triangulo', vol: 0.45 },
    { inicio: 0.09, dur: 0.26, frec: DO6, forma: 'triangulo', vol: 0.45 },
  ],
  // Muchos puntos de golpe (un castillo grande, una ermita): un arpegio corto.
  puntosGrandes: [
    { inicio: 0, dur: 0.12, frec: DO5, forma: 'triangulo', vol: 0.4 },
    { inicio: 0.08, dur: 0.12, frec: MI5, forma: 'triangulo', vol: 0.4 },
    { inicio: 0.16, dur: 0.12, frec: SOL5, forma: 'triangulo', vol: 0.4 },
    { inicio: 0.24, dur: 0.36, frec: DO6, forma: 'triangulo', vol: 0.45, vibrato: { frec: 6, prof: 0.01 } },
  ],
  // Fin de la partida: una pequeña fanfarria.
  fin: [
    { inicio: 0, dur: 0.16, frec: SOL5, forma: 'cuadrada', vol: 0.18 },
    { inicio: 0.16, dur: 0.16, frec: SOL5, forma: 'cuadrada', vol: 0.18 },
    { inicio: 0.32, dur: 0.18, frec: DO6, forma: 'cuadrada', vol: 0.2 },
    { inicio: 0.5, dur: 0.6, frec: MI6, forma: 'triangulo', vol: 0.4, vibrato: { frec: 5.5, prof: 0.012 } },
    { inicio: 0.5, dur: 0.6, frec: DO6, forma: 'triangulo', vol: 0.3 },
  ],
}

const ATAQUE = 0.005
const SATURACION = Math.tanh(3)

function onda(forma: Forma, fase: number): number {
  const s = Math.sin(fase)
  if (forma === 'seno') return s
  if (forma === 'triangulo') return (2 / Math.PI) * Math.asin(s)
  // Cuadrada suavizada: menos áspera que una cuadrada pura.
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
    // Deslizamiento exponencial de la frecuencia, que el oído percibe como lineal.
    let frec = nota.frec * Math.pow(frecFin / nota.frec, avance)
    if (nota.vibrato) frec *= 1 + nota.vibrato.prof * Math.sin(2 * Math.PI * nota.vibrato.frec * t)
    fase += (2 * Math.PI * frec) / muestreo
    // Envolvente: subida corta y caída suave hasta cero, para que no haya chasquidos.
    const env = Math.min(1, t / ATAQUE) * Math.pow(1 - avance, 1.5)
    salida[desde + i] += nota.vol * env * onda(nota.forma, fase)
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
