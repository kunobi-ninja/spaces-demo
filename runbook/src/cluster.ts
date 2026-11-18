/*
 * Cluster data for the runbook, in one projected shape. The snapshot in data/cluster.json is
 * already in this shape; live objects from useSource are passed through the same normalizers,
 * so the checks never know where their data came from.
 */

export interface Cond { s: string; r: string | null; m: string | null; t: string | null }
export interface Ref { kind: string; name: string; namespace?: string | null }
export interface HistoryRow { v: number; s: string; chart: string | null; last: string | null }
export interface HR {
  ns: string
  n: string
  suspend: boolean | null
  src: Ref | null
  tns: string
  rel: string | null
  storageNs: string
  timeout: string | null
  helmChart: string | null
  ready: Cond | null
  stalled: Cond | null
  failures: number
  upgradeFailures: number
  installFailures: number
  lastAction: string | null
  lastRev: string | null
  history: HistoryRow[]
}
export interface Source { kind: string; ns: string; n: string; ready: Cond | null; rev: string | null; chart: string | null; srcRef: Ref | null }
export interface KS { ns: string; n: string; dependsOn: string[]; hc: string[]; hrs: string[]; src: Ref | null; ready: Cond | null; applied: string | null }
export interface Workload { kind: string; ns: string; n: string; want: number; ready: number; chart: string | null }
export interface Cluster {
  takenAt: string
  /** A neutral label; the snapshot never names a real cluster. Live data has no label. */
  label: string | null
  k8s: string | null
  hrTotal: number
  helmreleases: HR[]
  sources: Source[]
  kustomizations: KS[]
  workloads: Workload[]
}

type Obj = Record<string, any>

export function cond(o: Obj, type: string): Cond | null {
  const c = (o?.status?.conditions ?? []).find((x: Obj) => x.type === type)
  if (!c) return null
  return { s: c.status, r: c.reason ?? null, m: typeof c.message === 'string' ? c.message.slice(0, 240) : null, t: c.lastTransitionTime ?? null }
}

export function hrRow(o: Obj): HR {
  const ns = o.metadata?.namespace ?? 'flux-system'
  const spec = o.spec ?? {}
  const st = o.status ?? {}
  const src: Ref | null = spec.chartRef
    ? { kind: spec.chartRef.kind, name: spec.chartRef.name, namespace: spec.chartRef.namespace ?? ns }
    : spec.chart?.spec?.sourceRef
      ? { kind: 'HelmChart', name: st.helmChart ? String(st.helmChart).split('/').pop()! : `${ns}-${o.metadata?.name}`, namespace: ns }
      : null
  return {
    ns,
    n: o.metadata?.name,
    suspend: spec.suspend ?? null,
    src,
    tns: spec.targetNamespace ?? ns,
    rel: spec.releaseName ?? null,
    storageNs: st.storageNamespace ?? ns,
    timeout: spec.timeout ?? null,
    helmChart: st.helmChart ?? null,
    ready: cond(o, 'Ready'),
    stalled: cond(o, 'Stalled'),
    failures: st.failures ?? 0,
    upgradeFailures: st.upgradeFailures ?? 0,
    installFailures: st.installFailures ?? 0,
    lastAction: st.lastAttemptedReleaseAction ?? null,
    lastRev: st.lastAttemptedRevision ?? null,
    history: (st.history ?? []).slice(0, 6).map((h: Obj) => ({ v: h.version, s: h.status, chart: h.chartVersion ?? null, last: h.lastDeployed ?? null })),
  }
}

export const sourceRow = (kind: string) => (o: Obj): Source => ({
  kind,
  ns: o.metadata?.namespace,
  n: o.metadata?.name,
  ready: cond(o, 'Ready'),
  rev: o.status?.artifact?.revision ?? null,
  chart: o.spec?.chart ?? null,
  srcRef: o.spec?.sourceRef ? { kind: o.spec.sourceRef.kind, name: o.spec.sourceRef.name } : null,
})

