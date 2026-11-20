// Pasalacabra para dos jugadores en un mismo dispositivo: inicio → juego → resultado.
// La lógica está en reglas.ts; aquí solo se pinta y se le pasa la hora real.
// Los textos (`w`) son las palabras de la página (WORDS en index.mdx) en el idioma de quien la lee.

import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent as TeclaReact } from 'react'
import {
  aplicar,
  crearPartida,
  preguntaActual,
  repartirPreguntas,
  resultado,
  tiempoDe,
  type Accion,
  type Evento,
  type Partida,
} from './reglas'
import { formatear, TIEMPO_POR_DEFECTO_MS } from './reloj'
import { Rueda } from './Rueda'
import type { NombreSonido } from './sintesis'
import { Sonidos } from './sonidos'
import { animoDe, Cabra } from './Cabra'
import { EDICIONES, IDIOMAS, type Idioma, type Nivel } from './ediciones'
import { Icono } from './Iconos'

/** Las palabras de la página, ya en el idioma de quien la lee (`useI18n(WORDS, …).w`). */
export type Palabras = Record<string, any>

const TIEMPOS = [90_000, TIEMPO_POR_DEFECTO_MS, 200_000]
const ahoraMs = () => performance.now()

/** Lo que se elige al empezar; `idioma` es el de las preguntas. */
export type Config = { nombres: [string, string]; tiempoMs: number; nivel: Nivel; idioma: Idioma }

export const configInicial = (idioma: Idioma): Config => ({ nombres: ['', ''], tiempoMs: TIEMPO_POR_DEFECTO_MS, nivel: 'facil', idioma })

export function nuevaPartida({ nombres, tiempoMs, nivel, idioma }: Config, ahora = ahoraMs()): Partida {
  const edicion = EDICIONES[idioma]
  const { banco } = edicion.niveles[nivel] ?? edicion.niveles.facil
  const preguntas = repartirPreguntas(banco, edicion.letras)
  const p = crearPartida({ nombres, preguntas, tiempoMs })
  return aplicar(p, { tipo: 'empezar' }, ahora)
}

/**
 * La partida en un mismo dispositivo: ajustes → juego → resultado. `idioma` es el de las preguntas
 * con que se abren los ajustes; `onSalir` vuelve a la portada.
 */
export function Pasalacabra({ w, idioma, onSalir }: { w: Palabras; idioma: Idioma; onSalir: () => void }) {
  const [partida, setPartida] = useState<Partida | null>(null)
  // Lo último que se eligió en los ajustes: sirve para la revancha y para no volver a escribir los nombres.
  const [config, setConfig] = useState<Config>(() => configInicial(idioma))
  const { niveles, corregir } = EDICIONES[config.idioma]
  const [ahora, setAhora] = useState(ahoraMs)
  const fase = partida?.fase

  // Mientras se juega, el reloj avanza con requestAnimationFrame y con la hora real.
  useEffect(() => {
    if (fase !== 'jugando') return
    let id = 0
    let ultimo = 0
    const bucle = (t: number) => {
      if (t - ultimo >= 100) {
        ultimo = t
        setAhora(t)
        setPartida((p) => (p ? aplicar(p, { tipo: 'tick' }, t) : p))
      }
      id = requestAnimationFrame(bucle)
    }
    id = requestAnimationFrame(bucle)
    return () => cancelAnimationFrame(id)
  }, [fase])

  const { botonSonido, desbloquear, reiniciarCuentaAtras } = useSonidosPartida(partida, ahora, w)

  // Las jugadas del jugador son gestos: desbloquean el audio antes de aplicarse.
  const jugar = useCallback((accion: Accion) => {
    desbloquear()
    setPartida((p) => (p ? aplicar(p, accion, ahoraMs(), corregir) : p))
  }, [corregir, desbloquear])

  const empezar = (nueva: Config) => {
    desbloquear()
    reiniciarCuentaAtras()
    setConfig(nueva)
    setPartida(nuevaPartida(nueva, ahoraMs()))
  }

  return (
    <div className="plc">
      <div className="plc-barra">
        {!partida && <BotonVolver w={w} onClick={onSalir} />}
        <span className="plc-barra-hueco" />
        {botonSonido}
      </div>
      {!partida ? (
        <Inicio w={w} inicial={config} onEmpezar={empezar} />
      ) : partida.fase === 'final' ? (
        <Final
          w={w}
          partida={partida}
          onRevancha={() => empezar(config)}
          onNueva={() => setPartida(null)}
        />
      ) : (
        <Juego w={w} partida={partida} ahora={ahora} nivel={(niveles[config.nivel] ?? niveles.facil).nombre} idioma={config.idioma} despachar={jugar} onCancelar={() => setPartida(null)} />
      )}
    </div>
  )
}

