import * as React from 'react'
import { useStore, useStoreStatus, edit, useDiagram } from 'kunobi'
import type { IncidentTimelineStore } from '../types/incident-timeline.store'
import { localizeSeed } from './seed'
import { useCluster, type Cluster, type Cond, type Snapshot, type Ev } from './live'

/*
 * The incident page. The header, timeline and follow-ups live in the `incident-timeline`
 * LiveStore (readable copy: data/timeline.json; data/timeline.start.json is shown read-only
 * where the store cannot open). Cluster facts come from src/live.ts: live from the cluster the
 * person selected, in their own preview; from the sample in data/cluster.json everywhere else. The postmortem is
 * written from both, so it changes as the timeline does.
 */

const STORE = 'incident-timeline'
type Store = IncidentTimelineStore
type Entry = Store['entries'][number]
type Kind = 'detect' | 'finding' | 'action' | 'decision' | 'note'
type IncStatus = 'investigating' | 'mitigated' | 'resolved'
type Health = 'ok' | 'failed' | 'blocked' | 'progressing' | 'unknown'
type St = { status?: string; canEdit?: boolean; saved?: boolean }

const C = { midnight: '#06213f', deep: '#0b2d52', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8', coral: '#e2603f', green: '#2f9e6e' }
const HEALTH: Record<Health, string> = { ok: C.green, failed: C.coral, blocked: C.sun, progressing: C.ocean, unknown: 'hsl(var(--muted-foreground))' }
const KIND_COLOR: Record<Kind, string> = { detect: C.coral, finding: C.horizon, action: C.green, decision: C.sun, note: 'hsl(var(--muted-foreground))' }
const STATUS_COLOR: Record<IncStatus, string> = { investigating: C.coral, mitigated: C.sun, resolved: C.green }
const KINDS: Kind[] = ['detect', 'finding', 'action', 'decision', 'note']
const STATUSES: IncStatus[] = ['investigating', 'mitigated', 'resolved']
const SEVERITIES = ['SEV1', 'SEV2', 'SEV3', 'SEV4'] as const

const ms = (iso?: string | null) => (iso ? Date.parse(iso) : NaN)
const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim()
const uid = () => Math.random().toString(36).slice(2, 8)

/* ---------- health ---------- */

const condHealth = (c: Cond | null): Health => {
  if (!c) return 'unknown'
  if (c.status === 'True') return 'ok'
  if (c.reason === 'DependencyNotReady') return 'blocked'
  if (c.status === 'Unknown' || c.reason === 'Progressing') return 'progressing'
  return 'failed'
}
const countHealth = (ready: number, want: number): Health => (want === 0 ? 'unknown' : ready >= want ? 'ok' : ready === 0 ? 'failed' : 'progressing')

/* ---------- what the page knows about the incident, from the cluster ---------- */

function facts(cl: Cluster, scope: Snapshot['scope']) {
  const ks = cl.kustomizations.items.filter((k) => k.n === scope.app || k.n.startsWith(`${scope.app}-`))
  const hr = cl.helmreleases.items.find((h) => h.n === scope.release)
  const ociName = hr?.chart.startsWith('OCIRepository/') ? hr.chart.split('/')[1] : scope.release
  const oci = cl.ocirepositories.items.find((o) => o.n === ociName)
  const git = cl.gitrepositories.items.find((g) => g.n === scope.app)
  const deploys = cl.deployments.items
  const pgc = cl.postgresclusters.items[0]
  const sts = cl.statefulsets.items
  const pods = cl.pods.items
  const objects = new Set([scope.release, scope.app, ...ks.map((k) => k.n)])
  const events = [...cl.fluxEvents.items, ...cl.appEvents.items]
    .filter((e) => e.ns === scope.namespace || objects.has(e.obj))
    .sort((a, b) => (a.type === b.type ? ms(b.last) - ms(a.last) : a.type === 'Warning' ? -1 : 1))
  const history = [...(hr?.history ?? [])].sort((a, b) => ms(a.at) - ms(b.at))
  const failed = history.filter((h) => h.s === 'failed')
  const lastGood = [...history].reverse().find((h) => h.s === 'deployed')
  const blocked = ks.filter((k) => condHealth(k.ready) === 'blocked')
  const blockedSince = blocked.map((k) => ms(k.ready?.t)).filter(Number.isFinite).sort((a, b) => a - b)[0]
  const podsReady = pods.filter((p) => p.phase === 'Running' && p.ready.length > 0 && p.ready.every(Boolean))
  const operator = deploys.find((d) => d.hr === scope.release)
  const operatorPod = operator ? pods.find((p) => p.owner === operator.n) : undefined
  const runningVersion = operator?.image.match(/(\d+\.\d+\.\d+)/)?.[1]
  const nothingWaiting = !!git && ks.length > 0 && ks.every((k) => k.rev === git.artifact)
  const appWarnings = events.filter((e) => e.ns === scope.namespace && e.type === 'Warning')
  return { scope, ks, hr, oci, git, deploys, pgc, sts, pods, events, history, failed, lastGood, blocked, blockedSince, podsReady, operator, operatorPod, runningVersion, nothingWaiting, appWarnings }
}
export type Facts = ReturnType<typeof facts>

/* ---------- the affected objects as a graph ---------- */

interface GNode { id: string; kind: string; ns: string; name: string; status: string; health: Health; match: string }
interface GEdge { from: string; to: string; rel: string }

const nid = (prefix: string, name: string) => `${prefix}_${name.replace(/[^a-zA-Z0-9]/g, '_')}`

/** Kustomizations in dependency order: each after the ones it depends on. */
function byDependency<T extends { n: string; dependsOn: string[] }>(list: T[]): T[] {
  const left = [...list].sort((a, b) => a.n.localeCompare(b.n))
  const out: T[] = []
  while (left.length) {
    const i = left.findIndex((k) => k.dependsOn.every((d) => !left.some((x) => x.n === d)))
    out.push(...left.splice(i < 0 ? 0 : i, 1))
  }
  return out
}

function graphModel(f: Facts, w: any) {
  const nodes: GNode[] = []
  const edges: GEdge[] = []
  const placed = new Set<string>()
  const add = (n: GNode) => { if (!placed.has(n.id)) { placed.add(n.id); nodes.push(n) } }
  const podGroup = (owner: string, owners: string[], parent: string) => {
    const group = f.pods.filter((p) => owners.includes(p.owner))
    if (!group.length) return
    const ready = group.filter((p) => p.ready.length && p.ready.every(Boolean)).length
    const restarts = group.reduce((n, p) => n + p.restarts, 0)
    const id = nid('pods', owner)
    add({
      id, kind: 'Pod', ns: group[0].ns,
      name: group.length === 1 ? group[0].n : w.pods(group.length),
      status: w.podStatus(ready, group.length, restarts),
      health: countHealth(ready, group.length),
      match: group.length === 1 ? group[0].n : owner,
    })
    edges.push({ from: parent, to: id, rel: w.rel.runs })
  }
  const deployment = (d: Facts['deploys'][number], parent: string, rel: string) => {
    const id = nid('dep', d.n)
    add({ id, kind: 'Deployment', ns: d.ns, name: d.n, status: w.replicas(d.ready, d.want), health: countHealth(d.ready, d.want), match: `Deployment ${d.ns}/${d.n}` })
    edges.push({ from: parent, to: id, rel })
    podGroup(d.n, [d.n], id)
  }
  // Declaration order guides the layout: each Kustomization, then what it applies or checks.
  for (const k of byDependency(f.ks)) {
    const h = condHealth(k.ready)
    const kid = nid('ks', k.n)
    add({ id: kid, kind: 'Kustomization', ns: k.ns, name: k.n, status: h === 'ok' ? w.health.ok : k.ready?.reason ?? w.health.unknown, health: h, match: k.n })
    for (const d of k.dependsOn) if (f.ks.some((x) => x.n === d)) edges.push({ from: nid('ks', d), to: kid, rel: w.rel.gates })
    if (f.hr && f.hr.ks === k.n) {
      const hid = nid('hr', f.hr.n)
      const hh = condHealth(f.hr.ready)
      const stalled = f.hr.stalled?.status === 'True' ? ' · Stalled' : ''
      if (f.oci) add({ id: nid('oci', f.oci.n), kind: 'OCIRepository', ns: f.oci.ns, name: f.oci.n, status: f.oci.artifact.split('@')[0] || '', health: condHealth(f.oci.ready), match: 'OCIRepository' })
      add({ id: hid, kind: 'HelmRelease', ns: f.hr.ns, name: f.hr.n, status: hh === 'ok' ? w.health.ok : `${f.hr.ready?.reason ?? ''}${stalled}`, health: hh, match: `HelmRelease ${f.hr.ns}/${f.hr.n}` })
      edges.push({ from: kid, to: hid, rel: w.rel.checks })
      if (f.oci) edges.push({ from: nid('oci', f.oci.n), to: hid, rel: w.rel.chart })
      for (const d of f.deploys.filter((x) => x.hr === f.hr!.n)) deployment(d, hid, w.rel.installs)
    }
    if (f.pgc && f.pgc.ks === k.n) {
      const pid = nid('pgc', f.pgc.n)
      add({ id: pid, kind: 'PostgresCluster', ns: f.pgc.ns, name: f.pgc.n, status: w.instances(f.pgc.ready, f.pgc.want), health: countHealth(f.pgc.ready, f.pgc.want), match: f.pgc.n })
      edges.push({ from: kid, to: pid, rel: w.rel.applies })
      if (f.operator) edges.push({ from: nid('dep', f.operator.n), to: pid, rel: w.rel.operates })
      podGroup(f.pgc.n, f.sts.filter((s) => s.owner === f.pgc!.n).map((s) => s.n), pid)
    }
    for (const d of f.deploys.filter((x) => !x.hr && x.ks === k.n)) deployment(d, kid, w.rel.applies)
  }
  const ids = new Set(nodes.map((n) => n.id))
  return { nodes, edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)) }
}

