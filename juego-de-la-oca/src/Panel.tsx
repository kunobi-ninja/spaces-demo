import * as React from 'react'
import { arteComoImagen } from './arte'

/*
 * Las piezas de interfaz que se ponen sobre el tablero 3D: el panel de la partida, el turno, el
 * historial, la ventana de reglas, la de jugar con amigos y la de victoria. Las palabras, las fichas
 * (data/fichas.json), las casillas (data/tablero.json) y la escena llegan por OcaContext.
 */

type Words = Record<string, any>
export interface Ficha { id: string; simbolo: string; color: string; tinta: string }
export interface Especial { id: string; tipo: string; nombre: string; icono: string; casillas: number[]; regla?: string }
export interface Piece { position: number; skip: number; well: boolean }
export interface Throw { player: number; roll: number; position: number; rules: string[] }
export interface Game {
  pieces: Piece[]
  current: number
  winner: number | null
  roll: number | null
  message: string
  throws?: Throw[]
}
export interface Reglas {
  specials: Record<number, { id: string; name: string; icon: string; kind: string; chant?: string }>
  newGame: (count: number, options?: { trackThrows?: boolean }) => Game
  playTurn: (game: Game, roll: number) => Game
}
interface Oca {
  w: Words
  fichas: Ficha[]
  especiales: Especial[]
  reglas: Reglas
  /** La última partida que el tablero ha terminado de enseñar (las animaciones van por detrás). */
  mostrada: Game | null
  /** Pide al tablero que enseñe esta partida, o la demo con null. */
  ver: (game: Game | null) => void
  abrirAyuda: () => void
}

export const OcaContext = React.createContext<Oca | null>(null)
export function useOca(): Oca {
  const oca = React.useContext(OcaContext)
  if (!oca) throw new Error('OcaContext sin proveedor')
  return oca
}

/** Texto con **negritas**. */
export function ConNegritas({ texto }: { texto: string }) {
  return <>{texto.split('**').map((parte, i) => i % 2 ? <strong key={i}>{parte}</strong> : parte)}</>
}

export function Token({ index, grande = false }: { index: number; grande?: boolean }) {
  const { fichas } = useOca()
  const { color, simbolo, tinta } = fichas[index % fichas.length]
  return <span className={'oca-token' + (grande ? ' oca-token-grande' : '')}
    style={{ '--piece': color, '--piece-ink': tinta } as React.CSSProperties} aria-hidden="true">{simbolo}</span>
}

const PIPS: Record<number, number[]> = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
}

function DadoPlano({ valor, rodando, etiqueta }: { valor: number | null; rodando: boolean; etiqueta: string }) {
  const puntos = (valor && PIPS[valor]) || []
  return (
    <div className={'oca-die' + (rodando ? ' oca-rolling' : '')} role="img" aria-label={etiqueta}>
      {puntos.length ? puntos.map(p => (
        <span key={p} style={{ gridRow: Math.ceil(p / 3), gridColumn: (p - 1) % 3 + 1 }} />
      )) : <b>?</b>}
    </div>
  )
}

/** El panel de la derecha (abajo en el móvil): cabecera con Inicio y Reglas, y su contenido. */
export function Panel({ alInicio, children }: { alInicio: () => void; children: React.ReactNode }) {
  const { w, abrirAyuda } = useOca()
  return (
    <aside className="oca-panel oca-entra">
      <header className="oca-panel-cabeza">
        <span className="oca-marca" aria-hidden="true"><Ilustracion id="oca" icono="🪿" /></span>
        <strong>{w.title}</strong>
        <button type="button" className="oca-icono" onClick={abrirAyuda} aria-label={w.portada.how}>?</button>
        <button type="button" className="oca-icono" onClick={alInicio} aria-label={w.hud.home}>⌂</button>
      </header>
      {children}
    </aside>
  )
}

