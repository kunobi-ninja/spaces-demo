import * as React from 'react'
import { edit, useSource, useStore, useStoreStatus } from 'kunobi'
import type { ClusterDashboardAcksStore } from '../types/cluster-dashboard-acks.store'
import {
  derive, fromSnapshot, normEvent, normFlux, normNode, normPod, normWorkload, podHealth,
  type Event, type Issue, type Pod, type Sev, type Snapshot,
} from './model'

export const STORE = 'cluster-dashboard-acks'
type Words = Record<string, any>

// ---------- data: the cluster selected in the person's tab, or the sample ----------

const KINDS = [
  ['Pod', 'v1'], ['Deployment', 'apps/v1'], ['StatefulSet', 'apps/v1'], ['DaemonSet', 'apps/v1'], ['Node', 'v1'],
  ['Kustomization', 'kustomize.toolkit.fluxcd.io/v1'], ['HelmRelease', 'helm.toolkit.fluxcd.io/v2'],
  ['HelmRepository', 'source.toolkit.fluxcd.io/v1'], ['Event', 'v1'],
] as const

// No `context`: Kunobi uses the cluster selected in the person's tab.
const useK8s = (kind: string, apiVersion: string) => {
  const s = useSource({ type: 'k8s', params: { kind, apiVersion } }) as any
  return { status: (s?.status ?? 'loading') as string, data: Array.isArray(s?.data) ? (s.data as any[]) : null, action: s?.action as { run: () => void } | undefined }
}

