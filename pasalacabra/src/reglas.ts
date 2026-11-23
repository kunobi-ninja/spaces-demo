// Reglas de Pasalacabra como máquina de estados pura: (partida, acción, ahora) → partida.
// Sin React ni temporizadores: la interfaz pasa la hora real en cada acción,
// así la misma lógica sirve en una pantalla y, más adelante, en una sala compartida.

import { esCorrecta } from './normalizar'
import { restante, TIEMPO_POR_DEFECTO_MS } from './reloj'

export type Estado = 'pendiente' | 'acierto' | 'fallo'

export type Pregunta = {
  letra: string
  tipo: 'empieza' | 'contiene'
  pista: string
  respuestas: string[]
}

export type Jugador = {
  nombre: string
  preguntas: Pregunta[]
  estados: Estado[]
  /** Lo que escribió en cada letra (null si no contestó o pasó). */
  respuestas: (string | null)[]
  /** Índice de la letra en la que está. */
  posicion: number
  /** Tiempo que le quedaba al empezar su turno actual (o el que le queda, si no es su turno). */
  tiempoRestanteMs: number
}

export type Turno = 0 | 1

export type Evento =
  | { tipo: 'empieza'; jugador: Turno }
  | { tipo: 'acierto' | 'fallo' | 'pasa'; jugador: Turno; letra: string }
  | { tipo: 'tiempo'; jugador: Turno }
  | { tipo: 'rueda-completa'; jugador: Turno }

export type Partida = {
  /** En 'pausa' los relojes están parados y la pregunta, oculta. */
  fase: 'inicio' | 'jugando' | 'pausa' | 'final'
  jugadores: [Jugador, Jugador]
  turno: Turno
  /** Marca de tiempo (ms) en que empezó el turno actual; null fuera de juego. */
  turnoEmpezoEn: number | null
  tiempoInicialMs: number
  /** Lo último que pasó, para que la interfaz muestre o suene algo. */
  ultimoEvento: Evento | null
}

export type Accion =
  | { tipo: 'empezar' }
  | { tipo: 'responder'; texto: string }
  | { tipo: 'pasar' }
  | { tipo: 'tick' }
  | { tipo: 'pausar' }
  | { tipo: 'reanudar' }
  | { tipo: 'reiniciar' }

export type Configuracion = {
  nombres: [string, string]
  preguntas: [Pregunta[], Pregunta[]]
  tiempoMs?: number
}

// ─── Creación ────────────────────────────────────────────────────────────────

function nuevoJugador(nombre: string, preguntas: Pregunta[], tiempoMs: number): Jugador {
  return {
    nombre,
    preguntas,
    estados: preguntas.map(() => 'pendiente'),
    respuestas: preguntas.map(() => null),
    posicion: 0,
    tiempoRestanteMs: tiempoMs,
  }
}

export function crearPartida({ nombres, preguntas, tiempoMs = TIEMPO_POR_DEFECTO_MS }: Configuracion): Partida {
  for (const lista of preguntas) {
    if (lista.length === 0) throw new Error('Cada jugador necesita al menos una pregunta')
  }
  return {
    fase: 'inicio',
    jugadores: [
      nuevoJugador(nombres[0], preguntas[0], tiempoMs),
      nuevoJugador(nombres[1], preguntas[1], tiempoMs),
    ],
    turno: 0,
    turnoEmpezoEn: null,
    tiempoInicialMs: tiempoMs,
    ultimoEvento: null,
  }
}

/**
 * Elige una pregunta por letra para cada jugador, distinta entre los dos cuando
 * el banco lo permite, en el orden de `letras`. `azar` devuelve un número en [0, 1), como Math.random.
 */
export function repartirPreguntas(
  banco: readonly Pregunta[],
  letras: readonly string[],
  azar: () => number = Math.random,
): [Pregunta[], Pregunta[]] {
  const a: Pregunta[] = []
  const b: Pregunta[] = []
  for (const letra of letras) {
    const opciones = banco.filter((p) => p.letra === letra)
    if (opciones.length === 0) continue
    const i = Math.floor(azar() * opciones.length)
    a.push(opciones[i])
    if (opciones.length === 1) {
      b.push(opciones[0])
    } else {
      const j = (i + 1 + Math.floor(azar() * (opciones.length - 1))) % opciones.length
      b.push(opciones[j])
    }
  }
  return [a, b]
}

