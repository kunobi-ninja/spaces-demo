import { useSource } from 'kunobi'

/*
 * Cluster data for the incident page. In the person's own Kunobi preview, after they allow it,
 * each list comes live from the cluster selected in their tab (no context is named here, so
 * Kunobi uses that one). Everywhere else (render, a shared Space, a web link) the sources answer
 * `blocked` and the page shows the sample in data/cluster.json. Live objects are full Kubernetes
 * objects; the normalizers below turn them into the rows the sample holds, so the page has one
 * code path for both.
 */

export interface Cond { status: string; reason: string; message: string; t: string }
export interface Ks { ns: string; n: string; path: string; dependsOn: string[]; rev: string; ready: Cond | null }
export interface Hr {
  ns: string; n: string; target: string; chart: string; ks: string | null; timeout: string | null
  ready: Cond | null; stalled: Cond | null; history: { v: string; s: string; at: string }[]
}
export interface Oci { ns: string; n: string; url: string; semver: string; artifact: string; ready: Cond | null }
export interface Git { ns: string; n: string; branch: string; artifact: string; ready: Cond | null }
export interface Deploy { ns: string; n: string; want: number; ready: number; image: string; hr: string | null; ks: string | null }
export interface Sts { ns: string; n: string; want: number; ready: number; owner: string }
export interface Pgc { ns: string; n: string; pg: number; want: number; ready: number; ks: string | null }
export interface Pod { ns: string; n: string; phase: string; ready: boolean[]; restarts: number; owner: string; start: string }
export interface Ev { ns: string; kind: string; obj: string; type: string; reason: string; count: number; first: string; last: string; src: string; msg: string }

export interface Snapshot {
  takenAt: string
  cluster: { label: string; k8s: string }
  /** Which objects the incident is about: the app's prefix and namespace, Flux's namespace, the failing release. */
  scope: { app: string; namespace: string; fluxNamespace: string; release: string }
  kustomizations: Ks[]; helmreleases: Hr[]; ocirepositories: Oci[]; gitrepositories: Git[]
  deployments: Deploy[]; statefulsets: Sts[]; postgresclusters: Pgc[]; pods: Pod[]; events: Ev[]
}

type Obj = any

const cond = (o: Obj, type: string): Cond | null => {
  const c = (o?.status?.conditions ?? []).find((x: Obj) => x?.type === type)
  return c ? { status: String(c.status ?? ''), reason: String(c.reason ?? ''), message: String(c.message ?? '').slice(0, 240), t: String(c.lastTransitionTime ?? '') } : null
}
const meta = (o: Obj) => ({ ns: String(o?.metadata?.namespace ?? ''), n: String(o?.metadata?.name ?? '') })
const label = (o: Obj, key: string): string | null => o?.metadata?.labels?.[key] ?? null
const shortDigest = (rev: string) => rev.replace(/(sha256:[0-9a-f]{12})[0-9a-f]+/, '$1')
const imageTag = (image: string) => image.split('/').pop() ?? image