const useCluster = (snap: Snapshot) => {
  const src = KINDS.map(([k, v]) => useK8s(k, v))
  const live = src.every((s) => s.status === 'ready' && s.data)
  const base = React.useMemo(() => fromSnapshot(snap), [snap])
  const data = React.useMemo(() => {
    if (!live) return base
    const [pods, deps, sts, ds, nodes, ks, hr, repos, evs] = src.map((s) => s.data as any[])
    return {
      pods: pods.map(normPod),
      workloads: [...deps.map(normWorkload('Deployment')), ...sts.map(normWorkload('StatefulSet')), ...ds.map(normWorkload('DaemonSet'))],
      nodes: nodes.map(normNode(new Map())),
      flux: [...ks.map(normFlux('Kustomization')), ...hr.map(normFlux('HelmRelease')), ...repos.map(normFlux('HelmRepository'))],
      events: evs.map(normEvent).filter(Boolean) as Event[],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, base, ...src.map((s) => s.data)])
  const actions = src.map((s) => s.action).filter(Boolean) as { run: () => void }[]
  return { data, live, allow: actions.length ? () => actions.forEach((a) => a.run()) : null }
}

// ---------- helpers ----------

const ago = (iso: string | null, now: number) => {
  if (!iso) return ''
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}
const command = (i: Issue) =>
  i.kind === 'Kustomization' || i.kind === 'HelmRelease' || i.kind === 'HelmRepository'
    ? `flux get ${i.kind.toLowerCase()}s ${i.n} -n ${i.ns}`
    : `kubectl describe ${i.kind.toLowerCase()} ${i.n}${i.ns ? ` -n ${i.ns}` : ''}`

const SHORT: Record<string, string> = { Kustomization: 'KS', HelmRelease: 'HR', HelmRepository: 'Repo', Deployment: 'Deploy', StatefulSet: 'STS', HelmChart: 'Chart', DaemonSet: 'DS', Pod: 'Pod', Node: 'Node' }
const short = (k: string) => SHORT[k] ?? k

// ---------- page ----------

export function Dashboard({ snap, savedAcks, w }: { snap: Snapshot; savedAcks: ClusterDashboardAcksStore; w: Words }) {
  const { data, live, allow } = useCluster(snap)
  const now = live ? Date.now() : Date.parse(snap.takenAt)
  const { issues } = React.useMemo(() => derive(data as any, now), [data, now])

  const status = useStoreStatus(STORE) as any
  const stored = useStore(STORE) as ClusterDashboardAcksStore | undefined
  const open = status?.status === 'open'
  const acks = (open ? stored?.acks : savedAcks.acks) ?? {}
  const canEdit = open && Boolean(status?.canEdit)

  const [sel, setSel] = React.useState<string | null>(null)
  const [ns, setNs] = React.useState<string | null>(null)

  const known = (i: Issue) => acks[i.key]?.state != null
  const active = issues.filter((i) => !known(i))
  const broken = active.filter((i) => i.sev === 'crit')
  const check = active.filter((i) => i.sev === 'warn')
  const shown = active.filter((i) => !ns || i.ns === ns)
  const quiet = issues.filter(known).filter((i) => !ns || i.ns === ns)
  const picked = issues.find((i) => i.key === sel) ?? null

  // Namespaces as blocks of pods; the ones with problems first.
  const groups = React.useMemo(() => {
    const m = new Map<string, { ns: string; pods: { p: Pod; sev: Sev | null }[]; objs: Issue[]; crit: number; warn: number }>()
    for (const p of data.pods) {
      if (p.phase === 'Succeeded') continue
      if (!m.has(p.ns)) m.set(p.ns, { ns: p.ns, pods: [], objs: [], crit: 0, warn: 0 })
      m.get(p.ns)!.pods.push({ p, sev: podHealth(p, now).sev })
    }
    for (const i of active) {
      if (!i.ns) continue
      if (!m.has(i.ns)) m.set(i.ns, { ns: i.ns, pods: [], objs: [], crit: 0, warn: 0 })
      const g = m.get(i.ns)!
      g[i.sev === 'crit' ? 'crit' : 'warn']++
      if (i.kind !== 'Pod') g.objs.push(i)
    }
    return [...m.values()].sort((a, b) => b.crit - a.crit || b.warn - a.warn || b.pods.length - a.pods.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, now, acks])

  const setAck = (key: string, state: 'known' | null) =>
    edit(STORE, (d: ClusterDashboardAcksStore) => {
      if (!d.acks) (d as any).acks = {}
      if (state === null) delete d.acks[key]
      else d.acks[key] = { state, note: '', at: new Date().toISOString() }
    })

  const healthy = data.pods.filter((p) => p.phase !== 'Succeeded' && !podHealth(p, now).sev).length
  const running = data.pods.filter((p) => p.phase !== 'Succeeded').length

  return (
    <div className="cd">
      <style>{CSS}</style>

      <header className="top">
        <div>
          <div className="name">
            {live ? w.selected : w.sample}
            {!live && <span className="tag" title={w.sampleTip({ when: new Date(snap.takenAt).toUTCString() })}>{w.sampleData}</span>}
            {!live && allow && <button className="live" onClick={allow}>{w.useLive}</button>}
          </div>
          <h1>
            {broken.length ? <><b className="crit">{broken.length}</b> {w.broken}</> : w.allGood}
            {check.length > 0 && <><span className="sep">·</span><b className="warn">{check.length}</b> {w.toCheck}</>}
          </h1>
        </div>
        <div className="pods"><b>{healthy}</b>/{running} {w.podsOk}</div>
      </header>

      <div className="body">
        <section className="map" aria-label={w.map}>
          {groups.map((g) => (
            <button
              key={g.ns}
              className={`ns${ns === g.ns ? ' on' : ''}${ns && ns !== g.ns ? ' dim' : ''}`}
              onClick={() => { setNs(ns === g.ns ? null : g.ns); setSel(null) }}
            >
              <span className="label">
                {g.crit > 0 && <i className="dot crit" />}
                {!g.crit && g.warn > 0 && <i className="dot warn" />}
                {g.ns}
              </span>
              <span className="cells">
                {g.pods.map(({ p, sev }) => <i key={p.n} className={`cell ${sev ?? 'ok'}`} title={`${p.n} · ${sev ? podHealth(p, now).code : 'ok'}`} />)}
                {g.objs.map((i) => <i key={i.key} className={`cell obj ${i.sev}`} title={`${i.kind} ${i.n} · ${i.code}`} />)}
                {g.pods.length === 0 && g.objs.length === 0 && <i className="cell none" />}
              </span>
            </button>
          ))}
        </section>

        <aside className="side">
          {picked ? (
            <div className="detail">
              <button className="back" onClick={() => setSel(null)}>← {w.back}</button>
              <div className={`sev ${picked.sev}`}>{picked.kind}</div>
              <h2>{picked.n}</h2>
              <div className="meta">{picked.ns && <span>{picked.ns}</span>}<code>{picked.code}</code>{picked.since && <span>{ago(picked.since, now)}</span>}</div>
              {picked.detail && <p className="msg">{picked.detail}</p>}
              <code className="cmd">{command(picked)}</code>
              {canEdit && (
                <button className="ack" onClick={() => setAck(picked.key, known(picked) ? null : 'known')}>
                  {known(picked) ? w.unmark : w.mark}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="head">
                <span>{ns ?? w.problems}</span>
                {ns && <button onClick={() => setNs(null)}>{w.all}</button>}
              </div>
              {shown.length === 0 && <p className="empty">{w.none}</p>}
              <ul>
                {shown.map((i) => (
                  <li key={i.key}>
                    <button onClick={() => setSel(i.key)}>
                      <i className={`dot ${i.sev}`} />
                      <span className="k">{short(i.kind)}</span>
                      <span className="n">{i.n}</span>
                      <code>{i.code}</code>
                      <span className="t">{ago(i.since, now)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {quiet.length > 0 && (
                <details className="known">
                  <summary>{w.known} {quiet.length}</summary>
                  <ul>
                    {quiet.map((i) => (
                      <li key={i.key}><button onClick={() => setSel(i.key)}><i className="dot off" /><span className="k">{short(i.kind)}</span><span className="n">{i.n}</span><code>{i.code}</code></button></li>
                    ))}
                  </ul>
                </details>
              )}
              {open && status?.saved === false && <p className="saving">{w.saving}</p>}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

const CSS = `
.cd { --crit: #e5484d; --warn: #f3aa08; --ok: #30ccd5; width: 100%; box-sizing: border-box; padding: 8px 24px 32px; container-type: inline-size; font: 400 14px/1.4 Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
:where(.cd) button { all: unset; cursor: pointer; }
.cd code { font: 500 12px ui-monospace, SFMono-Regular, Menlo, monospace; }

.top { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 4px 0 20px; }
.name { display: flex; align-items: center; gap: 10px; font: 600 13px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
.tag { padding: 2px 8px; border-radius: 99px; background: hsl(var(--muted)); font-size: 12px; cursor: help; }
.live { padding: 3px 10px; border-radius: 99px; background: #06213f; color: #fff; font-size: 12px; }
.cd h1 { margin: 6px 0 0; font: 800 clamp(26px, 3.4cqw, 40px)/1.1 Parkinsans, sans-serif; letter-spacing: -0.01em; }
.cd h1 b.crit { color: var(--crit); } h1 b.warn { color: var(--warn); }
.cd h1 .sep { margin: 0 14px; color: hsl(var(--muted-foreground)); font-weight: 600; }
.pods { font: 600 14px Figtree, sans-serif; color: hsl(var(--muted-foreground)); white-space: nowrap; }
.pods b { font: 800 22px Parkinsans, sans-serif; color: hsl(var(--foreground)); }

.body { display: grid; grid-template-columns: minmax(0, 1fr) 460px; gap: 20px; align-items: start; }
@container (max-width: 860px) { .body { grid-template-columns: 1fr; } .top { flex-wrap: wrap; } .side { order: -1; } }
@container (max-width: 560px) { .side li code { display: none; } .side li button { grid-template-columns: 8px 46px minmax(0, 1fr) 36px; } }

.map { display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start; }
.ns { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 12px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); max-width: 260px; transition: opacity .15s, border-color .15s; }
.ns:hover { border-color: hsl(var(--muted-foreground) / .5); }
.ns.on { border-color: hsl(var(--foreground)); }
.ns.dim { opacity: .35; }
.label { display: flex; align-items: center; gap: 6px; font: 600 12px Figtree, sans-serif; color: hsl(var(--muted-foreground)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cells { display: flex; flex-wrap: wrap; gap: 3px; }
.cell { width: 13px; height: 13px; border-radius: 3px; background: var(--ok); opacity: .55; }
.cell.warn { background: var(--warn); opacity: 1; }
.cell.crit { background: var(--crit); opacity: 1; }
.cell.info { background: var(--ok); opacity: .55; }
.cell.obj { background: transparent; border: 2.5px solid var(--crit); box-sizing: border-box; transform: rotate(45deg) scale(.82); opacity: 1; }
.cell.obj.warn { border-color: var(--warn); }
.cell.none { background: transparent; border: 1px dashed hsl(var(--border)); opacity: 1; }

.dot { width: 8px; height: 8px; border-radius: 99px; flex: none; background: var(--ok); }
.dot.crit { background: var(--crit); } .dot.warn { background: var(--warn); } .dot.off { background: hsl(var(--muted-foreground) / .5); }

.side { border-radius: 16px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); padding: 6px; min-height: 200px; }
.head { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px 6px; font: 600 12px Figtree, sans-serif; color: hsl(var(--muted-foreground)); text-transform: uppercase; letter-spacing: .04em; }
.head button { text-transform: none; letter-spacing: 0; color: hsl(var(--foreground)); }
.side ul { list-style: none; margin: 0; padding: 0; }
.side li button { display: grid; grid-template-columns: 8px 46px minmax(0, 1fr) auto 36px; align-items: center; gap: 10px; width: 100%; box-sizing: border-box; padding: 9px 12px; border-radius: 10px; }
.side li button:hover { background: hsl(var(--muted)); }
.side .k { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 11px Figtree, sans-serif; color: hsl(var(--muted-foreground)); text-transform: uppercase; letter-spacing: .03em; }
.side .n { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.side li code { color: hsl(var(--muted-foreground)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; }
.side .t { text-align: right; font-size: 12px; color: hsl(var(--muted-foreground)); }
.empty, .saving { padding: 12px; margin: 0; color: hsl(var(--muted-foreground)); }
.known summary { cursor: pointer; padding: 10px 12px; font: 600 12px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
.known li .n { font-weight: 400; color: hsl(var(--muted-foreground)); }

.detail { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.back { font: 600 13px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
.sev { align-self: flex-start; padding: 2px 9px; border-radius: 99px; font: 600 12px Figtree, sans-serif; color: #fff; background: var(--crit); }
.sev.warn { background: var(--warn); color: #06213f; }
.detail h2 { margin: 0; font: 800 20px/1.2 Parkinsans, sans-serif; overflow-wrap: anywhere; }
.meta { display: flex; flex-wrap: wrap; gap: 10px; color: hsl(var(--muted-foreground)); font-size: 13px; }
.msg { margin: 0; padding: 10px 12px; border-radius: 10px; background: hsl(var(--muted)); font: 400 13px/1.45 ui-monospace, Menlo, monospace; overflow-wrap: anywhere; max-height: 180px; overflow: auto; }
.cmd { display: block; padding: 10px 12px; border-radius: 10px; background: #06213f; color: #e6f4ff; overflow-x: auto; white-space: nowrap; user-select: all; }
.ack { align-self: flex-start; padding: 7px 14px; border-radius: 99px; border: 1px solid hsl(var(--border)); font: 600 13px Figtree, sans-serif; }
.ack:hover { background: hsl(var(--muted)); }
`