export function BotonVolver({ w, onClick }: { w: Palabras; onClick: () => void }) {
  return (
    <button type="button" className="plc-enlace" onClick={onClick}>
      <Icono nombre="volver" /> {w.volver}
    </button>
  )
}

export function useSonidosPartida(partida: Partida | null, ahora: number, w: Palabras) {
  const sonidos = useRef<Sonidos | null>(null)
  if (!sonidos.current) sonidos.current = new Sonidos()
  const [silencio, setSilencio] = useState(leerSilencio)
  sonidos.current.silencio = silencio
  useEffect(() => () => sonidos.current?.cerrar(), [])

  const cambiarSilencio = () => {
    sonidos.current?.desbloquear()
    setSilencio((s) => {
      guardarSilencio(!s)
      return !s
    })
  }

  // Cada jugada suena a lo suyo; el final de la partida, con un arpegio.
  const evento = partida?.ultimoEvento
  const final = partida?.fase === 'final'
  useEffect(() => {
    if (!evento) return
    const sonido = final ? 'fin' : SONIDO_DE_EVENTO[evento.tipo]
    if (sonido) sonidos.current?.tocar(sonido)
  }, [evento, final])

  // Cuenta atrás: un tic por segundo en los últimos 10 del jugador en turno.
  const ultimoTic = useRef('')
  useEffect(() => {
    if (!partida || partida.fase !== 'jugando') return
    const segundos = Math.ceil(tiempoDe(partida, partida.turno, ahora) / 1000)
    const clave = `${partida.turno}:${segundos}`
    if (segundos > 0 && segundos <= SEGUNDOS_CUENTA_ATRAS && ultimoTic.current !== clave) {
      ultimoTic.current = clave
      sonidos.current?.tocar('tic')
    }
  }, [partida, ahora])

  const desbloquear = useCallback(() => sonidos.current?.desbloquear(), [])
  return {
    desbloquear,
    reiniciarCuentaAtras: () => { ultimoTic.current = '' },
    botonSonido: (
      <button
        type="button"
        className="plc-boton plc-boton-cristal plc-redondo"
        onClick={cambiarSilencio}
        aria-pressed={silencio}
        aria-label={silencio ? w.silencio : w.sonido}
        title={silencio ? w.silencio : w.sonido}
      >
        <Icono nombre={silencio ? 'silencio' : 'sonido'} />
      </button>
    ),
  }
}

const SEGUNDOS_CUENTA_ATRAS = 10

const SONIDO_DE_EVENTO: Record<Evento['tipo'], NombreSonido | null> = {
  empieza: null,
  acierto: 'acierto',
  fallo: 'fallo',
  pasa: 'pasa',
  tiempo: 'tiempo',
  'rueda-completa': 'fin',
}

// La preferencia de sonido se recuerda en este dispositivo, si el navegador lo permite.
const CLAVE_SILENCIO = 'pasalacabra.silencio'

function leerSilencio(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_SILENCIO) === '1'
  } catch {
    return false
  }
}

function guardarSilencio(valor: boolean) {
  try {
    window.localStorage.setItem(CLAVE_SILENCIO, valor ? '1' : '0')
  } catch {
    // Sin almacenamiento, la preferencia dura lo que la página.
  }
}

// ─── Ajustes ─────────────────────────────────────────────────────────────────

