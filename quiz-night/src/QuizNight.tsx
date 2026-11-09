import * as React from 'react'
import * as kunobi from 'kunobi'
import { Backdrop, Confetti, type Mood } from './backdrop'
import { createSfx } from './sound'
import * as game from './game'
import type { Answer, Quiz, Scores, Stage } from './game'

/*
 * A quiz night for a room: the host's screen shows each question, every player answers once from
 * their own window or a shared link. The round lives in a room (`quiz-night-round`); the points
 * that should last go into the `quiz-night-scores` store.
 */

const INK = '#06213f'
const TILES = [
  { color: '#f3aa08', shape: 'triangle' },
  { color: '#5bcbf9', shape: 'diamond' },
  { color: '#30ccd5', shape: 'circle' },
  { color: '#ff7a59', shape: 'square' },
]
const LETTERS = ['A', 'B', 'C', 'D']

type Words = Record<string, any>

/* Shared state, where this build has it. Builds and previews without it read the saved scores. */
interface Room {
  status: string
  state?: Record<string, unknown>
  revision?: number
  canEdit?: boolean
  actor?: { kind: string; id: string }
  participants?: { id: string; name?: string; self: boolean; role: string }[]
  apply?: (op: unknown, options?: { baseRevision?: number }) => Promise<{ status: string }>
}
interface StoreStatus {
  status: string
  canEdit: boolean
  saved: boolean
}
const K = kunobi as Record<string, any>
const useRoom: (name: string) => Room = typeof K.useSession === 'function' ? K.useSession : () => ({ status: 'refused' })
const useScores: (name: string) => Scores | undefined = typeof K.useStore === 'function' ? K.useStore : () => undefined
const useScoresStatus: (name: string) => StoreStatus =
  typeof K.useStoreStatus === 'function' ? K.useStoreStatus : () => ({ status: 'refused', canEdit: false, saved: true })
const editScores = (change: (draft: Scores) => void) => (typeof K.edit === 'function' ? K.edit(game.STORE, change) : undefined)


const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''))

function Shape({ shape, size = 22 }: { shape: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      {shape === 'triangle' && <path d="M14 3 L26 24 L2 24 Z" />}
      {shape === 'diamond' && <path d="M14 1 L27 14 L14 27 L1 14 Z" />}
      {shape === 'circle' && <circle cx="14" cy="14" r="12" />}
      {shape === 'square' && <rect x="3" y="3" width="22" height="22" rx="3" />}
    </svg>
  )
}

function Avatar({ name, color, size = 34 }: { name: string; color: string; size?: number }) {
  return (
    <span className="qn-avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.42 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function useCountUp(to: number, from: number) {
  const [v, setV] = React.useState(from)
  React.useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 1100)
      setV(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 4))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, from])
  return v
}

function Count({ to, from = 0 }: { to: number; from?: number }) {
  return <>{useCountUp(to, from).toLocaleString('en-US')}</>
}