export const norm = {
  ks: (o: Obj): Ks => ({
    ...meta(o),
    path: String(o?.spec?.path ?? ''),
    dependsOn: (o?.spec?.dependsOn ?? []).map((d: Obj) => String(d?.name ?? '')),
    rev: String(o?.status?.lastAppliedRevision ?? ''),
    ready: cond(o, 'Ready'),
  }),
  hr: (o: Obj): Hr => {
    const ref = o?.spec?.chartRef
    return {
      ...meta(o),
      target: String(o?.spec?.targetNamespace ?? o?.metadata?.namespace ?? ''),
      chart: ref ? `${ref.kind}/${ref.name}` : String(o?.spec?.chart?.spec?.chart ?? ''),
      ks: label(o, 'kustomize.toolkit.fluxcd.io/name'),
      timeout: o?.spec?.timeout ?? null,
      ready: cond(o, 'Ready'),
      stalled: cond(o, 'Stalled'),
      history: (o?.status?.history ?? []).map((h: Obj) => ({
        v: String(h?.appVersion ?? String(h?.chartVersion ?? '').split('+')[0]),
        s: String(h?.status ?? ''),
        at: String(h?.lastDeployed ?? ''),
      })),
    }
  },
  oci: (o: Obj): Oci => ({
    ...meta(o),
    url: String(o?.spec?.url ?? ''),
    semver: String(o?.spec?.ref?.semver ?? o?.spec?.ref?.tag ?? ''),
    artifact: shortDigest(String(o?.status?.artifact?.revision ?? '')),
    ready: cond(o, 'Ready'),
  }),
  git: (o: Obj): Git => ({
    ...meta(o),
    branch: String(o?.spec?.ref?.branch ?? ''),
    artifact: String(o?.status?.artifact?.revision ?? ''),
    ready: cond(o, 'Ready'),
  }),
  deploy: (o: Obj): Deploy => ({
    ...meta(o),
    want: Number(o?.spec?.replicas ?? 1),
    ready: Number(o?.status?.readyReplicas ?? 0),
    image: imageTag(String(o?.spec?.template?.spec?.containers?.[0]?.image ?? '')),
    hr: label(o, 'helm.toolkit.fluxcd.io/name'),
    ks: label(o, 'kustomize.toolkit.fluxcd.io/name'),
  }),
  sts: (o: Obj): Sts => ({
    ...meta(o),
    want: Number(o?.spec?.replicas ?? 1),
    ready: Number(o?.status?.readyReplicas ?? 0),
    owner: String(o?.metadata?.ownerReferences?.[0]?.name ?? label(o, 'postgres-operator.crunchydata.com/cluster') ?? ''),
  }),
  pgc: (o: Obj): Pgc => {
    const inst: Obj[] = o?.status?.instances ?? []
    return {
      ...meta(o),
      pg: Number(o?.spec?.postgresVersion ?? 0),
      want: inst.reduce((n, i) => n + Number(i?.replicas ?? 0), 0),
      ready: inst.reduce((n, i) => n + Number(i?.readyReplicas ?? 0), 0),
      ks: label(o, 'kustomize.toolkit.fluxcd.io/name'),
    }
  },
  pod: (o: Obj): Pod => {
    const ref = o?.metadata?.ownerReferences?.[0]
    const cs: Obj[] = o?.status?.containerStatuses ?? []
    return {
      ...meta(o),
      phase: String(o?.status?.phase ?? ''),
      ready: cs.map((c) => !!c?.ready),
      restarts: cs.reduce((n, c) => n + Number(c?.restartCount ?? 0), 0),
      // A Deployment's pods belong to a ReplicaSet named `<deployment>-<hash>`.
      owner: ref?.kind === 'ReplicaSet' ? String(ref.name).replace(/-[a-z0-9]+$/, '') : String(ref?.name ?? ''),
      start: String(o?.status?.startTime ?? ''),
    }
  },
  ev: (o: Obj): Ev => ({
    ns: String(o?.involvedObject?.namespace ?? o?.metadata?.namespace ?? ''),
    kind: String(o?.involvedObject?.kind ?? ''),
    obj: String(o?.involvedObject?.name ?? ''),
    type: String(o?.type ?? ''),
    reason: String(o?.reason ?? ''),
    count: Number(o?.count ?? o?.series?.count ?? 1),
    first: String(o?.firstTimestamp ?? o?.eventTime ?? ''),
    last: String(o?.lastTimestamp ?? o?.series?.lastObservedTime ?? o?.eventTime ?? o?.firstTimestamp ?? ''),
    src: String(o?.source?.component ?? o?.reportingComponent ?? ''),
    msg: String(o?.message ?? '').slice(0, 240),
  }),
}

export interface K8sList<T> {
  items: T[]
  live: boolean
  status: string
  reason?: string
  allow?: () => void
}