/** Un solo paso antes de jugar: todo viene ya elegido y basta con pulsar «Empezar». */
export function Inicio({ w, inicial, onEmpezar, bloqueado = false }: {
  w: Palabras
  inicial: Config
  onEmpezar: (config: Config) => void
  bloqueado?: boolean
}) {
  const jugadorUno = `${w.jugador} 1`
  const jugadorDos = `${w.jugador} 2`
  const [uno, setUno] = useState(inicial.nombres[0] || jugadorUno)
  const [dos, setDos] = useState(inicial.nombres[1] || jugadorDos)
  const [tiempo, setTiempo] = useState(inicial.tiempoMs)
  const [idioma, setIdioma] = useState<Idioma>(inicial.idioma)
  const [nivelElegido, setNivel] = useState<Nivel>(inicial.nivel)
  const { niveles } = EDICIONES[idioma]
  /* Si el idioma no tiene el nivel elegido, se juega en el primero. */
  const nivel: Nivel = niveles[nivelElegido] ? nivelElegido : 'facil'
  // Sin <form>: el enlace web aísla la página en un marco que bloquea el envío de formularios.
  const empezar = () => {
    if (!bloqueado) onEmpezar({ nombres: [uno.trim() || jugadorUno, dos.trim() || jugadorDos], tiempoMs: tiempo, nivel, idioma })
  }
  const conIntro = (e: TeclaReact<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      empezar()
    }
  }
  const elegirTodo = (e: FocusEvent<HTMLInputElement>) => e.target.select()
  return (
    <div className="plc-panel plc-inicio">
      <h2>{w.ajustesTitulo}</h2>
      <div className="plc-nombres">
        <input aria-label={jugadorUno} value={uno} onChange={(e) => setUno(e.target.value)} onFocus={elegirTodo} maxLength={16} onKeyDown={conIntro} />
        <span className="plc-contra" aria-hidden="true">{w.contra}</span>
        <input aria-label={jugadorDos} value={dos} onChange={(e) => setDos(e.target.value)} onFocus={elegirTodo} maxLength={16} onKeyDown={conIntro} />
      </div>
      <div className="plc-opcion">
        <span className="plc-opcion-nombre">{w.tiempo}</span>
        <div className="plc-segmento" role="group" aria-label={w.tiempo}>
          {TIEMPOS.map((ms) => (
            <button type="button" key={ms} aria-pressed={ms === tiempo} onClick={() => setTiempo(ms)}>
              {formatear(ms)}
            </button>
          ))}
        </div>
      </div>
      <div className="plc-opcion">
        <span className="plc-opcion-nombre">{w.preguntas}</span>
        <div className="plc-segmento" role="group" aria-label={w.preguntas}>
          {Object.entries(niveles).map(([clave, { nombre }]) => (
            <button type="button" key={clave} aria-pressed={clave === nivel} onClick={() => setNivel(clave as Nivel)}>
              {nombre}
            </button>
          ))}
        </div>
      </div>
      <div className="plc-opcion">
        <span className="plc-opcion-nombre">{w.idiomaPreguntas}</span>
        <div className="plc-segmento" role="group" aria-label={w.idiomaPreguntas}>
          {IDIOMAS.map((clave) => (
            <button type="button" key={clave} lang={clave} aria-pressed={clave === idioma} onClick={() => setIdioma(clave)}>
              {EDICIONES[clave].nombre}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="plc-boton plc-boton-oro plc-boton-grande" disabled={bloqueado} onClick={empezar} autoFocus>
        <Icono nombre="jugar" /> {w.empezar}
      </button>
      <p className="plc-ayuda">
        <kbd>{w.introTecla}</kbd> {w.atajoResponder} · <kbd>Esc</kbd> {w.atajoPasar}
      </p>
    </div>
  )
}

// ─── Juego ───────────────────────────────────────────────────────────────────

type PropsJuego = {
  partida: Partida
  ahora: number
  nivel: string
  despachar: (a: Accion) => void
  onCancelar?: () => void
  puedeResponder?: boolean
  puedeGestionar?: boolean
  puedeReanudar?: boolean
  ocupado?: boolean
  limiteRespuesta?: number
  w: Palabras
  /** El idioma de las preguntas, para el campo de respuesta. */
  idioma: Idioma
}

export function Juego({
  partida, ahora, nivel, despachar, onCancelar, puedeResponder = true, puedeGestionar = true, puedeReanudar = true, ocupado = false, limiteRespuesta, w, idioma,
}: PropsJuego) {
  const [texto, setTexto] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const enPausa = partida.fase === 'pausa'
  const entrada = useRef<HTMLInputElement>(null)
  const pregunta = puedeResponder ? preguntaActual(partida) : null
  const turno = partida.turno
  const jugador = partida.jugadores[turno]

  // Tras cada jugada, el campo se vacía y vuelve a tener el foco.
  useEffect(() => {
    setTexto('')
    entrada.current?.focus()
  }, [partida.ultimoEvento])

  // Al volver de la pausa, el foco vuelve al campo de respuesta.
  useEffect(() => {
    if (!enPausa) entrada.current?.focus()
  }, [enPausa, puedeResponder])

  // Cancelar primero pausa la partida y pide confirmación.
  const pedirCancelar = () => {
    despachar({ tipo: 'pausar' })
    setConfirmando(true)
  }
  const seguir = () => {
    setConfirmando(false)
    despachar({ tipo: 'reanudar' })
  }

  // Esc pasa la cabra desde cualquier parte de la página.
  useEffect(() => {
    if (!puedeResponder || enPausa || ocupado) return
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !e.repeat) {
        e.preventDefault()
        despachar({ tipo: 'pasar' })
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [despachar, enPausa, ocupado, puedeResponder])

  const responder = () => {
    if (!ocupado && puedeResponder && texto.trim()) despachar({ tipo: 'responder', texto })
  }

  const aviso = mensaje(partida, w)
  // La cabra reacciona a cada jugada; `vez` vuelve a lanzar su animación aunque se repita el ánimo.
  const vez = useVez(partida.ultimoEvento)

  return (
    <div className="plc-juego">
      <div className="plc-ruedas">
        <Rueda jugador={partida.jugadores[0]} restanteMs={tiempoDe(partida, 0, ahora)} activa={turno === 0} enJuego asiento={0} w={w} />
        <Cabra animo={animoDe(partida.ultimoEvento)} vez={vez} bocadillo={w.pasa} />
        <Rueda jugador={partida.jugadores[1]} restanteMs={tiempoDe(partida, 1, ahora)} activa={turno === 1} enJuego asiento={1} w={w} />
      </div>

      {enPausa ? (
        <div className="plc-panel plc-pregunta plc-pausa" role="dialog" aria-label={confirmando ? w.cancelarTitulo : w.pausaTitulo}>
          {confirmando ? (
            <>
              <h3>{w.cancelarTitulo}</h3>
              <p className="plc-sub">{w.cancelarAviso}</p>
              <div className="plc-fila plc-centrada">
                <button type="button" className="plc-boton plc-boton-peligro" disabled={ocupado} onClick={onCancelar}>
                  {w.cancelarSi}
                </button>
                <button type="button" className="plc-boton plc-boton-cristal" onClick={() => setConfirmando(false)} autoFocus>
                  {w.no}
                </button>
              </div>
            </>
          ) : (
            <>
              <h3>{w.pausaTitulo}</h3>
              <p className="plc-sub">{w.pausaAviso({ nombre: jugador.nombre })}</p>
              {puedeGestionar && <div className="plc-fila plc-centrada">
                <button type="button" className="plc-boton plc-boton-oro" disabled={ocupado || !puedeReanudar} onClick={seguir} autoFocus>
                  <Icono nombre="jugar" /> {w.seguir}
                </button>
                <button type="button" className="plc-boton plc-boton-cristal" onClick={() => setConfirmando(true)}>
                  {w.cancelarPartida}
                </button>
              </div>}
            </>
          )}
        </div>
      ) : (
      <div className="plc-panel plc-pregunta">
        <div className="plc-cabecera">
          <div className="plc-turno">
            {w.turno} <strong>{jugador.nombre}</strong> · {w.nivel} {nivel}
          </div>
          {puedeGestionar && <div className="plc-controles">
            <button type="button" className="plc-boton plc-boton-cristal plc-redondo" disabled={ocupado} onClick={() => despachar({ tipo: 'pausar' })} aria-label={w.pausa} title={w.pausa}>
              <Icono nombre="pausa" />
            </button>
            <button type="button" className="plc-boton plc-boton-cristal plc-redondo" disabled={ocupado} onClick={pedirCancelar} aria-label={w.cancelar} title={w.cancelar}>
              <Icono nombre="cerrar" />
            </button>
          </div>}
        </div>
        {pregunta && (
          <div className="plc-pregunta-cuerpo" lang={idioma}>
            <span className="plc-letra-grande">{pregunta.letra}</span>
            <div className="plc-pista-tipo">{pregunta.tipo === 'empieza' ? w.empieza : w.contiene} {pregunta.letra}</div>
            <p className="plc-pista">{pregunta.pista}</p>
          </div>
        )}
        {puedeResponder ? <div className="plc-respuesta">
          <input
            ref={entrada}
            readOnly={ocupado}
            maxLength={limiteRespuesta}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={`${w.respuesta}…`}
            aria-label={w.respuesta}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            lang={idioma}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                responder()
              }
            }}
          />
          <button type="button" className="plc-boton plc-boton-oro" disabled={ocupado || !texto.trim()} onClick={responder}>
            {w.responder}
          </button>
          <button type="button" className="plc-boton plc-pasa" disabled={ocupado} onClick={() => despachar({ tipo: 'pasar' })}>
            {w.pasa}
          </button>
        </div> : <p className="plc-sub">{w.espera}</p>}
        <div className={`plc-aviso plc-aviso-${aviso?.tono ?? 'info'}`} role="status" aria-live="polite">
          {aviso?.texto ?? ' '}
        </div>
      </div>
      )}
    </div>
  )
}

