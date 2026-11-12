// Cluster model: one projection for the snapshot file and for live objects.
// Live objects from useSource are full Kubernetes objects; the normalizers below turn
// them into the same rows that data/cluster.json stores, so the page has one code path.

export type Sev = 'crit' | 'warn' | 'info'
export type Condition = { type: string; status: string; reason: string; message: string; since: string | null }

export type Pod = {
  ns: string; n: string; phase: string; ready: number; total: number; restarts: number
  waiting: string | null; ownerKind: string | null; owner: string | null; node: string | null; start: string | null
  lastReason: string | null; lastExit: number | null; lastAt: string | null
}
export type Workload = { kind: string; ns: string; n: string; want: number; ready: number; ownerKind: string | null }
export type Node = {
  n: string; role: string; ready: boolean; v: string; cpuAlloc: number; memAlloc: number
  cpu: number | null; mem: number | null; created: string | null; conditions: Condition[]
}
export type Flux = { kind: string; ns: string; n: string; suspend: boolean; dependsOn: string[]; conditions: Condition[] }
export type Event = { ns: string; kind: string; obj: string; reason: string; count: number; first: string; last: string; src: string; msg: string }
export type Usage = { ns: string; kind: string; n: string; pods: number; cpu: number; cpuReq: number; mem: number; memReq: number; memLim: number }

export type Snapshot = {
  takenAt: string
  context: { label: string; k8s: string }
  counts: Record<string, number>
  podFields: string[]; workloadFields: string[]; eventFields: string[]
  namespaces: string[]
  nodes: (Omit<Node, 'conditions'> & { conditions: any[][] })[]
  pods: any[][]; workloads: any[][]; events: any[][]
  flux: (Omit<Flux, 'conditions'> & { conditions: any[][] })[]
  usage: Usage[]
}

const zip = <T,>(fields: string[], row: any[]): T => Object.fromEntries(fields.map((f, i) => [f, row[i] ?? null])) as T
const cond = (c: any[]): Condition => ({ type: c[0], status: c[1], reason: c[2] ?? '', message: c[3] ?? '', since: c[4] ?? null })

export const fromSnapshot = (s: Snapshot) => ({
  pods: s.pods.map((r) => zip<Pod>(s.podFields, r)),
  workloads: s.workloads.map((r) => zip<Workload>(s.workloadFields, r)),
  events: s.events.map((r) => zip<Event>(s.eventFields, r)),
  nodes: s.nodes.map((x) => ({ ...x, conditions: x.conditions.map(cond) })) as Node[],
  flux: s.flux.map((x) => ({ ...x, conditions: x.conditions.map(cond) })) as Flux[],
})

// ---- live normalizers (same projection as the snapshot) ----

const cpuMilli = (v: string | undefined) => {
  if (!v) return 0
  if (v.endsWith('n')) return Number(v.slice(0, -1)) / 1e6
  if (v.endsWith('u')) return Number(v.slice(0, -1)) / 1e3
  if (v.endsWith('m')) return Number(v.slice(0, -1))
  return Number(v) * 1000
}
const memMi = (v: string | undefined) => {
  if (!v) return 0
  const m = /^(\d+(?:\.\d+)?)([KMGT]i?)?$/.exec(v)
  if (!m) return 0
  const n = Number(m[1])
  const unit = m[2] ?? ''
  const f: Record<string, number> = { Ki: 1 / 1024, Mi: 1, Gi: 1024, Ti: 1024 * 1024, K: 1e3 / 1048576, M: 1e6 / 1048576, G: 1e9 / 1048576, '': 1 / 1048576 }
  return Math.round(n * (f[unit] ?? 0))
}
const liveConds = (o: any): Condition[] =>
  (o?.status?.conditions ?? []).map((c: any) => ({ type: c.type, status: c.status, reason: c.reason ?? '', message: String(c.message ?? '').slice(0, 260), since: c.lastTransitionTime ?? null }))

