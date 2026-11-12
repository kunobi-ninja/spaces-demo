import * as React from 'react'
import { useSource } from 'kunobi'
import { hrRow, ksRow, sourceRow, workloadRow, type Cluster } from './cluster'

/*
 * Live cluster data, when the person's own Kunobi preview allows this page to watch a cluster.
 * The requests name no context, so Kunobi uses the one selected in the person's tab. Until every
 * list is ready, the page uses its snapshot.
 */

const FLUX = 'flux-system'
const REQUESTS = [
  { key: 'hr', kind: 'HelmRelease', apiVersion: 'helm.toolkit.fluxcd.io/v2', namespace: FLUX },
  { key: 'ks', kind: 'Kustomization', apiVersion: 'kustomize.toolkit.fluxcd.io/v1', namespace: FLUX },
  { key: 'oci', kind: 'OCIRepository', apiVersion: 'source.toolkit.fluxcd.io/v1beta2', namespace: FLUX },
  { key: 'chart', kind: 'HelmChart', apiVersion: 'source.toolkit.fluxcd.io/v1', namespace: FLUX },
  { key: 'git', kind: 'GitRepository', apiVersion: 'source.toolkit.fluxcd.io/v1', namespace: FLUX },
  { key: 'deploy', kind: 'Deployment', apiVersion: 'apps/v1' },
  { key: 'sts', kind: 'StatefulSet', apiVersion: 'apps/v1' },
] as const

type State = { status?: string; data?: unknown; reason?: string; action?: { label: string; run: () => void } } | undefined

function useK8s(kind: string, apiVersion: string, namespace?: string): State {
  return useSource({ type: 'k8s', params: { kind, apiVersion, ...(namespace ? { namespace } : {}) } }) as State
}

export function useCluster(snapshot: Cluster) {
  // A fixed list of hooks, called in the same order on every render.
  const states = REQUESTS.map((r) => useK8s(r.kind, r.apiVersion, 'namespace' in r ? r.namespace : undefined))
  const byKey = Object.fromEntries(REQUESTS.map((r, i) => [r.key, states[i]])) as Record<(typeof REQUESTS)[number]['key'], State>
  const ready = states.every((s) => s?.status === 'ready' && Array.isArray(s.data))
  const list = (s: State) => (Array.isArray(s?.data) ? (s!.data as any[]) : [])
  const stamp = states.map((s) => (Array.isArray(s?.data) ? (s!.data as any[]).length : -1)).join(',')

  const cluster = React.useMemo<Cluster>(() => {
    if (!ready) return snapshot
    const hrs = list(byKey.hr).map(hrRow)
    return {
      takenAt: new Date().toISOString(),
      label: null,
      k8s: null,
      hrTotal: hrs.length,
      helmreleases: hrs,
      sources: [...list(byKey.oci).map(sourceRow('OCIRepository')), ...list(byKey.chart).map(sourceRow('HelmChart')), ...list(byKey.git).map(sourceRow('GitRepository'))],
      kustomizations: list(byKey.ks).map(ksRow),
      workloads: [...list(byKey.deploy).map(workloadRow('Deployment')), ...list(byKey.sts).map(workloadRow('StatefulSet'))],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, snapshot, ...states.map((s) => s?.data), stamp])

  const action = states.find((s) => s?.action)?.action
  const blocked = states.find((s) => s?.status === 'blocked' || s?.status === 'error' || s?.status === 'unscoped')
  return {
    cluster,
    live: ready,
    loading: !ready && states.some((s) => !s || s.status === 'loading') && !blocked,
    allow: action ? () => action.run() : undefined,
    reason: ready ? undefined : blocked?.reason,
  }
}