/** One cluster list: live from the selected cluster when the person's own preview allowed it, the sample rows otherwise. */
export function useK8s<T>(kind: string, apiVersion: string, namespace: string, fallback: T[], normalize: (o: Obj) => T): K8sList<T> {
  const s = useSource({ type: 'k8s', params: { kind, apiVersion, namespace } }) as Obj
  const live = s?.status === 'ready' && Array.isArray(s?.data)
  return {
    items: live ? (s.data as Obj[]).map(normalize) : fallback,
    live,
    status: s?.status ?? 'loading',
    reason: s?.reason,
    allow: s?.action?.run ? () => s.action.run() : undefined,
  }
}

/** Every list the page reads, live or from the snapshot. */
export function useCluster(snap: Snapshot) {
  const { namespace: ns, fluxNamespace: flux, app, release } = snap.scope
  const lists = {
    kustomizations: useK8s('Kustomization', 'kustomize.toolkit.fluxcd.io/v1', flux, snap.kustomizations, norm.ks),
    helmreleases: useK8s('HelmRelease', 'helm.toolkit.fluxcd.io/v2', flux, snap.helmreleases, norm.hr),
    ocirepositories: useK8s('OCIRepository', 'source.toolkit.fluxcd.io/v1beta2', flux, snap.ocirepositories, norm.oci),
    gitrepositories: useK8s('GitRepository', 'source.toolkit.fluxcd.io/v1', flux, snap.gitrepositories, norm.git),
    deployments: useK8s('Deployment', 'apps/v1', ns, snap.deployments, norm.deploy),
    statefulsets: useK8s('StatefulSet', 'apps/v1', ns, snap.statefulsets, norm.sts),
    postgresclusters: useK8s('PostgresCluster', 'postgres-operator.crunchydata.com/v1beta1', ns, snap.postgresclusters, norm.pgc),
    pods: useK8s('Pod', 'v1', ns, snap.pods, norm.pod),
    fluxEvents: useK8s('Event', 'v1', flux, snap.events.filter((e) => e.ns === flux), norm.ev),
    appEvents: useK8s('Event', 'v1', ns, snap.events.filter((e) => e.ns === ns), norm.ev),
  }
  const all = Object.values(lists) as K8sList<unknown>[]
  const allLive = all.every((l) => l.live)
  const anyLive = all.some((l) => l.live)
  // A selected cluster without these objects has no incident to show: keep the sample then.
  const missing = anyLive && !lists.kustomizations.items.some((k) => k.n.startsWith(app)) && !lists.helmreleases.items.some((h) => h.n === release)
  if (missing) {
    lists.kustomizations = { ...lists.kustomizations, items: snap.kustomizations, live: false }
    lists.helmreleases = { ...lists.helmreleases, items: snap.helmreleases, live: false }
    lists.ocirepositories = { ...lists.ocirepositories, items: snap.ocirepositories, live: false }
    lists.gitrepositories = { ...lists.gitrepositories, items: snap.gitrepositories, live: false }
    lists.deployments = { ...lists.deployments, items: snap.deployments, live: false }
    lists.statefulsets = { ...lists.statefulsets, items: snap.statefulsets, live: false }
    lists.postgresclusters = { ...lists.postgresclusters, items: snap.postgresclusters, live: false }
    lists.pods = { ...lists.pods, items: snap.pods, live: false }
    lists.fluxEvents = { ...lists.fluxEvents, items: snap.events.filter((e) => e.ns === flux), live: false }
    lists.appEvents = { ...lists.appEvents, items: snap.events.filter((e) => e.ns === ns), live: false }
  }
  const allows = all.map((l) => l.allow).filter(Boolean) as (() => void)[]
  return {
    ...lists,
    live: allLive && !missing,
    partial: anyLive && !allLive && !missing,
    missing,
    loading: all.some((l) => l.status === 'loading'),
    allow: allows.length ? () => allows.forEach((run) => run()) : undefined,
  }
}
export type Cluster = ReturnType<typeof useCluster>