/** Cuenta cada cambio de `valor`, para volver a lanzar una animación. */
export function useVez(valor: unknown): number {
  const [vez, setVez] = useState(0)
  const primero = useRef(true)
  useEffect(() => {
    if (primero.current) {
      primero.current = false
      return
    }
    setVez((n) => n + 1)
  }, [valor])
  return vez
}

function mensaje(p: Partida, w: Palabras): { texto: string; tono: 'bien' | 'mal' | 'info' } | null {
  const ev = p.ultimoEvento
  if (!ev) return null
  const nombre = p.jugadores[ev.jugador].nombre
  const cambio = p.fase === 'jugando' && ev.jugador !== p.turno ? ` ${w.turno} ${p.jugadores[p.turno].nombre}.` : ''
  switch (ev.tipo) {
    case 'empieza':
      return { texto: w.avisoEmpieza({ nombre }), tono: 'info' }
    case 'acierto':
      return { texto: w.avisoAcierto({ letra: ev.letra }), tono: 'bien' }
    case 'fallo': {
      const correcta = p.jugadores[ev.jugador].preguntas.find((q) => q.letra === ev.letra)?.respuestas[0]
      return { texto: `${w.avisoFallo({ letra: ev.letra, correcta: correcta ?? '' })}${cambio}`, tono: 'mal' }
    }
    case 'pasa':
      return { texto: `${w.pasa}${cambio || ` ${w.avisoSigue({ nombre })}`}`, tono: 'info' }
    case 'tiempo':
      return { texto: `${w.avisoTiempo({ nombre })}${cambio}`, tono: 'mal' }
    case 'rueda-completa':
      return { texto: `${w.avisoRueda({ nombre })}${cambio}`, tono: 'bien' }
  }
}

