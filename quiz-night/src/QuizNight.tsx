import * as React from 'react'
import { Backdrop, Confetti, type Mood } from './backdrop'
import { createSfx } from './sound'
import * as game from './game'
import type { Quiz, State } from './game'

/* A quiz for one screen: the host reads, everyone answers on the same laptop or TV. */

const INK = '#06213f'
const TILES = [
  { color: '#f3aa08', shape: 'triangle' },
  { color: '#5bcbf9', shape: 'diamond' },
  { color: '#30ccd5', shape: 'circle' },
  { color: '#ff7a59', shape: 'square' },
]
const LETTERS = ['A', 'B', 'C', 'D']

type Words = Record<string, any>

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

/** A believable game in progress, for review captures (`preview`). */
function simulate(quiz: Quiz, upto: 'question' | 'reveal' | 'board' | 'final'): State {
  let s = game.next(quiz, game.next(quiz, game.start(quiz)))
  const answer = (st: State) => {
    const q = game.current(quiz, st)
    const n = game.questionNumber(quiz, st)
    return { ...st, picks: quiz.players.map((_, i) => ({ option: (i + n) % 3 === 0 ? (q.answer + 1) % 4 : q.answer, at: 2 + ((i * 3 + n) % 11) })) }
  }
  if (upto === 'question') return { ...s, picks: s.picks.map((p, i) => (i < 2 ? { option: 1, at: 4 } : p)) }
  if (upto === 'reveal') return game.reveal(quiz, answer(s))
  const stop = upto === 'board' ? 1 : quiz.rounds.length
  while (true) {
    s = game.next(quiz, game.reveal(quiz, answer(s)))
    if (s.phase === 'board' && upto === 'board') return s
    if (s.phase === 'final') return s
    if (s.phase === 'board') s = game.next(quiz, game.next(quiz, s))
    if (s.round >= stop) return s
  }
}