export function ksRow(o: Obj): KS {
  return {
    ns: o.metadata?.namespace,
    n: o.metadata?.name,
    dependsOn: (o.spec?.dependsOn ?? []).map((d: Obj) => d.name),
    hc: (o.spec?.healthChecks ?? []).filter((h: Obj) => h.kind === 'HelmRelease').map((h: Obj) => h.name),
    // HelmReleases this Kustomization applies, from its inventory ("<ns>_<name>_helm.toolkit.fluxcd.io_HelmRelease").
    hrs: (o.status?.inventory?.entries ?? [])
      .map((e: Obj) => String(e.id ?? ''))
      .filter((id: string) => id.endsWith('_helm.toolkit.fluxcd.io_HelmRelease'))
      .map((id: string) => id.split('_').slice(0, 2).join('/')),
    src: o.spec?.sourceRef ? { kind: o.spec.sourceRef.kind, name: o.spec.sourceRef.name } : null,
    ready: cond(o, 'Ready'),
    applied: o.status?.lastAppliedRevision ?? null,
  }
}

export const workloadRow = (kind: string) => (o: Obj): Workload => ({
  kind,
  ns: o.metadata?.namespace,
  n: o.metadata?.name,
  want: o.spec?.replicas ?? 1,
  ready: o.status?.readyReplicas ?? 0,
  chart: o.metadata?.labels?.['helm.sh/chart'] ?? null,
})

/* ------------------------------------------------------------------ checks */

export type Result = 'pass' | 'fail' | 'unknown'
export type StepId = 'ready' | 'suspend' | 'source' | 'retries' | 'history' | 'workloads' | 'downstream' | 'pending'
export const STEP_IDS: StepId[] = ['ready', 'suspend', 'source', 'retries', 'history', 'workloads', 'downstream', 'pending']

export interface Check { id: StepId; result: Result; seen: string; detail?: string | null; cmd: string[] }

const sha = (rev: string | null | undefined) => (rev ?? '').split(/[:@+]/).pop()!.slice(0, 12)
const short = (rev: string | null | undefined) => (rev ? rev.replace(/sha1:|sha256:/, '').replace(/^(.*[@:])?([0-9a-f]{12})[0-9a-f]+$/, '$1$2') : '–')
const isReady = (c: Cond | null) => c?.s === 'True'

/** The source an HR pulls its chart from, and the source behind that (a HelmChart's Git repo). */
export function chartSources(c: Cluster, hr: HR) {
  const first = hr.src ? c.sources.find((s) => s.kind === hr.src!.kind && s.n === hr.src!.name) ?? null : null
  const upstream = first?.srcRef ? c.sources.find((s) => s.kind === first.srcRef!.kind && s.n === first.srcRef!.name) ?? null : null
  return { first, upstream }
}

/** Kustomizations held back by this release: those that apply it, health-check it or name it in
 * their Ready message while not Ready, then everything not Ready that depends on those. */
export function blockedBy(c: Cluster, hr: HR): KS[] {
  const mention = `HelmRelease/${hr.ns}/${hr.n} `
  const id = `${hr.ns}/${hr.n}`
  const direct = c.kustomizations.filter((k) => !isReady(k.ready) && (k.hc.includes(hr.n) || k.hrs.includes(id) || (k.ready?.m ?? '').includes(mention)))
  const out = [...direct]
  let grew = true
  while (grew) {
    grew = false
    for (const k of c.kustomizations) {
      if (!out.includes(k) && !isReady(k.ready) && k.dependsOn.some((d) => out.some((o) => o.n === d))) {
        out.push(k)
        grew = true
      }
    }
  }
  return out
}

export interface Words {
  /** The words for what each check saw: plain strings, and functions of their `{{placeholders}}`. */
  seen: Record<string, any>
  date: (iso: string | null) => string
}

