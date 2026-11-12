// Builds the reference index from projected rows. The snapshot in data/cluster.json
// was produced by this same function from kctl reads; live mode feeds it rows
// projected from full objects (see project.js). Pure, no imports.

export function buildIndex(R) {
  const objects = {}
  const nodes = {}
  const refs = []
  const seen = new Set()
  const id = (kind, ns, n) => (ns ? `${kind}/${ns}/${n}` : `${kind}//${n}`)
  const mgr = (r) => (r.hr ? `helm:${r.hr}` : r.kz ? `flux:${r.kz}` : null)
  const ref = (o, f, how, d) => {
    if (!o || !f) return
    const k = `${o}|${f}|${how}|${d || ''}`
    if (seen.has(k)) return
    seen.add(k)
    refs.push(d ? [o, f, how, d] : [o, f, how])
  }

  for (const c of R.cm || []) {
    objects[id('ConfigMap', c.ns, c.n)] = {
      keys: (c.k || 0) + (c.bk || 0),
      imm: c.imm ? 1 : 0,
      auto: c.n === 'kube-root-ca.crt' ? 1 : 0,
      mgr: mgr(c),
    }
  }
  for (const s of R.svc || []) {
    objects[id('Service', s.ns, s.n)] = { type: s.t, ports: s.ports || [], sel: s.sel || null, mgr: mgr(s) }
  }
  for (const p of R.pvc || []) {
    objects[id('PersistentVolumeClaim', p.ns, p.n)] = { phase: p.ph, sc: p.sc, cap: p.cap, am: p.am || [], mgr: mgr(p) }
  }
  const sas = {}
  for (const a of R.sa || []) sas[id('ServiceAccount', a.ns, a.n)] = a

  // Workloads that own pods.
  const rsOwner = {}
  for (const r of R.rs || []) if (r.ok === 'Deployment') rsOwner[`${r.ns}/${r.n}`] = r.o
  const jobOwner = {}
  for (const j of R.jobs || []) if (j.ok === 'CronJob') jobOwner[`${j.ns}/${j.n}`] = j.o

  const reloadOf = (w) => {
    const ra = w.ra || []
    if (ra.some((e) => /reloader\.stakater\.com\/(auto|search)=true/.test(e))) return { reload: 'auto', names: [] }
    const named = ra.filter((e) => /(configmap|secret)\.reloader\.stakater\.com\/reload=/.test(e))
    if (named.length) {
      const names = named.flatMap((e) => e.split('=').slice(1).join('=').split(',').map((x) => x.trim()).filter(Boolean))
      return { reload: 'named', names }
    }
    return { reload: null, names: [] }
  }
  const addWorkload = (kind, w) => {
    const rl = reloadOf(w)
    nodes[id(kind, w.ns, w.n)] = {
      want: w.want ?? 0,
      ready: w.ready ?? 0,
      pods: [],
      podsReady: 0,
      restarts: 0,
      st: w.st || null,
      reload: rl.reload,
      reloadNames: rl.names,
      checksum: (w.ck || []).some((k) => k.startsWith('checksum/')) ? 1 : 0,
      mgr: mgr(w),
    }
    if (w.sa) ref(id('ServiceAccount', w.ns, w.sa), id(kind, w.ns, w.n), 'runsAs')
  }
  for (const w of R.deploy || []) addWorkload('Deployment', w)
  for (const w of R.sts || []) addWorkload('StatefulSet', w)
  for (const w of R.ds || []) addWorkload('DaemonSet', w)
  for (const c of R.cronA || []) {
    const cid = id('CronJob', c.ns, c.n)
    nodes[cid] = { want: 0, ready: 0, pods: [], podsReady: 0, restarts: 0, sch: c.sch, sus: c.sus ? 1 : 0, reload: null, reloadNames: [], checksum: 0 }
    const t = c.t || {}
    if (t.sa) ref(id('ServiceAccount', c.ns, t.sa), cid, 'runsAs')
    for (const v of t.v || []) {
      if (v.cm) ref(id('ConfigMap', c.ns, v.cm), cid, 'volume', v.vn)
      if (v.s) ref(id('Secret', c.ns, v.s), cid, 'volume', v.vn)
      if (v.p) ref(id('PersistentVolumeClaim', c.ns, v.p), cid, 'volume', v.vn)
    }
  }
  for (const c of R.cronB || []) {
    const cid = id('CronJob', c.ns, c.n)
    for (const e of c.ef || []) {
      if (e.cm) ref(id('ConfigMap', c.ns, e.cm), cid, 'envFrom')
      if (e.s) ref(id('Secret', c.ns, e.s), cid, 'envFrom')
    }
    for (const e of c.ev || []) {
      if (e.cm) ref(id('ConfigMap', c.ns, e.cm), cid, 'env', e.k)
      if (e.s) ref(id('Secret', c.ns, e.s), cid, 'env', e.k)
    }
  }

  // Pods: resolve each to the workload that owns it, then record its references.
  const byPod = {}
  const merge = (list, key) => {
    for (const r of list || []) {
      const k = `${r.ns}/${r.n}`
      byPod[k] = byPod[k] || {}
      byPod[k][key] = r
    }
  }
  merge(R.podsA, 'a'); merge(R.podsB, 'b'); merge(R.podsP, 'p'); merge(R.podsC, 'c'); merge(R.podsD, 'd'); merge(R.podsE, 'e')
  const podWorkload = {}
  for (const [k, P] of Object.entries(byPod)) {
    const a = P.a
    if (!a) continue
    let kind = 'Pod'
    let name = a.n
    if (a.ok === 'ReplicaSet' && rsOwner[`${a.ns}/${a.on}`]) { kind = 'Deployment'; name = rsOwner[`${a.ns}/${a.on}`] }
    else if (a.ok === 'Job') { if (jobOwner[`${a.ns}/${a.on}`]) { kind = 'CronJob'; name = jobOwner[`${a.ns}/${a.on}`] } else { kind = 'Job'; name = a.on } }
    else if (a.ok === 'StatefulSet' || a.ok === 'DaemonSet') { kind = a.ok; name = a.on }
    else if (a.ok && a.ok !== 'Node') { kind = a.ok; name = a.on }
    const wid = id(kind, a.ns, name)
    if (!nodes[wid]) nodes[wid] = { want: 0, ready: 0, pods: [], podsReady: 0, restarts: 0, reload: null, reloadNames: [], checksum: 0, bare: kind === 'Pod' || kind === 'Job' ? 1 : 0 }
    const W = nodes[wid]
    const c = P.c || {}
    const ok = a.ph === 'Running' && (c.rd || []).length > 0 && c.rd.every(Boolean)
    W.pods.push([a.n, a.ph, ok ? 1 : 0, c.rs || 0])
    if (ok) W.podsReady++
    W.restarts += c.rs || 0
    podWorkload[k] = { wid, lb: a.lb || {}, ns: a.ns, running: a.ph === 'Running' }
    if (a.sa) ref(id('ServiceAccount', a.ns, a.sa), wid, 'runsAs')
    const sp = new Set(c.sp || [])
    for (const v of (P.b && P.b.v) || []) {
      const how = sp.has(v.vn) ? 'subPath' : 'volume'
      if (v.cm) ref(id('ConfigMap', a.ns, v.cm), wid, how, v.vn)
      if (v.s) ref(id('Secret', a.ns, v.s), wid, how, v.vn)
      if (v.p) ref(id('PersistentVolumeClaim', a.ns, v.p), wid, 'volume', v.vn)
    }
    for (const v of (P.p && P.p.v) || []) {
      for (const n of v.cm || []) ref(id('ConfigMap', a.ns, n), wid, sp.has(v.vn) ? 'subPath' : 'projected', v.vn)
      for (const n of v.s || []) ref(id('Secret', a.ns, n), wid, sp.has(v.vn) ? 'subPath' : 'projected', v.vn)
    }
    for (const e of (P.d && P.d.ef) || []) {
      if (e.cm) ref(id('ConfigMap', a.ns, e.cm), wid, 'envFrom')
      if (e.s) ref(id('Secret', a.ns, e.s), wid, 'envFrom')
    }
    for (const e of (P.e && P.e.ev) || []) {
      if (e.cm) ref(id('ConfigMap', a.ns, e.cm), wid, 'env', e.k)
      if (e.s) ref(id('Secret', a.ns, e.s), wid, 'env', e.k)
    }
    for (const s of (P.e && P.e.ips) || []) ref(id('Secret', a.ns, s), wid, 'pullSecret')
  }
  for (const W of Object.values(nodes)) if (W.bare) { W.want = W.pods.length; W.ready = W.podsReady }

  // Services select pods; ingresses route to services and terminate TLS with secrets.
  for (const s of R.svc || []) {
    const sel = s.sel || {}
    const keys = Object.keys(sel)
    if (!keys.length) continue
    const sid = id('Service', s.ns, s.n)
    let matched = 0
    for (const p of Object.values(podWorkload)) {
      if (p.ns !== s.ns || !keys.every((k) => p.lb[k] === sel[k])) continue
      if (p.running) matched++
      ref(sid, p.wid, 'selector')
    }
    objects[sid].endpoints = matched
  }
  for (const i of R.ing || []) {
    const iid = id('Ingress', i.ns, i.n)
    nodes[iid] = { hosts: i.hosts || [], cls: i.cls || null }
    for (const b of [...(i.be || []), ...(i.def ? [i.def] : [])]) ref(id('Service', i.ns, b), iid, 'backend', (i.hosts || [])[0])
    for (const t of i.tls || []) if (t) ref(id('Secret', i.ns, t), iid, 'tls', (i.hosts || [])[0])
  }

  // Flux inputs, RBAC bindings and secret producers.
  for (const h of R.hrel || []) {
    const hid = id('HelmRelease', h.ns, h.n)
    nodes[hid] = { target: h.tns || h.ns }
    for (const v of h.vf || []) ref(id(v.k, h.ns, v.n), hid, 'helmValues')
  }
  for (const k of R.ks || []) {
    const kid = id('Kustomization', k.ns, k.n)
    if ((k.sf || []).length) nodes[kid] = {}
    for (const v of k.sf || []) ref(id(v.k, k.ns, v.n), kid, 'substitute')
  }
  for (const b of R.rb || []) {
    const bid = id('RoleBinding', b.ns, b.n)
    nodes[bid] = { role: `${b.rk}/${b.r}` }
    for (const s of b.sa || []) { const [ns, n] = s.split('/'); ref(id('ServiceAccount', ns && ns !== 'null' ? ns : b.ns, n), bid, 'binding', `${b.rk}/${b.r}`) }
  }
  for (const b of R.crb || []) {
    const bid = id('ClusterRoleBinding', '', b.n)
    nodes[bid] = { role: `ClusterRole/${b.r}` }
    for (const s of b.sa || []) { const [ns, n] = s.split('/'); if (ns && ns !== 'null') ref(id('ServiceAccount', ns, n), bid, 'binding', `ClusterRole/${b.r}`) }
  }
  for (const [sid, a] of Object.entries(sas)) {
    for (const s of a.ips || []) ref(id('Secret', a.ns, s), sid, 'pullSecret')
  }
  const producers = {}
  for (const e of R.es || []) producers[id('Secret', e.ns, e.tgt)] = `${e.sk || 'SecretStore'}/${e.store} · ExternalSecret ${e.n}`

  // A binding to a service account that does not exist and that nothing runs as is noise: drop it.
  const usedSa = new Set(refs.filter((r) => r[2] !== 'binding').map((r) => r[0]))
  for (let i = refs.length - 1; i >= 0; i--) {
    const [o, , how] = refs[i]
    if (how === 'binding' && !sas[o] && !usedSa.has(o)) refs.splice(i, 1)
  }
  // Every referenced object gets an entry; kinds listed in full that were not found are missing.
  for (const [o] of refs) {
    if (objects[o]) continue
    const kind = o.split('/')[0]
    if (kind === 'ServiceAccount') {
      const a = sas[o]
      objects[o] = a ? { mgr: mgr(a) } : { missing: 1 }
    } else if (kind === 'Secret') objects[o] = { src: producers[o] || null }
    else objects[o] = { missing: 1 }
  }
  for (const [o, src] of Object.entries(producers)) if (!objects[o]) objects[o] = { src }
  for (const W of Object.values(nodes)) if (W.pods) W.pods.sort((x, y) => (x[0] < y[0] ? -1 : 1))
  refs.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : 1))
  return { objects, nodes, refs }
}
