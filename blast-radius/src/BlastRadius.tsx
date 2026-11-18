import * as React from 'react'
import { useDiagram, useSource, useStore, useStoreStatus, edit } from 'kunobi'
import SNAP from '../data/cluster.json'
import { buildIndex } from './build.js'
import { projectLive } from './project.js'
import { localizeSeed } from './seed'
import {
  type Index, type Referrer, type Effect, TARGET_KINDS, SHORT,
  decodeSnapshot, finalizeLive, parseId, referrersOf, summarize, podCounts, refCounts, rowKey, restartCmd,
} from './model'

const STORE = 'blast-radius-review'
const DEFAULT = 'ConfigMap/kube-system/cilium-config'
const C = { midnight: '#06213f', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8', up: '#1f9d6b', down: '#d4573b', violet: '#8a6cf0', grey: '#8b97a6' }
const EFFECT_COLOR: Record<Effect, string> = {
  missing: C.down, restart: C.down, identity: C.violet, data: C.sun, route: C.horizon, traffic: C.horizon,
  helm: C.sun, flux: C.sun, files: C.up, cert: C.violet, pull: C.grey, auto: C.tide, grant: C.grey,
}

// Live sources: never Secret. No context: Kunobi uses the one selected in the person's tab.
const LIVE_KINDS: [string, string][] = [
  ['Pod', 'v1'], ['Deployment', 'apps/v1'], ['StatefulSet', 'apps/v1'], ['DaemonSet', 'apps/v1'], ['ReplicaSet', 'apps/v1'],
  ['Job', 'batch/v1'], ['CronJob', 'batch/v1'], ['Service', 'v1'], ['Ingress', 'networking.k8s.io/v1'],
  ['PersistentVolumeClaim', 'v1'], ['ServiceAccount', 'v1'], ['ConfigMap', 'v1'],
  ['RoleBinding', 'rbac.authorization.k8s.io/v1'], ['ClusterRoleBinding', 'rbac.authorization.k8s.io/v1'],
  ['HelmRelease', 'helm.toolkit.fluxcd.io/v2'], ['Kustomization', 'kustomize.toolkit.fluxcd.io/v1'], ['ExternalSecret', 'external-secrets.io/v1'],
]

function useIndex() {
  const states = LIVE_KINDS.map(([kind, apiVersion]) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length list, same order every render
    useSource({ type: 'k8s', params: { kind, apiVersion } }) as any
  )
  const settled = states.every((s) => s && (s.status === 'ready' || s.status === 'error' || s.status === 'unscoped'))
  const live = settled && states[0]?.status === 'ready' && Array.isArray(states[0]?.data)
  const action = states.find((s) => s?.action)?.action
  const snap = React.useMemo(() => decodeSnapshot(SNAP), [])
  const liveIndex = React.useMemo(() => {
    if (!live) return null
    const lists: Record<string, any[]> = {}
    LIVE_KINDS.forEach(([k], i) => (lists[k] = Array.isArray(states[i]?.data) ? states[i].data : []))
    // A kind whose source failed is unknown, not empty: do not mark its objects missing.
    const failed = new Set(LIVE_KINDS.filter((_, i) => states[i]?.status !== 'ready').map(([k]) => k))
    try {
      const I = finalizeLive(buildIndex(projectLive(lists)) as Index)
      for (const [k, v] of Object.entries(I.objects)) if (v?.missing && failed.has(k.split('/')[0])) I.objects[k] = { ...v, missing: 0 }
      return I
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, ...states.map((s) => s?.data)])
  return { index: liveIndex ?? snap, live: !!liveIndex, allow: action ? () => action.run() : undefined }
}

/** Send one change to the store; report anything it refused. */
const send = (change: (d: any) => void, onProblem: (r: string | null) => void) => {
  onProblem(null)
  Promise.resolve(edit(STORE, change) as any).then((r: any) => {
    if (r && r.status && r.status !== 'applied' && r.status !== 'unchanged') onProblem(String(r.reason || r.status))
  }, (err: any) => onProblem(String(err?.message ?? err)))
}

const fmtWhen = (iso: string, locale: string) => {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso)) + ' UTC'
  } catch {
    return iso
  }
}