export function runChecks(c: Cluster, hr: HR, w: Words): Check[] {
  const ns = hr.ns
  const s = w.seen
  const { first, upstream } = chartSources(c, hr)
  const blocked = blockedBy(c, hr)
  const rel = hr.rel ?? `${hr.tns}-${hr.n}`
  // Helm-managed workloads in the release's namespace (they carry a helm.sh/chart label).
  const loads = c.workloads.filter((x) => x.ns === hr.tns && x.chart)
  const out: Check[] = []

  // 1. Ready
  out.push({
    id: 'ready',
    result: hr.ready ? (hr.ready.s === 'True' ? 'pass' : hr.ready.s === 'False' ? 'fail' : 'unknown') : 'unknown',
    seen: hr.ready ? `Ready=${hr.ready.s} · ${hr.ready.r ?? '–'} · ${s.since({ date: w.date(hr.ready.t) })}` : s.noCondition,
    detail: hr.ready?.m,
    cmd: [`flux get helmreleases -n ${ns} ${hr.n}`],
  })

  // 2. Suspend
  out.push({
    id: 'suspend',
    result: hr.suspend ? 'fail' : 'pass',
    seen: hr.suspend ? 'spec.suspend: true' : `spec.suspend: ${hr.suspend === false ? 'false' : s.notSet}`,
    cmd: [`kubectl -n ${ns} get helmrelease ${hr.n} -o jsonpath='{.spec.suspend}'`],
  })

  // 3. Chart source
  const srcCmd: Record<string, string> = {
    OCIRepository: `flux get sources oci -n ${ns} ${hr.src?.name}`,
    HelmChart: `flux get sources chart -n ${ns} ${hr.src?.name}`,
    HelmRepository: `flux get sources helm -n ${ns} ${hr.src?.name}`,
  }
  out.push({
    id: 'source',
    result: !first ? 'unknown' : isReady(first.ready) ? 'pass' : first.ready?.s === 'False' ? 'fail' : 'unknown',
    seen: first
      ? `${first.kind} ${first.n} · ${isReady(first.ready) ? 'Ready' : first.ready?.r ?? '–'}${first.rev ? ` · ${short(first.rev)}` : ''}${first.chart ? ` · ${first.chart}` : ''}`
      : s.noSource({ name: hr.src ? `${hr.src.kind} ${hr.src.name}` : '–' }),
    detail: first && !isReady(first.ready) ? first.ready?.m : null,
    cmd: [srcCmd[hr.src?.kind ?? ''] ?? `kubectl -n ${ns} get helmrelease ${hr.n} -o yaml`],
  })

  // 4. Retries
  const stalled = hr.stalled?.s === 'True'
  const fails = hr.upgradeFailures + hr.installFailures
  out.push({
    id: 'retries',
    result: stalled ? 'fail' : 'pass',
    seen: stalled ? `Stalled · ${hr.stalled!.r} · ${s.failures({ count: fails })}` : `${s.notStalled} · ${s.failures({ count: fails })}`,
    detail: stalled ? hr.stalled!.m : null,
    cmd: [`kubectl -n ${ns} get helmrelease ${hr.n} -o jsonpath='{.status.conditions[?(@.type=="Stalled")].message}'`],
  })

  // 5. History
  const latest = hr.history[0]
  const good = hr.history.find((h) => h.s === 'deployed' || h.s === 'superseded')
  const failedSince = good ? hr.history.filter((h) => h.v > good.v && h.s === 'failed').length : hr.history.filter((h) => h.s === 'failed').length
  out.push({
    id: 'history',
    result: !latest ? 'unknown' : latest.s === 'deployed' ? 'pass' : 'fail',
    seen: !latest
      ? s.noHistory
      : latest.s === 'deployed'
        ? `v${latest.v} deployed · ${latest.chart} · ${w.date(latest.last)}`
        : `v${latest.v} ${latest.s} · ${latest.chart} · ${s.lastGood({ release: good ? `v${good.v} ${good.chart}, ${w.date(good.last)}` : '–' })} · ${s.failedSince({ count: failedSince })}`,
    cmd: [`helm history ${rel} -n ${hr.storageNs} --max 6`],
  })

  // 6. Workloads
  const notReady = loads.filter((x) => x.ready < x.want)
  out.push({
    id: 'workloads',
    result: loads.length === 0 ? 'unknown' : notReady.length ? 'fail' : 'pass',
    seen: loads.length === 0
      ? s.noWorkloads({ namespace: hr.tns })
      : loads.map((x) => `${x.kind} ${x.ns}/${x.n} ${x.ready}/${x.want}${x.chart ? ` · ${x.chart.replace(/_/g, '+')}` : ''}`).join('\n'),
    cmd: [`kubectl -n ${hr.tns} get deployments,statefulsets -o wide`],
  })

  // 7. Downstream
  out.push({
    id: 'downstream',
    result: blocked.length ? 'fail' : 'pass',
    seen: blocked.length
      ? `${s.blocked({ count: blocked.length })}: ${blocked.map((k) => `${k.n} (${k.ready?.r ?? '–'}, ${s.since({ date: w.date(k.ready?.t ?? null) })})`).join(' → ')}`
      : s.noneBlocked,
    cmd: [blocked.length ? `kubectl -n ${ns} get kustomizations ${blocked.map((k) => k.n).join(' ')}` : `flux get kustomizations -n ${ns} --status-selector ready=false`],
  })

  // 8. Pending: is a newer commit or chart held back?
  const pending: string[] = []
  let known = false
  for (const k of blocked) {
    const src = k.src ? c.sources.find((x) => x.kind === k.src!.kind && x.n === k.src!.name) : null
    if (src?.rev && k.applied) {
      known = true
      if (sha(src.rev) !== sha(k.applied)) pending.push(`${k.n}: ${short(k.applied)} → ${short(src.rev)}`)
    }
  }
  if (upstream?.kind === 'GitRepository' && upstream.rev && latest?.chart?.includes('+')) {
    known = true
    if (!sha(upstream.rev).startsWith(sha(latest.chart)) && !sha(latest.chart).startsWith(sha(upstream.rev))) pending.push(`${hr.n}: ${latest.chart} → ${short(upstream.rev)}`)
  } else if (first?.kind === 'OCIRepository' && first.rev) {
    const ver = first.rev.split('@')[0]
    const running = loads.some((x) => (x.chart ?? '').includes(ver))
    known = true
    if (!running) pending.push(`${hr.n}: ${ver}`)
  }
  const upToDate = blocked.filter((k) => k.applied).map((k) => short(k.applied))
  out.push({
    id: 'pending',
    result: pending.length ? 'fail' : known ? 'pass' : 'unknown',
    seen: pending.length ? `${s.waiting}: ${pending.join(' · ')}` : known ? s.nothingWaiting({ revision: upToDate[0] ?? (first?.rev ? short(first.rev) : '–') }) : s.cannotTell,
    cmd: blocked.length
      ? [`kubectl -n ${ns} get kustomization ${blocked[blocked.length - 1].n} -o jsonpath='{.status.lastAppliedRevision}'`]
      : upstream
        ? [`flux get sources git -n ${ns} ${upstream.n}`]
        : [`flux get sources all -n ${ns}`],
  })
  return out
}

