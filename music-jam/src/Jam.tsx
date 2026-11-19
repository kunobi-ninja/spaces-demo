import * as React from 'react'
import * as kunobi from 'kunobi'
import { createSynth } from './synth'
import { KEYS, STEPS, STORE, cells, chordName, clockStep, lookOf, noteName, setCell, stepAt, type Pattern, type Track } from './pattern'

/*
 * A step sequencer for a few friends. The pattern lives in the music-jam-pattern store: each track
 * has its owner, its 16 steps and its volume, and the jam has one tempo and key. Every screen reads
 * the same pattern and follows the same clock, so everyone hears the same groove. Sound is made here.
 */

type Words = Record<string, any>
interface StoreStatus {
  status: string
  canEdit: boolean
  saved: boolean
}
const K = kunobi as Record<string, any>
const usePattern: (name: string) => Pattern | undefined = typeof K.useStore === 'function' ? K.useStore : () => undefined
const usePatternStatus: (name: string) => StoreStatus =
  typeof K.useStoreStatus === 'function' ? K.useStoreStatus : () => ({ status: 'refused', canEdit: false, saved: true })
const editPattern = (change: (draft: Pattern) => void) => (typeof K.edit === 'function' ? K.edit(STORE, change) : undefined)

/** A word with `{{placeholders}}` is a function of their values (lib/i18n); one without is its text. */
const fill = (text: string | ((values: Record<string, string | number>) => string), values: Record<string, string | number>) => (typeof text === 'function' ? text(values) : text)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const NAME_KEY = 'music-jam.name'
const readName = () => {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
const keepName = (name: string) => {
  try {
    window.localStorage.setItem(NAME_KEY, name)
  } catch {
    /* the name is only a convenience */
  }
}

/**
 * The step the jam is on while it plays. It follows the clock, so every screen that plays is on the
 * same step. Stopped, the grid holds the last step where most tracks play together.
 */
function useStep(tempo: number, playing: boolean) {
  const [n, setN] = React.useState(() => clockStep(tempo))
  React.useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = () => {
      const next = clockStep(tempo)
      setN((prev) => (prev === next ? prev : next))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [tempo, playing])
  return n
}

const fullest = (tracks: Track[]) => {
  let best = 0
  let most = -1
  for (let s = 0; s < STEPS; s++) {
    const count = tracks.filter((t) => stepAt(t, s)).length
    if (count >= most) {
      most = count
      best = s
    }
  }
  return best
}

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <span className="mj-avatar" style={{ background: color }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function PlayIcon({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {on ? <rect x="5" y="5" width="14" height="14" rx="3" /> : <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />}
    </svg>
  )
}

const label = (t: Track, key: string | null, c: string) => {
  const n = Number.parseInt(c, 10)
  if (!Number.isFinite(n)) return ''
  return t.instrument === 'chords' ? chordName(key, n) : noteName(key, n)
}

export function MusicJam({ saved, localize, words: w }: { saved: Pattern; localize: (pattern: Pattern) => Pattern; words: Words }) {

  // The shared pattern while its store is open, otherwise the last saved copy. Starting track names show in the reader's language.
  const stored = usePattern(STORE)
  const status = usePatternStatus(STORE)
  const keeping = status.status === 'open' && !!stored
  const pattern: Pattern = React.useMemo(() => localize(keeping ? stored! : saved), [keeping, stored, saved, localize])
  const canEdit = keeping && status.canEdit
  const tempo = clamp(pattern.tempo ?? 104, 60, 180)
  const key = pattern.key ?? 'A minor'
  const tracks = pattern.tracks ?? []

  const [me, setMe] = React.useState('')
  React.useEffect(() => setMe(readName()), [])
  const [sound, setSound] = React.useState(false)
  const n = useStep(tempo, sound)
  const now = sound ? ((n % STEPS) + STEPS) % STEPS : fullest(tracks)
  const bar = (Math.floor(n / STEPS) % 8) + 1
  const [focus, setFocus] = React.useState({ row: 0, step: 0 })
  const [brush, setBrush] = React.useState<Record<string, number>>({})
  const [volumes, setVolumes] = React.useState<Record<string, number>>({})
  const grid = React.useRef<HTMLDivElement>(null)
  const volTimer = React.useRef<Record<string, any>>({})

  const live = React.useRef({ tempo, key, tracks })
  live.current = { tempo, key, tracks: tracks.map((t) => (volumes[t.id] !== undefined ? { ...t, volume: volumes[t.id] } : t)) }
  const synth = React.useMemo(() => createSynth(() => live.current), [])
  React.useEffect(() => () => synth.dispose(), [synth])

  const toggleSound = () => {
    if (synth.on) {
      synth.stop()
      setSound(false)
    } else setSound(synth.start())
  }

  const change = (fn: (d: Pattern) => void) => {
    if (canEdit) void editPattern(fn)
  }
  const changeTrack = (id: string, fn: (t: Track) => void) => change((d) => {
    const t = d.tracks.find((x) => x.id === id)
    if (t) fn(t)
  })

  const brushOf = (t: Track) => {
    if (brush[t.id]) return brush[t.id]
    const first = cells(t).find((c) => Number.isFinite(Number.parseInt(c, 10)))
    return first ? Number.parseInt(first, 10) : 1
  }
  const setCellTo = (t: Track, s: number, c: string) => {
    const next = { ...t, steps: setCell(t, s, c) }
    changeTrack(t.id, (d) => void (d.steps = setCell(d, s, c)))
    if (c !== '.') synth.preview(next, s)
  }
  const toggle = (t: Track, s: number) => {
    if (!canEdit) return
    const on = cells(t)[s] !== '.'
    setCellTo(t, s, on ? '.' : lookOf(t).melodic ? String(brushOf(t)) : 'x')
  }
  const nudge = (t: Track, s: number | null, by: number) => {
    const at = s ?? -1
    const c = at >= 0 ? cells(t)[at] : ''
    const current = Number.parseInt(c, 10)
    const from = Number.isFinite(current) ? current : brushOf(t)
    const next = clamp(from + by, 1, 9)
    setBrush((b) => ({ ...b, [t.id]: next }))
    if (Number.isFinite(current)) setCellTo(t, at, String(next))
  }

  const setVolume = (t: Track, v: number) => {
    setVolumes((m) => ({ ...m, [t.id]: v }))
    clearTimeout(volTimer.current[t.id])
    volTimer.current[t.id] = setTimeout(() => {
      changeTrack(t.id, (d) => void (d.volume = v))
      setVolumes(({ [t.id]: _gone, ...rest }) => rest)
    }, 250)
  }
  const take = (t: Track) => {
    const name = me.trim() || w.guest
    changeTrack(t.id, (d) => void (d.owner = name))
  }

  const moveFocus = (row: number, step: number) => {
    const r = clamp(row, 0, tracks.length - 1)
    const s = (step + STEPS) % STEPS
    setFocus({ row: r, step: s })
    grid.current?.querySelector<HTMLButtonElement>(`[data-cell="${r}-${s}"]`)?.focus()
  }
  const onKey = (e: React.KeyboardEvent) => {
    const t = tracks[focus.row]
    if (!t) return
    const k = e.key
    if (k === 'ArrowRight') moveFocus(focus.row, focus.step + 1)
    else if (k === 'ArrowLeft') moveFocus(focus.row, focus.step - 1)
    else if (k === 'ArrowDown') moveFocus(focus.row + 1, focus.step)
    else if (k === 'ArrowUp') moveFocus(focus.row - 1, focus.step)
    else if (k === ' ' || k === 'Enter') toggle(t, focus.step)
    else if (k === 'Backspace' || k === 'Delete') setCellTo(t, focus.step, '.')
    else if (k === '+' || k === '=') nudge(t, focus.step, 1)
    else if (k === '-' || k === '_') nudge(t, focus.step, -1)
    else if (/^[1-9]$/.test(k) && canEdit) {
      if (lookOf(t).melodic) {
        setBrush((b) => ({ ...b, [t.id]: Number(k) }))
        setCellTo(t, focus.step, k)
      }
    } else if ((k === 'x' || k === 'X') && canEdit && !lookOf(t).melodic) {
      setCellTo(t, focus.step, cells(t)[focus.step] === 'X' ? 'x' : 'X')
    } else return
    e.preventDefault()
  }

  /** How loud a track's meter stands now: its last hit, fading over the steps since. */
  const level = (t: Track) => {
    for (let k = 0; k < STEPS; k++) {
      const hit = stepAt(t, (now - k + STEPS) % STEPS)
      if (hit) return ((volumes[t.id] ?? t.volume ?? 0) / 100) * (hit.accent ? 1 : 0.85) * Math.pow(0.7, k)
    }
    return 0
  }

  const keyName = (k: string) => w.keys?.[k] ?? k

  return (
    <div className="mj-root">
      <style>{CSS}</style>
      <div className="mj-wrap">
        <section className={`mj-stage${sound ? ' playing' : ''}`} aria-label={w.title}>
          <div className="mj-glow" aria-hidden="true" />
          <header className="mj-top">
            <div className="mj-heading">
              <span className="mj-eyebrow">
                <i className="mj-live" /> {w.eyebrow}
                {sound && <span className="mj-bar">· {fill(w.bar, { n: bar })}</span>}
              </span>
              <h1 className="mj-title">{w.title}</h1>
            </div>
            <div className="mj-controls">
              <button className={`mj-play${sound ? ' on' : ''}`} onClick={toggleSound} aria-pressed={sound}>
                <PlayIcon on={sound} />
                {sound ? w.mute : w.listen}
              </button>
              <div className="mj-ctl" role="group" aria-label={w.tempo}>
                <button className="mj-step-btn" onClick={() => change((d) => void (d.tempo = clamp(tempo - 4, 60, 180)))} disabled={!canEdit} aria-label={w.slower}>
                  −
                </button>
                <span className="mj-ctl-value">
                  <b>{tempo}</b>
                  <small>{w.bpm}</small>
                </span>
                <button className="mj-step-btn" onClick={() => change((d) => void (d.tempo = clamp(tempo + 4, 60, 180)))} disabled={!canEdit} aria-label={w.faster}>
                  +
                </button>
              </div>
              <label className={`mj-ctl mj-key${canEdit ? '' : ' off'}`}>
                <small>{w.key}</small>
                <span className="mj-key-value" aria-hidden="true">
                  {keyName(key)}
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 4.5l3 3 3-3" />
                  </svg>
                </span>
                <select value={key} disabled={!canEdit} aria-label={w.key} onChange={(e) => change((d) => void (d.key = e.target.value))}>
                  {KEYS.map((k) => (
                    <option key={k} value={k}>
                      {keyName(k)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </header>

          <div className="mj-board">
            <div className="mj-ruler" aria-hidden="true">
              <span />
              <div className="mj-ruler-steps">
                {Array.from({ length: STEPS }, (_, s) => (
                  <span key={s} className={`${s % 4 === 0 ? 'beat' : ''}${s === now ? ' now' : ''}`}>
                    {s % 4 === 0 ? s / 4 + 1 : '·'}
                  </span>
                ))}
              </div>
            </div>

            <div className="mj-grid" role="grid" aria-label={w.gridLabel} ref={grid} onKeyDown={onKey}>
              {tracks.map((t, row) => {
                const look = lookOf(t)
                const name = t.name ?? t.instrument ?? ''
                const mine = !!me.trim() && t.owner === me.trim()
                const vol = volumes[t.id] ?? t.volume ?? 0
                const row$ = cells(t)
                return (
                  <div key={t.id} className={`mj-track${mine ? ' mine' : ''}`} role="row" style={{ '--c': look.color, '--ink': look.ink } as React.CSSProperties}>
                    <div className="mj-head" role="rowheader">
                      <span className="mj-meter" aria-hidden="true">
                        <i style={{ transform: `scaleY(${Math.max(0.05, level(t)).toFixed(3)})` }} />
                      </span>
                      <div className="mj-name">
                        <b>{name}</b>
                        <span className="mj-owner">
                          {t.owner ? <Avatar name={t.owner} color={look.color} /> : null}
                          <span>{mine ? w.yours : t.owner || w.free}</span>
                          {canEdit && !mine && (
                            <button className="mj-take" onClick={() => take(t)}>
                              {w.take}
                            </button>
                          )}
                        </span>
                      </div>
                      <div className="mj-tools">
                        {look.melodic && (
                          <span className="mj-brush" role="group" aria-label={w.note}>
                            <button onClick={() => nudge(t, null, -1)} disabled={!canEdit} aria-label={w.lower}>
                              ‹
                            </button>
                            <span>{label(t, key, String(brushOf(t)))}</span>
                            <button onClick={() => nudge(t, null, 1)} disabled={!canEdit} aria-label={w.higher}>
                              ›
                            </button>
                          </span>
                        )}
                        <span className={`mj-vol${canEdit ? '' : ' off'}`} style={{ '--v': `${vol}%` } as React.CSSProperties}>
                          <span className="mj-vol-track" aria-hidden="true">
                            <i />
                            <b />
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={vol}
                            disabled={!canEdit}
                            aria-label={fill(w.volume, { name })}
                            onChange={(e) => setVolume(t, Number(e.target.value))}
                          />
                        </span>
                      </div>
                    </div>
                    <div className="mj-steps">
                      {row$.map((c, s) => {
                        const on = c !== '.'
                        const cls = ['mj-cell', on ? 'on' : '', c === 'X' ? 'loud' : '', s === now ? 'now' : '', on && s === now ? 'hit' : '', Math.floor(s / 4) % 2 ? 'alt' : '']
                        const text = on && look.melodic ? label(t, key, c) : ''
                        return (
                          <button
                            key={s}
                            data-cell={`${row}-${s}`}
                            className={cls.filter(Boolean).join(' ')}
                            role="gridcell"
                            aria-pressed={on}
                            aria-label={`${fill(w.stepLabel, { name, n: s + 1 })}${text ? `, ${text}` : ''}`}
                            aria-disabled={!canEdit}
                            tabIndex={focus.row === row && focus.step === s ? 0 : -1}
                            onFocus={() => setFocus({ row, step: s })}
                            onClick={() => toggle(t, s)}
                          >
                            {text && <span>{text}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

          </div>

          <footer className="mj-foot">
            <label className="mj-you">
              <span>{w.yourName}</span>
              <input
                value={me}
                placeholder={w.namePh}
                maxLength={24}
                onChange={(e) => {
                  setMe(e.target.value)
                  keepName(e.target.value)
                }}
              />
            </label>
            <span className="mj-hint">{w.hint}</span>
          </footer>
        </section>

        <div className="mj-notes">
          <p className="mj-note">
            <b>{keeping ? w.sharedTitle : w.savedTitle}</b> {keeping ? w.sharedBody : w.savedBody}
            {keeping && !status.saved && <span className="mj-saving"> {w.saving}</span>}
          </p>
          <p className="mj-note">
            <b>{w.changeTitle}</b> {w.changeBody} <code>music-jam/data/pattern.json</code>. {w.askYourAi}
            {w.prompts.map((p: string) => (
              <span className="mj-prompt" key={p}>
                “{p}”
              </span>
            ))}
          </p>
        </div>
      </div>
    </div>
  )
}

const CSS = `
.mj-root { font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
.mj-wrap { width: min(var(--kunobi-prose-width, 1200px), 100%); margin: 0 auto; padding: 16px 24px 40px; box-sizing: border-box; container-type: inline-size; }
.mj-stage { position: relative; overflow: hidden; border-radius: 28px; background: #110c22; color: #fff; padding: clamp(16px, 2.4cqw, 30px); box-sizing: border-box; box-shadow: 0 20px 50px rgba(17, 12, 34, 0.3); display: flex; flex-direction: column; justify-content: space-between; gap: clamp(12px, 1.6cqw, 18px); min-height: min(700px, 61cqw); }
.mj-board { display: grid; gap: clamp(8px, 1.2cqw, 14px); }
.mj-glow { position: absolute; inset: 0; pointer-events: none; background:
  radial-gradient(60% 50% at 0% 0%, rgba(255, 93, 115, 0.28), transparent 70%),
  radial-gradient(50% 45% at 100% 10%, rgba(79, 216, 255, 0.22), transparent 70%),
  radial-gradient(60% 50% at 80% 100%, rgba(154, 123, 255, 0.3), transparent 70%),
  radial-gradient(40% 40% at 10% 100%, rgba(52, 224, 161, 0.2), transparent 70%); }
.mj-stage > *:not(.mj-glow) { position: relative; }

.mj-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px 20px; flex-wrap: wrap; }
.mj-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.72); }
.mj-bar { color: rgba(255,255,255,0.5); }
.mj-live { width: 9px; height: 9px; border-radius: 99px; background: #ff5d73; box-shadow: 0 0 0 4px rgba(255, 93, 115, 0.25); }
.mj-title { margin: 6px 0 0; font: 800 clamp(30px, 4.6cqw, 56px)/0.98 Parkinsans, Figtree, sans-serif; letter-spacing: -0.035em; }
.mj-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mj-play { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; min-height: 52px; padding: 12px 22px; border-radius: 999px; background: #ffd23e; color: #2a1a00; font: 800 17px Parkinsans, Figtree, sans-serif; letter-spacing: -0.01em; box-shadow: 0 10px 26px rgba(255, 210, 62, 0.3); transition: transform .15s; }
.mj-play:hover { transform: translateY(-2px); }
.mj-play.on { background: rgba(255,255,255,0.14); color: #fff; box-shadow: none; }
.mj-ctl { display: inline-flex; align-items: center; gap: 4px; min-height: 52px; padding: 4px; box-sizing: border-box; border-radius: 999px; background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.12); }
.mj-ctl-value { display: grid; justify-items: center; min-width: 52px; line-height: 1; }
.mj-ctl-value b { font: 800 20px Parkinsans, sans-serif; }
.mj-ctl-value small, .mj-key small { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.6); }
.mj-step-btn { all: unset; cursor: pointer; width: 42px; height: 42px; border-radius: 99px; display: grid; place-items: center; font: 800 22px Parkinsans, sans-serif; background: rgba(255,255,255,0.1); }
.mj-step-btn:hover:not(:disabled) { background: rgba(255,255,255,0.2); }
.mj-key { position: relative; padding: 4px 8px 4px 16px; gap: 8px; cursor: pointer; }
.mj-key-value { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 99px; background: rgba(255,255,255,0.1); font: 800 16px Parkinsans, Figtree, sans-serif; white-space: nowrap; }
.mj-key select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0 !important; cursor: pointer; font-size: 16px; }
.mj-key select option { color: #110c22; }
.mj-key:focus-within { outline: 3px solid #ffd23e; outline-offset: 2px; }
.mj-key.off { opacity: 0.7; cursor: default; }
.mj-key.off select { cursor: default; }
.mj-stage button:disabled, .mj-stage select:disabled, .mj-stage input:disabled { cursor: default; opacity: 0.55; }
.mj-stage button:focus-visible, .mj-stage select:focus-visible, .mj-stage input:focus-visible { outline: 3px solid #ffd23e; outline-offset: 2px; }

.mj-ruler, .mj-track { display: grid; grid-template-columns: minmax(200px, 250px) minmax(0, 1fr); gap: 14px; align-items: center; }
.mj-ruler-steps, .mj-steps { display: grid; grid-template-columns: repeat(16, minmax(0, 1fr)); gap: clamp(4px, 0.6cqw, 7px); }
.mj-ruler-steps span { text-align: center; font: 600 12px Figtree, sans-serif; color: rgba(255,255,255,0.3); padding: 2px 0; border-radius: 6px; }
.mj-ruler-steps span.beat { font: 800 13px Parkinsans, sans-serif; color: rgba(255,255,255,0.6); }
.mj-ruler-steps span.now { background: #fff; color: #110c22; }

.mj-grid { display: grid; gap: clamp(10px, 1.3cqw, 16px); }
.mj-track { padding: 8px; margin: -8px; border-radius: 20px; }
.mj-track.mine { background: color-mix(in srgb, var(--c) 12%, transparent); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent); }
.mj-head { display: grid; grid-template-columns: 10px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 12px; row-gap: 6px; align-items: center; min-width: 0; }
.mj-meter { grid-row: 1 / span 2; align-self: stretch; width: 10px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; display: flex; align-items: flex-end; }
.mj-meter i { display: block; width: 100%; height: 100%; border-radius: 99px; background: linear-gradient(to top, var(--c), color-mix(in srgb, var(--c) 40%, #fff)); transform-origin: bottom; }
.mj-name { display: flex; align-items: center; gap: 10px; min-width: 0; }
.mj-name b { font: 800 18px Parkinsans, Figtree, sans-serif; letter-spacing: -0.01em; color: var(--c); white-space: nowrap; }
.mj-owner { display: inline-flex; align-items: center; gap: 6px; min-width: 0; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.78); }
.mj-owner > span:not(.mj-avatar) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mj-avatar { flex: none; width: 22px; height: 22px; border-radius: 99px; display: inline-grid; place-items: center; color: var(--ink); font: 800 11px Parkinsans, sans-serif; }
.mj-take { all: unset; cursor: pointer; padding: 2px 9px; border-radius: 99px; font: 700 12px Figtree, sans-serif; color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); opacity: 0; transition: opacity .15s; }
.mj-track:hover .mj-take, .mj-take:focus-visible { opacity: 1; }
.mj-tools { display: flex; align-items: center; gap: 10px; min-width: 0; }
.mj-brush { flex: none; display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 99px; background: rgba(255,255,255,0.08); }
.mj-brush button { all: unset; cursor: pointer; width: 26px; height: 26px; border-radius: 99px; display: grid; place-items: center; font: 800 16px Parkinsans, sans-serif; color: rgba(255,255,255,0.8); }
.mj-brush button:hover:not(:disabled) { background: rgba(255,255,255,0.14); }
.mj-brush span { min-width: 30px; text-align: center; font: 800 13px Parkinsans, sans-serif; color: var(--c); }
.mj-vol { position: relative; flex: 1; min-width: 0; height: 26px; display: flex; align-items: center; }
.mj-vol-track { position: relative; width: 100%; height: 6px; border-radius: 99px; background: rgba(255,255,255,0.12); }
.mj-vol-track i { position: absolute; left: 0; top: 0; bottom: 0; width: var(--v); border-radius: 99px; background: var(--c); }
.mj-vol-track b { position: absolute; top: 50%; left: var(--v); width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 99px; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.35); }
.mj-vol input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0 !important; cursor: pointer; }
.mj-vol.off input { cursor: default; }
.mj-vol.off .mj-vol-track b { background: rgba(255,255,255,0.6); }
.mj-vol:focus-within .mj-vol-track { outline: 3px solid #ffd23e; outline-offset: 4px; }

.mj-cell { all: unset; box-sizing: border-box; cursor: pointer; position: relative; aspect-ratio: 1 / 1.22; min-height: 34px; border-radius: clamp(8px, 1cqw, 12px); background: rgba(255,255,255,0.07); display: grid; place-items: center; }
.mj-cell.alt { background: rgba(255,255,255,0.045); }
.mj-cell:hover { background: rgba(255,255,255,0.14); }
.mj-cell[aria-disabled="true"] { cursor: default; }
.mj-cell.on { background: linear-gradient(160deg, color-mix(in srgb, var(--c) 70%, #fff), var(--c) 55%); box-shadow: inset 0 -4px 0 rgba(0,0,0,0.18); }
.mj-cell.on.loud { box-shadow: inset 0 -4px 0 rgba(0,0,0,0.18), 0 0 0 2px #fff inset; }
.mj-cell.now::before { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit; background: rgba(255,255,255,0.16); }
.mj-cell.hit::before { background: rgba(255,255,255,0.24); }
.mj-cell.hit::after { content: ''; position: absolute; inset: -4px; pointer-events: none; border-radius: calc(clamp(8px, 1cqw, 12px) + 4px); border: 3px solid #fff; box-sizing: border-box; box-shadow: 0 0 26px 5px color-mix(in srgb, var(--c) 80%, transparent), inset 0 0 14px color-mix(in srgb, var(--c) 60%, #fff); }
.mj-cell.hit { z-index: 1; }
.mj-cell span { position: relative; z-index: 1; font: 800 clamp(10px, 1.1cqw, 13px) Parkinsans, sans-serif; color: var(--ink); }
.mj-cell:focus-visible { outline: 3px solid #ffd23e; outline-offset: 2px; z-index: 2; }

.mj-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px 18px; flex-wrap: wrap; padding-top: 4px; }
.mj-you { display: inline-flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7); }
.mj-you input { font: 600 15px Figtree, sans-serif; color: #fff; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); border-radius: 12px; padding: 9px 12px; width: 170px; max-width: 100%; box-sizing: border-box; outline: none; }
.mj-you input::placeholder { color: rgba(255,255,255,0.45); }
.mj-hint { font-size: 13px; color: rgba(255,255,255,0.55); }

.mj-notes { display: grid; gap: 6px; margin-top: 14px; }
.mj-note { margin: 0; font-size: 14px; line-height: 1.55; color: hsl(var(--muted-foreground)); }
.mj-note b, .mj-saving { color: hsl(var(--foreground)); }
.mj-note code { font-size: 13px; padding: 1px 6px; border-radius: 6px; background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.mj-prompt { display: inline-block; margin: 4px 6px 0 0; padding: 3px 10px; border-radius: 99px; background: hsl(var(--muted)); color: hsl(var(--foreground)); font-size: 13px; }

@container (max-width: 720px) {
  .mj-ruler { display: none; }
  .mj-track { grid-template-columns: 1fr; gap: 8px; }
  .mj-vol { max-width: 220px; }
  .mj-steps { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  .mj-cell { aspect-ratio: auto; height: 40px; }
  .mj-cell span { position: relative; z-index: 1; font-size: 12px; }
  .mj-take { opacity: 1; }
  .mj-hint { display: none; }
  .mj-controls { width: 100%; }
  .mj-play { flex: 1; justify-content: center; }
}
@container (max-width: 460px) {
  .mj-key { padding-left: 12px; }
  .mj-ctl-value { min-width: 44px; }
}
@media (prefers-reduced-motion: reduce) { .mj-play, .mj-take { transition: none; } }
`