// ─── Consultas ───────────────────────────────────────────────────────────────

export const rival = (t: Turno): Turno => (t === 0 ? 1 : 0)

export const pendientes = (j: Jugador): number => j.estados.filter((e) => e === 'pendiente').length

export const aciertos = (j: Jugador): number => j.estados.filter((e) => e === 'acierto').length

export const fallos = (j: Jugador): number => j.estados.filter((e) => e === 'fallo').length

/** Un jugador ha terminado si no le quedan letras o se le acabó el tiempo. */
export const haTerminado = (j: Jugador): boolean => pendientes(j) === 0 || j.tiempoRestanteMs <= 0

/** Tiempo que le queda ahora mismo al jugador `i`, contando el turno en curso. */
export function tiempoDe(p: Partida, i: Turno, ahora: number): number {
  const j = p.jugadores[i]
  return p.fase === 'jugando' && p.turno === i ? restante(j.tiempoRestanteMs, p.turnoEmpezoEn, ahora) : j.tiempoRestanteMs
}

/** La pregunta que tiene que contestar el jugador en turno (null fuera de juego). */
export function preguntaActual(p: Partida): Pregunta | null {
  if (p.fase !== 'jugando') return null
  const j = p.jugadores[p.turno]
  return j.preguntas[j.posicion] ?? null
}

/** Siguiente letra pendiente después de `desde`, dando la vuelta; -1 si no queda ninguna. */
function siguientePendiente(j: Jugador, desde: number): number {
  const n = j.estados.length
  for (let k = 1; k <= n; k++) {
    const i = (desde + k) % n
    if (j.estados[i] === 'pendiente') return i
  }
  return -1
}

export type Resultado = {
  ganador: Turno | null
  /** Qué decidió la partida. */
  motivo: 'aciertos' | 'fallos' | 'tiempo' | 'empate'
  marcadores: [Marcador, Marcador]
}

export type Marcador = { aciertos: number; fallos: number; pendientes: number; tiempoRestanteMs: number }

const marcador = (j: Jugador): Marcador => ({
  aciertos: aciertos(j),
  fallos: fallos(j),
  pendientes: pendientes(j),
  tiempoRestanteMs: j.tiempoRestanteMs,
})

/** Gana quien más acierte; si empatan, quien menos falle; si siguen, quien tenga más tiempo de sobra. */
export function resultado(p: Partida): Resultado {
  const m: [Marcador, Marcador] = [marcador(p.jugadores[0]), marcador(p.jugadores[1])]
  const criterios: [Resultado['motivo'], number][] = [
    ['aciertos', m[0].aciertos - m[1].aciertos],
    ['fallos', m[1].fallos - m[0].fallos],
    ['tiempo', m[0].tiempoRestanteMs - m[1].tiempoRestanteMs],
  ]
  for (const [motivo, diferencia] of criterios) {
    if (diferencia !== 0) return { ganador: diferencia > 0 ? 0 : 1, motivo, marcadores: m }
  }
  return { ganador: null, motivo: 'empate', marcadores: m }
}

// ─── Transiciones ────────────────────────────────────────────────────────────

function conJugador(p: Partida, i: Turno, cambios: Partial<Jugador>): Partida {
  const jugadores: [Jugador, Jugador] = [...p.jugadores]
  jugadores[i] = { ...jugadores[i], ...cambios }
  return { ...p, jugadores }
}

/** Apunta en el reloj del jugador en turno el tiempo gastado hasta `ahora`. */
function descontarTiempo(p: Partida, ahora: number): Partida {
  const j = p.jugadores[p.turno]
  const queda = restante(j.tiempoRestanteMs, p.turnoEmpezoEn, ahora)
  return { ...conJugador(p, p.turno, { tiempoRestanteMs: queda }), turnoEmpezoEn: ahora }
}

/**
 * Tras cerrar el turno del jugador actual: le toca al rival si aún juega; si no,
 * sigue el actual si aún juega; si ninguno, la partida acaba.
 */
function pasarTurno(p: Partida, ahora: number): Partida {
  const otro = rival(p.turno)
  if (!haTerminado(p.jugadores[otro])) return { ...p, turno: otro, turnoEmpezoEn: ahora }
  if (!haTerminado(p.jugadores[p.turno])) return { ...p, turnoEmpezoEn: ahora }
  return { ...p, fase: 'final', turnoEmpezoEn: null }
}