// ─── Resultado ───────────────────────────────────────────────────────────────

const COLORES_CONFETI = ['#ffc145', '#ff9f43', '#39d7c6', '#34d892', '#ff8fc8', '#fff4e3']

export function Final({ w, partida, onRevancha, onNueva, ocupado = false, puedeRevancha = true }: {
  w: Palabras
  partida: Partida
  onRevancha?: () => void
  onNueva?: () => void
  ocupado?: boolean
  puedeRevancha?: boolean
}) {
  const r = resultado(partida)
  const titulo = r.ganador === null ? w.empate : w.gana({ nombre: partida.jugadores[r.ganador].nombre })
  // Confeti fijo (sin azar en cada render): posiciones y retrasos repartidos a mano.
  const confeti = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    background: COLORES_CONFETI[i % COLORES_CONFETI.length],
    animationDelay: `${(i * 0.13) % 1.6}s`,
  })), [])
  return (
    <div className="plc-final">
      <div className="plc-panel plc-veredicto">
        <div className="plc-confeti" aria-hidden="true">{confeti.map((estilo, i) => <i key={i} style={estilo} />)}</div>
        <Cabra animo="feliz" />
        <h2>{titulo}</h2>
        <p className="plc-sub">{w.motivos[r.motivo]}</p>
        {onRevancha && onNueva && <div className="plc-fila plc-centrada">
          <button type="button" className="plc-boton plc-boton-oro" disabled={ocupado || !puedeRevancha} onClick={onRevancha} autoFocus>
            {w.revancha}
          </button>
          <button type="button" className="plc-boton plc-boton-cristal" disabled={ocupado} onClick={onNueva}>
            {w.cambiar}
          </button>
        </div>}
      </div>
      <div className="plc-ruedas">
        <Rueda jugador={partida.jugadores[0]} restanteMs={partida.jugadores[0].tiempoRestanteMs} activa={r.ganador === 0} enJuego={false} asiento={0} w={w} />
        <span />
        <Rueda jugador={partida.jugadores[1]} restanteMs={partida.jugadores[1].tiempoRestanteMs} activa={r.ganador === 1} enJuego={false} asiento={1} w={w} />
      </div>
      <div className="plc-repaso">
        {partida.jugadores.map((j, i) => (
          <details key={i} className="plc-panel">
            <summary>{w.repaso} {j.nombre}</summary>
            <table>
              <tbody>
                {j.preguntas.map((q, k) => (
                  <tr key={q.letra} className={`plc-fila-${j.estados[k]}`}>
                    <td className="plc-t-letra">{q.letra}</td>
                    <td>{q.pista}</td>
                    <td>
                      {j.estados[k] === 'acierto' ? <Icono nombre="bien" /> : j.estados[k] === 'fallo' ? <Icono nombre="mal" /> : '—'} {j.respuestas[k] ?? ''}
                    </td>
                    <td>
                      <strong>{q.respuestas[0]}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </div>
    </div>
  )
}
