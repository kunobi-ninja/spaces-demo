import { useSource } from 'kunobi'

/*
 * Cluster data for the handover. In the person's own Space preview the page can watch the cluster
 * selected in their tab once they allow it: the requests name no context. Everywhere else (shared
 * Spaces, web links, renders) it reads the sample in data/cluster.json. Both paths go through the
 * same normalizers, so the page draws live objects and sample rows the same way.
 */

export interface EventRow { ns: string; kind: string; obj: string; reason: string; count: number; first: string; last: string; src: string; msg: string }
export interface ChangeRow { ns: string; kind: string; obj: string; reason: string; last: string }
export interface PodRow { ns: string; n: string; r: number; last: string | null; why: (string | null)[] }
export interface KsRow { n: string; s: string; reason: string; t: string; m: string; d: string[] }
export interface HrRow { n: string; tns: string; s: string; reason: string; t: string; m: string }
export interface RepoRow { n: string; url: string; s: string; reason: string; t: string }
export interface StsRow { ns: string; n: string; want: number; ready: number }
export interface Totals { nodes: number; nodesReady: number; pods: number; running: number; succeeded: number; notReady: number; nodeShells: number; kustomizations: number; helmreleases: number; helmrepositories: number; statefulsets: number }
export interface Snapshot {
  takenAt: string
  windowHours: number
  cluster: { name: string; k8s: string }
  totals: Totals
  events: EventRow[]
  changes: ChangeRow[]
  pods: PodRow[]
  flux: { kustomizations: KsRow[]; helmreleases: HrRow[]; helmrepositories: RepoRow[] }
  statefulsets: StsRow[]
}

type Obj = any

const ready = (o: Obj) => (o?.status?.conditions ?? []).find((c: Obj) => c.type === 'Ready') ?? {}
const cut = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : '')

export const normEvent = (o: Obj): EventRow => ({
  ns: o.involvedObject?.namespace ?? o.metadata?.namespace ?? '',
  kind: o.involvedObject?.kind ?? '',
  obj: o.involvedObject?.name ?? '',
  reason: o.reason ?? '',
  count: o.count ?? o.series?.count ?? 1,
  first: o.firstTimestamp ?? o.eventTime ?? o.metadata?.creationTimestamp ?? '',
  last: o.lastTimestamp ?? o.series?.lastObservedTime ?? o.eventTime ?? o.firstTimestamp ?? '',
  src: o.source?.component ?? o.reportingComponent ?? '',
  msg: cut(o.message, 240),
})
export const normPod = (o: Obj): PodRow => {
  const cs: Obj[] = o.status?.containerStatuses ?? []
  const finished = cs.map((c) => c.lastState?.terminated?.finishedAt).filter(Boolean).sort()
  return {
    ns: o.metadata?.namespace ?? '',
    n: o.metadata?.name ?? '',
    r: cs.reduce((a, c) => a + (c.restartCount ?? 0), 0),
    last: finished.length ? finished[finished.length - 1] : null,
    why: [...new Set(cs.map((c) => c.lastState?.terminated?.reason ?? null))],
  }
}
export const normKs = (o: Obj): KsRow => {
  const r = ready(o)
  return { n: o.metadata?.name ?? '', s: r.status ?? 'Unknown', reason: r.reason ?? '', t: r.lastTransitionTime ?? '', m: cut(r.message, 200), d: (o.spec?.dependsOn ?? []).map((d: Obj) => d.name) }
}
export const normHr = (o: Obj): HrRow => {
  const r = ready(o)
  return { n: o.metadata?.name ?? '', tns: o.spec?.targetNamespace ?? o.metadata?.namespace ?? '', s: r.status ?? 'Unknown', reason: r.reason ?? '', t: r.lastTransitionTime ?? '', m: cut(r.message, 200) }
}
export const normRepo = (o: Obj): RepoRow => {
  const r = ready(o)
  return { n: o.metadata?.name ?? '', url: o.spec?.url ?? '', s: r.status ?? 'Unknown', reason: r.reason ?? '', t: r.lastTransitionTime ?? '' }
}
export const normSts = (o: Obj): StsRow => ({ ns: o.metadata?.namespace ?? '', n: o.metadata?.name ?? '', want: o.spec?.replicas ?? 1, ready: o.status?.readyReplicas ?? 0 })

interface Src { status: string; data?: Obj[]; reason?: string; action?: { label: string; run: () => void } }

function useK8s(kind: string, apiVersion: string): Src {
  // No context: Kunobi uses the one selected in the person's tab.
  const s = useSource({ type: 'k8s', params: { kind, apiVersion } }) as Src | undefined
  return s ?? { status: 'loading' }
}

export interface ClusterView {
  live: boolean
  status: string
  reason?: string
  allow?: () => void
  at: string
  totals: Totals
  events: EventRow[]
  changes: ChangeRow[]
  pods: PodRow[]
  ks: KsRow[]
  hr: HrRow[]
  repos: RepoRow[]
  sts: StsRow[]
}