interface TurnPanelProps {
  game: Game
  busy?: boolean
  roll: () => void
  rollButton?: React.Ref<HTMLButtonElement>
  disabled?: boolean
  names?: string[]
  turnName?: string
  notice?: string
  hideRollButton?: boolean
  children?: React.ReactNode
}

export function TurnPanel({ game, busy, roll, rollButton, disabled, names, turnName, notice, hideRollButton, children }: TurnPanelProps) {
  const { w } = useOca()
  const finished = game.winner !== null
  const heading = turnName
    ? (finished ? w.winsName : w.turnOfName)({ name: turnName })
    : (finished ? w.winsPlayer : w.turnOfPlayer)({ n: (game.winner ?? game.current) + 1 })
  return (
    <section className="oca-turno" aria-label={w.gameLabel}>
      <div className="oca-turno-cabeza">
        <Token index={game.winner ?? game.current} grande />
        <h2>{heading}</h2>
      </div>
      {!finished && (
        <div className="oca-throw">
          <DadoPlano valor={busy ? null : game.roll} rodando={Boolean(busy)}
            etiqueta={game.roll ? w.dieValue({ n: game.roll }) : w.dieNone} />
          {!hideRollButton && <button ref={rollButton} type="button" className={'oca-boton oca-primario' + (disabled || busy ? '' : ' oca-latido')} onClick={roll}
            aria-disabled={busy || disabled} disabled={disabled}>{w.roll}</button>}
        </div>
      )}
      {notice && <p className="oca-aviso" role="status">{notice}</p>}
      <p className="oca-message" role="status" aria-atomic="true">
        {game.message}
        {!finished && <span className="oca-sr-only"> {heading}.</span>}
      </p>
      <ul className="oca-roster" aria-label={w.piecesLabel}>
        {game.pieces.map((piece, index) => (
          <li key={index} aria-current={!finished && index === game.current ? 'true' : undefined}>
            <Token index={index} />
            <span className="oca-name">{names?.[index] ?? w.player({ n: index + 1 })}</span>
            <span className="oca-location">
              {piece.position ? w.square({ n: piece.position }) : w.start}
              {piece.well ? ' · ' + w.inWell : piece.skip > 0 ? ' · ' + w.waits({ n: piece.skip }) : ''}
            </span>
          </li>
        ))}
      </ul>
      {children}
    </section>
  )
}

export function ThrowHistory({ throws, names }: { throws: Throw[]; names: string[] }) {
  const { w } = useOca()
  return (
    <details className="oca-history">
      <summary>
        <span>{w.history.title}</span>
        <span className="oca-history-count">{w.history.throws({ count: throws.length })}</span>
      </summary>
      {throws.length === 0 ? (
        <p className="oca-history-empty">{w.history.empty}</p>
      ) : (
        <ol className="oca-history-list" reversed start={throws.length} tabIndex={0} aria-label={w.history.order}>
          {throws.slice().reverse().map(({ player, roll, position, rules }, index) => (
            <li key={throws.length - index}>
              <div className="oca-history-entry">
                <span className="oca-history-player"><Token index={player} />{names[player]}</span>
                <span>{w.history.die} <b>{roll}</b></span>
                <span>{position === 0 ? w.history.startSquare : w.square({ n: position })}</span>
              </div>
              <p className="oca-history-rule">{rules.length ? rules.join(' ') : w.history.plain}</p>
            </li>
          ))}
        </ol>
      )}
    </details>
  )
}

/** La ilustración de una casilla como imagen, pintada una vez. */
const imagenes = new Map<string, string>()
function useArte(id: string, icono: string) {
  return React.useMemo(() => {
    if (!imagenes.has(id)) imagenes.set(id, arteComoImagen(id, icono))
    return imagenes.get(id)!
  }, [id, icono])
}

function Ilustracion({ id, icono }: { id: string; icono: string }) {
  const src = useArte(id, icono)
  return src ? <img src={src} alt="" /> : <span />
}

