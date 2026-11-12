// Projects full Kubernetes objects (live mode) into the same rows the snapshot's
// kctl queries returned, so buildIndex() runs one code path for both.
// Secrets are never requested; only reference names are read here.

const meta = (o) => ({ ns: o.metadata?.namespace ?? null, n: o.metadata?.name })
const mb = (o) => ({ hr: o.metadata?.annotations?.['meta.helm.sh/release-name'] ?? null, kz: o.metadata?.labels?.['kustomize.toolkit.fluxcd.io/name'] ?? null })
const own = (o) => o.metadata?.ownerReferences?.[0] ?? {}
const ctrs = (spec) => [...(spec?.containers ?? []), ...(spec?.initContainers ?? [])]

function workload(o, want, ready, st) {
  const ann = o.metadata?.annotations ?? {}
  const tpl = o.spec?.template?.metadata?.annotations ?? {}
  return {
    ...meta(o), want, ready, st, sa: o.spec?.template?.spec?.serviceAccountName ?? null,
    ra: Object.entries(ann).filter(([k]) => /reloader/.test(k)).map(([k, v]) => `${k}=${v}`),
    ck: Object.keys(tpl).filter((k) => /checksum|restartedAt/.test(k)),
    ...mb(o),
  }
}

export function projectLive(L) {
  const pods = L.Pod ?? []
  const R = {
    podsA: pods.map((p) => ({ ...meta(p), ph: p.status?.phase, sa: p.spec?.serviceAccountName, ok: own(p).kind, on: own(p).name, lb: p.metadata?.labels ?? {} })),
    podsB: pods.map((p) => ({ ...meta(p), v: (p.spec?.volumes ?? []).map((v) => ({ vn: v.name, cm: v.configMap?.name ?? null, s: v.secret?.secretName ?? null, p: v.persistentVolumeClaim?.claimName ?? null })) })),
    podsP: pods.map((p) => ({
      ...meta(p),
      v: (p.spec?.volumes ?? []).filter((v) => v.projected).map((v) => ({
        vn: v.name,
        cm: (v.projected.sources ?? []).map((s) => s.configMap?.name).filter(Boolean),
        s: (v.projected.sources ?? []).map((s) => s.secret?.name).filter(Boolean),
      })),
    })),
    podsC: pods.map((p) => ({
      ...meta(p),
      sp: (p.spec?.containers ?? []).flatMap((c) => (c.volumeMounts ?? []).filter((m) => m.subPath).map((m) => m.name)),
      rd: (p.status?.containerStatuses ?? []).map((c) => c.ready),
      rs: (p.status?.containerStatuses ?? []).reduce((a, c) => a + (c.restartCount ?? 0), 0),
    })),
    podsD: pods.map((p) => ({ ...meta(p), ef: ctrs(p.spec).flatMap((c) => (c.envFrom ?? []).map((e) => ({ cm: e.configMapRef?.name ?? null, s: e.secretRef?.name ?? null }))) })),
    podsE: pods.map((p) => ({
      ...meta(p),
      ev: ctrs(p.spec).flatMap((c) => (c.env ?? []).filter((e) => e.valueFrom).map((e) => ({
        cm: e.valueFrom.configMapKeyRef?.name ?? null,
        s: e.valueFrom.secretKeyRef?.name ?? null,
        k: e.valueFrom.configMapKeyRef?.key ?? e.valueFrom.secretKeyRef?.key ?? null,
      }))),
      ips: (p.spec?.imagePullSecrets ?? []).map((s) => s.name),
    })),
    deploy: (L.Deployment ?? []).map((o) => workload(o, o.spec?.replicas, o.status?.readyReplicas, o.spec?.strategy?.type)),
    sts: (L.StatefulSet ?? []).map((o) => workload(o, o.spec?.replicas, o.status?.readyReplicas, o.spec?.updateStrategy?.type)),
    ds: (L.DaemonSet ?? []).map((o) => workload(o, o.status?.desiredNumberScheduled, o.status?.numberReady, o.spec?.updateStrategy?.type)),
    rs: (L.ReplicaSet ?? []).filter((o) => (o.spec?.replicas ?? 0) > 0).map((o) => ({ ...meta(o), o: own(o).name, ok: own(o).kind })),
    jobs: (L.Job ?? []).map((o) => ({ ...meta(o), o: own(o).name, ok: own(o).kind })),
    cronA: (L.CronJob ?? []).map((o) => {
      const t = o.spec?.jobTemplate?.spec?.template?.spec ?? {}
      return { ...meta(o), sch: o.spec?.schedule, sus: o.spec?.suspend, t: { sa: t.serviceAccountName, v: (t.volumes ?? []).map((v) => ({ vn: v.name, cm: v.configMap?.name ?? null, s: v.secret?.secretName ?? null, p: v.persistentVolumeClaim?.claimName ?? null })) } }
    }),
    cronB: (L.CronJob ?? []).map((o) => {
      const cs = o.spec?.jobTemplate?.spec?.template?.spec?.containers ?? []
      return {
        ...meta(o),
        ef: cs.flatMap((c) => (c.envFrom ?? []).map((e) => ({ cm: e.configMapRef?.name ?? null, s: e.secretRef?.name ?? null }))),
        ev: cs.flatMap((c) => (c.env ?? []).filter((e) => e.valueFrom).map((e) => ({ cm: e.valueFrom.configMapKeyRef?.name ?? null, s: e.valueFrom.secretKeyRef?.name ?? null }))),
      }
    }),
    svc: (L.Service ?? []).map((o) => ({ ...meta(o), t: o.spec?.type, sel: o.spec?.selector ?? null, ports: (o.spec?.ports ?? []).map((p) => `${p.port}/${p.protocol}`), ...mb(o) })),
    ing: (L.Ingress ?? []).map((o) => ({
      ...meta(o), cls: o.spec?.ingressClassName ?? null,
      hosts: (o.spec?.rules ?? []).map((r) => r.host),
      be: (o.spec?.rules ?? []).flatMap((r) => (r.http?.paths ?? []).map((p) => p.backend?.service?.name)).filter(Boolean),
      tls: (o.spec?.tls ?? []).map((t) => t.secretName),
      def: o.spec?.defaultBackend?.service?.name ?? null,
    })),
    pvc: (L.PersistentVolumeClaim ?? []).map((o) => ({ ...meta(o), ph: o.status?.phase, sc: o.spec?.storageClassName, cap: o.status?.capacity?.storage, am: o.spec?.accessModes ?? [], ...mb(o) })),
    sa: (L.ServiceAccount ?? []).map((o) => ({ ...meta(o), sec: (o.secrets ?? []).map((s) => s.name), ips: (o.imagePullSecrets ?? []).map((s) => s.name), ...mb(o) })),
    rb: (L.RoleBinding ?? []).map((o) => ({ ...meta(o), rk: o.roleRef?.kind, r: o.roleRef?.name, sa: (o.subjects ?? []).filter((s) => s.kind === 'ServiceAccount').map((s) => `${s.namespace ?? 'null'}/${s.name}`) })).filter((b) => b.sa.length),
    crb: (L.ClusterRoleBinding ?? []).map((o) => ({ n: o.metadata?.name, r: o.roleRef?.name, sa: (o.subjects ?? []).filter((s) => s.kind === 'ServiceAccount').map((s) => `${s.namespace ?? 'null'}/${s.name}`) })).filter((b) => b.sa.length),
    cm: (L.ConfigMap ?? []).map((o) => ({ ...meta(o), k: Object.keys(o.data ?? {}).length, bk: Object.keys(o.binaryData ?? {}).length, imm: o.immutable ?? null, ...mb(o) })),
    hrel: (L.HelmRelease ?? []).map((o) => ({ ...meta(o), tns: o.spec?.targetNamespace ?? null, vf: (o.spec?.valuesFrom ?? []).map((v) => ({ k: v.kind, n: v.name })) })),
    ks: (L.Kustomization ?? []).map((o) => ({ ...meta(o), sf: (o.spec?.postBuild?.substituteFrom ?? []).map((v) => ({ k: v.kind, n: v.name })) })),
    es: (L.ExternalSecret ?? []).map((o) => ({ ...meta(o), tgt: o.spec?.target?.name ?? o.metadata?.name, store: o.spec?.secretStoreRef?.name, sk: o.spec?.secretStoreRef?.kind })),
  }
  return R
}
