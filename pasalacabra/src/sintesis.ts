// Efectos de sonido de Pasalacabra, sintetizados con matemáticas: no hay archivos de audio.
// Funciones puras que devuelven muestras; sonidos.ts las convierte en AudioBuffer.

export type NombreSonido = 'acierto' | 'fallo' | 'pasa' | 'tic' | 'tiempo' | 'fin'

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
  /** Oscilación del volumen (0–1). Es lo que hace que «pasa» suene a balido. */
  tremolo?: { frec: number; prof: number }
}

const DO5 = 523.25
const MI5 = 659.25
const SOL5 = 783.99
const SI5 = 987.77
const DO6 = 1046.5

const RECETAS: Record<NombreSonido, Nota[]> = {
  // Dos notas que suben: ¡bien!
  acierto: [
    { inicio: 0, dur: 0.12, frec: MI5, forma: 'triangulo', vol: 0.5 },
    { inicio: 0.09, dur: 0.24, frec: SI5, forma: 'triangulo', vol: 0.5 },
  ],
  // Un zumbido grave que cae.
  fallo: [{ inicio: 0, dur: 0.36, frec: 220, frecFin: 110, forma: 'cuadrada', vol: 0.25 }],
  // «¡Beee!»: un balido de cabra, con trémolo rápido y algo de vibrato.
  pasa: [
    {
      inicio: 0,
      dur: 0.5,
      frec: 560,
      frecFin: 460,
      forma: 'triangulo',
      vol: 0.5,
      tremolo: { frec: 26, prof: 0.75 },
      vibrato: { frec: 6, prof: 0.03 },
    },
  ],
  // El tic de la cuenta atrás de los últimos 10 segundos.
  tic: [{ inicio: 0, dur: 0.05, frec: 1250, forma: 'seno', vol: 0.4 }],
  // Se acabó el tiempo: dos bocinazos graves.
  tiempo: [
    { inicio: 0, dur: 0.25, frec: 330, forma: 'cuadrada', vol: 0.22 },
    { inicio: 0.3, dur: 0.55, frec: 247, frecFin: 185, forma: 'cuadrada', vol: 0.22 },
  ],
  // Rueda completa o fin de la partida: arpegio que sube.
  fin: [
    { inicio: 0, dur: 0.18, frec: DO5, forma: 'triangulo', vol: 0.4 },
    { inicio: 0.1, dur: 0.18, frec: MI5, forma: 'triangulo', vol: 0.4 },
    { inicio: 0.2, dur: 0.18, frec: SOL5, forma: 'triangulo', vol: 0.4 },
    { inicio: 0.3, dur: 0.5, frec: DO6, forma: 'triangulo', vol: 0.45 },
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
    let env = Math.min(1, t / ATAQUE) * Math.pow(1 - avance, 1.5)
    if (nota.tremolo) env *= 1 - nota.tremolo.prof * (0.5 + 0.5 * Math.sin(2 * Math.PI * nota.tremolo.frec * t))
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