/** Una ventana sobre el tablero: centrada en escritorio, hoja inferior en el móvil. */
export function Ventana({ titulo, alCerrar, children, clase = '' }: { titulo: string; alCerrar?: () => void; children: React.ReactNode; clase?: string }) {
  const { w } = useOca()
  const cerrar = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    cerrar.current?.focus()
    if (!alCerrar) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [alCerrar])
  return (
    <div className="oca-velo" onClick={event => { if (event.target === event.currentTarget) alCerrar?.() }}>
      <section className={'oca-ventana ' + clase} role="dialog" aria-modal="true" aria-label={titulo}>
        {alCerrar && <button ref={cerrar} type="button" className="oca-icono oca-cerrar" onClick={alCerrar} aria-label={w.amigo.close}>×</button>}
        {children}
      </section>
    </div>
  )
}

export function Ayuda({ alCerrar }: { alCerrar: () => void }) {
  const { w, especiales } = useOca()
  return (
    <Ventana titulo={w.rules.title} alCerrar={alCerrar} clase="oca-ayuda">
      <h2>{w.rules.title}</h2>
      <ol className="oca-pasos">
        {(w.rules.steps as string[]).map((paso, i) => <li key={i}><span>{i + 1}</span><p>{paso}</p></li>)}
      </ol>
      <h3>{w.rules.squares}</h3>
      <ul className="oca-casillas">
        {especiales.filter(especial => especial.regla).map(especial => (
          <li key={especial.id}>
            <Ilustracion id={especial.id} icono={especial.icono} />
            <div><strong>{especial.nombre}</strong><p>{especial.regla}</p></div>
          </li>
        ))}
      </ul>
      <p className="oca-nota">{w.rules.outro}</p>
    </Ventana>
  )
}

export function HojaAmigo({ alJugarAqui, alCerrar }: { alJugarAqui: () => void; alCerrar: () => void }) {
  const { w } = useOca()
  return (
    <Ventana titulo={w.amigo.title} alCerrar={alCerrar} clase="oca-amigo">
      <div className="oca-amigo-arte" aria-hidden="true">
        <Ilustracion id="oca" icono="🪿" />
        <Ilustracion id="oca" icono="🪿" />
      </div>
      <h2>{w.amigo.title}</h2>
      <p><ConNegritas texto={w.amigo.text} /></p>
      <button type="button" className="oca-boton oca-primario oca-ancho" onClick={alJugarAqui}>{w.amigo.here}</button>
    </Ventana>
  )
}

const CONFETI = Array.from({ length: 42 }, (_, i) => i)

export function Victoria({ nombre, ganador, alOtra, alInicio }: { nombre: string; ganador: number; alOtra?: () => void; alInicio: () => void }) {
  const { w, fichas } = useOca()
  const colores = [fichas[ganador % fichas.length].color, '#f2b84b', '#f8ecd3', '#c0563a', '#6f9150']
  return (
    <div className="oca-velo oca-velo-victoria">
      <div className="oca-confeti" aria-hidden="true">
        {CONFETI.map(i => (
          <i key={i} style={{
            left: `${(i * 37) % 100}%`,
            background: colores[i % colores.length],
            animationDelay: `${(i % 7) * 0.18}s`,
            animationDuration: `${2.6 + (i % 5) * 0.35}s`,
            '--giro': `${(i % 2 ? 1 : -1) * (200 + i * 13)}deg`,
          } as React.CSSProperties} />
        ))}
      </div>
      <section className="oca-ventana oca-victoria" role="dialog" aria-modal="true" aria-label={w.victoria.title({ name: nombre })}>
        <Token index={ganador} grande />
        <h2>{w.victoria.title({ name: nombre })}</h2>
        <p>{w.victoria.sub}</p>
        <div className="oca-botones">
          {alOtra && <button type="button" className="oca-boton oca-primario" onClick={alOtra} autoFocus>{w.victoria.again}</button>}
          <button type="button" className="oca-boton oca-secundario" onClick={alInicio}>{w.victoria.home}</button>
        </div>
      </section>
    </div>
  )
}