export const normPod = (o: any): Pod => {
  const cs: any[] = o?.status?.containerStatuses ?? []
  const top = cs.reduce((a, c) => (!a || (c.restartCount ?? 0) > (a.restartCount ?? 0) ? c : a), null as any)
  const term = top && top.restartCount > 0 ? top.lastState?.terminated : null
  return {
    ns: o.metadata?.namespace, n: o.metadata?.name, phase: o.status?.phase ?? 'Unknown',
    ready: cs.filter((c) => c.ready).length, total: o.spec?.containers?.length ?? cs.length,
    restarts: cs.reduce((s, c) => s + (c.restartCount ?? 0), 0),
    waiting: cs.find((c) => c.state?.waiting)?.state.waiting.reason ?? null,
    ownerKind: o.metadata?.ownerReferences?.[0]?.kind ?? null, owner: o.metadata?.ownerReferences?.[0]?.name ?? null,
    node: o.spec?.nodeName ?? null, start: o.status?.startTime ?? null,
    lastReason: term?.reason ?? null, lastExit: term?.exitCode ?? null, lastAt: term?.finishedAt ?? null,
  }
}
export const normWorkload = (kind: string) => (o: any): Workload => ({
  kind, ns: o.metadata?.namespace, n: o.metadata?.name,
  want: kind === 'DaemonSet' ? (o.status?.desiredNumberScheduled ?? 0) : (o.spec?.replicas ?? 1),
  ready: kind === 'DaemonSet' ? (o.status?.numberReady ?? 0) : (o.status?.readyReplicas ?? 0),
  ownerKind: o.metadata?.ownerReferences?.[0]?.kind ?? null,
})
export const normNode = (usage: Map<string, { cpu: number | null; mem: number | null }>) => (o: any): Node => {
  const conds = liveConds(o)
  const name = o.metadata?.name
  return {
    n: name, role: o.metadata?.labels?.['node-role.kubernetes.io/control-plane'] != null ? 'control-plane' : 'worker',
    ready: conds.some((c) => c.type === 'Ready' && c.status === 'True'), v: o.status?.nodeInfo?.kubeletVersion ?? '',
    cpuAlloc: Math.round(cpuMilli(o.status?.allocatable?.cpu)), memAlloc: memMi(o.status?.allocatable?.memory),
    cpu: usage.get(name)?.cpu ?? null, mem: usage.get(name)?.mem ?? null,
    created: o.metadata?.creationTimestamp ?? null, conditions: conds,
  }
}
// Core v1 Event. Only warnings are kept; null for anything else.
export const normEvent = (o: any): Event | null => {
  if (o?.type !== 'Warning') return null
  const io = o.involvedObject ?? o.regarding ?? {}
  const first = o.firstTimestamp ?? o.eventTime ?? o.metadata?.creationTimestamp ?? null
  const last = o.lastTimestamp ?? o.series?.lastObservedTime ?? o.eventTime ?? first
  if (!io.kind || !io.name || !last) return null
  return {
    ns: io.namespace ?? o.metadata?.namespace ?? '', kind: io.kind, obj: io.name, reason: o.reason ?? '',
    count: o.count ?? o.series?.count ?? 1, first: first ?? last, last,
    src: o.source?.component ?? o.reportingComponent ?? o.reportingController ?? '', msg: String(o.message ?? o.note ?? '').slice(0, 260),
  }
}

export const normFlux = (kind: string) => (o: any): Flux => ({
  kind, ns: o.metadata?.namespace, n: o.metadata?.name, suspend: Boolean(o.spec?.suspend),
  dependsOn: (o.spec?.dependsOn ?? []).map((d: any) => d.name), conditions: liveConds(o),
})

// ---- derived views ----

export const DAY = 86400000
const BAD_EXIT = new Set(['OOMKilled', 'Error', 'ContainerCannotRun', 'DeadlineExceeded', 'Unknown'])

export const workloadOf = (p: Pod) => {
  if (!p.ownerKind) return null
  if (p.ownerKind === 'ReplicaSet' && p.owner) return { kind: 'Deployment', n: p.owner.replace(/-[a-z0-9]{6,10}$/, '') }
  if (p.ownerKind === 'Node') return { kind: 'Static pod', n: p.n.replace(new RegExp(`-${p.node}$`), '') }
  return { kind: p.ownerKind, n: p.owner as string }
}

export const ready = (f: Flux) => f.conditions.find((c) => c.type === 'Ready')

export type PodHealth = { sev: Sev | null; code: string; detail: string }
export const podHealth = (p: Pod, now: number): PodHealth => {
  if (p.phase === 'Succeeded') return { sev: null, code: 'ok', detail: '' }
  if (p.phase !== 'Running') return { sev: 'crit', code: p.waiting ?? p.phase, detail: p.phase }
  if (p.waiting) return { sev: 'crit', code: p.waiting, detail: `${p.ready}/${p.total}` }
  if (p.ready < p.total) return { sev: 'crit', code: 'NotReady', detail: `${p.ready}/${p.total}` }
  const recent = p.lastAt ? now - Date.parse(p.lastAt) < 14 * DAY : false
  if (p.restarts >= 5 && recent && p.lastReason && BAD_EXIT.has(p.lastReason)) return { sev: 'warn', code: p.lastReason, detail: `${p.restarts}` }
  if (!p.ownerKind) return { sev: 'info', code: 'Unowned', detail: '' }
  return { sev: null, code: 'ok', detail: '' }
}

export type Issue = {
  key: string; sev: Sev; kind: string; ns: string; n: string
  code: string; since: string | null; detail: string; count?: number
}
export const keyOf = (kind: string, ns: string | null, n: string) => `${kind}:${ns ?? '-'}:${n}`