/** Live lists when the person allowed this page in their own Space, the sample otherwise. */
export function useCluster(snap: Snapshot): ClusterView {
  const ev = useK8s('Event', 'v1')
  const pods = useK8s('Pod', 'v1')
  const ks = useK8s('Kustomization', 'kustomize.toolkit.fluxcd.io/v1')
  const hr = useK8s('HelmRelease', 'helm.toolkit.fluxcd.io/v2')
  const repos = useK8s('HelmRepository', 'source.toolkit.fluxcd.io/v1')
  const sts = useK8s('StatefulSet', 'apps/v1')
  const nodes = useK8s('Node', 'v1')
  const all = [ev, pods, ks, hr, repos, sts, nodes]
  const live = all.every((s) => s.status === 'ready' && Array.isArray(s.data))
  const action = all.find((s) => s.action)?.action
  const status = live ? 'ready' : (all.find((s) => s.status !== 'ready')?.status ?? 'loading')
  const reason = all.find((s) => s.reason)?.reason

  if (!live) {
    return {
      live: false, status, reason, allow: action ? () => action.run() : undefined, at: snap.takenAt, totals: snap.totals,
      events: snap.events, changes: snap.changes, pods: snap.pods,
      ks: snap.flux.kustomizations, hr: snap.flux.helmreleases, repos: snap.flux.helmrepositories, sts: snap.statefulsets,
    }
  }
  const evs = ev.data!
  const podRows = pods.data!.map(normPod)
  const ksAll = ks.data!.map(normKs)
  const hrAll = hr.data!.map(normHr)
  const repoAll = repos.data!.map(normRepo)
  const stsAll = sts.data!.map(normSts)
  const phases = pods.data!.map((p: Obj) => p.status?.phase)
  const notReady = pods.data!.filter((p: Obj) => p.status?.phase === 'Running' && (p.status?.containerStatuses ?? []).some((c: Obj) => !c.ready)).length
  return {
    live: true, status, at: new Date().toISOString(),
    totals: {
      nodes: nodes.data!.length,
      nodesReady: nodes.data!.filter((n: Obj) => ready(n).status === 'True').length,
      pods: podRows.length,
      running: phases.filter((p: string) => p === 'Running').length,
      succeeded: phases.filter((p: string) => p === 'Succeeded').length,
      notReady,
      nodeShells: podRows.filter((p) => p.ns === 'kube-system' && p.n.startsWith('node-shell')).length,
      kustomizations: ksAll.length, helmreleases: hrAll.length, helmrepositories: repoAll.length, statefulsets: stsAll.length,
    },
    events: evs.filter((o: Obj) => o.type === 'Warning').map(normEvent),
    changes: evs.filter((o: Obj) => o.type === 'Normal' && ['NewArtifact', 'UpgradeSucceeded', 'InstallSucceeded'].includes(o.reason)).map((o: Obj) => {
      const e = normEvent(o)
      return { ns: e.ns, kind: e.kind, obj: e.obj, reason: e.reason, last: e.last }
    }),
    pods: podRows.filter((p) => p.r > 0),
    ks: ksAll.filter((k) => k.s !== 'True'),
    hr: hrAll.filter((h) => h.s !== 'True'),
    repos: repoAll.filter((r) => r.s !== 'True'),
    sts: stsAll.filter((s) => s.ready < s.want),
  }
}

/** Warning events grouped per object and reason, with what happened inside the window. */
export interface EventGroup {
  key: string; ns: string; kind: string; obj: string; reason: string; src: string; msg: string
  first: string; last: string; total: number
  /** Exact times inside the window, for events Kubernetes kept one by one. */
  times: number[]
  /** Started before the window: count inside it is estimated from the total and first-seen time. */
  recurring: boolean
  inWindow: number
}

export function groupEvents(events: EventRow[], start: number, end: number): EventGroup[] {
  const map = new Map<string, EventGroup>()
  for (const e of events) {
    const last = Date.parse(e.last)
    if (!(last >= start)) continue
    const key = `${e.ns}/${e.kind}/${e.obj}/${e.reason}`
    const g = map.get(key) ?? { key, ns: e.ns, kind: e.kind, obj: e.obj, reason: e.reason, src: e.src, msg: e.msg, first: e.first, last: e.last, total: 0, times: [], recurring: false, inWindow: 0 }
    g.total += e.count
    if (e.first < g.first) g.first = e.first
    if (e.last >= g.last) { g.last = e.last; g.msg = e.msg }
    const first = Date.parse(e.first)
    if (first < start && e.count > 1) {
      g.recurring = true
      const rate = e.count / Math.max(1, last - first)
      g.inWindow += Math.round(rate * (Math.min(end, last) - start))
    } else {
      g.times.push(last)
      g.inWindow += e.count
    }
    map.set(key, g)
  }
  return [...map.values()].sort((a, b) => Number(a.recurring) - Number(b.recurring) || b.last.localeCompare(a.last))
}