/** What a person should do next, as commands to run (shown, never run by the page). */
export function nextAction(c: Cluster, hr: HR, checks: Check[]) {
  const by = Object.fromEntries(checks.map((x) => [x.id, x.result])) as Record<StepId, Result>
  const { upstream } = chartSources(c, hr)
  const blocked = blockedBy(c, hr)
  const head = blocked.find((k) => !blocked.some((o) => k.dependsOn.includes(o.n)))
  const then = head ? [`flux reconcile kustomization ${head.n} -n ${hr.ns}`] : []
  if (by.suspend === 'fail') return { kind: 'resume' as const, cmds: [`flux resume helmrelease ${hr.n} -n ${hr.ns}`, ...then] }
  if (by.source === 'fail')
    return {
      kind: 'source' as const,
      cmds: [
        ...(upstream?.kind === 'GitRepository' ? [`flux reconcile source git ${upstream.n} -n ${hr.ns}`] : []),
        `flux reconcile helmrelease ${hr.n} -n ${hr.ns} --with-source`,
      ],
    }
  if (by.retries === 'fail')
    return { kind: 'force' as const, cmds: [`flux reconcile helmrelease ${hr.n} -n ${hr.ns} --force`, `flux get helmreleases -n ${hr.ns} ${hr.n}`, ...then], timeout: /deadline exceeded|timed out/i.test(hr.ready?.m ?? '') && !hr.timeout }
  if (by.ready === 'fail') return { kind: 'retry' as const, cmds: [`flux reconcile helmrelease ${hr.n} -n ${hr.ns}`, ...then] }
  return { kind: 'none' as const, cmds: [] as string[] }
}
