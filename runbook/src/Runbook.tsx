import * as React from 'react'
import { edit, useStore, useStoreStatus } from 'kunobi'
import type { RunbookRunsStore } from '../types/runbook-runs.store'
import { STEP_IDS, blockedBy, chartSources, nextAction, runChecks, type Check, type Cluster, type HR, type Result, type StepId } from './cluster'
import { useCluster } from './live'
import { localizeSeed } from './seed'

/*
 * A runbook for a stuck Flux HelmRelease. Each step reads the cluster selected in the tab (live in
 * the person's own preview, otherwise the snapshot in data/cluster.json), says pass, fail or
 * unknown with the value it saw, and shows the command a person would run. The page never runs
 * a command. Runs that people (or agents) record live in the runbook-runs LiveStore.
 */

export const STORE = 'runbook-runs'
const C = { midnight: '#06213f', deep: '#0b2d52', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8', coral: '#e2603f' }
const RESULT_COLOR: Record<Result, string> = { pass: C.tide, fail: C.coral, unknown: C.sun }
const NAME_KEY = 'runbook.name'

const readName = () => {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
const keepName = (v: string) => {
  try {
    window.localStorage.setItem(NAME_KEY, v)
  } catch {
    /* per-viewer convenience only */
  }
}
const newId = (target: string) => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${target.split('/').pop()}`
const keyOf = (hr: HR) => `${hr.ns}/${hr.n}`

function Chip({ result, w, small }: { result: Result | null | undefined; w: any; small?: boolean }) {
  const r = result ?? 'unknown'
  return (
    <span className={`rb-chip ${small ? 'sm' : ''}`} style={{ ['--c' as any]: RESULT_COLOR[r] }}>
      <i aria-hidden="true" />
      {w.result[r]}
    </span>
  )
}

function Command({ cmd, w }: { cmd: string; w: any }) {
  const [state, setState] = React.useState<'' | 'ok' | 'no'>('')
  const copy = () => {
    try {
      const p = navigator.clipboard?.writeText(cmd)
      if (!p) return setState('no')
      p.then(() => setState('ok'), () => setState('no'))
    } catch {
      setState('no')
    }
    window.setTimeout(() => setState(''), 2200)
  }
  return (
    <div className="rb-cmd">
      <code>
        <span aria-hidden="true">$ </span>
        {cmd}
      </code>
      <button type="button" onClick={copy} aria-label={`${w.copy}: ${cmd}`}>
        {state === 'ok' ? w.copied : state === 'no' ? w.selectToCopy : w.copy}
      </button>
    </div>
  )
}

export function Runbook({ snapshot, saved, translated, w }: { snapshot: Cluster; saved: RunbookRunsStore; translated?: unknown; w: any }) {
  const src = useCluster(snapshot)
  const cluster = src.cluster
  const stored = useStore(STORE) as RunbookRunsStore | undefined
  const status = useStoreStatus(STORE) as any
  const open = (status?.status === 'open' || status?.status === 'paused') && stored !== undefined
  const canEdit = open && status?.status === 'open' && Boolean(status?.canEdit)
  // Seeded runs show in the reader's language until someone changes them; display only.
  const log: RunbookRunsStore = localizeSeed((open ? stored : saved) ?? { runs: {}, checks: {} }, saved, translated)

  const stuck = cluster.helmreleases.filter((h) => h.ready?.s !== 'True')
  const [pick, setPick] = React.useState<string | null>(null)
  const hr = stuck.find((h) => keyOf(h) === pick) ?? stuck[0]
  const target = hr ? keyOf(hr) : ''

  const dateFmt = React.useMemo(() => new Intl.DateTimeFormat(w.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }), [w.locale])
  const stampFmt = React.useMemo(() => new Intl.DateTimeFormat(w.locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }), [w.locale])
  const localFmt = React.useMemo(() => new Intl.DateTimeFormat(w.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), [w.locale])
  const words = { seen: w.seen, date: (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '–') }
  const checks: Check[] = hr ? runChecks(cluster, hr, words) : []
  const by = Object.fromEntries(checks.map((c) => [c.id, c])) as Record<StepId, Check>
  const next = hr ? nextAction(cluster, hr, checks) : null
  const count = (r: Result) => checks.filter((c) => c.result === r).length

  // Runs, newest first, with their checks.
  const runs = React.useMemo(() => {
    const checksByRun = new Map<string, { id: string; step: StepId; result: Result; seen: string; note: string }[]>()
    for (const [id, c] of Object.entries(log.checks ?? {})) {
      if (!c.run || !c.step) continue
      const list = checksByRun.get(c.run) ?? []
      list.push({ id, step: c.step, result: (c.result ?? 'unknown') as Result, seen: c.seen ?? '', note: c.note ?? '' })
      checksByRun.set(c.run, list)
    }
    return Object.entries(log.runs ?? {})
      .map(([id, r]) => ({ id, ...r, checks: (checksByRun.get(id) ?? []).sort((a, b) => STEP_IDS.indexOf(a.step) - STEP_IDS.indexOf(b.step)) }))
      .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  }, [log])
  const lastFor = (step: StepId) => {
    for (const r of runs) {
      if (r.target !== target) continue
      const c = r.checks.find((x) => x.step === step)
      if (c) return { ...c, by: r.by, at: r.at }
    }
    return null
  }

  // Recording.
  const [name, setName] = React.useState(readName)
  const [runNote, setRunNote] = React.useState('')
  const [notes, setNotes] = React.useState<Record<string, string>>({})
  const [session, setSession] = React.useState<Record<string, string>>({}) // target -> run id started here
  const [answer, setAnswer] = React.useState<string>('')
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const who = name.trim() || w.unnamed
  const sourceTag = src.live ? 'live' : 'snapshot'
  const report = (res: any) => setAnswer(res?.status === 'applied' || res?.status === 'unchanged' ? w.recorded : `${w.notRecorded} ${res?.reason ?? res?.status ?? ''}`.trim())

  const recordAll = async () => {
    if (!hr) return
    const id = newId(target)
    const at = new Date().toISOString()
    const res = await edit(STORE, (d: RunbookRunsStore) => {
      d.runs[id] = { target, by: who, at, source: sourceTag, note: runNote.trim() }
      for (const c of checks) d.checks[`${id}-${c.id}`] = { run: id, step: c.id, result: c.result, seen: c.seen, note: (notes[c.id] ?? '').trim() }
    })
    report(res)
    if ((res as any)?.status === 'applied') {
      setSession((s) => ({ ...s, [target]: id }))
      setRunNote('')
      setNotes({})
      setExpanded(id)
    }
  }
  const recordStep = async (c: Check) => {
    if (!hr) return
    const id = session[target] ?? newId(target)
    const at = new Date().toISOString()
    const res = await edit(STORE, (d: RunbookRunsStore) => {
      if (!d.runs[id]) d.runs[id] = { target, by: who, at, source: sourceTag, note: '' }
      d.checks[`${id}-${c.id}`] = { run: id, step: c.id, result: c.result, seen: c.seen, note: (notes[c.id] ?? '').trim() }
    })
    report(res)
    if ((res as any)?.status === 'applied') {
      setSession((s) => ({ ...s, [target]: id }))
      setNotes((n) => ({ ...n, [c.id]: '' }))
    }
  }

  // Plain words for people who do not read Flux status.
  const plain: string[] = []
  if (hr) {
    const blocked = blockedBy(cluster, hr)
    const r = (id: StepId) => by[id]?.result
    plain.push(r('workloads') === 'pass' ? w.plain.running(hr.n) : r('workloads') === 'fail' ? w.plain.notRunning(hr.n) : w.plain.unknownRunning(hr.n))
    if (r('suspend') === 'fail') plain.push(w.plain.paused)
    else if (r('source') === 'fail') plain.push(w.plain.noPackage)
    else if (r('retries') === 'fail') plain.push(w.plain.gaveUp)
    else if (r('ready') === 'fail') plain.push(w.plain.unhealthy)
    if (blocked.length) plain.push(w.plain.waitingOn(blocked.length))
    if (r('pending') === 'fail') plain.push(w.plain.newerWaiting)
    else if (r('pending') === 'pass' && blocked.length) plain.push(w.plain.nothingNew)
  }
  const definedIn = hr ? cluster.kustomizations.find((k) => k.hrs.includes(keyOf(hr))) : undefined
  const { first } = hr ? chartSources(cluster, hr) : { first: null }

  return (
    <div className="rb-root">
      <style>{CSS}</style>
      <div className="rb-in">
        <header className="rb-head">
          <div className="rb-htext">
            <h1 className="rb-title">{w.title}</h1>
            <p className="rb-sub">{w.sub(src.live ? null : cluster.label)}</p>
          </div>
          <div className="rb-kpis" aria-label={w.thisTarget}>
            <span><b style={{ color: C.coral }}>{count('fail')}</b> {w.result.fail}</span>
            <span><b style={{ color: C.tide }}>{count('pass')}</b> {w.result.pass}</span>
            <span><b style={{ color: C.sun }}>{count('unknown')}</b> {w.result.unknown}</span>
          </div>
        </header>

        <div className="rb-bar" role="status">
          {src.live ? (
            <span className="rb-badge live"><i />{w.live} · {stampFmt.format(new Date(cluster.takenAt))} UTC</span>
          ) : (
            <span className="rb-badge snap" title={src.allow ? w.liveAsk : w.liveOff}><i />{w.snapshot(stampFmt.format(new Date(snapshot.takenAt)))}</span>
          )}
          {!src.live && src.allow ? <button type="button" className="rb-btn ghost" onClick={src.allow}>{w.useLive}</button> : null}
          {!src.live && !src.allow ? <span className="rb-muted">{src.loading ? w.liveLoading : w.liveOff}</span> : null}
          {stuck.length ? (
            <nav className="rb-targets" aria-label={w.pickTarget}>
              <span className="rb-label">{w.stuckOf(stuck.length, cluster.hrTotal)}</span>
              {stuck.map((h) => (
                <button type="button" key={keyOf(h)} className={`rb-target ${keyOf(h) === target ? 'on' : ''}`} aria-pressed={keyOf(h) === target} onClick={() => setPick(keyOf(h))}>
                  <i style={{ background: h.ready?.s === 'False' ? C.coral : C.sun }} aria-hidden="true" />
                  <b>{h.n}</b>
                  <span>{h.ready?.r ?? '–'}</span>
                </button>
              ))}
            </nav>
          ) : null}
        </div>

        <div className="rb-grid">
          <section className="rb-steps" aria-label={w.steps}>
            {stuck.length === 0 ? (
              <div className="rb-box"><b>{w.allReady(cluster.hrTotal)}</b></div>
            ) : (
              <ol>
                {checks.map((c, i) => {
                  const last = lastFor(c.id)
                  const changed = last && last.result !== c.result
                  return (
                    <li key={c.id} className={`rb-step ${c.result}`}>
                      <span className="rb-num">{i + 1}</span>
                      <div className="rb-main">
                        <div className="rb-row">
                          <h3>{w.step[c.id].title}</h3>
                          <Chip result={c.result} w={w} />
                        </div>
                        <pre className="rb-seen">{c.seen}</pre>
                        {c.cmd.map((cmd) => <Command key={cmd} cmd={cmd} w={w} />)}
                        <div className="rb-foot">
                          <span className={`rb-last ${changed ? 'changed' : ''}`}>
                            {last ? `${changed ? w.wasBefore(w.result[last.result]) : w.sameAsLast} · ${last.by} · ${last.at ? localFmt.format(new Date(last.at)) : '–'}` : w.neverRecorded}
                          </span>
                          <details className="rb-more">
                            <summary>{w.more}</summary>
                            <p>{w.step[c.id].why}</p>
                            {c.detail ? <pre className="rb-detail">{c.detail}</pre> : null}
                            {canEdit ? (
                              <input
                                type="text"
                                value={notes[c.id] ?? ''}
                                placeholder={w.stepNote}
                                aria-label={`${w.stepNote}: ${w.step[c.id].title}`}
                                onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                              />
                            ) : null}
                          </details>
                          {canEdit ? <button type="button" className="rb-btn ghost sm" onClick={() => recordStep(c)}>{w.recordStep}</button> : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <aside className="rb-side">
            {next && next.kind !== 'none' ? (
              <section className="rb-box rb-next">
                <h2>{w.next.title}</h2>
                <p>{next.kind === 'source' ? w.next.source(first?.chart ?? '–', first?.srcRef?.name ?? '–', definedIn?.src?.name ?? null) : w.next[next.kind]}</p>
                {next.cmds.map((c) => <Command key={c} cmd={c} w={w} />)}
                {'timeout' in next && next.timeout ? <p className="rb-warn">{w.next.timeout}</p> : null}
                <details className="rb-more">
                  <summary>{w.inPlainWords}</summary>
                  <p>{plain.join(' ')}</p>
                </details>
              </section>
            ) : null}

            <section className="rb-box rb-log">
              <div className="rb-row">
                <h2>{w.lastRuns}</h2>
                <span className="rb-muted">{open ? (status?.saved ? w.shared : w.saving) : w.readOnly}</span>
              </div>
              {canEdit && hr ? (
                <div className="rb-record">
                  <input type="text" className="name" value={name} placeholder={w.yourName} aria-label={w.yourName} onChange={(e) => { setName(e.target.value); keepName(e.target.value) }} />
                  <input type="text" value={runNote} placeholder={w.runNote} aria-label={w.runNote} onChange={(e) => setRunNote(e.target.value)} />
                  <button type="button" className="rb-btn" onClick={recordAll}>{w.recordAll}</button>
                  {answer ? <span className="rb-muted rb-answer" role="status">{answer}</span> : null}
                </div>
              ) : null}
              {runs.length === 0 ? <p className="rb-muted">{w.noRuns}</p> : null}
              <ul className="rb-runs">
                {runs.slice(0, 10).map((r) => {
                  const tally = (x: Result) => r.checks.filter((c) => c.result === x).length
                  const isOpen = expanded === r.id
                  return (
                    <li key={r.id}>
                      <button type="button" className="rb-run" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : r.id)}>
                        <span className="rb-when">{r.at ? localFmt.format(new Date(r.at)) : '–'}</span>
                        <span className="rb-who"><b>{r.by ?? w.unnamed}</b> · {(r.target ?? '').split('/').pop()}{r.checks.length === 1 ? ` · ${w.step[r.checks[0].step].title}` : ''}</span>
                        <span className="rb-tally">
                          {(['fail', 'pass', 'unknown'] as Result[]).filter((x) => tally(x)).map((x) => (
                            <span key={x} className="rb-dot" style={{ ['--c' as any]: RESULT_COLOR[x] }} title={w.result[x]}><i />{tally(x)}</span>
                          ))}
                        </span>
                        {r.note ? <span className="rb-runnote">{r.note}</span> : null}
                      </button>
                      {isOpen ? (
                        <table className="rb-detailtable">
                          <tbody>
                            {r.checks.map((c) => (
                              <tr key={c.id}>
                                <td><Chip result={c.result} w={w} small /></td>
                                <th scope="row">{w.step[c.step]?.title ?? c.step}</th>
                                <td><code>{c.seen}</code>{c.note ? <div className="rb-cnote">{c.note}</div> : null}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>

            <details className="rb-box rb-change">
              <summary>{w.change}</summary>
              <ul>{w.prompts.map((p: string) => <li key={p}>{p}</li>)}</ul>
            </details>
          </aside>
        </div>
      </div>
    </div>
  )
}

const CSS = `
.rb-root { width: 100%; box-sizing: border-box; padding: 12px 20px 32px; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); font-size: 13.5px; }
.rb-in { container-type: inline-size; }
.rb-root h1, .rb-root h2, .rb-root h3 { font-family: Parkinsans, Figtree, sans-serif; letter-spacing: -0.01em; margin: 0; }
.rb-root h2 { font-size: 15px; font-weight: 600; }
.rb-root pre, .rb-root code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.rb-muted { color: hsl(var(--muted-foreground)); font-size: 12.5px; }
.rb-label { font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: hsl(var(--muted-foreground)); }
.rb-head { border-radius: 14px; padding: 14px 18px; color: #fff; background: radial-gradient(120% 160% at 10% 0%, ${C.deep} 0%, ${C.midnight} 60%, #031426 100%); display: flex; flex-wrap: wrap; gap: 10px 24px; align-items: center; justify-content: space-between; }
.rb-htext { min-width: 0; }
.rb-title { font: 800 clamp(20px, 2.4cqw, 26px)/1.1 Parkinsans, sans-serif; letter-spacing: -0.02em; }
.rb-sub { margin: 3px 0 0; font-size: 13px; color: rgba(255,255,255,.72); overflow-wrap: anywhere; }
.rb-kpis { display: flex; gap: 16px; font-size: 13px; color: rgba(255,255,255,.75); }
.rb-kpis b { font: 800 22px/1 Parkinsans, sans-serif; margin-right: 3px; }
.rb-bar { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 10px 0; }
.rb-badge { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; padding: 5px 10px; border-radius: 999px; background: hsl(var(--muted)); }
.rb-badge i { width: 8px; height: 8px; border-radius: 50%; background: ${C.sun}; }
.rb-badge.live i { background: ${C.tide}; box-shadow: 0 0 0 3px ${C.tide}40; }
.rb-targets { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-left: auto; }
.rb-target { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; padding: 5px 10px; border-radius: 8px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); font-size: 12.5px; }
.rb-target i { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.rb-target b { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; }
.rb-target span { color: hsl(var(--muted-foreground)); }
.rb-target.on { border-color: ${C.horizon}; box-shadow: 0 0 0 1px ${C.horizon}; }
.rb-btn { all: unset; box-sizing: border-box; cursor: pointer; font: 600 12.5px Figtree, sans-serif; padding: 7px 12px; border-radius: 8px; background: ${C.horizon}; color: #fff; white-space: nowrap; text-align: center; }
.rb-btn:hover { filter: brightness(1.08); }
.rb-btn.ghost { background: transparent; color: hsl(var(--foreground)); box-shadow: inset 0 0 0 1px hsl(var(--border)); padding: 5px 10px; }
.rb-btn.ghost:hover { background: hsl(var(--muted)); }
.rb-btn.sm { font-size: 12px; padding: 3px 9px; }
.rb-btn:focus-visible, .rb-target:focus-visible, .rb-run:focus-visible, .rb-cmd button:focus-visible, .rb-more summary:focus-visible, .rb-change summary:focus-visible { outline: 2px solid ${C.ocean}; outline-offset: 2px; }
.rb-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(340px, 1fr); gap: 12px; align-items: start; }
.rb-box { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 12px; padding: 12px 14px; }
.rb-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.rb-row { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; justify-content: space-between; }
.rb-steps ol { list-style: none; margin: 0; padding: 0; border: 1px solid hsl(var(--border)); border-radius: 12px; overflow: hidden; background: hsl(var(--card)); }
.rb-step { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; padding: 10px 14px; border-top: 1px solid hsl(var(--border)); position: relative; }
.rb-step:first-child { border-top: 0; }
.rb-step::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--edge, transparent); }
.rb-step.fail { --edge: ${C.coral}; }
.rb-step.unknown { --edge: ${C.sun}; }
.rb-num { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; font: 700 12px Figtree, sans-serif; background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
.rb-main { min-width: 0; }
.rb-main h3 { font-size: 14px; font-weight: 600; }
.rb-seen { margin: 4px 0; font-size: 12.5px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; font-weight: 600; }
.rb-detail { margin: 4px 0; font-size: 12px; color: hsl(var(--muted-foreground)); white-space: pre-wrap; overflow-wrap: anywhere; }
.rb-cmd { display: flex; align-items: stretch; margin: 4px 0; border-radius: 7px; border: 1px solid hsl(var(--border)); background: hsl(var(--muted) / .6); overflow: hidden; }
.rb-cmd code { flex: 1; min-width: 0; padding: 5px 9px; font-size: 12px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; user-select: all; }
.rb-cmd code span { color: hsl(var(--muted-foreground)); user-select: none; }
.rb-cmd button { all: unset; cursor: pointer; flex: none; padding: 0 10px; font: 600 11.5px Figtree, sans-serif; color: hsl(var(--muted-foreground)); border-left: 1px solid hsl(var(--border)); }
.rb-cmd button:hover { color: hsl(var(--foreground)); background: hsl(var(--muted)); }
.rb-foot { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; margin-top: 2px; }
.rb-last { font-size: 11.5px; color: hsl(var(--muted-foreground)); }
.rb-last.changed { color: hsl(var(--foreground)); font-weight: 600; }
.rb-more { font-size: 12.5px; }
.rb-more summary, .rb-change summary { cursor: pointer; color: hsl(var(--muted-foreground)); font-weight: 600; font-size: 12px; }
.rb-more[open] { flex-basis: 100%; order: 3; }
.rb-more p { margin: 4px 0; line-height: 1.45; }
.rb-more input, .rb-record input { box-sizing: border-box; width: 100%; font: 400 12.5px Figtree, sans-serif; padding: 5px 9px; border-radius: 7px; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--foreground)); margin-top: 4px; }
.rb-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; padding: 2px 9px 2px 7px; border-radius: 999px; background: color-mix(in srgb, var(--c) 18%, transparent); color: hsl(var(--foreground)); white-space: nowrap; }
.rb-chip i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
.rb-chip.sm { font-size: 11px; font-weight: 600; padding: 1px 7px 1px 6px; }
.rb-chip.sm i { width: 6px; height: 6px; }
.rb-next p { margin: 6px 0; line-height: 1.45; }
.rb-warn { font-size: 12px; padding: 6px 9px; border-radius: 7px; background: ${C.sun}22; }
.rb-record { display: grid; grid-template-columns: 120px minmax(0, 1fr) auto; gap: 6px; align-items: center; margin: 8px 0; }
.rb-record input { margin: 0; }
.rb-answer { grid-column: 1 / -1; }
.rb-runs { list-style: none; margin: 8px 0 0; padding: 0; }
.rb-runs > li { border-top: 1px solid hsl(var(--border)); }
.rb-run { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; padding: 7px 2px; font-size: 12.5px; }
.rb-run:hover { background: hsl(var(--muted) / .5); }
.rb-when { font-variant-numeric: tabular-nums; color: hsl(var(--muted-foreground)); }
.rb-who { overflow-wrap: anywhere; }
.rb-tally { display: flex; gap: 8px; }
.rb-dot { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-variant-numeric: tabular-nums; }
.rb-dot i { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
.rb-runnote { grid-column: 2 / -1; font-size: 12px; color: hsl(var(--muted-foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rb-detailtable { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
.rb-detailtable th { text-align: left; font-weight: 600; padding: 4px 8px; vertical-align: top; }
.rb-detailtable td { padding: 4px 2px; vertical-align: top; }
.rb-detailtable code { font-size: 11.5px; overflow-wrap: anywhere; white-space: pre-wrap; }
.rb-cnote { margin-top: 2px; color: hsl(var(--muted-foreground)); font-style: italic; }
.rb-change ul { margin: 8px 0 0; padding-left: 18px; line-height: 1.5; font-size: 12.5px; }
@container (max-width: 900px) {
  .rb-grid { grid-template-columns: 1fr; }
  .rb-targets { margin-left: 0; }
}
@container (max-width: 520px) {
  .rb-step { padding: 10px; gap: 8px; }
  .rb-record { grid-template-columns: 1fr; }
  .rb-run { grid-template-columns: 1fr auto; }
  .rb-who { grid-column: 1 / -1; grid-row: 2; }
  .rb-runnote { grid-column: 1 / -1; }
}
`