function TimerRing({ left, limit }: { left: number; limit: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const k = Math.max(0, left / limit)
  const urgent = left <= 5
  return (
    <div className={`qn-timer${urgent ? ' urgent' : ''}`} aria-label={`${Math.ceil(left)} s`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="track" />
        <circle cx="32" cy="32" r={r} className="arc" strokeDasharray={c} strokeDashoffset={c * (1 - k)} />
      </svg>
      <span>{Math.ceil(left)}</span>
    </div>
  )
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function QuizNight({ quiz, saved, words }: { quiz: Quiz; saved: Scores; words: Record<string, Words> }) {
  const w = React.useMemo(() => {
    const tag = (typeof navigator !== 'undefined' && navigator.language) || 'en'
    return words[tag.toLowerCase().split('-')[0]] ?? words.en
  }, [words])

  // The lasting scores: the store while it is open, otherwise the last saved copy.
  const stored = useScores(game.STORE)
  const store = useScoresStatus(game.STORE)
  const keeping = store.status === 'open' && !!stored
  const scores: Scores = keeping ? stored! : saved
  const tonight = scores.tonight ?? {}
  const total = scores.total ?? {}

  // The live round.
  const room = useRoom(game.ROOM)
  const live = room.status === 'open'
  const st = (live && room.state ? room.state : {}) as Record<string, any>
  const me = live ? room.actor?.id : undefined
  const canAct = live && room.canEdit !== false && !!me
  const stage: Stage = live && st.stage ? st.stage : game.lobby()
  const host = !!me && st.quizmaster === me
  const players = game.playersIn(quiz, st)
  const mine = players.find((p) => p.id === me)
  const selfName = room.participants?.find((p) => p.self)?.name
  const here = room.participants ? new Set(room.participants.map((p) => p.id)) : null
  const answerOf = (id: string) => st[game.answerKey(quiz, stage, id)] as Answer | undefined
  const teamOf = (id: string) => quiz.teams.find((t) => t.id === id) ?? quiz.teams[0]

  const [clock, setClock] = React.useState({ id: '', at: 0 })
  const [muted, setMuted] = React.useState(false)
  const [burst, setBurst] = React.useState(0)
  const [name, setName] = React.useState('')
  const [nudge, setNudge] = React.useState(0)
  const busy = React.useRef(false)
  const claimed = React.useRef(false)
  const sfx = React.useMemo(() => createSfx(), [])
  const mood = React.useRef<Mood>({ tint: quiz.rounds[0].color, energy: 0, pulse: 0 })
  const pointer = React.useRef({ x: 0, y: 0 })
  const stage$ = React.useRef<HTMLDivElement>(null)

  const round = quiz.rounds[stage.round] ?? quiz.rounds[0]
  const q = game.current(quiz, stage)
  const limit = game.secondsFor(quiz, q)
  const count = game.totalQuestions(quiz)
  const number = game.questionNumber(quiz, stage)
  const qId = `${stage.game}.${number}`
  const elapsed = clock.id === qId ? clock.at : 0
  const timeUp = stage.phase === 'question' && clock.id === qId && clock.at >= limit
  const myAnswer = me ? answerOf(me) : undefined
  const canAnswer = canAct && !!mine && stage.phase === 'question' && !myAnswer && !timeUp
  const playing = here ? players.filter((p) => here.has(p.id)) : players
  const allIn = playing.length > 0 && playing.every((p) => answerOf(p.id))

  React.useEffect(() => () => sfx.dispose(), [sfx])

  // The host of the room (the Space owner) says so once, so every window knows who moves the quiz on.
  React.useEffect(() => {
    if (!canAct || claimed.current || st.quizmaster === me) return
    claimed.current = true
    void room.apply?.({ type: 'set', key: 'quizmaster', value: me })
  }, [canAct, me, st.quizmaster]) // eslint-disable-line react-hooks/exhaustive-deps

  /** The host moves the quiz on, only from the state it saw: two host windows never both move it. */
  const move = (to: Stage, after?: () => void) => {
    if (!host || busy.current || !room.apply) return
    busy.current = true
    room
      .apply({ type: 'set', key: 'stage', value: to }, { baseRevision: room.revision })
      .then((r) => {
        if (r.status === 'applied') after?.()
        else if (r.status === 'stale') setNudge((n) => n + 1)
      })
      .finally(() => {
        busy.current = false
      })
  }
  const keep = (change: (d: Scores) => void) => {
    if (store.status === 'open' && store.canEdit) void editScores(change)
  }
  const reveal = () => {
    const { gained, fastest } = game.score(quiz, stage, players, answerOf)
    move({ ...stage, phase: 'reveal', gained, ...(fastest ? { fastest } : {}) }, () =>
      keep((d) => {
        for (const [team, n] of Object.entries(gained)) {
          if (!n) continue
          d.tonight[team] = (d.tonight[team] ?? 0) + n
          d.total[team] = (d.total[team] ?? 0) + n
        }
      }),
    )
  }
  const go = () => {
    sfx.unlock()
    if (!host) return
    if (stage.phase === 'question') return reveal()
    const to = game.next(quiz, stage, tonight)
    if (stage.phase === 'lobby')
      return move(to, () =>
        keep((d) => {
          for (const t of quiz.teams) d.tonight[t.id] = 0
        }),
      )
    if (to.phase === 'final')
      return move(to, () =>
        keep((d) => {
          const top = game.ranking(quiz, d.tonight)[0]
          const date = today()
          let id = date
          for (let n = 2; d.nights[id]; n++) id = `${date}-${n}`
          d.nights[id] = { date, winner: top.id, points: d.tonight[top.id] ?? 0 }
        }),
      )
    move(to)
  }
  const join = (team: string) => {
    if (!canAct) return
    sfx.unlock()
    sfx.play('select')
    void room.apply?.({ type: 'set', key: `team.${me}`, value: { team, name: (name.trim() || mine?.name || selfName || w.guest).slice(0, 24) } })
  }
  const pick = (option: number) => {
    if (!canAnswer || !me) return
    sfx.unlock()
    sfx.play('select')
    void room.apply?.({ type: 'set', key: game.answerKey(quiz, stage, me), value: { option, at: Math.round(elapsed * 10) / 10 } })
  }

  // Mood of the backdrop and music for each step.
  React.useEffect(() => {
    mood.current.tint = round.color
    mood.current.energy = stage.phase === 'question' ? 0.45 : stage.phase === 'final' ? 0.3 : 0.1
    if (stage.phase === 'question') sfx.music(true, 112)
    else sfx.music(false)
    if (stage.phase === 'round') sfx.play('whoosh')
    if (stage.phase === 'question') sfx.play('go')
    if (stage.phase === 'reveal') {
      mood.current.pulse = 1
      sfx.play(Object.values(stage.gained ?? {}).some((g) => g > 0) ? 'correct' : 'wrong')
    }
    if (stage.phase === 'final') {
      setBurst((b) => b + 1)
      sfx.play('fanfare')
    }
  }, [stage.phase, stage.round, stage.question, stage.game]) // eslint-disable-line react-hooks/exhaustive-deps

  // The question clock, from when this window saw the question.
  React.useEffect(() => {
    if (stage.phase !== 'question') return
    const t0 = performance.now()
    let raf = 0
    let lastTick = limit
    const tick = (now: number) => {
      const at = Math.min(limit, (now - t0) / 1000)
      setClock({ id: qId, at })
      const left = Math.ceil(limit - at)
      if (left <= 5 && left < lastTick && left > 0) sfx.play('tick')
      lastTick = left
      if (at < limit) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // A window in the background draws no frames: the deadline still ends the question.
    const end = setTimeout(() => setClock({ id: qId, at: limit }), limit * 1000)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(end)
    }
  }, [stage.phase, qId]) // eslint-disable-line react-hooks/exhaustive-deps

  // The host reveals when time is up, or a breath after everyone here has answered.
  React.useEffect(() => {
    if (!host || stage.phase !== 'question' || !(timeUp || allIn)) return
    const t = setTimeout(reveal, timeUp ? 0 : 700)
    return () => clearTimeout(t)
  }, [host, stage.phase, timeUp, allIn, room.revision, nudge]) // eslint-disable-line react-hooks/exhaustive-deps

  // Round title cards move on by themselves.
  React.useEffect(() => {
    if (!host || stage.phase !== 'round') return
    const t = setTimeout(() => move(game.next(quiz, stage, tonight)), 3200)
    return () => clearTimeout(t)
  }, [host, stage.phase, stage.round, stage.game, nudge]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const k = e.key.toLowerCase()
      if (k === 'm') {
        sfx.setMuted(!muted)
        setMuted(!muted)
        return
      }
      if (stage.phase === 'question') {
        const option = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k)
        if (option >= 0 && canAnswer) {
          e.preventDefault()
          pick(option)
        }
        return
      }
      if ((k === 'enter' || k === ' ') && host) {
        e.preventDefault()
        go()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onPointer = (e: React.PointerEvent) => {
    const r = stage$.current?.getBoundingClientRect()
    if (!r) return
    pointer.current = { x: (e.clientX - r.left - r.width / 2) / r.height, y: -(e.clientY - r.top - r.height / 2) / r.height }
  }

  const ranks = game.ranking(quiz, tonight)
  const before = game.ranking(quiz, stage.before ?? {})
  const top = Math.max(1, ...ranks.map((t) => tonight[t.id] ?? 0))
  const nights = Object.values(scores.nights ?? {}).sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const last = nights[0]
  const wins = (team: string) => nights.filter((n) => n.winner === team).length
  const winsLabel = (n: number) => (n === 0 ? w.wins0 : n === 1 ? w.wins1 : fill(w.winsN, { n }))
  const waitText = !live ? w.offline : st.quizmaster ? w.waitingHost : w.noHost

  const joinRow = canAct && !mine && stage.phase !== 'lobby' && (
    <div className="qn-join">
      <span>{w.joinNow}</span>
      {quiz.teams.map((t) => (
        <button key={t.id} onClick={() => join(t.id)} style={{ '--team': t.color } as React.CSSProperties}>
          {t.name}
        </button>
      ))}
    </div>
  )

  return (
    <div className="qn-root">
      <style>{CSS}</style>
      <div className="qn-wrap">
        <div className="qn-stage" ref={stage$} onPointerMove={onPointer} style={{ '--round': round.color } as React.CSSProperties}>
          <Backdrop moodRef={mood} pointerRef={pointer} />
          <Confetti burst={burst} colors={['#f3aa08', '#5bcbf9', '#30ccd5', '#ff7a59', '#ffffff']} />

          <header className="qn-top">
            {stage.phase === 'lobby' ? (
              <span className="qn-chip"><span className="qn-dot" style={{ background: '#f3aa08' }} />{w.quizNight}</span>
            ) : (
              <span className="qn-chip">
                <span className="qn-dot" style={{ background: round.color }} />
                {fill(w.roundOf, { n: stage.round + 1, total: quiz.rounds.length })} · {round.theme}
              </span>
            )}
            <div className="qn-top-right">
              {mine && (
                <span className="qn-chip qn-me" style={{ '--team': teamOf(mine.team).color } as React.CSSProperties}>
                  <span className="qn-dot" />
                  {mine.name} · {teamOf(mine.team).name}
                </span>
              )}
              {(stage.phase === 'question' || stage.phase === 'reveal') && <span className="qn-count">{fill(w.questionOf, { n: number, total: count })}</span>}
              <button
                className="qn-icon"
                onClick={() => {
                  sfx.unlock()
                  sfx.setMuted(!muted)
                  setMuted(!muted)
                }}
                aria-label={muted ? w.unmute : w.mute}
                title={`${muted ? w.unmute : w.mute} (M)`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
                  {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />}
                </svg>
              </button>
            </div>
          </header>

          {stage.phase === 'lobby' && (
            <section className="qn-lobby">
              <div className="qn-lobby-main">
                <h1 className="qn-title">{quiz.title}</h1>
                <p className="qn-sub">
                  {fill(w.summary, { rounds: quiz.rounds.length, questions: count })}
                  {quiz.host ? ` · ${fill(w.hostedBy, { host: quiz.host })}` : ''}
                </p>
                <ol className="qn-rounds">
                  {quiz.rounds.map((r, i) => (
                    <li key={r.theme}>
                      <span className="qn-round-n" style={{ background: r.color }}>{i + 1}</span>
                      {r.theme}
                    </li>
                  ))}
                </ol>
                <ol className="qn-how">
                  {w.how.map((line: string, i: number) => (
                    <li key={i}>
                      <b>{i + 1}</b>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
                {host ? (
                  <div className="qn-go">
                    <button className="qn-btn" onClick={go}>
                      {w.start} <Arrow />
                    </button>
                    <span className="qn-hint">{fill(w.joined, { n: players.length })}</span>
                  </div>
                ) : (
                  <p className="qn-wait">{waitText}</p>
                )}
              </div>

              <aside className="qn-teams">
                <div className="qn-teams-head">
                  <h2>{canAct ? (mine ? w.yourTeam : w.pickTeam) : w.allNights}</h2>
                  {keeping && !store.saved && <span className="qn-saving">{w.saving}</span>}
                </div>
                {canAct && (
                  <label className="qn-name">
                    <span>{w.yourName}</span>
                    <input
                      value={name}
                      maxLength={24}
                      placeholder={mine?.name || selfName || w.guest}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => mine && name.trim() && join(mine.team)}
                    />
                  </label>
                )}
                <ol>
                  {game.ranking(quiz, total).map((t) => {
                    const members = players.filter((p) => p.team === t.id)
                    const body = (
                      <>
                        <span className="qn-team-dot" />
                        <span className="qn-team-name">
                          {t.name}
                          <small>{winsLabel(wins(t.id))}</small>
                        </span>
                        <span className="qn-team-members">
                          {members.map((p) => (
                            <Avatar key={p.id} name={p.name} color={t.color} size={24} />
                          ))}
                        </span>
                        <span className="qn-team-total">
                          <b>{(total[t.id] ?? 0).toLocaleString('en-US')}</b>
                          <small>{w.pts}</small>
                        </span>
                      </>
                    )
                    const style = { '--team': t.color } as React.CSSProperties
                    return (
                      <li key={t.id}>
                        {canAct ? (
                          <button className={`qn-team${mine?.team === t.id ? ' mine' : ''}`} style={style} onClick={() => join(t.id)} aria-pressed={mine?.team === t.id}>
                            {body}
                          </button>
                        ) : (
                          <div className="qn-team" style={style}>{body}</div>
                        )}
                      </li>
                    )
                  })}
                </ol>
                {last?.winner && (
                  <p className="qn-last">{fill(w.lastQuiz, { team: teamOf(last.winner).name, n: last.points ?? 0, date: last.date ?? '' })}</p>
                )}
              </aside>
            </section>
          )}

          {stage.phase === 'round' && (
            <section className="qn-round" onClick={go}>
              <span className="qn-round-label">{fill(w.roundOf, { n: stage.round + 1, total: quiz.rounds.length })}</span>
              <h1 className="qn-round-title" style={{ color: round.color }}>{round.theme}</h1>
              <p className="qn-sub">{fill(w.questionsInRound, { n: round.questions.length })}</p>
            </section>
          )}

          {(stage.phase === 'question' || stage.phase === 'reveal') && (
            <section className="qn-play">
              <div className="qn-question">
                <h2>{q.q}</h2>
                {stage.phase === 'question' ? <TimerRing left={Math.max(0, limit - elapsed)} limit={limit} /> : null}
              </div>
              <div className="qn-options">
                {q.options.map((text, i) => {
                  const shown = stage.phase === 'reveal'
                  const right = shown && i === q.answer
                  const dim = (shown && i !== q.answer) || (!shown && !!myAnswer && myAnswer.option !== i)
                  const chosen = myAnswer?.option === i
                  const who = shown ? players.filter((p) => answerOf(p.id)?.option === i) : []
                  return (
                    <button
                      key={i}
                      className={`qn-option${right ? ' right' : ''}${dim ? ' dim' : ''}${chosen ? ' chosen' : ''}${canAnswer ? ' open' : ''}`}
                      style={{ '--tile': TILES[i].color } as React.CSSProperties}
                      disabled={!canAnswer}
                      onClick={() => pick(i)}
                    >
                      <span className="qn-option-mark">
                        <Shape shape={TILES[i].shape} />
                        <b>{LETTERS[i]}</b>
                      </span>
                      <span className="qn-option-text">{text}</span>
                      {right && (
                        <span className="qn-check" aria-label={w.correct}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                        </span>
                      )}
                      {who.length > 0 && (
                        <span className="qn-who">
                          {who.map((p) => <Avatar key={p.id} name={p.name} color={teamOf(p.team).color} size={24} />)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {stage.phase === 'reveal' && q.fact && (
                <div className="qn-fact">
                  <span>{w.didYouKnow}</span>
                  {q.fact}
                </div>
              )}

              <div className="qn-answers">
                {quiz.teams.map((t) => {
                  const members = players.filter((p) => p.team === t.id)
                  const g = stage.gained?.[t.id] ?? 0
                  return (
                    <div key={t.id} className={`qn-answer${mine?.team === t.id ? ' turn' : ''}`} style={{ '--me': t.color } as React.CSSProperties}>
                      <div className="qn-answer-head">
                        <span className="qn-team-dot" style={{ '--team': t.color } as React.CSSProperties} />
                        <span className="qn-answer-name">{t.name}</span>
                        {stage.phase === 'reveal' ? (
                          <span className={`qn-gain${g ? ' won' : ''}`}>{g ? `+${g}` : '0'}</span>
                        ) : (
                          <span className="qn-gain">{(tonight[t.id] ?? 0).toLocaleString('en-US')}</span>
                        )}
                      </div>
                      <div className="qn-members">
                        {members.length === 0 && <span className="qn-empty">{w.noPlayers}</span>}
                        {members.map((p) => {
                          const a = answerOf(p.id)
                          const fast = stage.phase === 'reveal' && stage.fastest === p.id
                          const right = stage.phase === 'reveal' && a?.option === q.answer
                          return (
                            <span key={p.id} className={`qn-member${a ? ' done' : ''}${right ? ' right' : ''}`} title={p.name}>
                              <Avatar name={p.name} color={t.color} size={22} />
                              <span>{p.name}</span>
                              {fast && <em>{w.quickest}</em>}
                              {stage.phase === 'reveal' && !a && <i>{w.noAnswer}</i>}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="qn-foot">
                <span className="qn-status">
                  {stage.phase === 'question' && myAnswer && w.locked}
                  {stage.phase === 'question' && !myAnswer && mine && timeUp && w.timeUp}
                  {stage.phase === 'question' && !mine && !canAct && w.watching}
                  {stage.phase === 'reveal' && !host && w.hostMovesOn}
                </span>
                {joinRow}
                {host && stage.phase === 'question' && (
                  <button className="qn-btn ghost" onClick={go}>
                    {w.revealNow}
                  </button>
                )}
                {host && stage.phase === 'reveal' && (
                  <button className="qn-btn" onClick={go}>
                    {stage.question + 1 < round.questions.length ? w.nextQuestion : stage.round + 1 < quiz.rounds.length ? w.seeScores : w.finalResults} <Arrow />
                  </button>
                )}
              </div>
            </section>
          )}

          {stage.phase === 'board' && (
            <section className="qn-board">
              <h1 className="qn-board-title">{fill(w.afterRound, { n: stage.round + 1 })}</h1>
              <ol className="qn-table">
                {ranks.map((t, place) => {
                  const shift = before.indexOf(t) - place
                  return (
                    <li key={t.id}>
                      <span className="qn-place">{place + 1}</span>
                      <Avatar name={t.name} color={t.color} size={32} />
                      <span className="qn-table-name">{t.name}</span>
                      <span className="qn-bar"><span style={{ width: `${((tonight[t.id] ?? 0) / top) * 100}%`, background: t.color }} /></span>
                      <span className={`qn-move${shift > 0 ? ' up' : shift < 0 ? ' down' : ''}`}>{shift > 0 ? `▲ ${shift}` : shift < 0 ? `▼ ${-shift}` : '–'}</span>
                      <span className="qn-score"><Count to={tonight[t.id] ?? 0} from={stage.before?.[t.id] ?? 0} /></span>
                    </li>
                  )
                })}
              </ol>
              <div className="qn-foot">
                <span className="qn-status">{!host && w.hostMovesOn}</span>
                {joinRow}
                {host && (
                  <button className="qn-btn" onClick={go}>
                    {fill(w.nextRound, { n: stage.round + 2, theme: quiz.rounds[stage.round + 1]?.theme ?? '' })} <Arrow />
                  </button>
                )}
              </div>
            </section>
          )}

          {stage.phase === 'final' && (
            <section className="qn-final">
              <span className="qn-round-label">{w.winnerIs}</span>
              <h1 className="qn-winner" style={{ color: ranks[0].color }}>{ranks[0].name}</h1>
              <div className="qn-podium">
                {[1, 0, 2].map((place) => {
                  const t = ranks[place]
                  if (!t) return <div key={place} />
                  return (
                    <div key={t.id} className={`qn-step p${place + 1}`}>
                      <Avatar name={t.name} color={t.color} size={place === 0 ? 64 : 48} />
                      <span className="qn-step-name">{t.name}</span>
                      <span className="qn-step-score"><Count to={tonight[t.id] ?? 0} /></span>
                      <div className="qn-block" style={{ background: t.color }}><b>{place + 1}</b></div>
                    </div>
                  )
                })}
              </div>
              {ranks.length > 3 && (
                <div className="qn-rest">
                  {ranks.slice(3).map((t, i) => (
                    <span key={t.id}>
                      {i + 4}. {t.name} · {(tonight[t.id] ?? 0).toLocaleString('en-US')}
                    </span>
                  ))}
                </div>
              )}
              {host ? (
                <button className="qn-btn" onClick={go}>
                  {w.playAgain} <Arrow />
                </button>
              ) : (
                <span className="qn-status">{w.hostMovesOn}</span>
              )}
            </section>
          )}
        </div>

        <div className="qn-notes">
          <p className="qn-note">
            <b>{keeping ? w.scoresTitle : w.savedTitle}</b> {keeping ? w.scoresBody : w.savedBody}
            {keeping && !store.saved && <span className="qn-saving"> {w.saving}</span>}
          </p>
          {live && (
            <p className="qn-note">
              <b>{w.shareTitle}</b> {w.shareBody}
            </p>
          )}
          <p className="qn-note">
            <b>{w.changeTitle}</b> {w.changeBody} <code>quiz-night/data/quiz.json</code>. {w.askYourAi}
            {w.prompts.map((p: string) => <span className="qn-prompt" key={p}>“{p}”</span>)}
          </p>
        </div>
      </div>
    </div>
  )
}

const CSS = `
.qn-root { font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
.qn-wrap { width: min(var(--kunobi-prose-width, 1200px), 100%); margin: 0 auto; padding: 16px 24px 40px; box-sizing: border-box; container-type: inline-size; }
.qn-stage { position: relative; overflow: hidden; border-radius: 28px; background: #041122; color: #fff; min-height: clamp(560px, 60cqw, 720px); display: flex; flex-direction: column; padding: clamp(18px, 2.6cqw, 32px); box-sizing: border-box; box-shadow: 0 20px 50px rgba(6, 33, 63, 0.25); }
.qn-bg, .qn-bg canvas { position: absolute; inset: 0; width: 100% !important; height: 100% !important; }
.qn-confetti { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; }
.qn-stage > *:not(.qn-bg):not(.qn-confetti) { position: relative; z-index: 1; }
.qn-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.qn-top-right { display: flex; align-items: center; gap: 10px; }
.qn-chip { display: inline-flex; align-items: center; gap: 9px; padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,0.1); font-weight: 600; font-size: 14px; backdrop-filter: blur(6px); }
.qn-dot { width: 9px; height: 9px; border-radius: 99px; }
.qn-me .qn-dot { background: var(--team); }
.qn-count { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.72); }
.qn-icon { all: unset; cursor: pointer; width: 38px; height: 38px; border-radius: 99px; display: grid; place-items: center; background: rgba(255,255,255,0.1); color: #fff; }
.qn-icon:hover { background: rgba(255,255,255,0.18); }
.qn-btn { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; padding: 14px 22px; border-radius: 999px; background: #f3aa08; color: ${INK}; font: 800 17px Parkinsans, Figtree, sans-serif; letter-spacing: -0.01em; box-shadow: 0 10px 24px rgba(243, 170, 8, 0.28); transition: transform .2s; }
.qn-btn:hover { transform: translateY(-2px); }
.qn-btn.ghost { background: rgba(255,255,255,0.12); color: #fff; box-shadow: none; padding: 11px 18px; font-size: 15px; }
.qn-btn:focus-visible, .qn-icon:focus-visible, .qn-option:focus-visible, .qn-team:focus-visible, .qn-join button:focus-visible { outline: 3px solid #5bcbf9; outline-offset: 3px; }
.qn-hint { font-size: 13px; color: rgba(255,255,255,0.6); }
.qn-avatar { flex: none; border-radius: 99px; display: inline-grid; place-items: center; color: ${INK}; font-weight: 800; font-family: Parkinsans, Figtree, sans-serif; box-shadow: 0 0 0 2px rgba(255,255,255,0.18); }

.qn-lobby { flex: 1; display: grid; grid-template-columns: 1.3fr 1fr; gap: clamp(20px, 4cqw, 48px); align-items: center; padding: 12px 0 4px; }
.qn-title { font: 800 clamp(38px, 6cqw, 72px)/0.98 Parkinsans, Figtree, sans-serif; letter-spacing: -0.035em; margin: 8px 0 10px; }
.qn-sub { margin: 0; font-size: clamp(15px, 1.6cqw, 18px); color: rgba(255,255,255,0.75); }
.qn-rounds { list-style: none; padding: 0; margin: 20px 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; }
.qn-rounds li { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 15px; }
.qn-round-n { flex: none; width: 24px; height: 24px; border-radius: 99px; display: grid; place-items: center; color: ${INK}; font: 800 12px Parkinsans, sans-serif; }
.qn-how { list-style: none; margin: 0 0 22px; padding: 0; display: grid; gap: 8px; }
.qn-how li { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.45; color: rgba(255,255,255,0.8); }
.qn-how li b { flex: none; width: 22px; height: 22px; border-radius: 99px; display: grid; place-items: center; background: rgba(255,255,255,0.14); font: 800 12px Parkinsans, sans-serif; color: #fff; }
.qn-go { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.qn-wait { margin: 0; display: inline-flex; padding: 10px 16px; border-radius: 14px; background: rgba(255,255,255,0.08); font-weight: 600; font-size: 15px; color: rgba(255,255,255,0.85); }

.qn-teams { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); border-radius: 22px; padding: 20px 20px 16px; backdrop-filter: blur(10px); }
.qn-teams-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.qn-teams h2 { margin: 0; font: 800 18px Parkinsans, sans-serif; }
.qn-teams ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.qn-saving { font-size: 13px; font-weight: 600; color: #f3aa08; }
.qn-name { display: grid; gap: 6px; margin-bottom: 12px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7); }
.qn-name input { font: 600 15px Figtree, sans-serif; color: #fff; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); border-radius: 12px; padding: 10px 12px; outline: none; min-width: 0; }
.qn-name input::placeholder { color: rgba(255,255,255,0.45); }
.qn-name input:focus { border-color: #5bcbf9; }
.qn-team { all: unset; box-sizing: border-box; width: 100%; display: grid; grid-template-columns: 12px minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 14px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); }
button.qn-team { cursor: pointer; transition: background .2s, border-color .2s; }
button.qn-team:hover { background: rgba(255,255,255,0.12); }
.qn-team.mine { border-color: var(--team); box-shadow: 0 0 0 1px var(--team); background: color-mix(in srgb, var(--team) 16%, transparent); }
.qn-team-dot { flex: none; width: 12px; height: 12px; border-radius: 99px; background: var(--team); }
.qn-team-name { display: grid; font-weight: 800; font-family: Parkinsans, Figtree, sans-serif; font-size: 16px; min-width: 0; }
.qn-team-name small { font: 600 12px Figtree, sans-serif; color: rgba(255,255,255,0.6); }
.qn-team-members { display: flex; }
.qn-team-members .qn-avatar { margin-left: -6px; box-shadow: 0 0 0 2px #0c1d33; }
.qn-team-total { display: grid; justify-items: end; line-height: 1.05; }
.qn-team-total b { font: 800 20px Parkinsans, sans-serif; }
.qn-team-total small { font-size: 11px; color: rgba(255,255,255,0.55); }
.qn-last { margin: 12px 2px 0; font-size: 13px; color: rgba(255,255,255,0.65); }

.qn-round { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 6px; }
.qn-round-label { font-weight: 600; font-size: 15px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.7); }
.qn-round-title { font: 800 clamp(44px, 8cqw, 104px)/0.95 Parkinsans, sans-serif; letter-spacing: -0.04em; margin: 6px 0 10px; }

.qn-play { flex: 1; display: flex; flex-direction: column; gap: clamp(12px, 1.6cqw, 18px); padding-top: clamp(14px, 2cqw, 26px); }
.qn-question { display: flex; align-items: center; gap: 20px; justify-content: space-between; }
.qn-question h2 { margin: 0; font: 800 clamp(24px, 3.4cqw, 42px)/1.12 Parkinsans, sans-serif; letter-spacing: -0.025em; max-width: 30ch; }
.qn-timer { position: relative; flex: none; width: 66px; height: 66px; }
.qn-timer svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.qn-timer .track { fill: rgba(255,255,255,0.08); stroke: rgba(255,255,255,0.14); stroke-width: 5; }
.qn-timer .arc { fill: none; stroke: #f3aa08; stroke-width: 5; stroke-linecap: round; transition: stroke-dashoffset .1s linear; }
.qn-timer.urgent .arc { stroke: #ff7a59; }
.qn-timer span { position: absolute; inset: 0; display: grid; place-items: center; font: 800 22px Parkinsans, sans-serif; }
.qn-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.qn-option { position: relative; display: flex; align-items: center; gap: 14px; width: 100%; box-sizing: border-box; padding: 16px 18px; min-height: 64px; border: 0; border-radius: 18px; background: var(--tile); color: ${INK}; font-family: inherit; font-weight: 600; font-size: clamp(16px, 1.8cqw, 20px); text-align: left; box-shadow: 0 8px 20px rgba(0,0,0,0.22); transition: background .35s, color .35s, transform .35s; }
.qn-option:disabled { cursor: default; }
.qn-option.open { cursor: pointer; }
.qn-option.open:hover { transform: translateY(-2px); }
.qn-option-mark { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.qn-option-mark b { font: 800 14px Parkinsans, sans-serif; opacity: 0.7; }
.qn-option-text { flex: 1; }
.qn-option.dim { background: color-mix(in srgb, var(--tile) 18%, #0c1d33); color: rgba(255,255,255,0.55); box-shadow: none; }
.qn-option.dim .qn-who .qn-avatar { box-shadow: 0 0 0 2px #0c1d33; }
.qn-option.chosen:not(.dim) { box-shadow: 0 0 0 3px #fff, 0 14px 36px rgba(0,0,0,0.35); }
.qn-option.right { transform: scale(1.015); box-shadow: 0 0 0 3px #fff, 0 14px 36px rgba(0,0,0,0.35); }
.qn-check { width: 32px; height: 32px; border-radius: 99px; display: grid; place-items: center; background: ${INK}; color: #fff; flex: none; }
.qn-who { display: flex; margin-left: 4px; }
.qn-who .qn-avatar { margin-left: -6px; box-shadow: 0 0 0 2px var(--tile); }
.qn-fact { padding: 14px 18px; border-radius: 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.14); font-size: 15px; line-height: 1.5; color: rgba(255,255,255,0.9); }
.qn-fact span { display: block; font: 800 12px Parkinsans, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--round); margin-bottom: 4px; }
.qn-answers { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin-top: auto; }
.qn-answer { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 16px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(8px); }
.qn-answer.turn { border-color: var(--me); box-shadow: 0 0 0 1px var(--me); }
.qn-answer-head { display: flex; align-items: center; gap: 9px; }
.qn-answer-name { flex: 1; font-weight: 800; font-family: Parkinsans, Figtree, sans-serif; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qn-gain { font: 800 15px Parkinsans, sans-serif; color: rgba(255,255,255,0.55); }
.qn-gain.won { color: #f3aa08; }
.qn-members { display: flex; flex-wrap: wrap; gap: 6px; min-height: 26px; }
.qn-member { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px 2px 2px; border-radius: 99px; background: rgba(255,255,255,0.06); font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.6); max-width: 100%; }
.qn-member > span:not(.qn-avatar) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qn-member .qn-avatar { opacity: 0.55; }
.qn-member.done { color: #fff; }
.qn-member.done .qn-avatar { opacity: 1; }
.qn-member.right { background: rgba(48, 204, 213, 0.18); }
.qn-member em { font-style: normal; font: 800 11px Parkinsans, sans-serif; color: ${INK}; background: #f3aa08; border-radius: 99px; padding: 2px 7px; }
.qn-member i { font-style: normal; font-size: 12px; color: rgba(255,255,255,0.5); }
.qn-empty { font-size: 13px; color: rgba(255,255,255,0.45); line-height: 26px; }
.qn-foot { display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap; }
.qn-status { margin-right: auto; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.75); }
.qn-status:empty { display: none; }
.qn-join { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-right: auto; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.75); }
.qn-join button { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 99px; background: var(--team); color: ${INK}; font: 800 13px Parkinsans, sans-serif; }

.qn-board { flex: 1; display: flex; flex-direction: column; gap: 16px; padding-top: 18px; }
.qn-board-title { margin: 0; font: 800 clamp(30px, 4.4cqw, 52px)/1 Parkinsans, sans-serif; letter-spacing: -0.03em; }
.qn-table { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.qn-table li { display: grid; grid-template-columns: 30px 34px minmax(80px, 160px) 1fr 52px 80px; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 16px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); }
.qn-place { font: 800 18px Parkinsans, sans-serif; color: rgba(255,255,255,0.6); }
.qn-table-name { font-weight: 600; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qn-bar { height: 12px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; }
.qn-bar span { display: block; height: 100%; border-radius: 99px; transition: width 1s cubic-bezier(.2,.8,.2,1); }
.qn-move { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.45); text-align: center; }
.qn-move.up { color: #30ccd5; }
.qn-move.down { color: #ff7a59; }
.qn-score { font: 800 20px Parkinsans, sans-serif; text-align: right; }
.qn-board .qn-foot { margin-top: auto; }

.qn-final { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding-top: 10px; }
.qn-winner { margin: 0 0 6px; font: 800 clamp(44px, 7cqw, 88px)/1 Parkinsans, sans-serif; letter-spacing: -0.04em; }
.qn-podium { display: grid; grid-template-columns: repeat(3, minmax(0, 170px)); align-items: end; gap: 12px; margin: 10px 0 8px; }
.qn-step { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.qn-step-name { font-weight: 600; font-size: 15px; }
.qn-step-score { font: 800 18px Parkinsans, sans-serif; color: rgba(255,255,255,0.85); }
.qn-block { width: 100%; border-radius: 16px 16px 6px 6px; display: grid; place-items: start center; padding-top: 10px; color: ${INK}; font: 800 28px Parkinsans, sans-serif; box-shadow: inset 0 -12px 24px rgba(0,0,0,0.15); }
.qn-step.p1 .qn-block { height: 150px; }
.qn-step.p2 .qn-block { height: 110px; }
.qn-step.p3 .qn-block { height: 80px; }
.qn-rest { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 18px; font-size: 14px; color: rgba(255,255,255,0.7); margin-bottom: 14px; }
.qn-final .qn-status { margin: 0; }

.qn-notes { display: grid; gap: 6px; margin-top: 14px; }
.qn-note { margin: 0; font-size: 14px; line-height: 1.55; color: hsl(var(--muted-foreground)); }
.qn-note b { color: hsl(var(--foreground)); }
.qn-note .qn-saving { color: hsl(var(--foreground)); }
.qn-note code { font-size: 13px; padding: 1px 6px; border-radius: 6px; background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.qn-prompt { display: inline-block; margin: 4px 6px 0 0; padding: 3px 10px; border-radius: 99px; background: hsl(var(--muted)); color: hsl(var(--foreground)); font-size: 13px; }

@container (max-width: 760px) {
  .qn-lobby { grid-template-columns: 1fr; }
  .qn-options { grid-template-columns: 1fr; }
  .qn-option { min-height: 52px; padding: 12px 14px; }
  .qn-answers { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .qn-table li { grid-template-columns: 24px 30px 1fr 64px; }
  .qn-table .qn-bar, .qn-table .qn-move { display: none; }
  .qn-question { align-items: flex-start; }
  .qn-timer { width: 54px; height: 54px; }
  .qn-count { display: none; }
  .qn-rounds { grid-template-columns: 1fr; }
}
@container (max-width: 460px) {
  .qn-answers { grid-template-columns: 1fr; }
  .qn-team { gap: 10px; padding: 10px 12px; }
}
@media (prefers-reduced-motion: reduce) { .qn-btn, .qn-option, .qn-bar span { transition: none; } }
`
