import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'kunobi'
import { Cabra } from './Cabra'
import type { Idioma } from './ediciones'
import { BotonVolver, configInicial, Final, Inicio, Juego, nuevaPartida, useSonidosPartida, type Config, type Palabras } from './Partida'
import { aplicar, tiempoDe, type Accion, type Partida } from './reglas'
import { asientoDe, edicionDe, entradaDe, guardarPartida, leerPartida, peticionVigente, resolverInvitado, type Mesa } from './sala'

type Participante = { id: string; kind: string; role: string; name?: string }
type Operacion = { type: 'set'; key: string; value: unknown }

const SIN_ESTADO: Record<string, unknown> = {}
const SIN_PARTICIPANTES: Participante[] = []
const ESCRITURA_EN_CURSO = Number.POSITIVE_INFINITY
const INTERVALO_ANFITRION_MS = 4_000
const ESPERA_CONEXION_MS = 16_000
const ESPERA_ENVIO_MS = 8_000

type Props = { w: Palabras; idioma: Idioma; onSalir: () => void }

/**
 * `idioma` es el de las preguntas con que se abren los ajustes del anfitrión; una partida empezada
 * usa el de su mesa. `onSalir` vuelve a la portada mientras no hay partida en la mesa.
 */
export function EnLinea(props: Props) {
  const [intento, cambiarIntento] = useState(0)
  const reintentar = useCallback(() => cambiarIntento((actual) => actual + 1), [])
  return <SalaEnLinea key={intento} reintentar={reintentar} {...props} />
}

