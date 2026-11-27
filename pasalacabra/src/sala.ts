import { EDICIONES, type Edicion, type Idioma, type Nivel } from './ediciones'
import { aplicar, type Jugador, type Partida, type Pregunta, type Turno } from './reglas'

type JugadorEnSala = Omit<Jugador, 'preguntas'> & { indices: number[] }
type PartidaEnSala = Omit<Partida, 'jugadores'> & { jugadores: [JugadorEnSala, JugadorEnSala] }

export type Mesa = {
  id: string
  paso: number
  anfitrion: string
  invitado: string
  /** El idioma de las preguntas, que elige el anfitrión. */
  idioma: Idioma
  nivel: Nivel
  partida: PartidaEnSala
}

export type Peticion = {
  id: string
  paso: number
} & ({ tipo: 'pasar' } | { tipo: 'responder'; texto: string })

/** La edición del idioma de la mesa; español si no se reconoce. */
export function edicionDe(mesa: Pick<Mesa, 'idioma'>): Edicion {
  return mesa.idioma && Object.hasOwn(EDICIONES, mesa.idioma) ? EDICIONES[mesa.idioma] : EDICIONES.es
}

function bancoDe(edicion: Edicion, nivel: Nivel): readonly Pregunta[] {
  return (edicion.niveles[nivel] ?? edicion.niveles.facil).banco
}

export function guardarPartida(partida: Partida, nivel: Nivel, idioma: Idioma): PartidaEnSala {
  const banco = bancoDe(edicionDe({ idioma }), nivel)
  const guardar = ({ preguntas, ...jugador }: Jugador): JugadorEnSala => ({
    ...jugador,
    indices: preguntas.map((pregunta) => banco.indexOf(pregunta)),
  })
  return { ...partida, jugadores: [guardar(partida.jugadores[0]), guardar(partida.jugadores[1])] }
}

export function leerPartida(mesa: Mesa): Partida {
  const banco = bancoDe(edicionDe(mesa), mesa.nivel)
  const leer = ({ indices, ...jugador }: JugadorEnSala): Jugador => ({
    ...jugador,
    preguntas: indices.map((i) => banco[i]),
  })
  return { ...mesa.partida, jugadores: [leer(mesa.partida.jugadores[0]), leer(mesa.partida.jugadores[1])] }
}

export function asientoDe(mesa: Mesa, id: string | undefined): Turno | null {
  if (id === mesa.anfitrion) return 0
  if (id === mesa.invitado) return 1
  return null
}

export function peticionVigente(mesa: Mesa, valor: unknown): valor is Peticion {
  if (!valor || typeof valor !== 'object') return false
  const peticion = valor as Partial<Peticion>
  if (peticion.id !== mesa.id || peticion.paso !== mesa.paso) return false
  return peticion.tipo === 'pasar' ||
    (peticion.tipo === 'responder' && typeof peticion.texto === 'string' &&
      peticion.texto.length <= 120 && peticion.texto.trim().length > 0)
}

/** La hora queda a cargo del anfitrión, igual que la validación de la respuesta y el turno. */
export function resolverInvitado(mesa: Mesa, partida: Partida, valor: unknown, ahora: number): Partida {
  if (partida.turno !== 1 || partida.fase !== 'jugando' || !peticionVigente(mesa, valor)) return partida
  return aplicar(partida, valor, ahora, edicionDe(mesa).corregir)
}

/** Kunobi puede presentar las claves con punto como entradas planas o como mapas anidados. */
export function entradaDe(estado: Record<string, unknown>, grupo: string, id: string | undefined): unknown {
  if (!id) return undefined
  const entradas = estado[grupo]
  return estado[`${grupo}.${id}`] ?? (entradas as Record<string, unknown> | undefined)?.[id]
}

/**
 * Si quien abre la página ya juega en la mesa o espera en la sala, hay que llevarlo al modo en línea.
 * En el enlace web la página no puede guardar el modo elegido, así que al recargar abriría en local.
 */
export function debeVolverALaSala(estado: Record<string, unknown>, soy: string | undefined): boolean {
  if (!soy) return false
  const mesa = estado.mesa as Mesa | null | undefined
  if (mesa && asientoDe(mesa, soy) !== null) return true
  return entradaDe(estado, 'listo', soy) === true
}