function mermaidOf(model: { nodes: GNode[]; edges: GEdge[] }, dir: 'LR' | 'TD') {
  const q = (s: string) => `"${s.replace(/"/g, "'")}"`
  const at = new Map(model.nodes.map((n, i) => [n.id, i]))
  const lines = [`flowchart ${dir}`]
  for (const n of model.nodes) lines.push(`  ${n.id}[${q(n.name)}]`)
  for (const e of [...model.edges].sort((a, b) => (at.get(a.to) ?? 0) - (at.get(b.to) ?? 0))) lines.push(`  ${e.from} -->|${q(e.rel)}| ${e.to}`)
  return lines.join('\n')
}

type Pt = { x: number; y: number }
type SceneNode = { id: string; x: number; y: number; width: number; height: number }
type SceneEdge = { id: string; source: string; target: string; label?: string; sections: { startPoint: Pt; endPoint: Pt; bendPoints?: Pt[] }[] }

const polyline = (e: SceneEdge): Pt[] => e.sections.flatMap((s) => [s.startPoint, ...(s.bendPoints ?? []), s.endPoint])
const midpoint = (pts: Pt[]): Pt => {
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 }
  const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y))
  let half = seg.reduce((a, b) => a + b, 0) / 2
  for (let i = 0; i < seg.length; i++) {
    if (half <= seg[i]) {
      const t = seg[i] ? half / seg[i] : 0
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }
    }
    half -= seg[i]
  }
  return pts[pts.length - 1]
}

function useWidth() {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = React.useState(1200)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth || 1200)
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])
  return { ref, width }
}