export function QuizNight({ quiz, words, preview }: { quiz: Quiz; words: Record<string, Words>; preview?: string }) {
  const w = React.useMemo(() => {
    const tag = (typeof navigator !== 'undefined' && navigator.language) || 'en'
    return words[tag.toLowerCase().split('-')[0]] ?? words.en
  }, [words])
  const [s, setS] = React.useState<State>(() =>
    preview === 'question' || preview === 'reveal' || preview === 'board' || preview === 'final' ? simulate(quiz, preview) : game.start(quiz),
  )
  const [elapsed, setElapsed] = React.useState(0)
  const [muted, setMuted] = React.useState(false)
  const [burst, setBurst] = React.useState(0)
  const sfx = React.useMemo(() => createSfx(), [])
  const mood = React.useRef<Mood>({ tint: quiz.rounds[0].color, energy: 0, pulse: 0 })
  const pointer = React.useRef({ x: 0, y: 0 })
  const stage = React.useRef<HTMLDivElement>(null)

  const round = quiz.rounds[s.round]
  const q = game.current(quiz, s)
  const limit = game.secondsFor(quiz, q)
  const total = game.totalQuestions(quiz)
  const number = game.questionNumber(quiz, s)
  const active = s.phase === 'question' ? s.picks.findIndex((p) => !p) : -1

  React.useEffect(() => () => sfx.dispose(), [sfx])

  // Mood of the backdrop and music for each step.
  React.useEffect(() => {
    mood.current.tint = round.color
    mood.current.energy = s.phase === 'question' ? 0.45 : s.phase === 'final' ? 0.3 : 0.1
    if (s.phase === 'question') sfx.music(true, 112)
    else sfx.music(false)
    if (s.phase === 'round') sfx.play('whoosh')
    if (s.phase === 'question') {
      setElapsed(0)
      sfx.play('go')
    }
    if (s.phase === 'reveal') {
      mood.current.pulse = 1
      sfx.play(s.gained.some((g) => g > 0) ? 'correct' : 'wrong')
    }
    if (s.phase === 'final') {
      setBurst((b) => b + 1)
      sfx.play('fanfare')
    }
  }, [s.phase, s.round, s.question]) // eslint-disable-line react-hooks/exhaustive-deps

  // The question clock, by elapsed time.
  React.useEffect(() => {
    if (s.phase !== 'question' || preview) return
    const t0 = performance.now()
    let raf = 0
    let lastTick = limit
    const tick = (now: number) => {
      const e = (now - t0) / 1000
      setElapsed(e)
      const left = Math.ceil(limit - e)
      if (left <= 5 && left < lastTick && left > 0) sfx.play('tick')
      lastTick = left
      if (e >= limit) setS((st) => (st.phase === 'question' ? game.reveal(quiz, st) : st))
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [s.phase, s.round, s.question]) // eslint-disable-line react-hooks/exhaustive-deps

  // Everyone has answered: reveal after a breath.
  React.useEffect(() => {
    if (s.phase !== 'question' || preview || s.picks.some((p) => !p)) return
    const t = setTimeout(() => setS((st) => (st.phase === 'question' ? game.reveal(quiz, st) : st)), 700)
    return () => clearTimeout(t)
  }, [s.picks]) // eslint-disable-line react-hooks/exhaustive-deps

  // Round title cards move on by themselves.
  React.useEffect(() => {
    if (s.phase !== 'round' || preview) return
    const t = setTimeout(() => setS((st) => (st.phase === 'round' ? game.next(quiz, st) : st)), 3200)
    return () => clearTimeout(t)
  }, [s.phase, s.round]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = () => {
    sfx.unlock()
    setS((st) => game.next(quiz, st))
  }
  const pick = (player: number, option: number) => {
    sfx.unlock()
    setS((st) => {
      if (st.phase !== 'question' || st.picks[player]) return st
      const picks = st.picks.slice()
      picks[player] = { option, at: elapsed }
      return { ...st, picks }
    })
    sfx.play('select')
  }

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'm') {
        setMuted((m) => {
          sfx.setMuted(!m)
          return !m
        })
        return
      }
      if (s.phase === 'question') {
        const option = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k)
        if (option >= 0 && active >= 0) {
          e.preventDefault()
          pick(active, option)
        }
        return
      }
      if (k === 'enter' || k === ' ') {
        e.preventDefault()
        go()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onPointer = (e: React.PointerEvent) => {
    const r = stage.current?.getBoundingClientRect()
    if (!r) return
    pointer.current = { x: (e.clientX - r.left - r.width / 2) / r.height, y: -(e.clientY - r.top - r.height / 2) / r.height }
  }

  const ranks = game.ranking(s.scores)
  const before = game.ranking(s.before)
  const top = Math.max(1, ...s.scores)

  return (
    <div className="qn-root">
      <style>{CSS}</style>
      <div className="qn-wrap">
        <div className="qn-stage" ref={stage} onPointerMove={onPointer} style={{ '--round': round.color } as React.CSSProperties}>
          <Backdrop moodRef={mood} pointerRef={pointer} />
          <Confetti burst={burst} colors={['#f3aa08', '#5bcbf9', '#30ccd5', '#ff7a59', '#ffffff']} />

          <header className="qn-top">
            {s.phase === 'lobby' ? (
              <span className="qn-chip"><span className="qn-dot" style={{ background: '#f3aa08' }} />{w.quizNight}</span>
            ) : (
              <span className="qn-chip">
                <span className="qn-dot" style={{ background: round.color }} />
                {fill(w.roundOf, { n: s.round + 1, total: quiz.rounds.length })} · {round.theme}
              </span>
            )}
            <div className="qn-top-right">
              {(s.phase === 'question' || s.phase === 'reveal') && <span className="qn-count">{fill(w.questionOf, { n: number, total })}</span>}
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

          {s.phase === 'lobby' && (
            <section className="qn-lobby">
              <div className="qn-lobby-main">
                <h1 className="qn-title">{quiz.title}</h1>
                <p className="qn-sub">
                  {fill(w.summary, { rounds: quiz.rounds.length, questions: total })}
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
                <div className="qn-players-row">
                  {quiz.players.map((p) => (
                    <span className="qn-player-chip" key={p.name}>
                      <Avatar name={p.name} color={p.color} size={26} />
                      {p.name}
                    </span>
                  ))}
                </div>
                <button className="qn-btn" onClick={go}>
                  {w.start} <Arrow />
                </button>
                <span className="qn-hint">{w.pressEnter}</span>
              </div>
              <aside className="qn-how">
                <h2>{w.howToPlay}</h2>
                <ol>
                  {w.how.map((line: string, i: number) => (
                    <li key={i}>
                      <b>{i + 1}</b>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              </aside>
            </section>
          )}

          {s.phase === 'round' && (
            <section className="qn-round" onClick={go}>
              <span className="qn-round-label">{fill(w.roundOf, { n: s.round + 1, total: quiz.rounds.length })}</span>
              <h1 className="qn-round-title" style={{ color: round.color }}>{round.theme}</h1>
              <p className="qn-sub">{fill(w.questionsInRound, { n: round.questions.length })}</p>
            </section>
          )}

          {(s.phase === 'question' || s.phase === 'reveal') && (
            <section className="qn-play">
              <div className="qn-question">
                <h2>{q.q}</h2>
                {s.phase === 'question' ? <TimerRing left={Math.max(0, limit - elapsed)} limit={limit} /> : null}
              </div>
              <div className="qn-options">
                {q.options.map((text, i) => {
                  const right = s.phase === 'reveal' && i === q.answer
                  const dim = s.phase === 'reveal' && i !== q.answer
                  const who = s.phase === 'reveal' ? quiz.players.filter((_, pi) => s.picks[pi]?.option === i) : []
                  return (
                    <div key={i} className={`qn-option${right ? ' right' : ''}${dim ? ' dim' : ''}`} style={{ '--tile': TILES[i].color } as React.CSSProperties}>
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
                          {who.map((p) => <Avatar key={p.name} name={p.name} color={p.color} size={24} />)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {s.phase === 'reveal' && q.fact && (
                <div className="qn-fact">
                  <span>{w.didYouKnow}</span>
                  {q.fact}
                </div>
              )}

              <div className="qn-answers">
                {quiz.players.map((p, pi) => {
                  const mine = s.picks[pi]
                  const turn = pi === active
                  return (
                    <div key={p.name} className={`qn-answer${turn ? ' turn' : ''}${mine ? ' done' : ''}`} style={{ '--me': p.color } as React.CSSProperties}>
                      <div className="qn-answer-head">
                        <Avatar name={p.name} color={p.color} size={28} />
                        <span className="qn-answer-name">{p.name}</span>
                        {s.phase === 'reveal' && (
                          <span className={`qn-gain${s.gained[pi] ? ' won' : ''}`}>{s.gained[pi] ? `+${s.gained[pi]}` : '0'}</span>
                        )}
                      </div>
                      {s.phase === 'question' && !mine && (
                        <div className="qn-mini">
                          {TILES.map((t, oi) => (
                            <button key={oi} style={{ background: t.color }} onClick={() => pick(pi, oi)} aria-label={`${p.name}: ${LETTERS[oi]}`}>
                              <Shape shape={t.shape} size={14} />
                            </button>
                          ))}
                        </div>
                      )}
                      {s.phase === 'question' && mine && <span className="qn-locked">{w.locked}</span>}
                      {s.phase === 'question' && turn && <span className="qn-turn">{w.yourTurn}</span>}
                      {s.phase === 'reveal' && (
                        <span className="qn-picked">
                          {mine ? (
                            <>
                              <span className="qn-picked-mark" style={{ background: TILES[mine.option].color }}><Shape shape={TILES[mine.option].shape} size={12} /></span>
                              {fill(w.inSeconds, { s: mine.at.toFixed(1) })}
                            </>
                          ) : (
                            w.noAnswer
                          )}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {s.phase === 'reveal' && (
                <div className="qn-foot">
                  <button className="qn-btn" onClick={go}>
                    {s.question + 1 < round.questions.length ? w.nextQuestion : s.round + 1 < quiz.rounds.length ? w.seeScores : w.finalResults} <Arrow />
                  </button>
                </div>
              )}
            </section>
          )}

          {s.phase === 'board' && (
            <section className="qn-board">
              <h1 className="qn-board-title">{fill(w.afterRound, { n: s.round + 1 })}</h1>
              <ol className="qn-table">
                {ranks.map((pi, place) => {
                  const p = quiz.players[pi]
                  const was = before.indexOf(pi)
                  const move = was - place
                  return (
                    <li key={p.name}>
                      <span className="qn-place">{place + 1}</span>
                      <Avatar name={p.name} color={p.color} size={32} />
                      <span className="qn-table-name">{p.name}</span>
                      <span className="qn-bar"><span style={{ width: `${(s.scores[pi] / top) * 100}%`, background: p.color }} /></span>
                      <span className={`qn-move${move > 0 ? ' up' : move < 0 ? ' down' : ''}`}>{move > 0 ? `▲ ${move}` : move < 0 ? `▼ ${-move}` : '–'}</span>
                      <span className="qn-score"><Count to={s.scores[pi]} from={s.before[pi]} /></span>
                    </li>
                  )
                })}
              </ol>
              <div className="qn-foot">
                <button className="qn-btn" onClick={go}>
                  {fill(w.nextRound, { n: s.round + 2, theme: quiz.rounds[s.round + 1].theme })} <Arrow />
                </button>
              </div>
            </section>
          )}

          {s.phase === 'final' && (
            <section className="qn-final">
              <span className="qn-round-label">{w.winnerIs}</span>
              <h1 className="qn-winner" style={{ color: quiz.players[ranks[0]].color }}>{quiz.players[ranks[0]].name}</h1>
              <div className="qn-podium">
                {[1, 0, 2].map((place) => {
                  const pi = ranks[place]
                  if (pi === undefined) return <div key={place} />
                  const p = quiz.players[pi]
                  return (
                    <div key={p.name} className={`qn-step p${place + 1}`}>
                      <Avatar name={p.name} color={p.color} size={place === 0 ? 64 : 48} />
                      <span className="qn-step-name">{p.name}</span>
                      <span className="qn-step-score"><Count to={s.scores[pi]} /></span>
                      <div className="qn-block" style={{ background: p.color }}><b>{place + 1}</b></div>
                    </div>
                  )
                })}
              </div>
              {ranks.length > 3 && (
                <div className="qn-rest">
                  {ranks.slice(3).map((pi, i) => (
                    <span key={pi}>
                      {i + 4}. {quiz.players[pi].name} · {s.scores[pi].toLocaleString('en-US')}
                    </span>
                  ))}
                </div>
              )}
              <button className="qn-btn" onClick={go}>
                {w.playAgain} <Arrow />
              </button>
            </section>
          )}
        </div>

        <div className="qn-notes">
          <p className="qn-note"><b>{w.scoresTitle}</b> {w.scoresBody}</p>
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
.qn-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.qn-top-right { display: flex; align-items: center; gap: 10px; }
.qn-chip { display: inline-flex; align-items: center; gap: 9px; padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,0.1); font-weight: 600; font-size: 14px; backdrop-filter: blur(6px); }
.qn-dot { width: 9px; height: 9px; border-radius: 99px; }
.qn-count { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.72); }
.qn-icon { all: unset; cursor: pointer; width: 38px; height: 38px; border-radius: 99px; display: grid; place-items: center; background: rgba(255,255,255,0.1); color: #fff; }
.qn-icon:hover { background: rgba(255,255,255,0.18); }
.qn-btn { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; padding: 14px 22px; border-radius: 999px; background: #f3aa08; color: ${INK}; font: 800 17px Parkinsans, Figtree, sans-serif; letter-spacing: -0.01em; box-shadow: 0 10px 24px rgba(243, 170, 8, 0.28); transition: transform .2s; }
.qn-btn:hover { transform: translateY(-2px); }
.qn-btn:focus-visible, .qn-icon:focus-visible, .qn-mini button:focus-visible { outline: 3px solid #5bcbf9; outline-offset: 3px; }
.qn-hint { font-size: 13px; color: rgba(255,255,255,0.55); margin-left: 14px; }
.qn-avatar { flex: none; border-radius: 99px; display: inline-grid; place-items: center; color: ${INK}; font-weight: 800; font-family: Parkinsans, Figtree, sans-serif; box-shadow: 0 0 0 2px rgba(255,255,255,0.18); }

.qn-lobby { flex: 1; display: grid; grid-template-columns: 1.4fr 1fr; gap: clamp(20px, 4cqw, 48px); align-items: center; padding: 12px 0 4px; }
.qn-title { font: 800 clamp(38px, 6cqw, 72px)/0.98 Parkinsans, Figtree, sans-serif; letter-spacing: -0.035em; margin: 8px 0 10px; }
.qn-sub { margin: 0; font-size: clamp(15px, 1.6cqw, 18px); color: rgba(255,255,255,0.75); }
.qn-rounds { list-style: none; padding: 0; margin: 22px 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; }
.qn-rounds li { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 15px; }
.qn-round-n { width: 24px; height: 24px; border-radius: 99px; display: grid; place-items: center; color: ${INK}; font: 800 12px Parkinsans, sans-serif; }
.qn-players-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 24px; }
.qn-player-chip { display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px 5px 5px; border-radius: 99px; background: rgba(255,255,255,0.1); font-weight: 600; font-size: 14px; }
.qn-how { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); border-radius: 22px; padding: 22px 24px; backdrop-filter: blur(10px); }
.qn-how h2 { margin: 0 0 14px; font: 800 18px Parkinsans, sans-serif; }
.qn-how ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.qn-how li { display: flex; gap: 12px; align-items: flex-start; font-size: 15px; line-height: 1.45; color: rgba(255,255,255,0.86); }
.qn-how li b { flex: none; width: 26px; height: 26px; border-radius: 99px; display: grid; place-items: center; background: rgba(255,255,255,0.14); font: 800 13px Parkinsans, sans-serif; color: #fff; }

.qn-round { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; cursor: pointer; gap: 6px; }
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
.qn-option { position: relative; display: flex; align-items: center; gap: 14px; padding: 16px 18px; min-height: 64px; border-radius: 18px; background: var(--tile); color: ${INK}; font-weight: 600; font-size: clamp(16px, 1.8cqw, 20px); box-shadow: 0 8px 20px rgba(0,0,0,0.22); transition: background .35s, color .35s, transform .35s; }
.qn-option-mark { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.qn-option-mark b { font: 800 14px Parkinsans, sans-serif; opacity: 0.7; }
.qn-option-text { flex: 1; }
.qn-option.dim { background: color-mix(in srgb, var(--tile) 18%, #0c1d33); color: rgba(255,255,255,0.55); box-shadow: none; }
.qn-option.dim .qn-who .qn-avatar { box-shadow: 0 0 0 2px #0c1d33; }
.qn-option.right { transform: scale(1.015); box-shadow: 0 0 0 3px #fff, 0 14px 36px rgba(0,0,0,0.35); }
.qn-check { width: 32px; height: 32px; border-radius: 99px; display: grid; place-items: center; background: ${INK}; color: #fff; flex: none; }
.qn-who { display: flex; margin-left: 4px; }
.qn-who .qn-avatar { margin-left: -6px; box-shadow: 0 0 0 2px var(--tile); }
.qn-fact { padding: 14px 18px; border-radius: 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.14); font-size: 15px; line-height: 1.5; color: rgba(255,255,255,0.9); }
.qn-fact span { display: block; font: 800 12px Parkinsans, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--round); margin-bottom: 4px; }
.qn-answers { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-top: auto; }
.qn-answer { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: 16px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(8px); }
.qn-answer.turn { border-color: var(--me); box-shadow: 0 0 0 2px var(--me); }
.qn-answer-head { display: flex; align-items: center; gap: 9px; }
.qn-answer-name { flex: 1; font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qn-mini { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.qn-mini button { all: unset; cursor: pointer; height: 34px; border-radius: 10px; display: grid; place-items: center; color: ${INK}; transition: transform .15s; }
.qn-mini button:hover { transform: translateY(-2px); }
.qn-locked, .qn-picked { display: inline-flex; align-items: center; gap: 8px; height: 34px; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.8); }
.qn-locked::before { content: ''; width: 10px; height: 10px; border-radius: 99px; background: var(--me); }
.qn-picked-mark { width: 24px; height: 24px; border-radius: 7px; display: grid; place-items: center; color: ${INK}; }
.qn-turn { position: absolute; top: -10px; right: 12px; padding: 3px 9px; border-radius: 99px; background: var(--me); color: ${INK}; font: 800 11px Parkinsans, sans-serif; letter-spacing: 0.02em; }
.qn-gain { font: 800 15px Parkinsans, sans-serif; color: rgba(255,255,255,0.45); }
.qn-gain.won { color: #f3aa08; }
.qn-foot { display: flex; justify-content: flex-end; }

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

.qn-notes { display: grid; gap: 6px; margin-top: 14px; }
.qn-note { margin: 0; font-size: 14px; line-height: 1.55; color: hsl(var(--muted-foreground)); }
.qn-note b { color: hsl(var(--foreground)); }
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
  .qn-hint, .qn-count { display: none; }
}
@media (prefers-reduced-motion: reduce) { .qn-btn, .qn-option, .qn-bar span, .qn-mini button { transition: none; } }
`