export const BlastRadius = ({ w, locale, seed, translated }: { w: any; locale: string; seed?: unknown; translated?: unknown }) => {
  const { index, live, allow } = useIndex()
  const [q, setQ] = React.useState('')
  const [kind, setKind] = React.useState<string>('all')
  const [sel, setSel] = React.useState<string>(DEFAULT)
  const [limit, setLimit] = React.useState(60)
  const pods = React.useMemo(() => podCounts(index), [index])
  const refsN = React.useMemo(() => refCounts(index), [index])
  const stored = useStore(STORE)
  // Seeded notes show in the reader's language until someone changes them; display only.
  const review = React.useMemo(() => localizeSeed(stored, seed, translated), [stored, seed, translated]) as any
  const status = useStoreStatus(STORE) as any
  const canEdit = status?.status === 'open' && !!status?.canEdit
  const saving = status?.status === 'open' && status?.saved === false

  const all = React.useMemo(() => Object.keys(index.objects).filter((id) => (TARGET_KINDS as readonly string[]).includes(parseId(id).kind)), [index])
  const counts = React.useMemo(() => {
    const c: Record<string, number> = {}
    for (const id of all) c[parseId(id).kind] = (c[parseId(id).kind] || 0) + 1
    return c
  }, [all])
  const filtered = React.useMemo(() => {
    const t = q.trim().toLowerCase()
    return all
      .filter((id) => (kind === 'all' || parseId(id).kind === kind) && (!t || id.toLowerCase().includes(t)))
      .sort((a, b) => (pods[b] || 0) - (pods[a] || 0) || (refsN[b] || 0) - (refsN[a] || 0) || (a < b ? -1 : 1))
  }, [all, q, kind, pods, refsN])
  const selected = index.objects[sel] ? sel : index.objects[DEFAULT] ? DEFAULT : filtered[0] ?? all[0] ?? DEFAULT
  const reviewed = React.useMemo(() => {
    const s = new Set<string>()
    for (const r of Object.values((review?.checks ?? {}) as Record<string, any>)) if (r?.object) s.add(r.object)
    for (const n of (review?.notes ?? []) as any[]) if (n?.object) s.add(n.object)
    return s
  }, [review])

  return (
    <div className="br">
      <style>{CSS}</style>
      <div className="br-in">
      <header className="br-head">
        <div className="br-h1">
          <span className="br-eyebrow">{w.eyebrow}</span>
          <h1>{w.title}</h1>
        </div>
        <div className={`br-source ${live ? 'live' : ''}`}>
          <span className="br-dot" />
          <span>{live ? w.live : w.snapshot(fmtWhen(SNAP.takenAt, locale))}</span>
          {!live ? <span className="br-tag">{w.readOnlyChip}</span> : null}
          {!live ? <span className="br-ctx">{w.sample}</span> : null}
          <span className="br-tag br-info" title={w.coverageTip} tabIndex={0}>{w.coverage} ⓘ</span>
          {!live && allow ? <button className="br-btn" onClick={allow}>{w.useLive}</button> : null}
        </div>
      </header>

      <div className="br-main">
        <aside className="br-side">
          <input className="br-search" type="search" value={q} placeholder={w.search} aria-label={w.search} onChange={(e) => { setQ(e.target.value); setLimit(60) }} />
          <div className="br-kinds" role="tablist">
            <button role="tab" aria-selected={kind === 'all'} className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}>{w.all} <b>{all.length}</b></button>
            {TARGET_KINDS.map((k) => (
              <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {w.kinds[k]} <b>{counts[k] || 0}</b>
              </button>
            ))}
          </div>
          <div className="br-count">{w.results(filtered.length)}</div>
          <ul className="br-list">
            {filtered.length === 0 ? <li className="br-empty">{w.noMatch}</li> : null}
            {filtered.slice(0, limit).map((id) => {
              const p = parseId(id)
              const o = index.objects[id]
              const n = pods[id] || 0
              return (
                <li key={id}>
                  <button className={id === selected ? 'on' : ''} onClick={() => setSel(id)} aria-current={id === selected}>
                    <span className={`br-kind k-${p.kind}`}>{SHORT[p.kind]}</span>
                    <span className="br-li-name">
                      <span className="br-mono">{p.name}</span>
                      <span className="br-li-ns">{p.ns}</span>
                    </span>
                    <span className="br-li-right">
                      {reviewed.has(id) ? <span className="br-rev" title={w.reviewed} aria-label={w.reviewed} /> : null}
                      {o.missing ? <span className="br-tag bad">{w.missing}</span> : n ? <span className="br-num">{w.pods(n)}</span> : refsN[id] ? <span className="br-num">{refsN[id]}</span> : <span className="br-tag">{w.unused}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
            {filtered.length > limit ? (
              <li><button className="br-more" onClick={() => setLimit(limit + 120)}>{w.showMore(Math.min(120, filtered.length - limit))}</button></li>
            ) : null}
          </ul>
        </aside>

        <Detail key={selected} id={selected} index={index} w={w} locale={locale} review={review} canEdit={canEdit} saving={saving} />
      </div>
      </div>
    </div>
  )
}

function Detail({ id, index, w, locale, review, canEdit, saving }: { id: string; index: Index; w: any; locale: string; review: any; canEdit: boolean; saving: boolean }) {
  const p = parseId(id)
  const o = index.objects[id] || {}
  const refs = React.useMemo(() => referrersOf(index, id), [index, id])
  const s = React.useMemo(() => summarize(refs), [refs])
  const items = React.useMemo(() => checklist(p, o, refs, s, w), [id, refs])

  const meta: string[] = []
  if (p.kind === 'ConfigMap' && o.keys != null) meta.push(w.keys(o.keys))
  if (o.imm) meta.push(w.immutable)
  if (p.kind === 'Service') {
    if (o.type) meta.push(o.type)
    if (o.ports?.length) meta.push(o.ports.join(' '))
    if (o.endpoints != null) meta.push(w.selects(o.endpoints))
  }
  if (p.kind === 'PersistentVolumeClaim') meta.push(...[o.cap, o.sc, ...(o.am || []), o.phase].filter(Boolean))
  if (p.kind === 'Secret') meta.push(w.secretNote)
  if (o.mgr) meta.push(o.mgr.startsWith('helm:') ? w.managedHelm(o.mgr.slice(5)) : w.managedFlux(o.mgr.slice(5)))
  if (o.src) meta.push(w.syncedFrom(o.src))

  return (
    <section className="br-detail">
      <div className="br-title">
        <span className={`br-kind big k-${p.kind}`}>{w.kind1[p.kind] ?? p.kind}</span>
        <h2 className="br-mono">{p.name}</h2>
        <span className="br-ns">{p.ns}</span>
        {o.missing ? <span className="br-tag bad">{w.notFound}</span> : null}
        {meta.map((m, i) => <span key={i} className="br-chip">{m}</span>)}
      </div>

      <div className="br-kpis">
        <Kpi label={w.k.pods} value={s.pods} sub={s.pods ? w.k.ready(s.podsReady) : ''} />
        <Kpi label={w.k.workloads} value={s.workloads} />
        <Kpi label={w.k.restart} value={s.restart.length} tone={s.restart.length ? 'bad' : ''} />
        <Kpi label={w.k.auto} value={s.auto.length} />
        <Kpi label={w.k.others} value={s.others} />
      </div>

      <div className="br-grid2">
        <div className="br-card br-gcard">
          <div className="br-card-head">
            <h3>{w.graph}</h3>
            <span className="br-muted">{refs.length}</span>
          </div>
          {refs.length ? (
            <>
              <Graph id={id} refs={refs} w={w} />
              <GraphStack id={id} refs={refs} w={w} />
              <Legend refs={refs} w={w} />
            </>
          ) : <p className="br-muted">{o.missing ? w.notFound : w.noRefs}</p>}
        </div>
        <div className="br-stack">
          <Checklist id={id} items={items} w={w} review={review} canEdit={canEdit} saving={saving} />
          <Notes id={id} w={w} review={review} canEdit={canEdit} saving={saving} locale={locale} />
        </div>
      </div>

      {refs.length ? (
        <div className="br-card">
          <div className="br-card-head"><h3>{w.refsTitle}</h3><span className="br-muted">{refs.length}</span></div>
          <RefTable refs={refs} w={w} />
        </div>
      ) : null}
    </section>
  )
}

const Kpi = ({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: string }) => (
  <div className={`br-kpi ${tone || ''}`}>
    <div className="br-kpi-v">{value}</div>
    <div className="br-kpi-l">{label}</div>
    {sub ? <div className="br-kpi-s">{sub}</div> : null}
  </div>
)

// ---------- graph ----------

const MAX_NODES = 7
const nodeKey = (id: string) => `br:${id}`

function Graph({ id, refs, w }: { id: string; refs: Referrer[]; w: any }) {
  const shown = refs.length > MAX_NODES + 1 ? refs.slice(0, MAX_NODES) : refs
  const rest = refs.length - shown.length
  const p = parseId(id)
  const q = (s: string) => s.replace(/["\\]/g, '')
  const lines = ['flowchart LR', `  o["${q(SHORT[p.kind])} ${q(p.name)}"]`]
  shown.forEach((r, i) => {
    const how = [...new Set(r.hows.map((h) => w.how[h.how]))].join(', ')
    lines.push(`  r${i}["${q(SHORT[r.kind] ?? r.kind)} · ${q(how)} · ${q(r.name)}"] --> o`)
  })
  if (rest) lines.push(`  m["+${rest}"] --> o`)
  const mermaid = lines.join('\n')
  const d = useDiagram(mermaid) as any
  const scene = d?.status === 'ready' && d.scene?.nodes?.length ? d.scene : fallbackScene(shown.length, rest)
  const nodeById: Record<string, any> = {}
  for (const n of scene.nodes) nodeById[n.id] = n
  let maxX = 0
  let maxY = 0
  for (const n of scene.nodes) { maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height) }
  const pad = 6
  const vw = maxX + pad * 2
  const vh = maxY + pad * 2

  const card = (nid: string) => {
    const n = nodeById[nid]
    if (!n) return null
    if (nid === 'o') {
      return (
        <g key={nid} data-kunobi-node={nodeKey(id)} aria-label={`${p.kind} ${p.name}`} transform={`translate(${n.x + pad} ${n.y + pad})`}>
          <rect width={n.width} height={n.height} rx="10" className="g-obj" />
          <text x="12" y="20" className="g-kind on">{w.kind1[p.kind] ?? p.kind}</text>
          <text x="12" y="40" className="g-name on">{clip(p.name, n.width)}</text>
        </g>
      )
    }
    if (nid === 'm') {
      return (
        <g key={nid} transform={`translate(${n.x + pad} ${n.y + pad})`}>
          <rect width={n.width} height={n.height} rx="10" className="g-more" />
          <text x={n.width / 2} y={n.height / 2 + 4} textAnchor="middle" className="g-kind">{w.and(rest)}</text>
        </g>
      )
    }
    const r = shown[Number(nid.slice(1))]
    if (!r) return null
    const col = EFFECT_COLOR[r.effect]
    const podsTxt = r.node?.pods ? `${r.node.pods.filter((x: any[]) => x[2]).length}/${r.node.pods.length}` : ''
    return (
      <g key={nid} data-kunobi-node={nodeKey(r.id)} aria-label={`${r.kind} ${r.name}`} transform={`translate(${n.x + pad} ${n.y + pad})`}>
        <rect width={n.width} height={n.height} rx="10" className="g-card" />
        <rect width="5" height={n.height - 16} x="0" y="8" rx="2.5" fill={col} />
        <text x="14" y="20" className="g-kind">{clip(`${SHORT[r.kind] ?? r.kind} · ${[...new Set(r.hows.map((h) => w.how[h.how]))].join(', ')}`, n.width - (podsTxt ? 60 : 20))}</text>
        {podsTxt ? <text x={n.width - 10} y="20" textAnchor="end" className="g-pods">{podsTxt}</text> : null}
        <text x="14" y="40" className="g-name">{clip(r.name, n.width - 8)}</text>
      </g>
    )
  }

  return (
    <div className="br-graph">
      <svg viewBox={`0 0 ${vw} ${vh}`} style={{ maxWidth: vw * 1.5 }} role="img" aria-label={w.graph}>
        <defs>
          <marker id="br-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L8 4L0 8z" className="g-arrow" />
          </marker>
        </defs>
        {scene.edges.map((e: any, i: number) => {
          const sec = e.sections?.[0]
          if (!sec) return null
          const pts = [sec.startPoint, ...(sec.bendPoints || []), sec.endPoint].map((pt: any) => [pt.x + pad, pt.y + pad])
          const src = String(e.source)
          const r = src.startsWith('r') ? shown[Number(src.slice(1))] : null
          const col = r ? EFFECT_COLOR[r.effect] : C.grey
          return (
            <polyline key={i} points={pts.map((pt) => pt.join(',')).join(' ')} fill="none" stroke={col} strokeWidth="1.6" markerEnd="url(#br-arrow)" style={{ color: col }} />
          )
        })}
        {scene.nodes.map((n: any) => card(String(n.id)))}
        {/* Edge labels last, so a card never hides one. */}
        {scene.edges.map((e: any, i: number) => {
          const sec = e.sections?.[0]
          if (!sec || !e.label) return null
          const mid = midpoint([sec.startPoint, ...(sec.bendPoints || []), sec.endPoint].map((pt: any) => [pt.x + pad, pt.y + pad]))
          return (
            <g key={`l${i}`} transform={`translate(${mid[0]} ${mid[1]})`}>
              <rect x={-(e.label.length * 3.1) - 5} y="-8" width={e.label.length * 6.2 + 10} height="16" rx="8" className="g-lbl-bg" />
              <text y="4" textAnchor="middle" className="g-lbl">{e.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Narrow cards: the object on top, its dependents listed below. */
function GraphStack({ id, refs, w }: { id: string; refs: Referrer[]; w: any }) {
  const p = parseId(id)
  const shown = refs.length > MAX_NODES + 1 ? refs.slice(0, MAX_NODES) : refs
  const rest = refs.length - shown.length
  return (
    <div className="br-gstack">
      <div className="gs-obj">
        <span className="gs-k">{w.kind1[p.kind] ?? p.kind}</span>
        <span className="br-mono">{p.name}</span>
      </div>
      <div className="gs-up" aria-hidden="true">▲</div>
      <ul>
        {shown.map((r) => {
          const pods = r.node?.pods ? `${r.node.pods.filter((x: any[]) => x[2]).length}/${r.node.pods.length}` : ''
          return (
            <li key={r.id} style={{ ['--c' as any]: EFFECT_COLOR[r.effect] }}>
              <span className="gs-k">{SHORT[r.kind] ?? r.kind} · {[...new Set(r.hows.map((h) => w.how[h.how]))].join(', ')}</span>
              {pods ? <span className="gs-pods">{pods}</span> : null}
              <span className="br-mono gs-n">{r.name}</span>
            </li>
          )
        })}
        {rest ? <li className="gs-more">{w.and(rest)}</li> : null}
      </ul>
    </div>
  )
}

function fallbackScene(n: number, rest: number) {
  const W = 220
  const H = 56
  const gap = 18
  const rows = n + (rest ? 1 : 0)
  const total = rows * H + (rows - 1) * gap
  const nodes: any[] = []
  const edges: any[] = []
  for (let i = 0; i < rows; i++) {
    const nid = i < n ? `r${i}` : 'm'
    nodes.push({ id: nid, x: 0, y: i * (H + gap), width: W, height: H })
  }
  const oy = total / 2 - H / 2
  nodes.push({ id: 'o', x: W + 160, y: oy, width: W, height: H })
  for (const nd of nodes) if (nd.id !== 'o') edges.push({ source: nd.id, sections: [{ startPoint: { x: W, y: nd.y + H / 2 }, endPoint: { x: W + 160, y: oy + H / 2 } }] })
  return { nodes, edges }
}

function midpoint(pts: number[][]) {
  let best = 0
  let len = -1
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1])
    if (l > len) { len = l; best = i }
  }
  return [(pts[best][0] + pts[best + 1][0]) / 2, (pts[best][1] + pts[best + 1][1]) / 2]
}

const clip = (s: string, width: number) => {
  const max = Math.max(6, Math.floor(width / 7.2))
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function Legend({ refs, w }: { refs: Referrer[]; w: any }) {
  const effects = [...new Set(refs.map((r) => r.effect))]
  return (
    <ul className="br-legend">
      {effects.map((e) => (
        <li key={e}><span style={{ background: EFFECT_COLOR[e] }} />{w.effect[e]}</li>
      ))}
    </ul>
  )
}

// ---------- references ----------

function RefTable({ refs, w }: { refs: Referrer[]; w: any }) {
  const [open, setOpen] = React.useState<string | null>(null)
  return (
    <div className="br-refs">
      <div className="br-ref head">
        <span>{w.col.who}</span><span>{w.col.how}</span><span>{w.col.pods}</span><span>{w.col.change}</span>
      </div>
      {refs.map((r) => {
        const n = r.node
        const podList: any[] = n?.pods || []
        const ready = podList.filter((x) => x[2]).length
        const isOpen = open === r.id
        return (
          <div className="br-ref" key={r.id}>
            <span className="br-who">
              <span className="br-kind">{SHORT[r.kind] ?? r.kind}</span>
              <span>
                <span className="br-mono">{r.name}</span>
                {r.ns ? <span className="br-li-ns">{r.ns}</span> : null}
              </span>
            </span>
            <span className="br-hows">
              {r.hows.map((h, i) => (
                <span key={i} className="br-how">{w.how[h.how]}{h.d ? <em> · {h.d}</em> : null}</span>
              ))}
            </span>
            <span className="br-pods">
              {podList.length ? (
                <button className="br-podbtn" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
                  <b className={ready < podList.length ? 'warn' : ''}>{w.podsOf(ready, podList.length)}</b>
                  {n.restarts ? <span className="br-muted"> · {w.restarts(n.restarts)}</span> : null}
                </button>
              ) : n?.pods && r.kind === 'CronJob' ? <span className="br-mono br-muted">{n.sch}</span> : n?.pods && n.want > 0 ? <b className="warn">{`0/${n.want}`}</b> : <span className="br-muted">–</span>}
              {n?.pods && !n.bare && r.kind !== 'DaemonSet' && r.kind !== 'CronJob' && (n.want ?? 0) <= 1 && (r.effect === 'restart' || r.effect === 'auto') ? <span className="br-tag">{w.single}</span> : null}
            </span>
            <span className="br-change">
              <span className="br-eff" title={w.effectLong[r.effect]} style={{ ['--c' as any]: EFFECT_COLOR[r.effect] }}>{w.effect[r.effect]}</span>
            </span>
            {isOpen ? (
              <ul className="br-podlist">
                {podList.map((pd) => (
                  <li key={pd[0]}><span className={`br-pd ${pd[2] ? 'ok' : pd[1] === 'Succeeded' ? 'done' : 'bad'}`} /><span className="br-mono">{pd[0]}</span>{pd[3] ? <span className="br-muted"> · {pd[3]}↻</span> : null}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

// ---------- checklist ----------

interface Item { id: string; text: string; cmds?: string[]; tone?: 'bad' | '' }

function checklist(p: any, o: any, refs: Referrer[], s: ReturnType<typeof summarize>, w: any): Item[] {
  const items: Item[] = []
  const names = (rs: Referrer[]) => w.list(rs.map((r) => r.name))
  const B = s.byEffect
  if (o.missing) items.push({ id: 'missing', text: w.c.missing(refs.length), tone: 'bad' })
  if (o.mgr?.startsWith('helm:')) items.push({ id: 'managed', text: w.c.helm(o.mgr.slice(5)) })
  else if (o.mgr?.startsWith('flux:')) items.push({ id: 'managed', text: w.c.flux(o.mgr.slice(5)) })
  if (o.src) items.push({ id: 'src', text: w.c.src(o.src) })
  if (!refs.length) items.push({ id: 'unused', text: w.c.unused })
  if (s.restart.length) {
    const cmds = s.restart.map(restartCmd).filter(Boolean) as string[]
    items.push({ id: 'restart', text: w.c.restart(s.restart.length, names(s.restart)), cmds: cmds.slice(0, 4), tone: 'bad' })
  }
  if (s.auto.length) items.push({ id: 'auto', text: w.c.auto(names(s.auto)) })
  if (s.single.length) items.push({ id: 'single', text: w.c.single(names(s.single)), tone: 'bad' })
  if (s.envKeys.length) items.push({ id: 'keys', text: w.c.keys(w.list(s.envKeys)) })
  if (s.files.length) items.push({ id: 'files', text: w.c.files(names(s.files)) })
  if (B.helm?.length) items.push({ id: 'helm', text: w.c.helmValues(B.helm.length, names(B.helm)) })
  if (B.flux?.length) items.push({ id: 'flux', text: w.c.substitute(B.flux.length) })
  const hosts = (rs: Referrer[] = []) => w.list([...new Set(rs.flatMap((r) => r.node?.hosts || []))])
  if (B.route?.length) items.push({ id: 'route', text: w.c.route(hosts(B.route)) })
  if (B.traffic?.length) {
    const n = B.traffic.reduce((a, r) => a + (r.node?.pods || []).filter((x: any[]) => x[1] === 'Running').length, 0)
    items.push({ id: 'traffic', text: w.c.traffic(n, names(B.traffic)) })
  }
  if (B.cert?.length) items.push({ id: 'cert', text: w.c.cert(hosts(B.cert)) })
  if (B.data?.length) items.push({ id: 'data', text: w.c.data(names(B.data), (o.am || []).includes('ReadWriteOnce')) })
  if (B.identity?.length) items.push({ id: 'identity', text: w.c.identity(B.identity.length) })
  if (B.grant?.length) {
    const roles = [...new Set(B.grant.flatMap((r) => r.hows.map((h) => h.d).filter(Boolean)))] as string[]
    items.push({ id: 'grant', text: w.c.grant(B.grant.length, w.list(roles)) })
  }
  if (B.pull?.length) items.push({ id: 'pull', text: w.c.pull(names(B.pull)) })
  if (refs.length && !o.missing) items.push({ id: 'diff', text: w.c.diff })
  if (s.pods) {
    const nss = [...new Set(refs.filter((r) => r.node?.pods).map((r) => r.ns).filter(Boolean))].slice(0, 2) as string[]
    items.push({ id: 'watch', text: w.c.watch(), cmds: nss.map((ns) => `kubectl -n ${ns} get pods -w`) })
  }
  return items
}

function Checklist({ id, items, w, review, canEdit, saving }: { id: string; items: Item[]; w: any; review: any; canEdit: boolean; saving: boolean }) {
  const [problem, setProblem] = React.useState<string | null>(null)
  const checks = (review?.checks ?? {}) as Record<string, any>
  const done = items.filter((it) => checks[rowKey(id, it.id)]?.state === 'done').length
  const toggle = (it: Item) => {
    const key = rowKey(id, it.id)
    send((d: any) => {
      d.checks = d.checks || {}
      if (d.checks[key]) delete d.checks[key]
      else d.checks[key] = { object: id, item: it.id, state: 'done' }
    }, setProblem)
  }
  return (
    <div className="br-card">
      <div className="br-card-head">
        <h3>{w.check}</h3>
        <span className="br-muted">{canEdit ? (saving ? <span className="br-saving">{w.saving} · </span> : '') : `${w.readOnly} · `}{w.progress(done, items.length)}</span>
      </div>
      {problem ? <p className="br-problem" role="alert">{w.notSaved(problem)}</p> : null}
      <ol className="br-check">
        {items.map((it) => {
          const on = checks[rowKey(id, it.id)]?.state === 'done'
          return (
            <li key={it.id} className={`${on ? 'on' : ''} ${it.tone || ''}`}>
              {canEdit ? (
                <label className="br-ci">
                  <input type="checkbox" checked={on} onChange={() => toggle(it)} />
                  <ItemText it={it} />
                </label>
              ) : (
                <div className="br-ci ro">
                  <span className={`br-mark ${on ? 'on' : ''}`} aria-hidden="true">{on ? '✓' : ''}</span>
                  <ItemText it={it} />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const ItemText = ({ it }: { it: Item }) => (
  <span>
    {it.text}
    {it.cmds?.length ? <code className="br-cmd">{it.cmds.join('\n')}</code> : null}
  </span>
)

function Notes({ id, w, review, canEdit, saving, locale }: { id: string; w: any; review: any; canEdit: boolean; saving: boolean; locale: string }) {
  const [text, setText] = React.useState('')
  const [problem, setProblem] = React.useState<string | null>(null)
  const notes = ((review?.notes ?? []) as any[]).filter((n) => n?.object === id).slice().reverse()
  const add = () => {
    const t = text.trim()
    if (!t) return
    send((d: any) => {
      d.notes = d.notes || []
      d.notes.push({ id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, object: id, text: t.slice(0, 500), at: new Date().toISOString() })
    }, setProblem)
    setText('')
  }
  return (
    <div className="br-card">
      <div className="br-card-head"><h3>{w.notes}</h3><span className="br-muted">{canEdit && saving ? <span className="br-saving">{w.saving} · </span> : null}{notes.length || ''}</span></div>
      {problem ? <p className="br-problem" role="alert">{w.notSaved(problem)}</p> : null}
      {canEdit ? (
        <form className="br-noteform" onSubmit={(e) => { e.preventDefault(); add() }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={w.notePlaceholder} aria-label={w.notes} />
          <button className="br-btn" type="submit" disabled={!text.trim()}>{w.add}</button>
        </form>
      ) : null}
      {notes.length ? (
        <ul className="br-notes">
          {notes.map((n) => (
            <li key={n.id}>
              <span>{n.text}</span>
              <time className="br-muted">{n.at ? new Date(n.at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : ''}</time>
            </li>
          ))}
        </ul>
      ) : <p className="br-muted small">{w.noNotes}</p>}
    </div>
  )
}

const CSS = `
.br { width: 100%; margin: 0; box-sizing: border-box; container: br / inline-size; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); font-size: 14px; }
.br-in { padding: 12px 20px 32px; }
.br *, .br *::before, .br *::after { box-sizing: border-box; }
.br h1, .br h2, .br h3 { margin: 0; }
.br-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em; overflow-wrap: anywhere; }
.br-muted { color: hsl(var(--muted-foreground)); }
.br .small { font-size: 12.5px; margin: 2px 0 10px; }
.br-head { display: flex; justify-content: space-between; align-items: center; gap: 10px 20px; flex-wrap: wrap; padding: 4px 0 12px; border-bottom: 1px solid hsl(var(--border)); margin-bottom: 14px; }
.br-h1 { display: flex; align-items: baseline; gap: 4px 14px; flex-wrap: wrap; }
.br-info { cursor: help; }
.br-chip { font-size: 12px; padding: 2px 8px; border-radius: 6px; background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
.br-eyebrow { font: 600 12px Figtree, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: ${C.horizon}; }
.br h1 { font: 800 24px/1.15 Parkinsans, Figtree, sans-serif; letter-spacing: -.01em; }
.br-source { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; padding: 8px 12px; border-radius: 10px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); font-size: 12.5px; font-weight: 600; max-width: 100%; }
.br-source .br-ctx { font-weight: 400; color: hsl(var(--muted-foreground)); font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; }
.br-dot { width: 8px; height: 8px; border-radius: 99px; background: ${C.sun}; flex: none; }
.br-source.live .br-dot { background: ${C.up}; box-shadow: 0 0 0 3px color-mix(in srgb, ${C.up} 25%, transparent); }
.br-btn { font: 600 12.5px Figtree, sans-serif; padding: 6px 12px; border-radius: 8px; border: 1px solid ${C.horizon}; background: ${C.horizon}; color: #fff; cursor: pointer; }
.br-btn:disabled { opacity: .45; cursor: default; }
.br-main { display: grid; grid-template-columns: 290px minmax(0, 1fr); gap: 18px; align-items: start; }
.br-side { position: sticky; top: 8px; display: grid; gap: 10px; min-width: 0; }
.br-search { width: 100%; font: 14px Figtree, sans-serif; padding: 9px 12px; border-radius: 10px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); color: hsl(var(--foreground)); outline: none; }
.br-search:focus { border-color: ${C.horizon}; box-shadow: 0 0 0 3px color-mix(in srgb, ${C.horizon} 22%, transparent); }
.br-kinds { display: flex; flex-wrap: wrap; gap: 6px; }
.br-kinds button { font: 600 12px Figtree, sans-serif; padding: 5px 9px; border-radius: 99px; border: 1px solid hsl(var(--border)); background: transparent; color: hsl(var(--muted-foreground)); cursor: pointer; }
.br-kinds button b { font-weight: 600; opacity: .7; margin-left: 2px; }
.br-kinds button.on { background: hsl(var(--foreground)); border-color: hsl(var(--foreground)); color: hsl(var(--background)); }
.br-count { font-size: 12px; color: hsl(var(--muted-foreground)); }
.br-list { list-style: none; margin: 0; padding: 4px; border: 1px solid hsl(var(--border)); border-radius: 12px; background: hsl(var(--card)); max-height: calc(100vh - 190px); min-height: 360px; overflow: auto; }
.br-list li button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
.br-list li button:hover { background: hsl(var(--muted)); }
.br-list li button.on { background: color-mix(in srgb, ${C.horizon} 14%, hsl(var(--card))); box-shadow: inset 3px 0 0 ${C.horizon}; }
.br-list li button:focus-visible { outline: 2px solid ${C.horizon}; }
.br-li-name { display: grid; min-width: 0; flex: 1; line-height: 1.25; }
.br-li-name .br-mono { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12.5px; }
.br-li-ns { display: block; font-size: 11.5px; color: hsl(var(--muted-foreground)); }
.br-li-right { display: flex; align-items: center; gap: 6px; flex: none; }
.br-num { font: 600 11.5px Figtree, sans-serif; color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; }
.br-rev { width: 7px; height: 7px; border-radius: 99px; background: ${C.up}; }
.br-empty { padding: 12px; color: hsl(var(--muted-foreground)); font-size: 13px; }
.br-more { justify-content: center; font-weight: 600; color: ${C.horizon}; }
.br-kind { flex: none; display: inline-block; min-width: 42px; text-align: center; font: 600 10.5px Figtree, sans-serif; letter-spacing: .02em; padding: 2px 6px; border-radius: 6px; background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
.br-kind.k-ConfigMap { background: color-mix(in srgb, ${C.tide} 20%, transparent); color: color-mix(in srgb, ${C.tide} 60%, hsl(var(--foreground))); }
.br-kind.k-Secret { background: color-mix(in srgb, ${C.violet} 18%, transparent); color: color-mix(in srgb, ${C.violet} 65%, hsl(var(--foreground))); }
.br-kind.k-Service { background: color-mix(in srgb, ${C.horizon} 16%, transparent); color: color-mix(in srgb, ${C.horizon} 70%, hsl(var(--foreground))); }
.br-kind.k-PersistentVolumeClaim { background: color-mix(in srgb, ${C.sun} 22%, transparent); color: color-mix(in srgb, ${C.sun} 45%, hsl(var(--foreground))); }
.br-kind.k-ServiceAccount { background: color-mix(in srgb, ${C.up} 18%, transparent); color: color-mix(in srgb, ${C.up} 65%, hsl(var(--foreground))); }
.br-kind.big { font-size: 12px; padding: 4px 9px; }
.br-tag { font: 600 10.5px Figtree, sans-serif; padding: 2px 7px; border-radius: 99px; border: 1px solid hsl(var(--border)); color: hsl(var(--muted-foreground)); white-space: nowrap; }
.br-tag.bad { border-color: color-mix(in srgb, ${C.down} 50%, transparent); color: ${C.down}; }
.br-detail { min-width: 0; display: grid; gap: 14px; }
.br-title { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; }
.br-title h2 { font-size: 22px; font-weight: 600; letter-spacing: -.01em; }
.br-ns { font-size: 13px; color: hsl(var(--muted-foreground)); }
.br-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: -4px; }
.br-meta span { font-size: 12px; padding: 3px 8px; border-radius: 6px; background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
.br-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.br-kpi { padding: 10px 12px; border-radius: 12px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); min-width: 0; }
.br-kpi-v { font: 800 22px/1 Parkinsans, Figtree, sans-serif; font-variant-numeric: tabular-nums; }
.br-kpi.bad .br-kpi-v { color: ${C.down}; }
.br-kpi-l { margin-top: 5px; font-size: 12px; font-weight: 600; line-height: 1.3; }
.br-kpi-s { font-size: 11.5px; color: hsl(var(--muted-foreground)); margin-top: 2px; }
.br-card { padding: 14px 16px; border-radius: 14px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); min-width: 0; }
.br-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 6px 12px; flex-wrap: wrap; margin-bottom: 8px; }
.br-card-head h3 { font: 600 15px Figtree, sans-serif; }
.br-card-head .br-muted { font-size: 12.5px; }
.br-gcard { container: brg / inline-size; }
.br-gstack { display: none; gap: 6px; }
.br-gstack .gs-obj { display: grid; gap: 2px; padding: 9px 12px; border-radius: 10px; background: ${C.midnight}; border: 1.5px solid ${C.horizon}; color: #fff; }
.br-gstack .gs-obj .gs-k { color: ${C.ocean}; }
.br-gstack .gs-k { font: 600 10.5px Figtree, sans-serif; color: hsl(var(--muted-foreground)); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.br-gstack .gs-up { text-align: center; font-size: 10px; line-height: 1; color: hsl(var(--muted-foreground)); }
.br-gstack ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
.br-gstack li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; padding: 7px 10px 7px 14px; border-radius: 9px; border: 1px solid hsl(var(--border)); position: relative; }
.br-gstack li::before { content: ''; position: absolute; left: 0; top: 7px; bottom: 7px; width: 4px; border-radius: 2px; background: var(--c); }
.br-gstack .gs-pods { font: 600 11px Figtree, sans-serif; font-variant-numeric: tabular-nums; }
.br-gstack .gs-n { grid-column: 1 / -1; font-size: 12px; }
.br-gstack li.gs-more { display: block; text-align: center; border-style: dashed; color: hsl(var(--muted-foreground)); font-size: 12px; padding: 5px; }
.br-gstack li.gs-more::before { display: none; }
@container brg (max-width: 460px) {
  .br-graph { display: none; }
  .br-gstack { display: grid; }
}
.br-graph svg { display: block; width: 100%; height: auto; margin: 0 auto; }
.br .g-card { fill: hsl(var(--card)); stroke: hsl(var(--border)); }
.br .g-obj { fill: ${C.midnight}; stroke: ${C.horizon}; stroke-width: 1.5; }
.br .g-more { fill: hsl(var(--muted)); stroke: hsl(var(--border)); stroke-dasharray: 4 3; }
.br .g-kind { font: 600 10.5px Figtree, sans-serif; fill: hsl(var(--muted-foreground)); }
.br .g-pods { font: 600 11px Figtree, sans-serif; fill: hsl(var(--foreground)); font-variant-numeric: tabular-nums; }
.br .g-name { font: 500 12px ui-monospace, Menlo, monospace; fill: hsl(var(--foreground)); }
.br .g-kind.on { fill: ${C.ocean}; }
.br .g-name.on { fill: #fff; }
.br .g-arrow { fill: currentColor; }
.br .g-lbl-bg { fill: hsl(var(--card)); stroke: hsl(var(--border)); }
.br .g-lbl { font: 600 10.5px Figtree, sans-serif; fill: hsl(var(--muted-foreground)); }
.br-legend { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 8px 0 0; padding: 0; font-size: 12px; color: hsl(var(--muted-foreground)); }
.br-legend span { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.br-grid2 { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(300px, 1fr); gap: 14px; align-items: start; }
.br-stack { display: grid; gap: 14px; min-width: 0; }
.br-refs { display: grid; }
.br-ref { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.4fr) 110px 150px; gap: 4px 12px; padding: 6px 0; border-top: 1px solid hsl(var(--border)); align-items: start; }
.br-ref.head { border-top: 0; padding-top: 0; font-size: 11.5px; font-weight: 600; color: hsl(var(--muted-foreground)); text-transform: uppercase; letter-spacing: .05em; }
.br-who { display: flex; gap: 8px; align-items: flex-start; min-width: 0; }
.br-who .br-mono { font-size: 12.5px; }
.br-hows { display: flex; flex-wrap: wrap; gap: 4px; }
.br-how { font-size: 12px; padding: 1px 7px; border-radius: 6px; background: hsl(var(--muted)); overflow-wrap: anywhere; }
.br-how em { font-style: normal; color: hsl(var(--muted-foreground)); font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
.br-pods { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; font-variant-numeric: tabular-nums; }
.br-podbtn { all: unset; cursor: pointer; font-size: 13px; border-bottom: 1px dashed hsl(var(--border)); }
.br-podbtn:focus-visible { outline: 2px solid ${C.horizon}; }
.br .warn { color: ${C.down}; }
.br-change { display: grid; gap: 2px; font-size: 12px; line-height: 1.35; }
.br-eff { font-weight: 600; color: var(--c); display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; }
.br-eff::before { content: ''; width: 8px; height: 8px; border-radius: 2px; background: var(--c); }
.br-podlist { grid-column: 1 / -1; list-style: none; margin: 4px 0 0; padding: 8px 10px; border-radius: 8px; background: hsl(var(--muted)); display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 4px 12px; font-size: 12px; }
.br-podlist li { display: flex; align-items: center; gap: 6px; min-width: 0; }
.br-podlist .br-mono { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.br-pd { width: 7px; height: 7px; border-radius: 99px; flex: none; background: ${C.down}; }
.br-pd.ok { background: ${C.up}; }
.br-pd.done { background: ${C.grey}; }
.br-check { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; counter-reset: c; }
.br-check .br-ci { position: relative; display: flex; gap: 10px; align-items: flex-start; padding: 5px 6px; border-radius: 8px; cursor: pointer; font-size: 13px; line-height: 1.4; }
.br-check .br-ci.ro { cursor: default; }
.br-check label.br-ci:hover { background: hsl(var(--muted)); }
.br-check li.bad > .br-ci { padding-left: 11px; }
.br-check li.bad > .br-ci::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 2px; background: color-mix(in srgb, ${C.down} 75%, transparent); }
.br-mark { flex: none; width: 15px; height: 15px; margin-top: 3px; display: grid; place-items: center; font-size: 13px; font-weight: 700; line-height: 1; color: ${C.horizon}; }
.br-mark::before { content: ''; width: 5px; height: 5px; border-radius: 99px; background: hsl(var(--muted-foreground)); opacity: .55; }
.br-mark.on::before { display: none; }
.br-saving { color: ${C.horizon}; font-weight: 600; }
.br-problem { margin: 0 0 8px; padding: 6px 10px; border-radius: 8px; font-size: 12.5px; color: ${C.down}; background: color-mix(in srgb, ${C.down} 10%, transparent); }
.br-check li.on > .br-ci > span { color: hsl(var(--muted-foreground)); text-decoration: line-through; text-decoration-color: color-mix(in srgb, currentColor 50%, transparent); }
.br-check input { margin-top: 3px; width: 15px; height: 15px; accent-color: ${C.horizon}; flex: none; }
.br-cmd { display: block; margin-top: 6px; padding: 6px 8px; border-radius: 6px; background: hsl(var(--muted)); font: 11.5px/1.5 ui-monospace, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; text-decoration: none; }
.br-noteform { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.br-noteform input { flex: 1 1 200px; min-width: 0; font: 13.5px Figtree, sans-serif; padding: 8px 10px; border-radius: 8px; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--foreground)); }
.br-notes { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.br-notes li { display: grid; gap: 2px; padding: 8px 10px; border-radius: 8px; background: hsl(var(--muted)); font-size: 13.5px; line-height: 1.4; }
.br-notes time { font-size: 11.5px; }
.br-foot { margin-top: 28px; padding: 16px 18px; border-radius: 14px; background: hsl(var(--muted)); font-size: 13.5px; line-height: 1.55; }
.br-foot h3 { font: 600 14px Figtree, sans-serif; margin-bottom: 4px; }
.br-foot p { margin: 4px 0 0; max-width: 95ch; }
@container br (max-width: 1080px) {
  .br-grid2 { grid-template-columns: minmax(0, 1fr); }
}
@container br (max-width: 860px) {
  .br-main { grid-template-columns: minmax(0, 1fr); }
  .br-side { position: static; }
  .br-list { max-height: 300px; }
  .br-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .br-list { min-height: 0; }
}
@container br (max-width: 560px) {
  .br-in { padding: 12px 16px 36px; }
  .br-ref { grid-template-columns: minmax(0, 1fr) auto; }
  .br-ref.head { display: none; }
  .br-hows { grid-column: 1 / -1; grid-row: 2; }
  .br-pods { grid-column: 2; grid-row: 1; justify-items: end; }
  .br-change { grid-column: 1 / -1; }
  .br h1 { font-size: 20px; }
}
`