function SalaEnLinea({ reintentar, w, idioma: idiomaPagina, onSalir }: Props & { reintentar: () => void }) {
  const sala = useSession('pasalacabra', { model: 'map', schema: 1 })
  const abierta = sala.status === 'open'
  const motivo = sala.refusal?.reason ?? sala.reason
  const estado = sala.state ?? SIN_ESTADO
  const soy = sala.actor?.id
  const revision = sala.revision ?? 0
  const aplicarEnSala = sala.apply
  // En una sala de un Space propio, Kunobi identifica al dueño con «Me».
  const anfitrion = soy === 'Me'
  const puedeEscribir = abierta && !!soy && sala.canEdit !== false
  const participantes = sala.participants ?? SIN_PARTICIPANTES
  const mesa = estado.mesa as Mesa | null | undefined
  const edicion = mesa ? edicionDe(mesa) : null
  const clavePartida = mesa ? `${mesa.id}:${mesa.paso}` : null
  const [vistaPartida, guardarVistaPartida] = useState(() => ({
    clave: clavePartida,
    partida: mesa ? leerPartida(mesa) : null,
  }))
  // Las señales de conexión pueden traer otra copia de la mesa sin que haya una jugada nueva.
  // Mantener la partida por paso evita borrar la respuesta o repetir el sonido de la jugada.
  let partida = vistaPartida.partida
  if (vistaPartida.clave !== clavePartida) {
    partida = mesa ? leerPartida(mesa) : null
    guardarVistaPartida({ clave: clavePartida, partida })
  }
  const asiento = mesa ? asientoDe(mesa, soy) : null
  const invitadoPresente = participantes.some((p) => p.id === mesa?.invitado && p.role === 'writer')
  const peticion = entradaDe(estado, 'jugada', mesa?.invitado)

  const valorPulso = entradaDe(estado, 'listo', mesa?.anfitrion)
  const pulso = typeof valorPulso === 'number' ? valorPulso : null
  const [ultimoPulso, registrarPulso] = useState(() => ({ pulso, recibido: performance.now(), visto: false }))
  if (ultimoPulso.pulso !== pulso) registrarPulso({ pulso, recibido: performance.now(), visto: true })
  const [elegido, elegir] = useState('')
  const [config, configurar] = useState<Config>(() => configInicial(idiomaPagina))
  const [error, mostrarError] = useState('')
  const [ahora, marcarHora] = useState(Date.now)
  const [revisionPendiente, esperarRevision] = useState<number | null>(null)
  const pendiente = useRef<number | null>(null)
  const ausencia = useRef<number | null>(null)
  const ocupado = abierta && revisionPendiente !== null && revision < revisionPendiente

  useEffect(() => {
    if (!abierta || revisionPendiente === null || revision >= revisionPendiente) {
      pendiente.current = null
      return
    }
    const timer = window.setTimeout(reintentar, ESPERA_ENVIO_MS)
    return () => window.clearTimeout(timer)
  }, [abierta, reintentar, revision, revisionPendiente])

  const escribir = useCallback(async (operacion: Operacion, automatica = false) => {
    if (!puedeEscribir || (pendiente.current !== null && revision < pendiente.current)) return
    pendiente.current = ESCRITURA_EN_CURSO
    esperarRevision(ESCRITURA_EN_CURSO)
    if (!automatica) mostrarError('')
    let hasta: number | null = null
    try {
      const respuesta = await aplicarEnSala(operacion, operacion.key === 'mesa' ? { baseRevision: revision } : undefined)
      if (respuesta.status === 'applied' || respuesta.status === 'duplicate') {
        hasta = respuesta.revision ?? revision + 1
        mostrarError('')
      } else if (respuesta.status !== 'stale' || !automatica) {
        mostrarError(respuesta.status === 'stale'
          ? w.sala.errorCambio
          : w.sala.errorActualizar({ motivo: respuesta.reason ?? w.sala.vuelveAIntentarlo }))
      }
    } catch {
      mostrarError(w.sala.errorConexion)
    } finally {
      pendiente.current = hasta
      esperarRevision(hasta)
    }
  }, [aplicarEnSala, puedeEscribir, revision, w])

  const actualizarPartida = useCallback((siguiente: Partida, automatica = false) => {
    if (!mesa || siguiente === partida) return
    const nuevaMesa = { ...mesa, paso: mesa.paso + 1, partida: guardarPartida(siguiente, mesa.nivel, mesa.idioma) }
    void escribir({ type: 'set', key: 'mesa', value: nuevaMesa }, automatica)
  }, [escribir, mesa, partida])

  const jugando = partida?.fase === 'jugando'
  const enPartida = !!mesa
  useEffect(() => {
    if (!puedeEscribir || !anfitrion || !enPartida) return
    // Las señales de conexión son independientes de las jugadas y no cambian su paso.
    const enviarPulso = () => {
      if (pendiente.current !== null) return
      void aplicarEnSala({ type: 'set', key: `listo.${soy}`, value: Date.now() }).catch(() => {})
    }
    const timer = window.setInterval(enviarPulso, INTERVALO_ANFITRION_MS)
    return () => window.clearInterval(timer)
  }, [anfitrion, aplicarEnSala, enPartida, puedeEscribir, soy])

  useEffect(() => {
    if (!abierta || anfitrion || !enPartida) return
    const timer = window.setTimeout(reintentar, ESPERA_CONEXION_MS)
    return () => window.clearTimeout(timer)
  }, [abierta, anfitrion, enPartida, pulso, reintentar])

  useEffect(() => {
    ausencia.current = null
  }, [invitadoPresente, jugando, mesa?.id])

  useEffect(() => {
    if (!abierta || !jugando) return
    const timer = window.setInterval(() => marcarHora(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [abierta, jugando])

  useEffect(() => {
    if (!puedeEscribir || !anfitrion || ocupado || !mesa || partida?.fase !== 'jugando') return
    const hora = Date.now()
    if (!invitadoPresente) {
      ausencia.current ??= performance.now()
      if (performance.now() - ausencia.current >= ESPERA_CONEXION_MS) {
        actualizarPartida(aplicar(partida, { tipo: 'pausar' }, hora), true)
        return
      }
    }
    const siguiente = resolverInvitado(mesa, partida, peticion, hora)
    actualizarPartida(aplicar(siguiente, { tipo: 'tick' }, hora), true)
  }, [actualizarPartida, anfitrion, ahora, invitadoPresente, mesa, ocupado, partida, peticion, puedeEscribir])

  const horaAnfitrion = anfitrion || pulso === null || !ultimoPulso.visto
    ? ahora
    : pulso + Math.max(0, performance.now() - ultimoPulso.recibido)
  const horaVisible = Math.max(horaAnfitrion, partida?.turnoEmpezoEn ?? 0)
  const { botonSonido, desbloquear, reiniciarCuentaAtras } = useSonidosPartida(partida, horaVisible, w)
  const puedeResponder = puedeEscribir && partida?.fase === 'jugando' && asiento === partida.turno
  const relojAgotado = anfitrion && puedeResponder && tiempoDe(partida, partida.turno, horaVisible) === 0
  const esperandoJugada = !!mesa && asiento === 1 && peticionVigente(mesa, peticion)

  const despachar = (accion: Accion) => {
    if (!mesa || !partida || !puedeEscribir || ocupado) return
    desbloquear()
    if (accion.tipo === 'responder' || accion.tipo === 'pasar') {
      if (!puedeResponder || esperandoJugada || relojAgotado) return
      if (!anfitrion) {
        const jugada = { ...accion, id: mesa.id, paso: mesa.paso }
        void escribir({ type: 'set', key: `jugada.${soy}`, value: jugada })
        return
      }
    } else if (!anfitrion || (accion.tipo === 'reanudar' && !invitadoPresente)) {
      return
    }
    actualizarPartida(aplicar(partida, accion, Date.now(), edicionDe(mesa).corregir))
  }

  const candidatos = anfitrion ? participantes.filter((p) =>
    p.id !== soy &&
    (p.kind === 'person' || p.kind === 'visitor') &&
    p.role === 'writer' && entradaDe(estado, 'listo', p.id) === true,
  ) : []
  const invitado = candidatos.find((p) => p.id === elegido) ?? candidatos[0]
  const listo = entradaDe(estado, 'listo', soy) === true

  const empezar = (nueva: Config, invitadoId: string | undefined) => {
    if (!anfitrion || !soy || !invitadoId || ocupado) return
    desbloquear()
    reiniciarCuentaAtras()
    configurar(nueva)
    const hora = Date.now()
    marcarHora(hora)
    const siguiente: Mesa = {
      id: `${hora.toString(36)}-${Math.random().toString(36).slice(2)}`,
      paso: 0,
      anfitrion: soy,
      invitado: invitadoId,
      idioma: nueva.idioma,
      nivel: nueva.nivel,
      partida: guardarPartida(nuevaPartida(nueva, hora), nueva.nivel, nueva.idioma),
    }
    void escribir({ type: 'set', key: 'mesa', value: siguiente })
  }
  const volver = () => void escribir({ type: 'set', key: 'mesa', value: null })

  return (
    <div className="plc">
      <div className="plc-barra">
        {!mesa && <BotonVolver w={w} onClick={onSalir} />}
        <span className="plc-barra-hueco" />
        {botonSonido}
      </div>
      {error && <p className="plc-sala-estado plc-aviso-mal" role="alert">{error}</p>}
      {!abierta ? (
        <div className="plc-panel plc-inicio">
          <h2>{w.tituloEnLinea}</h2>
          <p role="status">{sala.status === 'opening' ? w.sala.abriendo :
            sala.status === 'paused' ? w.sala.anfitrionDesconectado : w.sala.noDisponible}</p>
          {typeof motivo === 'string' && motivo && <p className="plc-sub">{motivo}</p>}
          {sala.status === 'opening' && <p className="plc-sub">{w.sala.abrirEnKunobi}</p>}
          <div className="plc-fila plc-centrada">
            <button type="button" className="plc-boton plc-boton-cristal" onClick={reintentar}>{w.sala.reintentar}</button>
          </div>
        </div>
      ) : mesa && partida && edicion ? (
        <>
          <p className="plc-sala-estado" role="status">
            {asiento === null ? w.sala.espectador : w.sala.juegasComo({ nombre: partida.jugadores[asiento].nombre })}
            {anfitrion && !invitadoPresente && ` ${w.sala.esperandoVuelta}`}
          </p>
          {partida.fase === 'final' ? (
            <Final
              w={w}
              partida={partida}
              ocupado={ocupado}
              puedeRevancha={invitadoPresente}
              onRevancha={anfitrion ? () => empezar({
                nombres: [partida.jugadores[0].nombre, partida.jugadores[1].nombre],
                tiempoMs: partida.tiempoInicialMs,
                nivel: mesa.nivel,
                idioma: edicion.idioma,
              }, invitadoPresente ? mesa.invitado : undefined) : undefined}
              onNueva={anfitrion ? volver : undefined}
            />
          ) : (
            <Juego
              key={mesa.id}
              partida={partida}
              nivel={(edicion.niveles[mesa.nivel] ?? edicion.niveles.facil).nombre}
              ahora={horaVisible}
              despachar={despachar}
              ocupado={ocupado || esperandoJugada || relojAgotado}
              puedeResponder={puedeResponder}
              limiteRespuesta={120}
              puedeGestionar={anfitrion}
              puedeReanudar={invitadoPresente}
              onCancelar={anfitrion ? volver : undefined}
              w={w}
              idioma={edicion.idioma}
            />
          )}
        </>
      ) : anfitrion ? (
        <>
          <div className="plc-panel plc-inicio">
            <h2>{w.sala.espera}</h2>
            {invitado ? (
              <label className="plc-sub">{w.sala.segundoJugador}{' '}
                <select value={invitado.id} onChange={(e) => elegir(e.target.value)}>
                  {candidatos.map((p) => <option key={p.id} value={p.id}>{p.name ?? w.sala.invitado}</option>)}
                </select>
              </label>
            ) : (
              <p role="status">{w.sala.pideUnirse}</p>
            )}
          </div>
          <Inicio w={w} inicial={config} onEmpezar={(nueva) => empezar(nueva, invitado?.id)} bloqueado={!invitado || ocupado} />
        </>
      ) : (
        <div className="plc-panel plc-inicio">
          <Cabra animo={listo ? 'feliz' : 'atenta'} />
          <h2>{w.sala.espera}</h2>
          {puedeEscribir ? (
            <>
              {listo && <p role="status">{w.sala.enSala}</p>}
              <button type="button" className="plc-boton plc-boton-oro" disabled={ocupado} onClick={() => {
                desbloquear()
                void escribir({ type: 'set', key: `listo.${soy}`, value: !listo })
              }}>{listo ? w.sala.salir : w.sala.unirme}</button>
            </>
          ) : <p role="status">{w.sala.soloEspectador}</p>}
        </div>
      )}
    </div>
  )
}