/** Si al jugador en turno se le acabó el tiempo, cierra su rueda y pasa el turno. */
function comprobarTiempo(p: Partida, ahora: number): Partida {
  if (p.fase !== 'jugando') return p
  if (restante(p.jugadores[p.turno].tiempoRestanteMs, p.turnoEmpezoEn, ahora) > 0) return p
  const agotado = descontarTiempo(p, ahora)
  return { ...pasarTurno(agotado, ahora), ultimoEvento: { tipo: 'tiempo', jugador: p.turno } }
}

/** Cierra la letra actual del jugador en turno y decide quién sigue. */
function cerrarLetra(p: Partida, estado: 'acierto' | 'fallo', texto: string, ahora: number): Partida {
  const t = p.turno
  const j = p.jugadores[t]
  const letra = j.preguntas[j.posicion].letra
  const estados = [...j.estados]
  const respuestas = [...j.respuestas]
  estados[j.posicion] = estado
  respuestas[j.posicion] = texto
  const conLetra = conJugador(p, t, { estados, respuestas })
  const siguiente = siguientePendiente(conLetra.jugadores[t], j.posicion)
  const movido = siguiente === -1 ? conLetra : conJugador(conLetra, t, { posicion: siguiente })

  if (siguiente === -1) {
    return { ...pasarTurno(movido, ahora), ultimoEvento: { tipo: 'rueda-completa', jugador: t } }
  }
  // Con acierto sigue el mismo jugador; con fallo le toca al rival.
  const siguiendo = estado === 'acierto' ? movido : pasarTurno(movido, ahora)
  return { ...siguiendo, ultimoEvento: { tipo: estado, jugador: t, letra } }
}

export function aplicar(p: Partida, accion: Accion, ahora: number, corregir = esCorrecta): Partida {
  switch (accion.tipo) {
    case 'empezar': {
      if (p.fase !== 'inicio') return p
      return { ...p, fase: 'jugando', turno: 0, turnoEmpezoEn: ahora, ultimoEvento: { tipo: 'empieza', jugador: 0 } }
    }
    case 'reiniciar': {
      const [a, b] = p.jugadores
      return crearPartida({
        nombres: [a.nombre, b.nombre],
        preguntas: [a.preguntas, b.preguntas],
        tiempoMs: p.tiempoInicialMs,
      })
    }
    case 'tick':
      return comprobarTiempo(p, ahora)
    case 'pausar': {
      if (p.fase !== 'jugando') return p
      // Si el tiempo ya se había agotado, eso cuenta antes de pausar.
      const aTiempo = comprobarTiempo(p, ahora)
      if (aTiempo !== p) return aTiempo
      return { ...descontarTiempo(p, ahora), fase: 'pausa', turnoEmpezoEn: null }
    }
    case 'reanudar': {
      if (p.fase !== 'pausa') return p
      return { ...p, fase: 'jugando', turnoEmpezoEn: ahora }
    }
    case 'responder':
    case 'pasar': {
      if (p.fase !== 'jugando') return p
      // Una respuesta que llega con el tiempo agotado no cuenta.
      const aTiempo = comprobarTiempo(p, ahora)
      if (aTiempo !== p) return aTiempo
      const conTiempo = descontarTiempo(p, ahora)
      if (accion.tipo === 'pasar') return cerrarLetraPasada(conTiempo, ahora)
      const texto = accion.texto.trim()
      if (!texto) return p
      const pregunta = preguntaActual(conTiempo)!
      const estado = corregir(texto, pregunta.respuestas) ? 'acierto' : 'fallo'
      return cerrarLetra(conTiempo, estado, texto, ahora)
    }
  }
}

/** «¡Pasa la cabra!»: la letra sigue pendiente, avanza a la siguiente y el turno pasa. */
function cerrarLetraPasada(p: Partida, ahora: number): Partida {
  const t = p.turno
  const j = p.jugadores[t]
  const letra = j.preguntas[j.posicion].letra
  const siguiente = siguientePendiente(j, j.posicion)
  // Si era la única pendiente, se queda en ella para la próxima vuelta.
  const movido = siguiente === -1 ? p : conJugador(p, t, { posicion: siguiente })
  return { ...pasarTurno(movido, ahora), ultimoEvento: { tipo: 'pasa', jugador: t, letra } }
}