function ObjectGraph({ f, w, selected, onSelect }: { f: Facts; w: any; selected: string | null; onSelect: (n: GNode | null) => void }) {
  const { ref, width } = useWidth()
  const dir = width < 720 ? 'TD' : 'LR'
  const model = React.useMemo(() => graphModel(f, w), [f, w])
  const source = React.useMemo(() => mermaidOf(model, dir), [model, dir])
  const records = React.useMemo(() => model.nodes.map((n) => ({ id: n.id, name: n.name, kind: n.kind, namespace: n.ns })), [model])
  const diagram = useDiagram({ mermaid: source, nodes: records } as any) as { status: string; scene?: { nodes: SceneNode[]; edges: SceneEdge[] }; reason?: string }
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  // While a new layout is on its way the last one stays on screen.
  const scene = Array.isArray(diagram.scene?.nodes) ? diagram.scene : undefined

  if (!scene?.nodes?.length) {
    // Without a layout, the same objects as a list, so nothing is hidden.
    return (
      <div ref={ref} className="inc-graph-list">
        {diagram.status !== 'loading' && diagram.reason ? <p className="inc-muted">{diagram.reason}</p> : null}
        {model.nodes.map((n) => (
          <button key={n.id} type="button" data-kunobi-node={n.id} aria-label={`${n.kind} ${n.name}`} className={selected === n.id ? 'on' : ''} onClick={() => onSelect(selected === n.id ? null : n)}>
            <i style={{ background: HEALTH[n.health] }} />
            <span className="inc-tag">{n.kind}</span> <b className="inc-mono">{n.name}</b> <span className="inc-muted">{n.status}</span>
          </button>
        ))}
      </div>
    )
  }

  const pts = [...scene.nodes.flatMap((n) => [{ x: n.x, y: n.y }, { x: n.x + n.width, y: n.y + n.height }]), ...scene.edges.flatMap(polyline)]
  const minX = Math.min(...pts.map((p) => p.x)) - 16
  const minY = Math.min(...pts.map((p) => p.y)) - 16
  const vw = Math.max(...pts.map((p) => p.x)) - minX + 16
  const vh = Math.max(...pts.map((p) => p.y)) - minY + 16
  // Fit the width when it can stay legible; otherwise keep 70% scale and scroll.
  const scale = Math.max(0.55, Math.min(1, width / vw))
  const sceneById = new Map(scene.nodes.map((n) => [n.id, n]))

  return (
    <div ref={ref} className="inc-graph-scroll">
      <svg className="inc-graph" width={vw * scale} height={vh * scale} viewBox={`${minX} ${minY} ${vw} ${vh}`} role="img" aria-label={w.graphTitle}>
        <defs>
          {(['ok', 'failed', 'blocked', 'progressing', 'unknown'] as Health[]).map((h) => (
            <marker key={h} id={`inc-arrow-${h}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={h === 'ok' ? 'hsl(var(--muted-foreground))' : HEALTH[h]} />
            </marker>
          ))}
        </defs>
        {scene.edges.map((e) => {
          const from = byId.get(e.source)
          const h: Health = from && from.health !== 'ok' ? from.health : 'ok'
          const line = polyline(e)
          if (line.length < 2) return null
          const mid = midpoint(line)
          const label = e.label ?? ''
          return (
            <g key={e.id} className="inc-edge">
              <path d={`M${line.map((p) => `${p.x},${p.y}`).join(' L')}`} fill="none" stroke={h === 'ok' ? 'hsl(var(--muted-foreground))' : HEALTH[h]} strokeOpacity={h === 'ok' ? 0.55 : 0.95} strokeWidth={h === 'ok' ? 1.4 : 2} strokeDasharray={h === 'blocked' ? '5 4' : undefined} markerEnd={`url(#inc-arrow-${h})`} />
              {label ? (
                <g transform={`translate(${mid.x} ${mid.y})`}>
                  <rect x={-label.length * 3.1 - 6} y={-9} width={label.length * 6.2 + 12} height={18} rx={9} className="inc-edge-pill" />
                  <text textAnchor="middle" y={4} className="inc-edge-label">{label}</text>
                </g>
              ) : null}
            </g>
          )
        })}
        {model.nodes.map((n) => {
          const s = sceneById.get(n.id)
          if (!s) return null
          const on = selected === n.id
          return (
            <g
              key={n.id}
              data-kunobi-node={n.id}
              aria-label={`${n.kind} ${n.name}: ${n.status}`}
              role="button"
              tabIndex={0}
              className={`inc-node${on ? ' on' : ''}`}
              transform={`translate(${s.x} ${s.y})`}
              onClick={() => onSelect(on ? null : n)}
              onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onSelect(on ? null : n)}
            >
              <title>{`${n.kind} ${n.ns}/${n.name}: ${n.status}`}</title>
              <rect width={s.width} height={s.height} rx={10} className="inc-node-box" style={{ stroke: on ? 'hsl(var(--foreground))' : HEALTH[n.health] }} />
              <rect width={5} height={s.height - 16} x={0} y={8} rx={2.5} fill={HEALTH[n.health]} />
              <text x={16} y={22} className="inc-node-kind">{(n.kind.length + n.ns.length + 3) * 6.4 + 24 < s.width ? `${n.kind.toUpperCase()} · ${n.ns}` : n.kind.toUpperCase()}</text>
              <text x={16} y={43} className="inc-node-name">{n.name}</text>
              <circle cx={20} cy={s.height - 19} r={4} fill={HEALTH[n.health]} />
              <text x={30} y={s.height - 15} className="inc-node-status">{n.status}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ---------- the page ---------- */

const SHORT: Record<string, string> = { HelmRelease: 'HR', Kustomization: 'KS', OCIRepository: 'OCI', GitRepository: 'GIT', PostgresCluster: 'PG', Deployment: 'DEP', Pod: 'POD' }

/** What the side panel shows for a graph node: the condition message or spec it rests on. */
function detailOf(n: GNode, f: Facts): { detail: string; since: string } {
  if (n.kind === 'Kustomization') {
    const k = f.ks.find((x) => x.n === n.name)
    return { detail: k?.ready?.message ?? '', since: k && condHealth(k.ready) !== 'ok' ? k.ready?.t ?? '' : '' }
  }
  if (n.kind === 'HelmRelease') return { detail: f.hr?.ready?.message ?? '', since: f.hr?.ready?.t ?? '' }
  if (n.kind === 'OCIRepository') return { detail: f.oci ? `${f.oci.url} · ${f.oci.semver} → ${f.oci.artifact}` : '', since: '' }
  if (n.kind === 'Deployment') return { detail: f.deploys.find((d) => d.n === n.name)?.image ?? '', since: '' }
  if (n.kind === 'PostgresCluster') return { detail: f.pgc ? `Postgres ${f.pgc.pg}` : '', since: '' }
  if (n.kind === 'Pod') {
    const owners = new Set([n.match, ...f.sts.filter((s) => s.owner === n.match).map((s) => s.n)])
    const pods = f.pods.filter((p) => p.n === n.match || owners.has(p.owner))
    return { detail: pods.map((p) => `${p.n} · ${p.restarts}↻`).join('\n'), since: '' }
  }
  return { detail: '', since: '' }
}

export function Incident({ snapshot, start, translated, w }: { snapshot: Snapshot; start: Store; translated?: unknown; w: any }) {
  const cl = useCluster(snapshot)
  const f = React.useMemo(() => facts(cl, snapshot.scope), [cl, snapshot.scope])
  const model = React.useMemo(() => graphModel(f, w), [f, w])

  const live = useStore(STORE) as Store | undefined
  const st = (useStoreStatus(STORE) ?? {}) as St
  const open = st.status === 'open' && !!live
  // Seeded text shows in the reader's language until someone changes it; display only.
  const data: Store = React.useMemo(() => localizeSeed((open || st.status === 'paused') && live ? live : start, start, translated), [open, st.status, live, start, translated])
  const canEdit = open && !!st.canEdit
  const [refused, setRefused] = React.useState(false)
  const send = (change: (d: Store) => void) =>
    Promise.resolve(edit(STORE, change as any))
      .then((r: any) => setRefused(!!r?.status && !['applied', 'unchanged', 'duplicate'].includes(r.status)))
      .catch(() => setRefused(true))

  const [author, setAuthorState] = React.useState('')
  React.useEffect(() => {
    try { setAuthorState(localStorage.getItem('incident.author') ?? '') } catch { /* no storage here */ }
  }, [])
  const setAuthor = (v: string) => {
    setAuthorState(v)
    try { localStorage.setItem('incident.author', v) } catch { /* no storage here */ }
  }

  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const [focusId, setFocusId] = React.useState<string | null>(null)
  const focus = model.nodes.find((n) => n.id === focusId) ?? null

  const status = (data.status ?? 'investigating') as IncStatus
  const entries = React.useMemo(() => [...(data.entries ?? [])].sort((a, b) => ms(a.time) - ms(b.time)), [data.entries])
  const startedAt = ms(data.started)
  const endAt = status === 'resolved' && Number.isFinite(ms(data.resolved)) ? ms(data.resolved) : now
  const openFor = Number.isFinite(startedAt) ? endAt - startedAt : NaN

  const fmt = React.useMemo(() => ({
    date: new Intl.DateTimeFormat(w.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    dateTime: new Intl.DateTimeFormat(w.locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hourCycle: 'h23' }),
    time: new Intl.DateTimeFormat(w.locale, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hourCycle: 'h23' }),
    num: new Intl.NumberFormat(w.locale),
  }), [w.locale])
  const date = (iso?: string | null) => (Number.isFinite(ms(iso)) ? fmt.date.format(new Date(ms(iso))) : '—')
  const dateTime = (iso?: string | null) => (Number.isFinite(ms(iso)) ? `${fmt.dateTime.format(new Date(ms(iso)))} UTC` : '—')

  const setStatus = (next: IncStatus) => {
    if (next === status) return
    const when = new Date().toISOString()
    send((d) => {
      d.status = next
      d.resolved = next === 'resolved' ? when : ''
      d.entries.push({ id: `e-${uid()}`, time: when, kind: 'decision', author: author || w.someone, source: w.storeSource, text: w.statusChanged(w.status[next]) })
    })
  }

  // The postmortem's inputs: the timeline plus what the cluster says.
  const detect = entries.find((e) => e.kind === 'detect')
  const pm = {
    status, started: data.started ?? '', resolved: data.resolved ?? '',
    openDays: Number.isFinite(openFor) ? Math.floor(openFor / 86_400_000) : 0,
    failed: f.failed.map((h) => h.v), lastGood: f.lastGood?.v ?? '',
    stalledAt: f.hr?.stalled?.status === 'True' ? f.hr.stalled.t : '',
    running: f.runningVersion ?? '',
    podsReady: f.podsReady.length, pods: f.pods.length,
    blocked: f.blocked.map((k) => k.n), blockedDays: Number.isFinite(f.blockedSince) ? Math.floor((now - f.blockedSince) / 86_400_000) : 0,
    app: snapshot.scope.app, ns: snapshot.scope.namespace, release: snapshot.scope.release, gate: f.hr?.ks ?? '',
    detectLagDays: detect && Number.isFinite(startedAt) ? Math.floor((ms(detect.time) - startedAt) / 86_400_000) : null,
    actions: entries.filter((e) => e.kind === 'action'),
    date,
  }
  const kpis: { label: string; value: string; health: Health }[] = [
    { label: w.kpi.blocked, value: pm.blocked.length ? `${pm.blocked.length} · ${pm.blockedDays} d` : '0', health: pm.blocked.length ? 'blocked' : 'ok' },
    { label: w.kpi.failed, value: String(pm.failed.length), health: pm.failed.length ? 'failed' : 'ok' },
    { label: w.kpi.pods, value: `${pm.podsReady}/${pm.pods}`, health: countHealth(pm.podsReady, pm.pods) },
    { label: w.kpi.postgres, value: `${f.pgc?.ready ?? 0}/${f.pgc?.want ?? 0}`, health: countHealth(f.pgc?.ready ?? 0, f.pgc?.want ?? 0) },
    { label: w.kpi.pending, value: f.nothingWaiting ? '0' : '≥1', health: f.nothingWaiting ? 'ok' : 'blocked' },
    { label: w.kpi.warnings, value: String(f.appWarnings.length), health: f.appWarnings.length ? 'failed' : 'ok' },
  ]

  const shown = focus ? entries.filter((e) => `${e.source ?? ''} ${e.text ?? ''}`.includes(focus.match)) : entries
  const detail = focus ? <NodeDetail n={focus} d={detailOf(focus, f)} w={w} dateTime={dateTime} count={shown.length} onClose={() => setFocusId(null)} /> : null
  const sourceNote = cl.live ? w.live : cl.missing ? w.missing : w.sample(dateTime(snapshot.takenAt))

  return (
    <div className="inc">
      <style>{STYLE}</style>
      <div className="inc-in">
        <header className="inc-head">
          <div className="inc-head-l">
            <span className="inc-eyebrow"><span className="inc-dot" style={{ background: STATUS_COLOR[status] }} />{w.eyebrow(cl.live ? w.selectedCluster : snapshot.cluster.label)}</span>
            <h1>{data.title}</h1>
            <p className="inc-lede" title={w.plainTitle}>{w.plain(pm)}</p>
          </div>
          <div className="inc-meta">
            <div className="inc-field">
              <span>{w.severity}</span>
              {canEdit ? (
                <select className="inc-sev-select" value={data.severity ?? 'SEV3'} onChange={(e) => send((d) => void (d.severity = e.target.value as any))} aria-label={w.severity}>
                  {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <b className="inc-sev">{data.severity}</b>
              )}
            </div>
            <div className="inc-field">
              <span>{w.statusLabel}</span>
              <div className="inc-seg" role="radiogroup" aria-label={w.statusLabel}>
                {STATUSES.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={status === s} disabled={!canEdit && status !== s} className={status === s ? 'on' : ''} style={status === s ? { background: STATUS_COLOR[s], color: s === 'mitigated' ? C.midnight : '#fff' } : undefined} onClick={() => canEdit && setStatus(s)}>
                    {w.status[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="inc-field">
              <span>{w.commander}</span>
              {canEdit ? <Commander value={data.commander ?? ''} onCommit={(v) => send((d) => void (d.commander = v))} label={w.commander} /> : <b>{data.commander || '—'}</b>}
            </div>
            <div className="inc-field"><span>{w.started}</span><b>{dateTime(data.started)}</b></div>
            <div className="inc-field">
              <span>{status === 'resolved' ? w.resolvedAfter : w.openFor}</span>
              <b>{Number.isFinite(openFor) ? w.duration(openFor) : '—'}</b>
            </div>
            <SourceBadge cl={cl} w={w} takenAt={dateTime(snapshot.takenAt)} />
          </div>
          {refused ? <p className="inc-refused">{w.refused}</p> : null}
        </header>

        <ul className="inc-kpis">
          {kpis.map((k) => (
            <li key={k.label}><i style={{ background: HEALTH[k.health] }} /><span>{k.label}</span><b>{k.value}</b></li>
          ))}
        </ul>

        <div className="inc-main">
          <div className="inc-left">
            <section className="inc-card">
              <div className="inc-card-head">
                <h2>{w.graphTitle}<small>{w.graphHint}</small></h2>
                <ul className="inc-legend">
                  {(['failed', 'blocked', 'ok'] as Health[]).map((h) => (
                    <li key={h}><i style={{ background: HEALTH[h] }} />{w.health[h]}</li>
                  ))}
                </ul>
              </div>
              <ObjectGraph f={f} w={w} selected={focusId} onSelect={(n) => setFocusId(n ? n.id : null)} />
              <div className="inc-detail-narrow">{detail}</div>
            </section>

            <div className="inc-lower">
              <section className="inc-card">
                <div className="inc-card-head"><h2>{w.resourcesTitle}<small>{sourceNote}</small></h2></div>
                <Resources f={f} w={w} dateTime={dateTime} />
              </section>
              <section className="inc-card">
                <div className="inc-card-head"><h2>{w.eventsTitle}<small>{f.events.length}</small></h2></div>
                <Events events={f.events} w={w} now={cl.live ? now : ms(snapshot.takenAt)} num={fmt.num} />
              </section>
            </div>
          </div>

          <section className="inc-card inc-tl">
            <div className="inc-card-head">
              <h2>{w.timelineTitle}<small>{w.entriesN(entries.length)}</small></h2>
              {canEdit && st.saved === false ? <span className="inc-saving">{w.saving}</span> : null}
            </div>
            <div className="inc-detail-wide">{detail}</div>
            <ol className="inc-timeline">
              {shown.map((e, i) => {
                const day = date(e.time)
                const prevDay = i > 0 ? date(shown[i - 1].time) : null
                const kind = (e.kind ?? 'note') as Kind
                return (
                  <li key={e.id}>
                    {day !== prevDay ? <div className="inc-day">{day}</div> : null}
                    <div className="inc-entry">
                      <time>{Number.isFinite(ms(e.time)) ? fmt.time.format(new Date(ms(e.time))) : ''}</time>
                      <span className="inc-kind" style={{ color: KIND_COLOR[kind], borderColor: KIND_COLOR[kind] }}>{w.kinds[kind]}</span>
                      <div className="inc-entry-body">
                        <p>{e.text}</p>
                        <div className="inc-source">{e.source}{e.author ? <span> · {e.author}</span> : null}</div>
                      </div>
                    </div>
                  </li>
                )
              })}
              {shown.length === 0 ? <li className="inc-muted">{w.noEntries}</li> : null}
            </ol>
            {canEdit ? <AddEntry w={w} author={author} setAuthor={setAuthor} focus={focus} onAdd={(row) => send((d) => void d.entries.push({ id: `e-${uid()}`, time: new Date().toISOString(), ...row }))} /> : null}
          </section>
        </div>

        <section className="inc-card">
          <div className="inc-card-head">
            <h2>{w.pmTitle}</h2>
            <span className="inc-pm-status" style={{ color: STATUS_COLOR[status], borderColor: STATUS_COLOR[status] }}>{w.pmState[status]}</span>
          </div>
          <div className="inc-pm-grid">
            <div>
              <h3 className="inc-h3">{w.pmSummary}</h3>
              {w.summary(pm).map((p: string, i: number) => <p key={i} className="inc-prose">{p}</p>)}
              <h3 className="inc-h3">{w.pmChanged}</h3>
              {pm.actions.length ? (
                <ul className="inc-bullets">{pm.actions.map((a) => <li key={a.id}><b>{date(a.time)}</b> {a.text}</li>)}</ul>
              ) : (
                <p className="inc-prose inc-muted">{w.changedNone}</p>
              )}
            </div>
            <div>
              <h3 className="inc-h3">{w.pmTimeline}</h3>
              <ol className="inc-pm-timeline">
                {entries.map((e) => (
                  <li key={e.id}>
                    <span className="inc-pm-when">{date(e.time)}</span>
                    <span className="inc-pm-dot" style={{ background: KIND_COLOR[(e.kind ?? 'note') as Kind] }} />
                    <span>{firstSentence(e.text ?? '')}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="inc-h3">{w.pmFollow}</h3>
              <FollowUps rows={data.followups ?? []} w={w} canEdit={canEdit} send={send} />
            </div>
          </div>
        </section>

        <footer className="inc-foot">
          <b>{w.howTitle}</b>
          <ul>{w.prompts.map((p: string) => <li key={p}>{p}</li>)}</ul>
        </footer>
      </div>
    </div>
  )
}

/* ---------- pieces ---------- */

function SourceBadge({ cl, w, takenAt }: { cl: Cluster; w: any; takenAt: string }) {
  if (cl.live) return <span className="inc-badge live"><i />{w.live}</span>
  return (
    <span className="inc-badge">
      {cl.partial ? w.partial : w.sample(takenAt)}
      {cl.allow ? <button type="button" onClick={cl.allow}>{w.useLive}</button> : null}
    </span>
  )
}

function NodeDetail({ n, d, w, dateTime, count, onClose }: { n: GNode; d: { detail: string; since: string }; w: any; dateTime: (iso?: string | null) => string; count: number; onClose: () => void }) {
  return (
    <div className="inc-detail" style={{ borderColor: HEALTH[n.health] }}>
      <div className="inc-detail-top">
        <span className="inc-tag">{n.kind}</span>
        <b className="inc-mono">{n.ns}/{n.name}</b>
        <button type="button" onClick={onClose} aria-label={w.clear}>×</button>
      </div>
      <div className="inc-detail-state" style={{ color: HEALTH[n.health] }}>{n.status}</div>
      {d.detail ? <div className="inc-detail-msg">{d.detail}</div> : null}
      <div className="inc-detail-foot">
        {d.since ? <span>{w.since(dateTime(d.since))}</span> : null}
        <span>{w.entriesN(count)}</span>
      </div>
    </div>
  )
}

function Commander({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [draft, setDraft] = React.useState(value)
  React.useEffect(() => setDraft(value), [value])
  const commit = () => draft.trim() !== value && onCommit(draft.trim())
  return <input className="inc-commander" value={draft} aria-label={label} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
}

function AddEntry({ w, author, setAuthor, focus, onAdd }: { w: any; author: string; setAuthor: (v: string) => void; focus: { match: string } | null; onAdd: (row: Omit<Entry, 'id' | 'time'>) => void }) {
  const [kind, setKind] = React.useState<Kind>('finding')
  const [text, setText] = React.useState('')
  const [source, setSource] = React.useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    onAdd({ kind, text: text.trim(), source: source.trim() || focus?.match || '', author: author.trim() || w.someone })
    setText('')
    setSource('')
  }
  return (
    <form className="inc-add" onSubmit={submit}>
      <div className="inc-add-row">
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label={w.addKind}>
          {KINDS.map((k) => <option key={k} value={k}>{w.kinds[k]}</option>)}
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={w.addText} aria-label={w.addText} />
      </div>
      <div className="inc-add-row">
        <input className="inc-mono-in" value={source} onChange={(e) => setSource(e.target.value)} placeholder={focus ? focus.match : w.addSource} aria-label={w.addSource} />
        <input className="inc-author-in" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={w.addAuthor} aria-label={w.addAuthor} />
        <button type="submit" disabled={!text.trim()}>{w.add}</button>
      </div>
    </form>
  )
}

function Resources({ f, w, dateTime }: { f: Facts; w: any; dateTime: (iso?: string | null) => string }) {
  const rows: { key: string; kind: string; name: string; health: Health; state: string; tip: string }[] = []
  const ok = (h: Health, state: string) => (h === 'ok' && /Succeeded|Ready/.test(state) ? w.health.ok : state)
  const tip = (msg: string, since?: string) => [msg, since ? w.since(dateTime(since)) : ''].filter(Boolean).join('\n')
  if (f.hr) rows.push({ key: 'hr', kind: 'HelmRelease', name: `${f.hr.ns}/${f.hr.n}`, health: condHealth(f.hr.ready), state: f.hr.ready?.reason ?? '—', tip: tip(f.hr.ready?.message ?? '', f.hr.ready?.t) })
  for (const k of f.ks) rows.push({ key: `ks-${k.n}`, kind: 'Kustomization', name: `${k.ns}/${k.n}`, health: condHealth(k.ready), state: k.ready?.reason ?? '—', tip: tip(k.ready?.message ?? '', condHealth(k.ready) === 'ok' ? '' : k.ready?.t) })
  if (f.oci) rows.push({ key: 'oci', kind: 'OCIRepository', name: `${f.oci.ns}/${f.oci.n}`, health: condHealth(f.oci.ready), state: f.oci.artifact.split('@')[0] || '—', tip: `${f.oci.semver} → ${f.oci.artifact}` })
  if (f.git) rows.push({ key: 'git', kind: 'GitRepository', name: `${f.git.ns}/${f.git.n}`, health: condHealth(f.git.ready), state: `${f.git.branch}@${f.git.artifact.split(':').pop()?.slice(0, 7) ?? ''}`, tip: f.git.artifact })
  if (f.pgc) rows.push({ key: 'pgc', kind: 'PostgresCluster', name: `${f.pgc.ns}/${f.pgc.n}`, health: countHealth(f.pgc.ready, f.pgc.want), state: `${f.pgc.ready}/${f.pgc.want}`, tip: `Postgres ${f.pgc.pg}` })
  for (const d of f.deploys) rows.push({ key: `dep-${d.n}`, kind: 'Deployment', name: `${d.ns}/${d.n}`, health: countHealth(d.ready, d.want), state: `${d.ready}/${d.want}`, tip: d.image })
  return (
    <table className="inc-table">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} title={[r.kind + ' ' + r.name, r.tip].filter(Boolean).join('\n')}>
            <td><i className="inc-sq" style={{ background: HEALTH[r.health] }} aria-label={w.health[r.health]} /></td>
            <td><span className="inc-tag">{SHORT[r.kind] ?? r.kind}</span></td>
            <td className="inc-mono inc-ellip">{r.name.split('/').pop()}</td>
            <td className="inc-state" style={{ color: r.health === 'ok' ? undefined : HEALTH[r.health] }}>{ok(r.health, r.state)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Events({ events, w, now, num }: { events: Ev[]; w: any; now: number; num: Intl.NumberFormat }) {
  if (!events.length) return <p className="inc-muted">{w.eventsNone}</p>
  return (
    <ul className="inc-events">
      {events.slice(0, 6).map((e) => (
        <li key={`${e.kind}-${e.obj}-${e.reason}`} className={e.type === 'Warning' ? 'warn' : ''} title={`${e.kind} ${e.ns}/${e.obj} · ${e.src}\n${e.msg}`}>
          <div className="inc-ev-top">
            <span className="inc-ev-type">{e.type === 'Warning' ? 'W' : 'N'}</span>
            <b>{e.reason}</b>
            <span className="inc-mono inc-ellip inc-ev-obj">{SHORT[e.kind] ?? e.kind} {e.obj}</span>
            <span className="inc-ev-count">×{num.format(e.count)}</span>
            <span className="inc-ev-ago">{w.ago(now - ms(e.last))}</span>
          </div>
          <div className="inc-ev-msg">{e.msg}</div>
        </li>
      ))}
    </ul>
  )
}

function FollowUps({ rows, w, canEdit, send }: { rows: Store['followups']; w: any; canEdit: boolean; send: (c: (d: Store) => void) => void }) {
  const [text, setText] = React.useState('')
  const toggle = (id: string) => send((d) => {
    const r = d.followups.find((x) => x.id === id)
    if (r) r.done = r.done === 'done' ? 'open' : 'done'
  })
  return (
    <>
      <ul className="inc-follow">
        {rows.map((r) => (
          <li key={r.id} className={r.done === 'done' ? 'done' : ''}>
            <button type="button" role="checkbox" aria-checked={r.done === 'done'} disabled={!canEdit} onClick={() => toggle(r.id)} aria-label={r.text ?? ''}>
              <span className="inc-check">{r.done === 'done' ? '✓' : ''}</span>
            </button>
            <span className="inc-follow-text">{r.text}</span>
            <span className="inc-owner">{r.owner || w.noOwner}</span>
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form className="inc-add inc-add-follow" onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          send((d) => void d.followups.push({ id: `f-${uid()}`, text: text.trim(), owner: '', done: 'open' }))
          setText('')
        }}>
          <div className="inc-add-row">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={w.followPh} aria-label={w.followPh} />
            <button type="submit" disabled={!text.trim()}>{w.add}</button>
          </div>
        </form>
      ) : null}
    </>
  )
}

const STYLE = `
.inc { width: 100%; margin: 0; box-sizing: border-box; padding: 12px 20px 32px; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
.inc *, .inc *::before, .inc *::after { box-sizing: border-box; }
.inc-in { container-type: inline-size; display: flex; flex-direction: column; gap: 12px; }
.inc h1, .inc h2, .inc h3 { font-family: Parkinsans, Figtree, sans-serif; letter-spacing: -0.01em; margin: 0; }
.inc p { margin: 0; }
.inc-muted { color: hsl(var(--muted-foreground)); }
.inc-mono, .inc-source, .inc-mono-in { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.inc-ellip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inc-tag { display: inline-block; font: 700 10px Figtree, sans-serif; letter-spacing: .05em; text-transform: uppercase; padding: 1px 6px; border-radius: 5px; background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }

.inc-head { padding: 14px 18px; border-radius: 14px; background: radial-gradient(120% 160% at 10% 0%, ${C.deep} 0%, ${C.midnight} 60%, #031426 100%); color: #fff; display: flex; flex-wrap: wrap; gap: 12px 32px; align-items: flex-end; justify-content: space-between; }
.inc-head-l { display: grid; gap: 5px; min-width: 0; flex: 1 1 380px; }
.inc-eyebrow { display: inline-flex; align-items: center; gap: 8px; font: 600 12px Figtree, sans-serif; color: rgba(255,255,255,.7); letter-spacing: .02em; }
.inc-dot { width: 8px; height: 8px; border-radius: 99px; box-shadow: 0 0 0 3px rgba(255,255,255,.08); flex: none; }
.inc-head h1 { font-weight: 800; font-size: clamp(20px, 2.3cqw, 28px); line-height: 1.1; }
.inc-lede { font-size: 13px; line-height: 1.4; color: rgba(255,255,255,.75); max-width: 90ch; }
.inc-meta { display: flex; flex-wrap: wrap; gap: 10px 20px; align-items: flex-end; }
.inc-field { display: grid; gap: 4px; min-width: 0; }
.inc-field > span { font: 600 10.5px Figtree, sans-serif; color: rgba(255,255,255,.55); text-transform: uppercase; letter-spacing: .06em; }
.inc-field > b { font: 600 14px Figtree, sans-serif; white-space: nowrap; }
.inc-sev { display: inline-block; padding: 2px 8px; border-radius: 6px; background: rgba(243,170,8,.18); color: ${C.sun}; font: 800 13px ui-monospace, Menlo, monospace !important; }
.inc-sev-select, .inc-commander { font: 600 13px Figtree, sans-serif; color: #fff; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); border-radius: 7px; padding: 4px 7px; }
.inc-sev-select { font-family: ui-monospace, Menlo, monospace; color: ${C.sun}; }
.inc-sev-select option { color: #000; }
.inc-commander { width: 14ch; }
.inc-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; background: rgba(255,255,255,.08); flex-wrap: wrap; }
.inc-seg button { all: unset; cursor: pointer; padding: 3px 9px; border-radius: 7px; font: 600 12.5px Figtree, sans-serif; color: rgba(255,255,255,.75); }
.inc-seg button:disabled { cursor: default; opacity: .45; }
.inc-seg button:not(.on):not(:disabled):hover { background: rgba(255,255,255,.1); color: #fff; }
.inc-badge { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 4px 6px 4px 10px; border-radius: 99px; background: rgba(255,255,255,.1); font: 600 11.5px Figtree, sans-serif; color: rgba(255,255,255,.85); }
.inc-badge:not(:has(button)) { padding-right: 10px; }
.inc-badge.live i { width: 7px; height: 7px; border-radius: 99px; background: ${C.green}; box-shadow: 0 0 0 3px rgba(47,158,110,.3); }
.inc-badge button { all: unset; cursor: pointer; padding: 2px 9px; border-radius: 99px; background: ${C.sun}; color: ${C.midnight}; font-weight: 700; }
.inc-refused { color: ${C.sun}; font-size: 13px; flex-basis: 100%; }

.inc-kpis { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
.inc-kpis li { display: grid; grid-template-columns: 5px minmax(0, 1fr); column-gap: 10px; padding: 7px 12px; border-radius: 10px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); }
.inc-kpis i { grid-row: 1 / 3; width: 5px; border-radius: 3px; }
.inc-kpis span { font: 600 10.5px Figtree, sans-serif; text-transform: uppercase; letter-spacing: .05em; color: hsl(var(--muted-foreground)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inc-kpis b { font: 700 18px ui-monospace, Menlo, monospace; }
@container (max-width: 900px) { .inc-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }

.inc-main { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 27%); gap: 12px; align-items: start; }
.inc-tl { position: sticky; top: 12px; max-height: calc(100vh - 24px); }
.inc-tl .inc-timeline { overflow-y: auto; min-height: 0; flex: 1 1 auto; padding-right: 4px; }
.inc-left { display: grid; gap: 12px; min-width: 0; }
.inc-lower { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
@container (max-width: 1080px) { .inc-main { grid-template-columns: 1fr; } .inc-tl { position: static; max-height: none; } }
@container (max-width: 760px) { .inc-lower { grid-template-columns: 1fr; } }
.inc-detail-narrow { display: none; }
@container (max-width: 1080px) { .inc-detail-narrow { display: block; } .inc-detail-wide { display: none; } }

.inc-card { padding: 12px 14px; border-radius: 12px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.inc-card-head { display: flex; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; align-items: baseline; }
.inc-card-head h2 { font-size: 15px; font-weight: 600; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.inc-card-head h2 small { font: 600 12px Figtree, sans-serif; color: hsl(var(--muted-foreground)); letter-spacing: 0; }
.inc-h3 { font-size: 11px; font-weight: 600; color: hsl(var(--muted-foreground)); text-transform: uppercase; letter-spacing: .06em; }
.inc-legend { list-style: none; margin: 0; padding: 0; display: flex; gap: 10px; font-size: 12px; color: hsl(var(--muted-foreground)); flex-wrap: wrap; }
.inc-legend li { display: inline-flex; gap: 5px; align-items: center; }
.inc-legend i { width: 9px; height: 9px; border-radius: 3px; }

.inc-graph-scroll { overflow-x: auto; }
.inc-graph { display: block; margin: 0 auto; }
.inc-node { cursor: pointer; outline: none; }
.inc-node-box { fill: hsl(var(--card)); stroke-width: 1.6; }
.inc-node:hover .inc-node-box, .inc-node:focus-visible .inc-node-box { fill: hsl(var(--muted)); }
.inc-node.on .inc-node-box { stroke-width: 2.6; fill: hsl(var(--muted)); }
.inc-node-kind { font: 600 9.5px Figtree, sans-serif; letter-spacing: .06em; fill: hsl(var(--muted-foreground)); }
.inc-node-name { font: 600 13.5px ui-monospace, SFMono-Regular, Menlo, monospace; fill: hsl(var(--foreground)); }
.inc-node-status { font: 600 11.5px Figtree, sans-serif; fill: hsl(var(--muted-foreground)); }
.inc-edge-pill { fill: hsl(var(--card)); stroke: hsl(var(--border)); }
.inc-edge-label { font: 600 10.5px Figtree, sans-serif; fill: hsl(var(--muted-foreground)); }
.inc-graph-list { display: grid; gap: 4px; }
.inc-graph-list button { all: unset; cursor: pointer; display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 8px; background: hsl(var(--muted)); font-size: 13px; flex-wrap: wrap; }
.inc-graph-list button.on { outline: 2px solid hsl(var(--foreground)); }
.inc-graph-list i { width: 9px; height: 9px; border-radius: 99px; }

.inc-detail { border: 1px solid; border-left-width: 4px; border-radius: 10px; padding: 8px 10px; display: grid; gap: 4px; background: hsl(var(--muted)); }
.inc-detail-top { display: flex; gap: 8px; align-items: center; min-width: 0; }
.inc-detail-top b { font-size: 13px; overflow-wrap: anywhere; }
.inc-detail-top button { all: unset; cursor: pointer; margin-left: auto; font-size: 18px; line-height: 1; padding: 0 4px; color: hsl(var(--muted-foreground)); }
.inc-detail-state { font: 700 12.5px Figtree, sans-serif; }
.inc-detail-msg { font: 12px ui-monospace, Menlo, monospace; line-height: 1.4; overflow-wrap: anywhere; white-space: pre-line; }
.inc-detail-foot { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11.5px; color: hsl(var(--muted-foreground)); }

.inc-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12.5px; }
.inc-table td { padding: 5px 4px; border-bottom: 1px solid hsl(var(--border)); vertical-align: middle; }
.inc-table tr:last-child td { border-bottom: 0; }
.inc-table td:nth-child(1) { width: 18px; }
.inc-table td:nth-child(2) { width: 44px; }
.inc-table td:nth-child(4) { width: 40%; text-align: right; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inc-sq { display: block; width: 9px; height: 9px; border-radius: 3px; }

.inc-events { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.inc-events li { padding: 5px 8px; border-radius: 8px; background: hsl(var(--muted)); display: grid; gap: 2px; border-left: 3px solid hsl(var(--border)); min-width: 0; }
.inc-events li.warn { border-left-color: ${C.coral}; }
.inc-ev-top { display: flex; gap: 6px; align-items: baseline; font-size: 12.5px; min-width: 0; }
.inc-ev-type { font: 800 10px ui-monospace, Menlo, monospace; color: hsl(var(--muted-foreground)); }
.inc-events li.warn .inc-ev-type { color: ${C.coral}; }
.inc-ev-obj { flex: 1 1 auto; min-width: 0; font-size: 11.5px; color: hsl(var(--muted-foreground)); }
.inc-ev-count { font: 600 11.5px ui-monospace, Menlo, monospace; color: hsl(var(--muted-foreground)); white-space: nowrap; }
.inc-ev-ago { font-size: 11.5px; color: hsl(var(--muted-foreground)); white-space: nowrap; }
.inc-ev-msg { font-size: 11.5px; color: hsl(var(--muted-foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.inc-timeline { list-style: none; margin: 0; padding: 0; display: grid; }
.inc-day { font: 700 11px Figtree, sans-serif; color: hsl(var(--muted-foreground)); padding: 8px 0 3px; border-bottom: 1px solid hsl(var(--border)); margin-bottom: 3px; text-transform: uppercase; letter-spacing: .05em; }
.inc-timeline li:first-child .inc-day { padding-top: 0; }
.inc-entry { display: grid; grid-template-columns: 38px 66px minmax(0, 1fr); gap: 8px; padding: 4px 0; align-items: baseline; }
.inc-entry time { font: 600 11.5px ui-monospace, Menlo, monospace; color: hsl(var(--muted-foreground)); }
.inc-kind { font: 700 9.5px Figtree, sans-serif; text-transform: uppercase; letter-spacing: .04em; padding: 1px 0; border: 1px solid; border-radius: 99px; text-align: center; }
.inc-entry-body { display: grid; gap: 1px; min-width: 0; }
.inc-entry-body p { font-size: 13px; line-height: 1.38; }
.inc-source { font-size: 10.5px; color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.inc-source span { font-family: Figtree, sans-serif; }
.inc-saving { font-size: 12px; color: hsl(var(--muted-foreground)); }

.inc-add { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid hsl(var(--border)); }
.inc-add-row { display: flex; gap: 6px; flex-wrap: wrap; }
.inc-add input, .inc-add select { font: 13px Figtree, sans-serif; color: hsl(var(--foreground)); background: hsl(var(--background)); border: 1px solid hsl(var(--border)); border-radius: 8px; padding: 5px 8px; min-width: 0; }
.inc-add input { flex: 1 1 160px; }
.inc-add .inc-mono-in { font-size: 12px; font-family: ui-monospace, Menlo, monospace; flex: 2 1 160px; }
.inc-add .inc-author-in { flex: 1 1 90px; }
.inc-add button { all: unset; cursor: pointer; padding: 5px 14px; border-radius: 8px; background: ${C.horizon}; color: #fff; font: 700 12.5px Figtree, sans-serif; text-align: center; }
.inc-add button:disabled { opacity: .4; cursor: default; }

.inc-pm-status { font: 700 11.5px Figtree, sans-serif; padding: 2px 9px; border: 1px solid; border-radius: 99px; }
.inc-pm-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr); gap: 10px 24px; }
.inc-pm-grid > div { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
@container (max-width: 1080px) { .inc-pm-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .inc-pm-grid > div:first-child { grid-column: 1 / -1; } }
@container (max-width: 700px) { .inc-pm-grid { grid-template-columns: 1fr; } }
.inc-prose { font-size: 13.5px; line-height: 1.5; max-width: 72ch; }
.inc-bullets { margin: 0; padding-left: 16px; list-style: disc; display: grid; gap: 4px; font-size: 13px; line-height: 1.45; }
.inc-bullets b { font-weight: 600; color: hsl(var(--muted-foreground)); font-size: 12px; }
.inc-pm-timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.inc-pm-timeline li { display: grid; grid-template-columns: 84px 7px minmax(0, 1fr); gap: 8px; align-items: baseline; font-size: 12.5px; line-height: 1.38; }
.inc-pm-when { font: 600 11px ui-monospace, Menlo, monospace; color: hsl(var(--muted-foreground)); }
.inc-pm-dot { width: 7px; height: 7px; border-radius: 99px; transform: translateY(-1px); }
.inc-follow { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
.inc-follow li { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 8px; align-items: start; font-size: 13px; line-height: 1.4; }
.inc-follow li.done .inc-follow-text { text-decoration: line-through; color: hsl(var(--muted-foreground)); }
.inc-follow button { all: unset; cursor: pointer; }
.inc-follow button:disabled { cursor: default; }
.inc-check { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 5px; border: 1.5px solid hsl(var(--border)); font: 800 11px Figtree, sans-serif; color: #fff; margin-top: 1px; }
.inc-follow li.done .inc-check { background: ${C.green}; border-color: ${C.green}; }
.inc-owner { font-size: 11px; color: hsl(var(--muted-foreground)); white-space: nowrap; }
.inc-add-follow { border-top: 0; padding-top: 2px; }

.inc-foot { padding: 10px 14px; border-radius: 12px; background: hsl(var(--muted)); display: flex; gap: 8px 12px; flex-wrap: wrap; align-items: center; font-size: 12.5px; }
.inc-foot ul { list-style: none; margin: 0; padding: 0; display: flex; gap: 6px; flex-wrap: wrap; }
.inc-foot li { padding: 4px 10px; border-radius: 10px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); line-height: 1.35; }

@container (max-width: 520px) {
  .inc-head { padding: 14px; }
  .inc-meta { gap: 10px 14px; }
  .inc-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .inc-entry { grid-template-columns: 36px minmax(0, 1fr); row-gap: 2px; }
  .inc-entry .inc-kind { justify-self: start; padding: 1px 6px; }
  .inc-entry .inc-entry-body { grid-column: 2; }
  .inc-pm-timeline li { grid-template-columns: 76px 7px minmax(0, 1fr); }
}
`
