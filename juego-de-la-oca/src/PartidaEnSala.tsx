import * as React from 'react'
import * as kunobi from 'kunobi'
import { rollDie } from './dado.js'
import { Panel, Token, TurnPanel, Victoria, useOca, type Game } from './Panel'

/*
 * Partida entre dispositivos en la sala `oca`. El anfitrión escribe la partida (`match`); cada
 * jugador solo escribe su propia petición (`players.<id>`): unirse a la sala o pedir su tirada.
 * El anfitrión tira el dado por quien lo pide y publica el nuevo estado, así nadie elige su número.
 */

export const ROOM = 'oca'
const MAX_PLAYERS = 4

interface Match { id: string; host: string; game: Game | null; seats?: string[]; move?: number }
interface Request { lobby?: string; joined?: boolean; roll?: number }
interface Person { id: string; name?: string; self: boolean; role: string }
interface Room {
  status: string
  state?: Record<string, any>
  revision?: number
  canEdit?: boolean
  refusal?: { status?: string }
  actor?: { id: string }
  participants?: Person[]
  apply?: (op: unknown, options?: { baseRevision?: number }) => Promise<{ status: string; revision?: number }>
}

const K = kunobi as Record<string, any>
export const useRoom: (name: string) => Room = typeof K.useSession === 'function'
  ? K.useSession
  : () => ({ status: 'refused', refusal: { status: 'unsupported' } })

function roomSeats(state: Record<string, any>, match: Match, online: Map<string, Person>) {
  const prefix = 'players.'
  const guests = Object.entries(state)
    .filter(([key, request]) => key.startsWith(prefix) && request?.lobby === match.id && request.joined)
    .map(([key]) => key.slice(prefix.length))
    .filter(id => id !== match.host && online.has(id) && online.get(id)!.role !== 'reader')
  return [match.host, ...guests.slice(0, MAX_PLAYERS - 1)]
}

function requestedTurn(state: Record<string, any>, match: Match | undefined) {
  if (!match?.game || match.game.winner !== null || !match.seats) return null
  const current = match.seats[match.game.current]
  const request: Request | undefined = state['players.' + current]
  return request?.lobby === match.id && request.roll === match.move ? current : null
}

