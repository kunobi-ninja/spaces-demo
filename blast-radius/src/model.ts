// Reads the index (snapshot or live) and answers "what depends on this object?".

export const HOW = ['volume', 'projected', 'subPath', 'envFrom', 'env', 'pullSecret', 'runsAs', 'selector', 'backend', 'tls', 'helmValues', 'substitute', 'binding'] as const
export type How = (typeof HOW)[number]
export type Effect = 'missing' | 'restart' | 'identity' | 'data' | 'route' | 'traffic' | 'helm' | 'flux' | 'files' | 'cert' | 'pull' | 'auto' | 'grant'
export const TARGET_KINDS = ['ConfigMap', 'Secret', 'Service', 'PersistentVolumeClaim', 'ServiceAccount'] as const
export const SHORT: Record<string, string> = {
  ConfigMap: 'CM', Secret: 'Secret', Service: 'Svc', PersistentVolumeClaim: 'PVC', ServiceAccount: 'SA',
  Deployment: 'Deploy', StatefulSet: 'STS', DaemonSet: 'DS', CronJob: 'Cron', Job: 'Job', Pod: 'Pod',
  Ingress: 'Ing', HelmRelease: 'HR', Kustomization: 'KS', RoleBinding: 'RB', ClusterRoleBinding: 'CRB',
}
const SEVERITY: Effect[] = ['restart', 'identity', 'data', 'route', 'traffic', 'helm', 'flux', 'files', 'cert', 'pull', 'auto', 'grant']

export interface Index {
  objects: Record<string, any>
  nodes: Record<string, any>
  refs: [string, string, How, string?][]
}

export function parseId(id: string) {
  const [kind, ns, ...rest] = id.split('/')
  return { kind, ns: ns || null, name: rest.join('/') }
}

/** Snapshot (compact, from data/cluster.json) to index. */
export function decodeSnapshot(s: any): Index {
  const ids: string[] = s.ids
  const objects: Record<string, any> = {}
  const nodes: Record<string, any> = {}
  for (const [i, v] of s.o) objects[ids[i]] = v
  for (const [i, v] of s.n) nodes[ids[i]] = v
  const refs = s.r.map((r: any[]) => [ids[r[0]], ids[r[1]], HOW[r[2]], r[3]] as [string, string, How, string?])
  return { objects, nodes, refs }
}

/** Live index from buildIndex(): drop the root CA config map Kubernetes puts in every pod, as the snapshot does. */
export function finalizeLive(I: Index): Index {
  const drop = new Set(Object.keys(I.objects).filter((k) => I.objects[k].auto))
  const objects: Record<string, any> = {}
  for (const [k, v] of Object.entries(I.objects)) if (!drop.has(k)) objects[k] = v
  return { objects, nodes: I.nodes, refs: I.refs.filter((r) => !drop.has(r[0])) }
}

export interface Referrer {
  id: string
  kind: string
  ns: string | null
  name: string
  hows: { how: How; d?: string; effect: Effect }[]
  effect: Effect
  node: any
}

export function effectOf(objKind: string, objName: string, how: How, node: any): Effect {
  if (how === 'env' || how === 'envFrom' || how === 'subPath') {
    if (node?.reload === 'auto' || (node?.reload === 'named' && (node.reloadNames || []).includes(objName))) return 'auto'
    return 'restart'
  }
  if (how === 'volume' || how === 'projected') return objKind === 'PersistentVolumeClaim' ? 'data' : 'files'
  return ({ pullSecret: 'pull', runsAs: 'identity', selector: 'traffic', backend: 'route', tls: 'cert', helmValues: 'helm', substitute: 'flux', binding: 'grant' } as Record<string, Effect>)[how]
}

export function referrersOf(I: Index, oid: string): Referrer[] {
  const { kind, name } = parseId(oid)
  const map = new Map<string, Referrer>()
  for (const [o, f, how, d] of I.refs) {
    if (o !== oid) continue
    const node = I.nodes[f] || null
    let r = map.get(f)
    if (!r) {
      const p = parseId(f)
      r = { id: f, kind: p.kind, ns: p.ns, name: p.name, hows: [], effect: 'grant', node }
      map.set(f, r)
    }
    r.hows.push({ how, d, effect: effectOf(kind, name, how, node) })
  }
  for (const r of map.values()) r.effect = SEVERITY.find((e) => r.hows.some((h) => h.effect === e)) ?? 'grant'
  const pods = (r: Referrer) => (r.node?.pods ? r.node.pods.length : -1)
  return [...map.values()].sort((a, b) => SEVERITY.indexOf(a.effect) - SEVERITY.indexOf(b.effect) || pods(b) - pods(a) || (a.name < b.name ? -1 : 1))
}

export interface Summary {
  pods: number
  podsReady: number
  workloads: number
  restart: Referrer[]
  auto: Referrer[]
  files: Referrer[]
  single: Referrer[]
  envKeys: string[]
  byEffect: Record<string, Referrer[]>
  others: number
}

export function summarize(refs: Referrer[]): Summary {
  const byEffect: Record<string, Referrer[]> = {}
  for (const r of refs) for (const e of new Set(r.hows.map((h) => h.effect))) (byEffect[e] = byEffect[e] || []).push(r)
  const wl = refs.filter((r) => r.node?.pods)
  const pods = wl.reduce((a, r) => a + r.node.pods.length, 0)
  const podsReady = wl.reduce((a, r) => a + r.node.pods.filter((p: any[]) => p[2]).length, 0)
  const restart = byEffect.restart || []
  const envKeys = [...new Set(refs.flatMap((r) => r.hows.filter((h) => h.how === 'env' && h.d).map((h) => h.d as string)))].sort()
  const single = [...restart, ...(byEffect.auto || [])].filter((r) => r.node && !r.node.bare && r.kind !== 'DaemonSet' && r.kind !== 'CronJob' && (r.node.want ?? 0) <= 1)
  return { pods, podsReady, workloads: wl.length, restart, auto: byEffect.auto || [], files: byEffect.files || [], single, envKeys, byEffect, others: refs.length - wl.length }
}

/** Pods touched per object, for the search list. */
export function podCounts(I: Index): Record<string, number> {
  const seen: Record<string, Set<string>> = {}
  for (const [o, f] of I.refs) if (I.nodes[f]?.pods) (seen[o] = seen[o] || new Set()).add(f)
  const out: Record<string, number> = {}
  for (const [o, s] of Object.entries(seen)) out[o] = [...s].reduce((a, f) => a + I.nodes[f].pods.length, 0)
  return out
}

export function refCounts(I: Index): Record<string, number> {
  const seen: Record<string, Set<string>> = {}
  for (const [o, f] of I.refs) (seen[o] = seen[o] || new Set()).add(f)
  const out: Record<string, number> = {}
  for (const [o, s] of Object.entries(seen)) out[o] = s.size
  return out
}

export const rowKey = (oid: string, item: string) => `${oid}~${item}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180)

export function restartCmd(r: Referrer) {
  const res = r.kind === 'Deployment' ? 'deployment' : r.kind === 'StatefulSet' ? 'statefulset' : r.kind === 'DaemonSet' ? 'daemonset' : null
  if (res) return `kubectl -n ${r.ns} rollout restart ${res}/${r.name}`
  if (r.kind === 'Pod') return `kubectl -n ${r.ns} delete pod ${r.name}`
  return null
}