export const derive = (d: { pods: Pod[]; workloads: Workload[]; nodes: Node[]; flux: Flux[]; events: Event[] }, now: number) => {
  const issues: Issue[] = []
  const evByKey = new Map<string, Event[]>()
  for (const e of d.events) {
    const k = keyOf(e.kind, e.ns, e.obj)
    evByKey.set(k, [...(evByKey.get(k) ?? []), e])
  }
  const latestEvent = (k: string) => (evByKey.get(k) ?? []).slice().sort((a, b) => b.last.localeCompare(a.last))[0]

  for (const n of d.nodes) if (!n.ready) issues.push({ key: keyOf('Node', null, n.n), sev: 'crit', kind: 'Node', ns: '', n: n.n, code: 'NodeNotReady', since: n.conditions.find((c) => c.type === 'Ready')?.since ?? null, detail: '' })

  for (const w of d.workloads) {
    if (w.ready >= w.want) continue
    const k = keyOf(w.kind, w.ns, w.n)
    const ev = latestEvent(k)
    issues.push({ key: k, sev: w.ready === 0 ? 'crit' : 'warn', kind: w.kind, ns: w.ns, n: w.n, code: 'ReplicasShort', since: ev?.first ?? null, detail: ev ? ev.msg : `${w.ready}/${w.want}`, count: ev?.count })
  }
  for (const f of d.flux) {
    const r = ready(f)
    if (!r || r.status === 'True' || f.suspend) continue
    const blocked = r.reason === 'DependencyNotReady'
    issues.push({ key: keyOf(f.kind, f.ns, f.n), sev: blocked ? 'warn' : 'crit', kind: f.kind, ns: f.ns, n: f.n, code: r.reason || 'NotReady', since: r.since, detail: r.message, count: (evByKey.get(keyOf(f.kind, f.ns, f.n)) ?? []).reduce((s, e) => s + e.count, 0) || undefined })
  }
  for (const p of d.pods) {
    const h = podHealth(p, now)
    if (h.sev !== 'crit' && h.sev !== 'warn') continue
    issues.push({ key: keyOf('Pod', p.ns, p.n), sev: h.sev, kind: 'Pod', ns: p.ns, n: p.n, code: h.code, since: h.sev === 'warn' ? p.lastAt : p.start, detail: h.sev === 'warn' ? `${p.restarts}` : h.detail })
  }
  // Warning events on objects not already listed (a HelmChart, a Service...).
  const listed = new Set(issues.map((i) => i.key))
  for (const [k, evs] of evByKey) {
    if (listed.has(k)) continue
    const e = evs.slice().sort((a, b) => b.last.localeCompare(a.last))[0]
    if (now - Date.parse(e.last) > 2 * DAY) continue
    issues.push({ key: k, sev: 'warn', kind: e.kind, ns: e.ns, n: e.obj, code: e.reason, since: e.first, detail: e.msg, count: evs.reduce((s, x) => s + x.count, 0) })
  }
  const rank = { crit: 0, warn: 1, info: 2 }
  issues.sort((a, b) => rank[a.sev] - rank[b.sev] || (a.since ?? '').localeCompare(b.since ?? ''))

  // Events grouped by object.
  const groups = [...evByKey.entries()].map(([k, evs]) => {
    const sorted = evs.slice().sort((a, b) => b.last.localeCompare(a.last))
    return {
      key: k, kind: sorted[0].kind, ns: sorted[0].ns, obj: sorted[0].obj,
      reasons: [...new Set(sorted.map((e) => e.reason))], count: evs.reduce((s, e) => s + e.count, 0), records: evs.length,
      first: evs.reduce((m, e) => (e.first < m ? e.first : m), sorted[0].first), last: sorted[0].last, msg: sorted[0].msg,
    }
  }).sort((a, b) => b.last.localeCompare(a.last))

  // Namespaces.
  const ns = new Map<string, { ns: string; pods: number; ready: number; restarts: number; recent: number; warnings: number; workloads: number; crit: number; warn: number }>()
  const row = (name: string) => {
    if (!ns.has(name)) ns.set(name, { ns: name, pods: 0, ready: 0, restarts: 0, recent: 0, warnings: 0, workloads: 0, crit: 0, warn: 0 })
    return ns.get(name)!
  }
  for (const p of d.pods) {
    const r = row(p.ns)
    r.pods++
    if (p.phase === 'Succeeded' || (p.phase === 'Running' && p.ready === p.total && !p.waiting)) r.ready++
    r.restarts += p.restarts
    if (p.lastAt && now - Date.parse(p.lastAt) < 14 * DAY && p.lastReason && BAD_EXIT.has(p.lastReason)) r.recent += p.restarts
  }
  for (const w of d.workloads) row(w.ns).workloads++
  for (const g of groups) if (g.ns) row(g.ns).warnings++
  for (const i of issues) if (i.ns) row(i.ns)[i.sev === 'crit' ? 'crit' : 'warn']++

  return { issues, groups, evByKey, namespaces: [...ns.values()].sort((a, b) => b.crit - a.crit || b.warn - a.warn || b.pods - a.pods) }
}
