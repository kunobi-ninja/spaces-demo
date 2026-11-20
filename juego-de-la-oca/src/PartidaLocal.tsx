import * as React from 'react'
import { rollDie } from './dado.mjs'
import { Panel, ThrowHistory, TurnPanel, Victoria, useOca, type Game } from './Panel'

/*
 * De 2 a 4 jugadores en este dispositivo; cada asiento es una persona o la IA, que tira sola. La
 * partida avanza al instante y el tablero la anima por detrás: el panel enseña `mostrada`, la
 * última jugada que el tablero ya ha terminado de enseñar, y nadie tira mientras tanto.
 */

export interface Ajustes { count: number; automated: boolean[] }

export function PartidaLocal({ ajustes, alSalir }: { ajustes: Ajustes; alSalir: () => void }) {
  const { w, reglas, mostrada, ver } = useOca()
  const { count, automated } = ajustes
  const [game, setGame] = React.useState<Game>(() => reglas.newGame(count, { trackThrows: true }))
  const [paused, setPaused] = React.useState(false)
  const [confirm, setConfirm] = React.useState<null | 'reset' | 'home'>(null)
  const rollButton = React.useRef<HTMLButtonElement>(null)
  const keepPlayingButton = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => ver(game), [game, ver])

  const shown = mostrada ?? game
  const busy = shown !== game
  const finished = shown.winner !== null
  const seats = automated.slice(0, count)
  const allAI = seats.every(Boolean)
  const aiTurn = Boolean(automated[game.current])
  const names = seats.map((isAI, index) => (isAI ? w.ai : w.player)({ n: index + 1 }))

  const roll = React.useCallback(() => {
    setGame(previous => previous.winner === null ? reglas.playTurn(previous, rollDie()) : previous)
  }, [reglas])

  React.useEffect(() => {
    if (busy || !aiTurn || paused || confirm || game.winner !== null) return
    const timer = setTimeout(roll, 650)
    return () => clearTimeout(timer)
  }, [busy, aiTurn, paused, confirm, game, roll])

  React.useEffect(() => {
    if (!busy && !aiTurn && !finished) rollButton.current?.focus({ preventScroll: true })
  }, [busy, aiTurn, finished])

  React.useEffect(() => {
    if (confirm) keepPlayingButton.current?.focus()
  }, [confirm])

  function restart() {
    setConfirm(null)
    setPaused(false)
    setGame(reglas.newGame(count, { trackThrows: true }))
  }

  return (
    <>
      <Panel alInicio={() => (game.winner !== null || !game.throws?.length ? alSalir() : setConfirm('home'))}>
        <TurnPanel game={shown} busy={busy} roll={() => !busy && !aiTurn && roll()} rollButton={rollButton}
          disabled={aiTurn || busy || Boolean(confirm)} hideRollButton={allAI} names={names}
          turnName={seats.some(Boolean) ? names[shown.winner ?? shown.current] : undefined}
          notice={allAI && paused && !finished ? w.local.paused : undefined}>
          {confirm ? (
            <div className="oca-confirmar">
              <p>{confirm === 'home' ? w.local.confirmHome : w.local.confirmEnd}</p>
              <div className="oca-botones">
                <button type="button" className="oca-boton oca-secundario" onClick={confirm === 'home' ? alSalir : restart}>
                  {confirm === 'home' ? w.local.yesHome : w.local.yesNew}
                </button>
                <button type="button" className="oca-boton oca-fantasma" ref={keepPlayingButton} onClick={() => setConfirm(null)}>{w.keepPlaying}</button>
              </div>
            </div>
          ) : (
            <div className="oca-botones">
              {allAI && !finished && (
                <>
                  <button type="button" className="oca-boton oca-secundario" onClick={() => setPaused(!paused)}>
                    {paused ? w.local.resume : w.local.pause}
                  </button>
                  <button type="button" className="oca-boton oca-fantasma" disabled={!paused || busy} onClick={roll}>{w.local.step}</button>
                </>
              )}
              <button type="button" className="oca-boton oca-fantasma" onClick={() => (finished ? restart() : setConfirm('reset'))}>{w.newGame}</button>
            </div>
          )}
        </TurnPanel>
        <ThrowHistory throws={shown.throws ?? []} names={names} />
      </Panel>
      {shown.winner !== null && (
        <Victoria nombre={names[shown.winner]} ganador={shown.winner} alOtra={restart} alInicio={alSalir} />
      )}
    </>
  )
}