export function PartidaEnSala({ alSalir }: { alSalir: () => void }) {
  const { w, reglas, mostrada, ver } = useOca()
  const s = w.room
  const room = useRoom(ROOM)
  const state = room.state ?? {}
  const match: Match | undefined = state.match
  const actor = room.actor?.id
  const connected = room.status === 'open'
  const people = room.participants ?? []
  const online = new Map(people.map(person => [person.id, person]))
  const self = actor ? online.get(actor) : undefined
  const canPlay = Boolean(connected && actor && (room.canEdit ?? (self?.role !== 'reader')))
  const isHost = Boolean(actor && match?.host === actor)
  const lobby = Boolean(match && !match.game)
  const seats = match && lobby ? roomSeats(state, match, online) : match?.seats ?? []
  const seat = actor ? seats.indexOf(actor) : -1
  const game = match?.game ?? null
  React.useEffect(() => ver(game), [game, ver])
  const shown = game && mostrada ? mostrada : game
  const animating = Boolean(game && shown && JSON.stringify(shown) !== JSON.stringify(game))
  const ownRequest: Request | null = actor ? state['players.' + actor] : null
  const pendingRoll = seat >= 0 && requestedTurn(state, match) === actor
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [hostError, setHostError] = React.useState('')
  const [retry, setRetry] = React.useState(0)
  const [resetId, setResetId] = React.useState<string | null>(null)
  const lastWrite = React.useRef<number | null>(null)
  const writeInProgress = React.useRef(false)
  const settling = connected && lastWrite.current !== null && (room.revision ?? 0) < lastWrite.current
  const confirmReset = Boolean(game && match?.id === resetId)
  const canRoll = Boolean(canPlay && seat >= 0 && game?.current === seat && match && online.has(match.host) && !animating)

  React.useEffect(() => {
    if (!connected) lastWrite.current = null
  }, [connected])

  async function write(key: string, value: unknown) {
    if (!canPlay || writeInProgress.current || settling || !room.apply) return
    writeInProgress.current = true
    setBusy(true)
    setError('')
    try {
      const result = await room.apply({ type: 'set', key, value }, { baseRevision: room.revision })
      if (result.status === 'applied') {
        lastWrite.current = result.revision ?? null
      } else if (result.status !== 'duplicate') {
        setError(result.status === 'denied' && key === 'match' && !match
          ? s.onlyOwner
          : s.errors[result.status] ?? s.saveFailed)
      }
    } catch {
      setError(s.errors.unavailable)
    } finally {
      writeInProgress.current = false
      setBusy(false)
    }
  }

  const activeRequest = requestedTurn(state, match)
  const apply = room.apply
  const revision = room.revision

  React.useEffect(() => {
    if (!connected || !isHost || !activeRequest || !match?.game || !apply) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const next = { ...match, move: (match.move ?? 0) + 1, game: reglas.playTurn(match.game, rollDie()) }

    async function resolveTurn() {
      let status
      try {
        status = (await apply!({ type: 'set', key: 'match', value: next }, { baseRevision: revision })).status
      } catch {
        status = 'unavailable'
      }
      if (disposed) return
      if (status === 'applied' || status === 'duplicate' || status === 'stale') {
        setHostError('')
      } else {
        setHostError(s.errors[status] ?? s.resolveFailed)
        if (status === 'unavailable' || status === 'over_budget') {
          timer = setTimeout(() => setRetry(value => value + 1), 1000)
        }
      }
    }

    resolveTurn()
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [apply, connected, isHost, activeRequest, match, revision, retry, reglas, s])

  function createLobby() {
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
    write('match', { id, host: actor, game: null })
  }

  function joinLobby(joined: boolean) {
    if (!match || !lobby || joined && seats.length >= MAX_PLAYERS) return
    write('players.' + actor, { lobby: match.id, joined })
  }

  function startShared() {
    if (!match || !isHost || !lobby || seats.length < 2) return
    write('match', { ...match, seats, move: 0, game: reglas.newGame(seats.length) })
  }

  function rollShared() {
    if (!match || !game || !canRoll || pendingRoll || confirmReset || game.winner !== null) return
    write('players.' + actor, { lobby: match.id, roll: match.move })
  }

  const waiting = busy || settling
  const displayNames = seats.map((id, index) => {
    const name = online.get(id)?.name || w.player({ n: index + 1 })
    return id === actor ? w.you({ name }) : name
  })
  const statusMessage: string = (room.status === 'refused' && room.refusal?.status === 'unsupported'
    ? s.status.unsupported
    : s.status[room.status]) ?? ''
  const notice = statusMessage || (game && match && !online.has(match.host)
    ? s.hostAway
    : game && seat < 0
      ? s.spectator
      : game && game.winner === null && !online.has(seats[game.current])
        ? s.waitingTurn
        : '')
  const currentError = error || (activeRequest && hostError)

  return (
    <>
      <Panel alInicio={alSalir}>
        {game && shown && match ? (
          <TurnPanel game={shown} names={displayNames} roll={rollShared} notice={notice}
            busy={animating || pendingRoll || Boolean(busy && canRoll)}
            disabled={!canRoll || confirmReset || settling}>
            {currentError && <p className="oca-error" role="alert">{currentError}</p>}
            {isHost && <div className="oca-botones">
              {confirmReset ? (
                <div className="oca-confirmar">
                  <p>{s.confirmEndAll}</p>
                  <div className="oca-botones">
                    <button type="button" className="oca-boton oca-secundario" disabled={waiting || !connected} onClick={createLobby}>{s.yesNewRoom}</button>
                    <button type="button" className="oca-boton oca-fantasma" onClick={() => setResetId(null)}>{w.keepPlaying}</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="oca-boton oca-fantasma" disabled={waiting || !connected} onClick={() => {
                  if (game.winner !== null) createLobby()
                  else setResetId(match.id)
                }}>{w.newGame}</button>
              )}
            </div>}
          </TurnPanel>
        ) : (
          <section className="oca-sala" aria-label={s.title}>
            <p className="oca-kicker">{s.kicker}</p>
            <h2>{s.title}</h2>
            <p className="oca-aviso" role="status">{statusMessage || (lobby
              ? s.inRoom({ n: seats.length, max: MAX_PLAYERS })
              : s.howToJoin)}</p>
            {lobby && <ul className="oca-roster oca-asientos" aria-label={s.enrolled}>
              {Array.from({ length: MAX_PLAYERS }, (_, index) => (
                <li key={seats[index] ?? 'libre' + index} data-libre={seats[index] ? undefined : 'true'}>
                  <Token index={index} />
                  <span className="oca-name">{displayNames[index] ?? s.freeSeat}</span>
                  {index === 0 && <span className="oca-location">{s.host}</span>}
                </li>
              ))}
            </ul>}
            {canPlay && (!lobby ? (
              <button type="button" className="oca-boton oca-primario oca-ancho" disabled={waiting} onClick={createLobby}>{s.create}</button>
            ) : isHost ? (
              <>
                <button type="button" className="oca-boton oca-primario oca-ancho" disabled={waiting || seats.length < 2}
                  onClick={startShared}>{w.startGame}</button>
                <p className="oca-aviso">{seats.length < 2 ? s.waitingOther : s.keepOpen}</p>
              </>
            ) : (
              <button type="button" className="oca-boton oca-primario oca-ancho" disabled={waiting || seat < 0 && seats.length >= MAX_PLAYERS}
                onClick={() => joinLobby(!(ownRequest?.lobby === match?.id && ownRequest?.joined))}>
                {seat >= 0 ? s.leave : seats.length >= MAX_PLAYERS ? s.full : s.join}
              </button>
            ))}
            {connected && self?.role === 'reader' && <p className="oca-aviso">{s.readerOnly}</p>}
            {error && <p className="oca-error" role="alert">{error}</p>}
          </section>
        )}
      </Panel>
      {shown && shown.winner !== null && match && (
        <Victoria nombre={displayNames[shown.winner] ?? w.player({ n: shown.winner + 1 })} ganador={shown.winner}
          alOtra={isHost ? createLobby : undefined} alInicio={alSalir} />
      )}
    </>
  )
}
