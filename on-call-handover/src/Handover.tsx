import * as React from 'react'
import { edit, useStore, useStoreStatus } from 'kunobi'
import type { OnCallHandoverItemsStore } from '../types/on-call-handover-items.store'
import { groupEvents, useCluster, type Snapshot, type EventGroup } from './live'

/*
 * An on-call handover. Cluster facts come from the cluster selected in the person's tab, or from the
 * sample in data/cluster.json; the summary from data/handover.json. The open items, who handed over
 * and who took over live in the on-call-handover-items LiveStore, so the incoming person acks each
 * item and comments on it.
 */

export const STORE = 'on-call-handover-items'

type Store = OnCallHandoverItemsStore
type Item = Store['items'][string] & { id: string }
type Status = 'open' | 'acked' | 'done'
type Severity = 'high' | 'medium' | 'low'

interface Note { headline: string; lines: string[] }
export interface HandoverText { writtenAt: string; rota: string[]; en: Note; es: Note; [lang: string]: unknown }

const C = { midnight: '#06213f', deep: '#0b2d52', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8', coral: '#e2603f' }
const SEV: Record<Severity, string> = { high: C.coral, medium: C.sun, low: C.ocean }
const STATUS: Status[] = ['open', 'acked', 'done']
const HOUR = 3_600_000
const KIND: Record<string, string> = { HelmRelease: 'HR', Kustomization: 'KS', StatefulSet: 'STS', HelmRepository: 'Repo' }

export function Handover({ snap, text, start, w, lang }: { snap: Snapshot; text: HandoverText; start: Store; w: any; lang: string }) {
  const cluster = useCluster(snap)
  const stored = useStore(STORE) as Store | undefined
  const st = useStoreStatus(STORE) as { status?: string; canEdit?: boolean; saved?: boolean } | undefined
  // Without the store (web links, renders, other builds) the page shows the saved items, read-only.
  const open = (st?.status === 'open' || st?.status === 'paused') && stored !== undefined
  const canEdit = open && st?.status === 'open' && Boolean(st?.canEdit)
  const data = (open ? stored : start) ?? start
  const items: Item[] = Object.entries(data.items ?? {})
    .map(([id, v]) => ({ ...v, id }))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))

  const end = Date.parse(cluster.at)
  const startT = end - snap.windowHours * HOUR
  const groups = groupEvents(cluster.events, startT, end)
  const restarts = cluster.pods.filter((p) => p.last && Date.parse(p.last) >= startT).sort((a, b) => (a.last! < b.last! ? -1 : 1))
  const crashed = restarts.filter((p) => p.why.some((r) => r === 'Error' || r === 'OOMKilled'))
  const changes = cluster.changes.filter((c) => Date.parse(c.last) >= startT)
  const t = cluster.totals
  const fluxBad = cluster.ks.length + cluster.hr.length + cluster.repos.length
  const counts = { open: 0, acked: 0, done: 0 } as Record<Status, number>
  for (const i of items) counts[(i.status ?? 'open') as Status]++

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(w.locale, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false })
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(w.locale, { timeZone: 'UTC', day: 'numeric', month: 'short' })
  const fmtWhen = (iso: string) => `${fmtDay(iso)}, ${fmtTime(iso)} UTC`
  const since = (iso: string) => {
    const ms = end - Date.parse(iso)
    if (!(ms >= 0)) return ''
    if (ms < HOUR) return w.ago.min(Math.max(1, Math.round(ms / 60_000)))
    if (ms < 48 * HOUR) return w.ago.h(Math.round(ms / HOUR))
    return w.ago.since(fmtDay(iso))
  }
  const note: Note = (text[lang] as Note) ?? text.en

  const save = (fn: (d: Store) => void) => edit(STORE, fn)
  const setStatus = (i: Item, s: Status) =>
    save((d) => {
      const row = d.items[i.id]
      if (!row) return
      row.status = s
      if (s !== 'open' && !row.owner && d.takenBy) row.owner = d.takenBy
    })
  const setOwner = (i: Item, owner: string) => save((d) => { if (d.items[i.id]) d.items[i.id].owner = owner })
  const setComment = (i: Item, comment: string) => save((d) => { if (d.items[i.id]) d.items[i.id].comment = comment })
  const takeOver = (who: string) => save((d) => { d.takenBy = who; d.takenAt = who ? new Date().toISOString() : '' })

  const [filter, setFilter] = React.useState<'all' | Status>('all')
  const shown = items.filter((i) => filter === 'all' || (i.status ?? 'open') === filter)

  return (
    <div className="oc-root">
      <style>{CSS}</style>
      <div className="oc-in">
        <header className="oc-head">
          <div className="oc-headtop">
            <div className="oc-titles">
              <div className="oc-eyebrow">{w.eyebrow}{cluster.live ? null : <> · {w.sampleCluster}</>}</div>
              <h1 className="oc-title">{w.title}</h1>
            </div>
            <SourceBadge cluster={cluster} w={w} fmtWhen={fmtWhen} />
          </div>
          <div className="oc-bar">
            <div className="oc-shift">
              <div className="oc-person">
                <span className="oc-label">{w.handedBy}</span>
                <b>{data.handedBy || '—'}</b>
                <span className="oc-sub">{data.handedAt ? fmtWhen(data.handedAt) : ''}</span>
              </div>
              <span className="oc-arrow" aria-hidden="true">→</span>
              <TakeOver data={data} rota={text.rota} canEdit={canEdit} onTake={takeOver} w={w} fmtWhen={fmtWhen} />
              <div className="oc-person">
                <span className="oc-label">{w.window}</span>
                <b className="mono">{fmtTime(new Date(startT).toISOString())}–{fmtTime(cluster.at)}</b>
                <span className="oc-sub">{snap.windowHours} h · UTC</span>
              </div>
            </div>
            <div className="oc-kpis">
              <Kpi label={w.kpi.nodes} value={`${t.nodesReady}/${t.nodes}`} ok={t.nodesReady === t.nodes} />
              <Kpi label={w.kpi.pods} value={String(t.notReady)} sub={w.kpi.podsSub(t.running)} ok={t.notReady === 0} />
              <Kpi label={w.kpi.flux} value={String(fluxBad)} sub={w.kpi.fluxSub(cluster.ks.length, cluster.hr.length, cluster.repos.length)} ok={fluxBad === 0} />
              <Kpi label={w.kpi.restarts} value={String(crashed.length)} sub={w.kpi.restartsSub} ok={crashed.length === 0} warn />
              <Kpi label={w.kpi.items} value={String(counts.open)} sub={w.kpi.itemsSub(counts.acked, counts.done)} ok={counts.open === 0} />
            </div>
          </div>
        </header>

        <div className="oc-grid">
          <section className="oc-panel oc-note" aria-labelledby="oc-note-h">
            <div className="oc-sechead">
              <h2 id="oc-note-h">{w.noteTitle}</h2>
              <span className="oc-sub">{fmtWhen(text.writtenAt)}</span>
            </div>
            <p className="oc-headline">{note.headline}</p>
            <ul className="oc-lines">{note.lines.slice(0, 3).map((p, i) => <li key={i}>{p}</li>)}</ul>
          </section>

          <section className="oc-panel oc-failp" aria-labelledby="oc-fail-h">
            <div className="oc-sechead">
              <h2 id="oc-fail-h">{w.failingTitle} <span className="oc-count">{fluxBad + cluster.sts.length}</span></h2>
              <span className="oc-sub">{w.failingSub(t.kustomizations, t.helmreleases, t.helmrepositories, t.statefulsets)}</span>
            </div>
            <ul className="oc-fail">
              {cluster.hr.map((h) => <FailRow key={`hr-${h.n}`} kind="HelmRelease" name={h.n} state={h.s} reason={h.reason} msg={h.m} since={since(h.t)} when={h.t ? fmtWhen(h.t) : ''} />)}
              {cluster.ks.map((k) => <FailRow key={`ks-${k.n}`} kind="Kustomization" name={k.n} state={k.s} reason={k.reason} msg={k.m} since={since(k.t)} when={k.t ? fmtWhen(k.t) : ''} />)}
              {cluster.sts.map((s) => <FailRow key={`sts-${s.ns}-${s.n}`} kind="StatefulSet" name={`${s.ns}/${s.n}`} state="False" reason={`${s.ready}/${s.want} ${w.ready}`} msg={w.stsMsg} since="" when="" />)}
              {cluster.repos.map((r) => <FailRow key={`repo-${r.n}`} kind="HelmRepository" name={r.n} state={r.s} reason={r.reason} msg={r.url} since={since(r.t)} when={r.t ? fmtWhen(r.t) : ''} />)}
              {fluxBad + cluster.sts.length === 0 ? <li className="oc-empty">{w.nothingFailing}</li> : null}
            </ul>
          </section>

          <section className="oc-panel oc-itemsp" aria-labelledby="oc-items-h">
            <div className="oc-sechead">
              <h2 id="oc-items-h">{w.itemsTitle} <span className="oc-count">{counts.open}</span></h2>
              <span className="oc-sub" aria-live="polite">{open && st?.saved === false ? w.saving : w.progressLabel(counts.acked + counts.done, items.length)}</span>
            </div>
            <div className="oc-itemsbar">
              <div className="oc-tabs" role="tablist">
                {(['all', ...STATUS] as const).map((f) => (
                  <button key={f} role="tab" aria-selected={filter === f} className={`oc-tab${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
                    {f === 'all' ? w.all : w.status[f]} <small>{f === 'all' ? items.length : counts[f]}</small>
                  </button>
                ))}
              </div>
              <div className="oc-progress" aria-hidden="true">
                {items.map((i) => <span key={i.id} className={`oc-pip ${i.status ?? 'open'}`} title={`${i.title}: ${w.status[i.status ?? 'open']}`} />)}
              </div>
            </div>
            <ol className="oc-items">
              {shown.map((i) => (
                <ItemCard key={i.id} item={i} rota={text.rota} canEdit={canEdit} w={w} since={since} fmtWhen={fmtWhen}
                  onStatus={(s) => setStatus(i, s)} onOwner={(o) => setOwner(i, o)} onComment={(c) => setComment(i, c)} />
              ))}
              {shown.length === 0 ? <li className="oc-empty">{w.noItems}</li> : null}
            </ol>
          </section>

          <section className="oc-panel oc-tlp" aria-labelledby="oc-tl-h">
            <div className="oc-sechead">
              <h2 id="oc-tl-h">{w.timelineTitle(snap.windowHours)}</h2>
              <span className="oc-sub">{w.utc}</span>
            </div>
            <Timeline groups={groups} restarts={restarts} changes={changes} start={startT} end={end} w={w} fmtTime={fmtTime} hours={snap.windowHours} />
          </section>
        </div>

        <details className="oc-foot">
          <summary>{w.change}</summary>
          <ul>{w.prompts.map((p: string) => <li key={p}>{p}</li>)}</ul>
        </details>
      </div>
    </div>
  )
}

function SourceBadge({ cluster, w, fmtWhen }: { cluster: ReturnType<typeof useCluster>; w: any; fmtWhen: (s: string) => string }) {
  if (cluster.live) return <div className="oc-badge live"><i />{w.live}</div>
  return (
    <div className="oc-badge snap" title={cluster.reason}>
      <b>{w.sample(fmtWhen(cluster.at))}</b>
      {cluster.allow ? <button className="oc-btn light" onClick={cluster.allow}>{w.useLive}</button> : null}
    </div>
  )
}

function Kpi({ label, value, sub, ok, warn }: { label: string; value: string; sub?: string; ok: boolean; warn?: boolean }) {
  return (
    <div className={`oc-kpi${ok ? ' ok' : warn ? ' warn' : ' bad'}`}>
      <span className="oc-kpil">{label}</span>
      <b>{value}</b>
      {sub ? <span className="oc-kpis-sub">{sub}</span> : null}
    </div>
  )
}

function TakeOver({ data, rota, canEdit, onTake, w, fmtWhen }: { data: Store; rota: string[]; canEdit: boolean; onTake: (who: string) => void; w: any; fmtWhen: (s: string) => string }) {
  const others = rota.filter((p) => p !== data.handedBy)
  const [who, setWho] = React.useState(others[0] ?? '')
  if (data.takenBy) {
    return (
      <div className="oc-person">
        <span className="oc-label">{w.takenBy}</span>
        <b>{data.takenBy}</b>
        <span className="oc-sub">
          {data.takenAt ? fmtWhen(data.takenAt) : ''}
          {canEdit ? <button className="oc-link" onClick={() => onTake('')}>{w.undo}</button> : null}
        </span>
      </div>
    )
  }
  return (
    <div className="oc-person">
      <span className="oc-label">{w.takenBy}</span>
      {canEdit ? (
        <span className="oc-take">
          <select aria-label={w.whoTakes} value={who} onChange={(e) => setWho(e.target.value)}>
            {others.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="oc-btn" disabled={!who} onClick={() => onTake(who)}>{w.takeOver}</button>
        </span>
      ) : (
        <b className="oc-pending">{w.notTaken}</b>
      )}
    </div>
  )
}

function FailRow({ kind, name, state, reason, msg, since, when }: { kind: string; name: string; state: string; reason: string; msg: string; since: string; when: string }) {
  return (
    <li className={`oc-failrow ${state === 'Unknown' ? 'unknown' : 'false'}`}>
      <details>
        <summary className="oc-failsum">
          <span className="oc-failname">
            <span className="oc-kind" title={kind}>{KIND[kind] ?? kind}</span>
            <span className="mono oc-name" title={name}>{name}</span>
          </span>
          <span className="oc-since" title={when}>{since}</span>
          <span className="oc-reason">{reason}</span>
        </summary>
        <div className="oc-msg mono">{msg}</div>
      </details>
    </li>
  )
}

function Timeline({ groups, restarts, changes, start, end, w, fmtTime, hours }: {
  groups: EventGroup[]; restarts: { ns: string; n: string; last: string | null; why: (string | null)[]; r: number }[]
  changes: { kind: string; obj: string; reason: string; last: string }[]; start: number; end: number; w: any; fmtTime: (s: string) => string; hours: number
}) {
  const x = (ms: number) => `${Math.min(100, Math.max(0, ((ms - start) / (end - start)) * 100))}%`
  const ticks = Array.from({ length: hours / 3 + 1 }, (_, i) => start + i * 3 * HOUR)
  const Axis = () => (
    <div className="oc-row oc-axisrow" aria-hidden="true">
      <div className="oc-rowlabel" />
      <div className="oc-axis">{ticks.map((tk) => <span key={tk} style={{ left: x(tk) }}>{fmtTime(new Date(tk).toISOString())}</span>)}</div>
      <div className="oc-rowcount" />
    </div>
  )
  const Grid = () => <>{ticks.map((tk) => <i key={tk} className="oc-gridline" style={{ left: x(tk) }} />)}</>
  return (
    <div className="oc-tl">
      <Axis />
      {groups.map((g) => (
        <div key={g.key} className="oc-row" title={g.msg}>
          <div className="oc-rowlabel">
            <span className="oc-kind" title={g.kind}>{KIND[g.kind] ?? g.kind}</span> <span className="mono">{g.obj}</span>
            <div className="oc-rowreason">{g.reason}{g.recurring ? ` · ${w.since(fmtDayShort(g.first, w.locale))}` : ''}</div>
          </div>
          <div className="oc-track">
            <Grid />
            {g.recurring ? <span className="oc-band" style={{ left: 0, right: `${100 - parseFloat(x(Date.parse(g.last)))}%` }} /> : null}
            {g.times.map((tm) => <span key={tm} className="oc-tick warn" style={{ left: x(tm) }} title={`${fmtTime(new Date(tm).toISOString())} UTC`} />)}
          </div>
          <div className="oc-rowcount">
            <b>{g.recurring ? '≈' : ''}{g.inWindow.toLocaleString(w.locale)}</b>
            <span>{g.recurring ? w.estimated : w.exact}</span>
          </div>
        </div>
      ))}
      {restarts.length ? (
        <div className="oc-row">
          <div className="oc-rowlabel">
            <span className="oc-kind">Pod</span> <span>{w.restarts}</span>
            <div className="oc-rowreason">{restarts.map((r) => r.n.replace(/^node-shell-.*/, 'node-shell-*')).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</div>
          </div>
          <div className="oc-track">
            <Grid />
            {restarts.map((r) => <span key={r.n} className={`oc-tick ${r.why.includes('Error') || r.why.includes('OOMKilled') ? 'warn' : 'muted'}`} style={{ left: x(Date.parse(r.last!)) }} title={`${r.ns}/${r.n} · ${fmtTime(r.last!)} UTC · ${r.why.filter(Boolean).join(', ')}`} />)}
          </div>
          <div className="oc-rowcount"><b>{restarts.length}</b><span>{w.exact}</span></div>
        </div>
      ) : null}
      {changes.length ? (
        <div className="oc-row">
          <div className="oc-rowlabel">
            <span className="oc-kind">{w.changes}</span>
            <div className="oc-rowreason">{changes.map((c) => `${c.obj} ${c.reason}`).join(', ')}</div>
          </div>
          <div className="oc-track">
            <Grid />
            {changes.map((c) => <span key={c.obj + c.last} className="oc-tick change" style={{ left: x(Date.parse(c.last)) }} title={`${c.kind} ${c.obj} · ${fmtTime(c.last)} UTC`} />)}
          </div>
          <div className="oc-rowcount"><b>{changes.length}</b><span>{w.exact}</span></div>
        </div>
      ) : null}
      <div className="oc-legend">
        <span><i className="oc-tick warn static" /> {w.legend.event}</span>
        <span><i className="oc-band static" /> {w.legend.recurring}</span>
        <span><i className="oc-tick muted static" /> {w.legend.restart}</span>
        <span><i className="oc-tick change static" /> {w.legend.change}</span>
      </div>
    </div>
  )
}

const fmtDayShort = (iso: string, locale: string) => new Date(iso).toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' })

function ItemCard({ item, rota, canEdit, w, since, fmtWhen, onStatus, onOwner, onComment }: {
  item: Item; rota: string[]; canEdit: boolean; w: any; since: (s: string) => string; fmtWhen: (s: string) => string
  onStatus: (s: Status) => void; onOwner: (o: string) => void; onComment: (c: string) => void
}) {
  const status = (item.status ?? 'open') as Status
  const sev = (item.severity ?? 'low') as Severity
  const [draft, setDraft] = React.useState(item.comment ?? '')
  React.useEffect(() => setDraft(item.comment ?? ''), [item.comment])
  const commit = () => { if (draft !== (item.comment ?? '')) onComment(draft.trim()) }
  return (
    <li className={`oc-item ${status}`} style={{ ['--sev' as any]: SEV[sev] }}>
      <div className="oc-itemtop">
        <span className={`oc-sev ${sev}`}>{w.severity[sev]}</span>
        <h3>{item.title}</h3>
        {item.since ? <span className="oc-since" title={fmtWhen(item.since)}>{since(item.since)}</span> : null}
      </div>
      <div className="oc-itemmeta mono">{item.source}</div>
      {canEdit ? (
        <div className="oc-ictl">
          <div className="oc-seg" role="group" aria-label={w.statusLabel}>
            {STATUS.map((s) => (
              <button key={s} className={`oc-segbtn ${s}${status === s ? ' on' : ''}`} aria-pressed={status === s} onClick={() => onStatus(s)}>{w.statusAction[s]}</button>
            ))}
          </div>
          <select aria-label={w.owner} value={item.owner ?? ''} onChange={(e) => onOwner(e.target.value)}>
            <option value="">{w.owner}: {w.nobody}</option>
            {rota.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      ) : (
        <div className="oc-ictl ro">
          <span className={`oc-status ${status}`}>{w.status[status]}</span>
          <span className="oc-ro">{w.owner}: <b>{item.owner || w.nobody}</b></span>
        </div>
      )}
      {!canEdit && item.comment ? <q className="oc-comment">{item.comment}</q> : null}
      <details className="oc-more">
        <summary>{w.more}</summary>
        <p className="oc-detail">{item.detail}</p>
        {item.check ? <div className="oc-check"><span>{w.check}</span><code>{item.check}</code></div> : null}
        {canEdit ? (
          <label className="oc-field">
            <span>{w.comment}</span>
            <input type="text" value={draft} placeholder={w.commentPh} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
          </label>
        ) : null}
      </details>
    </li>
  )
}

const CSS = `
.oc-root { width: 100%; box-sizing: border-box; padding: 12px clamp(12px, 1.6vw, 24px) 32px; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); font-size: 14px; }
.oc-in { container-type: inline-size; display: grid; gap: 12px; }
.oc-root h1, .oc-root h2, .oc-root h3 { font-family: Parkinsans, Figtree, sans-serif; letter-spacing: -0.015em; margin: 0; }
.oc-root .mono, .oc-root code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
.oc-head { border-radius: 16px; padding: clamp(14px, 1.6cqw, 20px); color: #fff; background: linear-gradient(160deg, ${C.deep} 0%, ${C.midnight} 55%, #031426 100%); display: grid; gap: 12px; }
.oc-headtop { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
.oc-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .05em; color: rgba(255,255,255,.68); text-transform: uppercase; }
.oc-title { font: 800 clamp(22px, 2.4cqw, 28px)/1.1 Parkinsans, sans-serif; margin-top: 2px !important; }
.oc-badge { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; padding: 6px 6px 6px 12px; border-radius: 10px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); }
.oc-badge b { color: ${C.sun}; font-weight: 700; }
.oc-badge.live { padding: 6px 12px; color: ${C.tide}; font-weight: 600; gap: 8px; }
.oc-badge.live i { width: 8px; height: 8px; border-radius: 50%; background: ${C.tide}; box-shadow: 0 0 0 3px ${C.tide}33; }
.oc-bar { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 10px; align-items: stretch; }
.oc-shift { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1.25fr) minmax(0,.9fr); gap: 10px; align-items: center; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,.06); }
.oc-person { display: grid; gap: 1px; min-width: 0; }
.oc-person b { font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.oc-label { font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: rgba(255,255,255,.6); }
.oc-head .oc-sub { color: rgba(255,255,255,.66); font-size: 12px; }
.oc-arrow { font-size: 18px; color: ${C.ocean}; }
.oc-pending { color: ${C.sun}; }
.oc-take { display: flex; gap: 6px; flex-wrap: wrap; }
.oc-take select { font: inherit; font-size: 13.5px; padding: 5px 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.1); color: #fff; min-width: 0; max-width: 100%; }
.oc-take select option { color: #000; }
.oc-btn { font: 600 13px Figtree, sans-serif; padding: 6px 11px; border-radius: 8px; border: 0; background: ${C.sun}; color: ${C.midnight}; cursor: pointer; }
.oc-btn:disabled { opacity: .5; cursor: default; }
.oc-btn.light { background: rgba(255,255,255,.14); color: #fff; border: 1px solid rgba(255,255,255,.25); }
.oc-link { all: unset; cursor: pointer; margin-left: 8px; text-decoration: underline; color: ${C.ocean}; }
.oc-btn:focus-visible, .oc-link:focus-visible, .oc-tab:focus-visible, .oc-segbtn:focus-visible, .oc-root select:focus-visible, .oc-root input:focus-visible, .oc-root summary:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
.oc-kpis { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 8px; }
.oc-kpi { border-radius: 12px; padding: 8px 10px; background: rgba(255,255,255,.06); border-top: 3px solid rgba(255,255,255,.18); display: grid; gap: 1px; min-width: 0; align-content: start; }
.oc-kpi.ok { border-top-color: ${C.tide}; }
.oc-kpi.warn { border-top-color: ${C.sun}; }
.oc-kpi.bad { border-top-color: ${C.coral}; }
.oc-kpi b { font: 800 24px/1.1 Parkinsans, sans-serif; font-variant-numeric: tabular-nums; }
.oc-kpil { font-size: 11.5px; font-weight: 600; color: rgba(255,255,255,.78); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.oc-kpis-sub { font-size: 11.5px; color: rgba(255,255,255,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.oc-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.15fr); grid-template-areas: "note fail items" "tl tl items"; gap: 12px; align-items: stretch; }
.oc-note { grid-area: note; } .oc-failp { grid-area: fail; } .oc-itemsp { grid-area: items; align-self: start; } .oc-tlp { grid-area: tl; align-self: start; }
.oc-panel { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 14px; padding: clamp(12px, 1.4cqw, 16px); min-width: 0; }
.oc-sechead { display: flex; justify-content: space-between; align-items: baseline; gap: 2px 10px; flex-wrap: wrap; margin-bottom: 10px; }
.oc-sechead h2 { font-size: 16px; font-weight: 800; display: inline-flex; align-items: baseline; gap: 6px; }
.oc-count { font: 700 12px Figtree, sans-serif; padding: 1px 7px; border-radius: 999px; background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.oc-sub { font-size: 12px; color: hsl(var(--muted-foreground)); }
.oc-headline { font-weight: 700; font-size: 14.5px; line-height: 1.35; margin: 0 0 8px; }
.oc-lines { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.oc-lines li { font-size: 13px; line-height: 1.4; padding-left: 10px; border-left: 2px solid hsl(var(--border)); }
.oc-fail { list-style: none; margin: 0; padding: 0; display: grid; }
.oc-failrow { border-left: 3px solid ${C.coral}; border-bottom: 1px solid hsl(var(--border) / .6); }
.oc-failrow:last-child { border-bottom: 0; }
.oc-failrow.unknown { border-left-color: ${C.sun}; }
.oc-failsum { list-style: none; cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr) 4.5em; gap: 2px 8px; align-items: baseline; padding: 6px 0 6px 10px; }
.oc-failsum::-webkit-details-marker { display: none; }
.oc-failname { display: flex; gap: 6px; align-items: baseline; min-width: 0; }
.oc-kind { flex: none; font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: hsl(var(--muted-foreground)); }
.oc-name { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-failrow details[open] .oc-name { white-space: normal; overflow-wrap: anywhere; }
.oc-reason { grid-column: 1; justify-self: start; font-size: 11.5px; font-weight: 700; padding: 1px 6px; border-radius: 5px; background: ${C.coral}22; color: hsl(var(--foreground)); }
.oc-failrow.unknown .oc-reason { background: ${C.sun}33; }
.oc-since { font-size: 12px; color: hsl(var(--muted-foreground)); white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
.oc-failsum .oc-since { grid-column: 2; grid-row: 1; }
.oc-msg { font-size: 12px; color: hsl(var(--muted-foreground)); margin: 0 0 8px 10px; overflow-wrap: anywhere; line-height: 1.4; }
.oc-empty { color: hsl(var(--muted-foreground)); list-style: none; padding: 8px 0; }
.oc-tl { display: grid; gap: 0; }
.oc-row { display: grid; grid-template-columns: minmax(140px, 220px) minmax(0, 1fr) 72px; gap: 10px; align-items: center; padding: 5px 0; border-bottom: 1px solid hsl(var(--border) / .6); }
.oc-axisrow { border-bottom: 0; padding: 0 0 2px; }
.oc-rowlabel { font-size: 12.5px; min-width: 0; overflow-wrap: anywhere; }
.oc-rowlabel .mono { font-weight: 600; }
.oc-rowreason { font-size: 11.5px; color: hsl(var(--muted-foreground)); }
.oc-axis { position: relative; height: 16px; font-size: 11px; color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; }
.oc-axis span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.oc-axis span:first-child { transform: none; }
.oc-axis span:last-child { transform: translateX(-100%); }
.oc-track { position: relative; height: 20px; border-radius: 6px; background: hsl(var(--muted) / .55); overflow: hidden; }
.oc-gridline { position: absolute; top: 0; bottom: 0; width: 1px; background: hsl(var(--border)); }
.oc-band { position: absolute; top: 6px; height: 8px; border-radius: 4px; background: repeating-linear-gradient(90deg, ${C.coral}cc 0 2px, transparent 2px 6px); }
.oc-tick { position: absolute; top: 2px; width: 3px; height: 16px; margin-left: -1.5px; border-radius: 2px; background: ${C.coral}; }
.oc-tick.muted { background: hsl(var(--muted-foreground)); }
.oc-tick.change { background: ${C.horizon}; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; top: 6px; }
.oc-rowcount { text-align: right; display: grid; font-variant-numeric: tabular-nums; }
.oc-rowcount b { font-size: 14px; }
.oc-rowcount span { font-size: 11px; color: hsl(var(--muted-foreground)); }
.oc-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11.5px; color: hsl(var(--muted-foreground)); padding-top: 8px; }
.oc-legend span { display: inline-flex; align-items: center; gap: 6px; }
.oc-legend .static { position: static; display: inline-block; margin: 0; }
.oc-legend .oc-band.static { width: 22px; top: auto; }
.oc-itemsbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.oc-progress { display: flex; align-items: center; gap: 3px; }
.oc-pip { width: 18px; height: 6px; border-radius: 3px; background: ${C.coral}; }
.oc-pip.acked { background: ${C.sun}; }
.oc-pip.done { background: ${C.tide}; }
.oc-tabs { display: inline-flex; flex-wrap: wrap; padding: 3px; border-radius: 9px; background: hsl(var(--muted)); gap: 2px; }
.oc-tab { all: unset; cursor: pointer; padding: 4px 10px; border-radius: 7px; font: 600 12.5px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
.oc-tab small { font-weight: 600; opacity: .75; margin-left: 2px; }
.oc-tab.on { background: hsl(var(--card)); color: hsl(var(--foreground)); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.oc-items { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.oc-item { display: grid; gap: 6px; border: 1px solid hsl(var(--border)); border-left: 4px solid var(--sev); border-radius: 10px; padding: 9px 11px; background: hsl(var(--card)); min-width: 0; }
.oc-item.done { opacity: .72; }
.oc-item.done h3 { text-decoration: line-through; text-decoration-color: hsl(var(--muted-foreground)); }
.oc-itemtop { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: baseline; }
.oc-itemtop h3 { font-size: 14px; font-weight: 700; line-height: 1.3; }
.oc-sev { font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; padding: 2px 6px; border-radius: 5px; background: var(--sev); color: ${C.midnight}; }
.oc-sev.high { color: #fff; }
.oc-itemmeta { font-size: 11.5px; color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.oc-ictl { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 8px; align-items: center; }
.oc-ictl.ro { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.oc-ictl select { font: 13px Figtree, sans-serif; padding: 5px 6px; border-radius: 8px; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--foreground)); min-width: 0; }
.oc-seg { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid hsl(var(--border)); border-radius: 8px; overflow: hidden; }
.oc-segbtn { all: unset; cursor: pointer; text-align: center; padding: 5px 4px; font: 600 12px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
.oc-segbtn + .oc-segbtn { border-left: 1px solid hsl(var(--border)); }
.oc-segbtn.on.open { background: ${C.coral}; color: #fff; }
.oc-segbtn.on.acked { background: ${C.sun}; color: ${C.midnight}; }
.oc-segbtn.on.done { background: ${C.tide}; color: ${C.midnight}; }
.oc-status { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: ${C.coral}; color: #fff; }
.oc-status.acked { background: ${C.sun}; color: ${C.midnight}; }
.oc-status.done { background: ${C.tide}; color: ${C.midnight}; }
.oc-ro { font-size: 12.5px; color: hsl(var(--muted-foreground)); }
.oc-ro b { color: hsl(var(--foreground)); font-weight: 600; }
.oc-comment { font-size: 12.5px; color: hsl(var(--muted-foreground)); }
.oc-more summary { cursor: pointer; font-size: 12px; font-weight: 600; color: hsl(var(--muted-foreground)); width: max-content; }
.oc-detail { margin: 6px 0; font-size: 13px; line-height: 1.45; }
.oc-check { display: grid; gap: 3px; font-size: 11.5px; color: hsl(var(--muted-foreground)); margin-bottom: 6px; }
.oc-check code { padding: 3px 7px; border-radius: 6px; background: hsl(var(--muted)); color: hsl(var(--foreground)); overflow-wrap: anywhere; user-select: all; }
.oc-field { display: grid; gap: 3px; font-size: 11.5px; font-weight: 600; color: hsl(var(--muted-foreground)); }
.oc-field input { font: 13px Figtree, sans-serif; padding: 5px 8px; border-radius: 8px; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--foreground)); min-width: 0; }
.oc-foot { font-size: 13px; color: hsl(var(--muted-foreground)); padding: 0 2px; }
.oc-foot summary { cursor: pointer; font-weight: 600; width: max-content; }
.oc-foot ul { margin: 6px 0 0; padding-left: 18px; }
.oc-foot li { margin: 2px 0; }
@container (max-width: 1000px) {
  .oc-bar { grid-template-columns: 1fr; }
  .oc-grid { grid-template-columns: minmax(0, 1fr); grid-template-areas: "note" "fail" "items" "tl"; }
}
@container (max-width: 680px) {
  .oc-kpis { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .oc-shift { grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); }
  .oc-shift > .oc-person:last-child { grid-column: 1 / -1; }
}
@container (max-width: 520px) {
  .oc-kpis { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .oc-kpi:last-child { grid-column: 1 / -1; }
  .oc-shift { grid-template-columns: 1fr; }
  .oc-arrow { display: none; }
  .oc-row { grid-template-columns: minmax(0, 1fr) 60px; gap: 2px 8px; }
  .oc-row .oc-rowlabel { grid-column: 1 / -1; }
  .oc-axisrow .oc-rowlabel { display: none; }
  .oc-ictl { grid-template-columns: 1fr; }
}
`
