import * as React from 'react'
import * as THREE from 'three'
import { edit, useStore, useStoreStatus } from 'kunobi'
import { observeGestures } from '@vixi/helpers/input'
import type { FlatTourPinsStore } from '../types/flat-tour-pins.store'

/** Pins the flatmates drop in the flat: where (x, y, z in centimetres), what kind, what they said, and whether it is dealt with. */
export const STORE = 'flat-tour-pins'
type Pin = FlatTourPinsStore['pins'][string]
export type Kind = 'like' | 'issue' | 'question' | 'idea'
const KINDS: Kind[] = ['issue', 'question', 'idea', 'like']

type Range = [number, number]
export interface Flat {
  address: string
  wallHeight: number
  flatmates: { id: string; name: string; color: string }[]
  rooms: { id: string; x: Range; z: Range; floor: string }[]
  walls: [number, number, number, number][]
  windows: [number, number, number, number][]
  furniture: { id: string; x: number; z: number; w: number; d: number; h: number; color: string }[]
  camera: { target: [number, number, number]; yaw: number; pitch: number; distance: number; narrowDistance: number; pinDistance: number }
}

const C = { midnight: '#06213f', deep: '#0b2d52', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8', cut: '#d9654b', leaf: '#2fb37a' }
const KIND_COLOR: Record<Kind, string> = { issue: C.cut, question: C.horizon, idea: C.sun, like: C.leaf }
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
/** A word with `{{placeholders}}` is a function of their values (lib/i18n); one without is its text. */
const fill = (t: string | ((v: Record<string, string | number>) => string), v: Record<string, string | number>) => (typeof t === 'function' ? t(v) : t)

function KindIcon({ kind, resolved }: { kind: Kind; resolved?: boolean }) {
  if (resolved) return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  if (kind === 'like') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13.6S2 10 2 6.1A3.1 3.1 0 0 1 8 4.6a3.1 3.1 0 0 1 6 1.5C14 10 8 13.6 8 13.6z" fill="currentColor" /></svg>
  if (kind === 'idea') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z" fill="currentColor" /></svg>
  return <b aria-hidden="true">{kind === 'issue' ? '!' : '?'}</b>
}

type Draft = { x: number; y: number; z: number; room: string }
type Api = { flyTo(x: number, y: number, z: number): void; overview(): void }

export function Tour({ flat, start, localize, words: w }: { flat: Flat; start: FlatTourPinsStore; localize: (data: FlatTourPinsStore) => FlatTourPinsStore; words: any }) {
  const live = useStore(STORE) as FlatTourPinsStore | undefined
  const status = useStoreStatus(STORE)
  // Without the store (other builds, previews), show the starting pins, read-only.
  const open = (status?.status === 'open' || status?.status === 'paused') && live !== undefined
  const canEdit = open && status?.status === 'open' && Boolean(status?.canEdit)
  const pins = React.useMemo(() => localize((open ? live : start) as FlatTourPinsStore)?.pins ?? {}, [open, live, start, localize])

  const [selected, setSelected] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [kind, setKind] = React.useState<Kind>('issue')
  const [text, setText] = React.useState('')
  const [me, setMe] = React.useState<string>(() => {
    try { return localStorage.getItem('flat-tour-me') || flat.flatmates[0].id } catch { return flat.flatmates[0].id }
  })
  const [filter, setFilter] = React.useState<'all' | 'open' | Kind>('all')
  const [touched, setTouched] = React.useState(false)
  const [noGl, setNoGl] = React.useState(false)
  const [problem, setProblem] = React.useState('')

  const stageRef = React.useRef<HTMLDivElement>(null)
  const touchRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const api = React.useRef<Api | null>(null)
  const marks = React.useRef(new Map<string, HTMLElement>())
  const spots = React.useRef<{ id: string; x: number; y: number; z: number }[]>([])
  const pick = React.useRef<(x: number, y: number) => void>(() => {})

  const name = (id: string | null) => flat.flatmates.find((f) => f.id === id)?.name ?? id ?? ''
  const roomName = (id: string | null) => (id && w.rooms[id]) || id || ''
  const when = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(w.locale, { day: 'numeric', month: 'short' })
  }

  const list = Object.entries(pins)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (a.resolved === 'yes' ? 1 : 0) - (b.resolved === 'yes' ? 1 : 0) || String(b.added).localeCompare(String(a.added)))
  const shown = list.filter((p) => (filter === 'all' ? true : filter === 'open' ? p.resolved !== 'yes' : p.kind === filter))
  const openOf = (k: Kind) => list.filter((p) => p.kind === k && p.resolved !== 'yes').length
  const active = selected ? list.find((p) => p.id === selected) ?? null : null

  // Where the scene draws each pin and room label; read every frame, so it is a ref.
  spots.current = [
    ...list.map((p) => ({ id: p.id, x: (p.x ?? 0) / 100, y: (p.y ?? 0) / 100, z: (p.z ?? 0) / 100 })),
    ...(draft ? [{ id: '__draft', x: draft.x, y: draft.y, z: draft.z }] : []),
    ...flat.rooms.map((r) => ({ id: `room:${r.id}`, x: (r.x[0] + r.x[1]) / 2, y: 0.05, z: (r.z[0] + r.z[1]) / 2 })),
  ]

  pick.current = (cx, cy) => {
    setTouched(true)
    if (!canEdit) return
    const hit = api.current && (api.current as any).hit?.(cx, cy)
    if (!hit) return
    setSelected(null)
    setDraft(hit)
    setText('')
    setProblem('')
  }

  const answer = (result: any) => {
    const s = result?.status
    if (s && s !== 'applied' && s !== 'unchanged') setProblem(fill(w.failed, { reason: result.reason ?? s }))
  }

  const save = async () => {
    if (!draft || !text.trim()) return
    const id = `p${Date.now().toString(36)}`
    const now = new Date()
    const added = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const row: Pin = {
      x: Math.round(draft.x * 100), y: Math.round(draft.y * 100), z: Math.round(draft.z * 100),
      kind, text: text.trim(), author: me, room: draft.room, resolved: 'no', added,
    }
    setDraft(null)
    setSelected(id)
    answer(await edit(STORE, (d: FlatTourPinsStore) => void (d.pins[id] = row)))
  }
  const setResolved = async (id: string, yes: boolean) =>
    answer(await edit(STORE, (d: FlatTourPinsStore) => { if (d.pins[id]) d.pins[id].resolved = yes ? 'yes' : 'no' }))
  const remove = async (id: string) => {
    setSelected(null)
    answer(await edit(STORE, (d: FlatTourPinsStore) => void delete d.pins[id]))
  }
  const choose = (id: string) => {
    const p = pins[id]
    setDraft(null)
    setSelected(id)
    setTouched(true)
    if (p) api.current?.flyTo((p.x ?? 0) / 100, (p.y ?? 0) / 100, (p.z ?? 0) / 100)
    // On a phone the list sits under the flat: bring the flat back into view.
    const stage = stageRef.current
    if (stage && stage.clientWidth < 560) stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  const chooseMe = (id: string) => {
    setMe(id)
    try { localStorage.setItem('flat-tour-me', id) } catch { /* the choice lasts for this visit */ }
  }

  React.useEffect(() => {
    const stage = stageRef.current!
    const touch = touchRef.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current!, antialias: true, alpha: true, preserveDrawingBuffer: true })
    } catch (error) {
      console.warn('flat-tour: WebGL is not available', error)
      setNoGl(true)
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const world = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200)
    const owned: { dispose(): void }[] = []
    const solid = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra })
      owned.push(m)
      return m
    }
    const box = (w: number, h: number, d: number) => {
      const g = new THREE.BoxGeometry(w, h, d)
      owned.push(g)
      return g
    }
    const pickable: THREE.Object3D[] = []

    world.add(new THREE.HemisphereLight(0xffffff, 0x9aa9b8, 2.1))
    const sun = new THREE.DirectionalLight(0xfff3df, 2.4)
    sun.position.set(-4, 14, 10)
    sun.target.position.set(5.6, 0, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 })
    sun.shadow.bias = -0.0008
    world.add(sun, sun.target)

    // The plinth the flat stands on.
    const width = Math.max(...flat.rooms.map((r) => r.x[1]))
    const depth = Math.max(...flat.rooms.map((r) => r.z[1]))
    const plinth = new THREE.Mesh(box(width + 0.5, 0.3, depth + 0.5), solid(C.deep))
    plinth.position.set(width / 2, -0.16, depth / 2)
    plinth.receiveShadow = true
    world.add(plinth)

    for (const r of flat.rooms) {
      const floor = new THREE.Mesh(box(r.x[1] - r.x[0], 0.02, r.z[1] - r.z[0]), solid(r.floor))
      floor.position.set((r.x[0] + r.x[1]) / 2, -0.01, (r.z[0] + r.z[1]) / 2)
      floor.receiveShadow = true
      world.add(floor)
      pickable.push(floor)
    }
    const wallMat = solid('#f6f2ea')
    const glassMat = solid(C.ocean, { transparent: true, opacity: 0.45, roughness: 0.2 })
    const segment = ([x0, z0, x1, z1]: number[], mat: THREE.Material, t: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0)
      const m = new THREE.Mesh(box(len + t, flat.wallHeight, t), mat)
      m.position.set((x0 + x1) / 2, flat.wallHeight / 2, (z0 + z1) / 2)
      m.rotation.y = -Math.atan2(z1 - z0, x1 - x0)
      return m
    }
    for (const s of flat.walls) {
      const m = segment(s, wallMat, 0.12)
      m.castShadow = true
      m.receiveShadow = true
      world.add(m)
      pickable.push(m)
    }
    for (const s of flat.windows) {
      const m = segment(s, glassMat, 0.05)
      world.add(m)
      pickable.push(m)
    }
    for (const f of flat.furniture) {
      const m = new THREE.Mesh(box(f.w, f.h, f.d), solid(f.color))
      m.position.set(f.x, f.h / 2, f.z)
      m.castShadow = f.h > 0.05
      m.receiveShadow = true
      world.add(m)
      pickable.push(m)
    }

    const roomAt = (x: number, z: number) =>
      flat.rooms.find((r) => x >= r.x[0] && x <= r.x[1] && z >= r.z[0] && z <= r.z[1])?.id ?? flat.rooms[0].id
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()

    // Orbit: goal values follow gestures and buttons, current values ease toward them.
    const cam = flat.camera
    const target = new THREE.Vector3(...cam.target)
    const wide = () => stage.clientWidth >= 560
    const goal = { yaw: cam.yaw, pitch: cam.pitch, distance: wide() ? cam.distance : cam.narrowDistance, target: target.clone() }
    const now = { yaw: goal.yaw, pitch: goal.pitch, distance: goal.distance, target: goal.target.clone() }
    let moved = 0
    let framed = false

    const onDown = () => (moved = 0)
    touch.addEventListener('pointerdown', onDown, true)
    const stopGestures = observeGestures(touch, ({ pan, zoom }) => {
      moved += Math.abs(pan.x) + Math.abs(pan.y)
      if (moved < 6 && zoom === 1) return
      framed = true
      goal.yaw -= pan.x * 0.006
      goal.pitch = clamp(goal.pitch + pan.y * 0.005, 0.3, 1.45)
      goal.distance = clamp(goal.distance / zoom, 3.5, 32)
    })
    const onClick = (e: MouseEvent) => {
      if (moved >= 6) return
      pick.current(e.clientX, e.clientY)
    }
    touch.addEventListener('click', onClick)

    api.current = {
      flyTo(x, y, z) {
        framed = true
        goal.target.set(x, Math.min(y, 0.6), z)
        goal.distance = cam.pinDistance
      },
      overview() {
        framed = false
        goal.target.copy(target)
        goal.yaw = cam.yaw
        goal.pitch = cam.pitch
        goal.distance = wide() ? cam.distance : cam.narrowDistance
      },
    }
    ;(api.current as any).hit = (cx: number, cy: number): Draft | null => {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const [hit] = ray.intersectObjects(pickable, false)
      if (!hit) return null
      const p = hit.point.clone()
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0)
      const inside = p.clone().addScaledVector(n, 0.08)
      return { x: p.x + n.x * 0.03, y: Math.max(0, p.y), z: p.z + n.z * 0.03, room: roomAt(inside.x, inside.z) }
    }

    const size = () => {
      const sw = stage.clientWidth
      const sh = stage.clientHeight
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
      renderer.setSize(sw, sh, false)
      camera.aspect = sw / Math.max(1, sh)
      camera.updateProjectionMatrix()
      if (!framed) goal.distance = wide() ? cam.distance : cam.narrowDistance
    }
    const v = new THREE.Vector3()
    let drawn = ''
    // Ease the camera toward its goal, draw when it moved, and place the HTML pins and room names.
    const step = (dt: number) => {
      const k = 1 - Math.exp(-dt * 6)
      now.yaw += (goal.yaw - now.yaw) * k
      now.pitch += (goal.pitch - now.pitch) * k
      now.distance += (goal.distance - now.distance) * k
      now.target.lerp(goal.target, k)
      const cp = Math.cos(now.pitch)
      camera.position.set(
        now.target.x + now.distance * Math.sin(now.yaw) * cp,
        now.target.y + now.distance * Math.sin(now.pitch),
        now.target.z + now.distance * Math.cos(now.yaw) * cp,
      )
      camera.lookAt(now.target)
      camera.updateMatrixWorld()
      const sw = stage.clientWidth
      const sh = stage.clientHeight
      const pose = `${sw}x${sh}:${camera.position.toArray().map((n) => n.toFixed(4))}:${now.target.toArray().map((n) => n.toFixed(4))}`
      if (pose !== drawn) {
        renderer.render(world, camera)
        drawn = pose
      }
      for (const s of spots.current) {
        const el = marks.current.get(s.id)
        if (!el) continue
        v.set(s.x, s.y, s.z).project(camera)
        const off = v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1
        el.style.visibility = off ? 'hidden' : 'visible'
        el.style.transform = `translate(${((v.x + 1) / 2) * sw}px, ${((1 - v.y) / 2) * sh}px)`
        if (!s.id.startsWith('room:')) el.style.zIndex = String(10 + Math.round((1 - v.z) * 5000))
      }
    }
    const resize = () => {
      size()
      drawn = ''
      step(0)
    }
    resize()
    const watch = new ResizeObserver(resize)
    watch.observe(stage)
    ;(api.current as any).redraw = () => step(0)

    let last = performance.now()
    let raf = requestAnimationFrame(function frame(t) {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, Math.max(0, (t - last) / 1000))
      last = t
      step(dt)
    })

    return () => {
      cancelAnimationFrame(raf)
      api.current = null
      stopGestures()
      touch.removeEventListener('pointerdown', onDown, true)
      touch.removeEventListener('click', onClick)
      watch.disconnect()
      for (const o of owned) o.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    }
  }, [flat])

  // Place pins that appeared since the last frame, even where frames are throttled.
  React.useEffect(() => { (api.current as any)?.redraw?.() })

  const mark = (id: string) => (el: HTMLElement | null) => {
    if (el) marks.current.set(id, el)
    else marks.current.delete(id)
  }
  const filters: ('all' | 'open' | Kind)[] = ['all', 'open', ...KINDS]
  const count = (f: 'all' | 'open' | Kind) => (f === 'all' ? list.length : f === 'open' ? list.filter((p) => p.resolved !== 'yes').length : list.filter((p) => p.kind === f).length)

  const card = active ? (
    <div className="ft-card" key={active.id}>
      <div className="ft-card-top">
        <span className="ft-kind" style={{ background: active.resolved === 'yes' ? '#8a97a6' : KIND_COLOR[active.kind as Kind] }}>
          <KindIcon kind={active.kind as Kind} resolved={active.resolved === 'yes'} />
          {active.resolved === 'yes' ? w.resolvedTag : w.kinds[active.kind as Kind]}
        </span>
        <button className="ft-x" aria-label={w.close} onClick={() => setSelected(null)}>×</button>
      </div>
      <p className="ft-text">{active.text}</p>
      <div className="ft-meta">{name(active.author)} · {roomName(active.room)} · {when(active.added)}</div>
      {canEdit && (
        <div className="ft-actions">
          <button className={`ft-btn${active.resolved === 'yes' ? '' : ' go'}`} onClick={() => setResolved(active.id, active.resolved !== 'yes')}>
            {active.resolved === 'yes' ? w.reopen : w.resolve}
          </button>
          <button className="ft-link" onClick={() => remove(active.id)}>{w.remove}</button>
        </div>
      )}
    </div>
  ) : draft ? (
    <div className="ft-card">
      <div className="ft-card-top">
        <b className="ft-card-title">{fill(w.newPin, { room: roomName(draft.room) })}</b>
        <button className="ft-x" aria-label={w.cancel} onClick={() => setDraft(null)}>×</button>
      </div>
      <div className="ft-chips" role="radiogroup">
        {KINDS.map((k) => (
          <button key={k} role="radio" aria-checked={kind === k} className={`ft-chip${kind === k ? ' on' : ''}`} style={kind === k ? { background: KIND_COLOR[k], borderColor: KIND_COLOR[k] } : undefined} onClick={() => setKind(k)}>
            <KindIcon kind={k} />{w.kinds[k]}
          </button>
        ))}
      </div>
      <input
        className="ft-input"
        autoFocus
        value={text}
        maxLength={240}
        placeholder={w.placeholder[kind]}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save() }}
      />
      <div className="ft-row">
        <span className="ft-from">{w.from}</span>
        {flat.flatmates.map((f) => (
          <button key={f.id} className={`ft-face${me === f.id ? ' on' : ''}`} style={{ background: f.color }} aria-pressed={me === f.id} onClick={() => chooseMe(f.id)} title={f.name}>
            {f.name}
          </button>
        ))}
        <button className="ft-btn go ft-save" disabled={!text.trim()} onClick={save}>{w.save}</button>
      </div>
    </div>
  ) : null

  return (
    <div className="ft">
      <style>{`
        .ft { width: min(var(--kunobi-prose-width, 1200px), 100%); margin: 0 auto; box-sizing: border-box; padding: 16px 24px 48px; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
        .ft-in { container-type: inline-size; }
        .ft h1, .ft h2 { font-family: Parkinsans, Figtree, sans-serif; letter-spacing: -0.02em; margin: 0; }
        .ft button { font-family: Figtree, system-ui, sans-serif; }
        .ft-head { border-radius: 28px; background: radial-gradient(120% 140% at 10% 0%, ${C.deep} 0%, ${C.midnight} 60%, #031426 100%); color: #fff; padding: clamp(22px, 3.6cqw, 36px); display: grid; grid-template-columns: 1fr auto; gap: 20px 24px; align-items: end; }
        .ft-eyebrow { font: 600 13px Figtree, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.65); }
        .ft-head h1 { font-weight: 800; font-size: clamp(30px, 4.4cqw, 50px); line-height: 1.02; margin-top: 8px; }
        .ft-head h1 em { font-style: normal; color: ${C.sun}; }
        .ft-stats { display: flex; gap: 10px; }
        .ft-stat { background: rgba(255,255,255,0.08); border-radius: 18px; padding: 12px 16px; min-width: 84px; }
        .ft-stat b { display: flex; align-items: center; gap: 8px; font: 800 26px Parkinsans, sans-serif; }
        .ft-stat b i { width: 10px; height: 10px; border-radius: 99px; }
        .ft-stat span { font-size: 13px; color: rgba(255,255,255,0.7); }
        .ft-main { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(0, 1fr); gap: 16px; margin-top: 16px; }
        .ft-stage { position: relative; aspect-ratio: 4 / 3; border-radius: 24px; overflow: hidden; user-select: none;
          background: radial-gradient(110% 90% at 50% 30%, #f4f7fa 0%, #e2e9f0 60%, #cbd7e3 100%); border: 1px solid hsl(var(--border)); }
        .ft-touch { position: absolute; inset: 0; touch-action: none; cursor: crosshair; }
        .ft-touch.read { cursor: grab; }
        .ft-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .ft-layer { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
        .ft-mark { position: absolute; left: 0; top: 0; visibility: hidden; will-change: transform; }
        .ft-room { font: 700 10.5px Figtree, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: rgba(6,33,63,.55); white-space: nowrap; translate: -50% -50%; text-shadow: 0 1px 0 rgba(255,255,255,.7); }
        .ft-pin { all: unset; pointer-events: auto; cursor: pointer; position: relative; display: block; translate: -50% -100%; transition: scale .15s; }
        .ft-pin span { width: 30px; height: 30px; border-radius: 99px; display: grid; place-items: center; color: #fff; border: 2.5px solid #fff; box-shadow: 0 4px 12px rgba(6,33,63,.35); box-sizing: border-box; }
        .ft-pin span svg { width: 15px; height: 15px; }
        .ft-pin span b { font: 800 16px Parkinsans, sans-serif; line-height: 1; }
        .ft-pin::after { content: ''; display: block; width: 0; height: 0; margin: -2px auto 0; border: 6px solid transparent; border-top: 8px solid #fff; border-bottom: 0; filter: drop-shadow(0 2px 2px rgba(6,33,63,.25)); }
        .ft-pin.done span { background: #8a97a6 !important; width: 24px; height: 24px; }
        .ft-pin.done span svg { width: 12px; height: 12px; }
        .ft-pin.on { scale: 1.25; }
        .ft-pin.on span { box-shadow: 0 0 0 4px rgba(243,170,8,.55), 0 6px 16px rgba(6,33,63,.35); }
        .ft-pin:focus-visible span { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
        .ft-pin.draft span { background: #fff; border-color: ${C.sun}; color: ${C.midnight}; animation: ft-bob 1s ease-in-out infinite alternate; }
        @keyframes ft-bob { to { translate: 0 -4px; } }
        .ft-hint { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 28px); box-sizing: border-box; text-align: center; padding: 8px 14px; border-radius: 999px; font: 600 13px Figtree, sans-serif; color: #fff; background: rgba(6,33,63,.72); backdrop-filter: blur(10px); transition: opacity .5s; pointer-events: none; z-index: 20000; }
        .ft-hint.gone { opacity: 0; }
        .ft-over { all: unset; cursor: pointer; position: absolute; top: 14px; right: 14px; z-index: 20001; padding: 7px 13px; border-radius: 999px; font: 600 13px Figtree, sans-serif; background: rgba(255,255,255,.88); color: ${C.midnight}; box-shadow: 0 4px 14px rgba(6,33,63,.15); }
        .ft-over:focus-visible { outline: 2px solid ${C.horizon}; }
        .ft-nogl { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center; font-size: 15px; color: ${C.midnight}; }
        .ft-view { position: relative; }
        .ft-card { position: absolute; left: 14px; bottom: 14px; z-index: 20002; width: min(380px, calc(100% - 28px)); box-sizing: border-box; background: hsl(var(--card)); color: hsl(var(--foreground)); border: 1px solid hsl(var(--border)); border-radius: 20px; padding: 14px 16px; box-shadow: 0 14px 34px rgba(6,33,63,.28); }
        .ft-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .ft-card-title { font: 800 16px Parkinsans, sans-serif; }
        .ft-kind { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 8px; border-radius: 999px; color: #fff; font: 700 12px Figtree, sans-serif; }
        .ft-kind svg { width: 12px; height: 12px; }
        .ft-kind b { font: 800 13px Parkinsans, sans-serif; }
        .ft-x { all: unset; cursor: pointer; width: 28px; height: 28px; flex: none; border-radius: 99px; display: grid; place-items: center; background: hsl(var(--muted)); font-size: 17px; }
        .ft-text { margin: 10px 0 4px; font: 600 16px/1.4 Figtree, sans-serif; }
        .ft-meta { font-size: 13px; color: hsl(var(--muted-foreground)); }
        .ft-actions { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
        .ft-btn { all: unset; cursor: pointer; padding: 8px 14px; border-radius: 999px; font: 700 14px Figtree, sans-serif; background: hsl(var(--muted)); color: hsl(var(--foreground)); }
        .ft-btn.go { background: ${C.midnight}; color: #fff; }
        .ft-btn:disabled { opacity: .4; cursor: default; }
        .ft-btn:focus-visible, .ft-link:focus-visible, .ft-chip:focus-visible, .ft-face:focus-visible, .ft-x:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
        .ft-link { all: unset; cursor: pointer; font: 600 13px Figtree, sans-serif; color: hsl(var(--muted-foreground)); text-decoration: underline; text-underline-offset: 3px; }
        .ft-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .ft-chip { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px 5px 9px; border-radius: 999px; font: 600 13px Figtree, sans-serif; border: 1px solid hsl(var(--border)); }
        .ft-chip svg { width: 12px; height: 12px; }
        .ft-chip b { font: 800 13px Parkinsans, sans-serif; }
        .ft-chip.on { color: #fff; }
        .ft-input { width: 100%; box-sizing: border-box; margin-top: 10px; font: 400 15px Figtree, sans-serif; padding: 9px 12px; border-radius: 12px; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--foreground)); }
        .ft-input:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 1px; }
        .ft-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; }
        .ft-from { font-size: 13px; color: hsl(var(--muted-foreground)); margin-right: 2px; }
        .ft-face { all: unset; cursor: pointer; padding: 4px 10px; border-radius: 999px; font: 700 12px Figtree, sans-serif; color: ${C.midnight}; opacity: .45; }
        .ft-face.on { opacity: 1; box-shadow: 0 0 0 2px hsl(var(--card)), 0 0 0 4px ${C.midnight}; }
        .ft-save { margin-left: auto; }
        .ft-side { position: relative; min-height: 0; }
        .ft-side-in { position: absolute; inset: 0; display: flex; flex-direction: column; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 24px; overflow: hidden; }
        .ft-side-head { padding: 16px 16px 10px; border-bottom: 1px solid hsl(var(--border)); }
        .ft-side-head h2 { font-size: 20px; font-weight: 800; display: flex; align-items: baseline; gap: 10px; }
        .ft-saving { margin-left: auto; font: 600 12px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
        .ft-filters { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
        .ft-f { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 999px; background: hsl(var(--muted)); font: 600 12.5px Figtree, sans-serif; }
        .ft-f small { opacity: .6; font-size: 11.5px; }
        .ft-f i { width: 7px; height: 7px; border-radius: 99px; }
        .ft-f.on { background: ${C.midnight}; color: #fff; }
        .ft-f:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
        .ft-list { flex: 1; overflow-y: auto; padding: 8px; }
        .ft-item { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 28px 1fr; gap: 10px; width: 100%; padding: 10px; border-radius: 16px; transition: background .15s; }
        .ft-item:hover { background: hsl(var(--muted) / .6); }
        .ft-item.on { background: rgba(243,170,8,.16); }
        .ft-item:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: -2px; }
        .ft-dot { width: 28px; height: 28px; border-radius: 99px; display: grid; place-items: center; color: #fff; }
        .ft-dot svg { width: 13px; height: 13px; }
        .ft-dot b { font: 800 14px Parkinsans, sans-serif; }
        .ft-item-text { font: 600 14px/1.35 Figtree, sans-serif; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .ft-item-meta { font-size: 12.5px; color: hsl(var(--muted-foreground)); margin-top: 2px; }
        .ft-item.done .ft-item-text { color: hsl(var(--muted-foreground)); text-decoration: line-through; text-decoration-color: hsl(var(--muted-foreground) / .5); }
        .ft-empty { padding: 20px 12px; font-size: 14px; color: hsl(var(--muted-foreground)); }
        .ft-problem { margin-top: 10px; font-size: 13px; color: ${C.cut}; }
        .ft-foot { margin: 10px 4px 0; font-size: 13px; color: hsl(var(--muted-foreground)); }
        .ft-foot code, .ft-how code { font-size: 12.5px; background: hsl(var(--muted)); padding: 1px 6px; border-radius: 6px; }
        .ft-how { margin-top: 24px; padding: 16px 18px; border-radius: 20px; background: hsl(var(--muted)); font-size: 14px; line-height: 1.5; }
        .ft-how b { margin-right: 6px; }
        .ft-how code { background: hsl(var(--card)); }
        .ft-how q { display: block; margin-top: 6px; font-style: italic; quotes: none; }
        .ft-how q::before, .ft-how q::after { content: none; }
        @container (max-width: 820px) {
          .ft-head { grid-template-columns: 1fr; }
          .ft-main { grid-template-columns: 1fr; }
          .ft-side-in { position: static; max-height: 520px; }
        }
        @container (max-width: 560px) {
          .ft-stats { display: grid; grid-template-columns: 1fr 1fr; }
          .ft-stat { min-width: 0; }
          .ft-stage { aspect-ratio: 1 / 1; border-radius: 22px; }
          .ft-card { position: relative; left: auto; bottom: auto; width: auto; margin-top: 10px; box-shadow: 0 6px 18px rgba(6,33,63,.1); }
          .ft-hint { font-size: 12px; border-radius: 16px; top: auto; bottom: 12px; }
        }
      `}</style>
      <div className="ft-in">
        <header className="ft-head">
          <div>
            <div className="ft-eyebrow">{fill(w.eyebrow, { address: flat.address })}</div>
            <h1>{w.title} <em>{w.titleEm}</em></h1>
          </div>
          <div className="ft-stats">
            {(['issue', 'question', 'idea'] as Kind[]).map((k) => (
              <div className="ft-stat" key={k}><b><i style={{ background: KIND_COLOR[k] }} />{openOf(k)}</b><span>{w.stats[k]}</span></div>
            ))}
            <div className="ft-stat"><b>{list.filter((p) => p.resolved === 'yes').length}</b><span>{w.stats.resolved}</span></div>
          </div>
        </header>

        <div className="ft-main">
          <div>
          <div className="ft-view">
            <div ref={stageRef} className="ft-stage">
              <div ref={touchRef} className={`ft-touch${canEdit ? '' : ' read'}`}>
                <canvas ref={canvasRef} />
              </div>
              {noGl && <div className="ft-nogl">{w.noGl}</div>}
              <div className="ft-layer">
                {flat.rooms.map((r) => (
                  <div key={r.id} ref={mark(`room:${r.id}`)} className="ft-mark"><div className="ft-room">{roomName(r.id)}</div></div>
                ))}
                {list.map((p) => (
                  <div key={p.id} ref={mark(p.id)} className="ft-mark">
                    <button
                      className={`ft-pin${p.resolved === 'yes' ? ' done' : ''}${selected === p.id ? ' on' : ''}`}
                      aria-label={`${w.kinds[p.kind as Kind]}: ${p.text}`}
                      onClick={() => choose(p.id)}
                    >
                      <span style={{ background: KIND_COLOR[p.kind as Kind] }}><KindIcon kind={p.kind as Kind} resolved={p.resolved === 'yes'} /></span>
                    </button>
                  </div>
                ))}
                {draft && (
                  <div ref={mark('__draft')} className="ft-mark">
                    <div className="ft-pin draft"><span><b>+</b></span></div>
                  </div>
                )}
              </div>
              <div className={`ft-hint${touched || noGl ? ' gone' : ''}`}>{canEdit ? w.hintEdit : w.hintRead}</div>
              {!noGl && <button className="ft-over" onClick={() => { setSelected(null); setDraft(null); api.current?.overview() }}>{w.overview}</button>}
            </div>
            {card}
          </div>
            {problem && <div className="ft-problem">{problem}</div>}
            <div className="ft-foot">{w.model} <code>flat-tour/data/flat.json</code>.{open ? '' : ` ${w.readOnly}`}</div>
          </div>

          <aside className="ft-side">
            <div className="ft-side-in">
              <div className="ft-side-head">
                <h2>{w.pins} {open && !status?.saved && <span className="ft-saving">{w.saving}</span>}</h2>
                <div className="ft-filters">
                  {filters.map((f) => (
                    <button key={f} className={`ft-f${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {f !== 'all' && f !== 'open' && <i style={{ background: KIND_COLOR[f] }} />}
                      {f === 'all' ? w.all : f === 'open' ? w.open : w.kindsPlural[f]} <small>{count(f)}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="ft-list">
                {shown.length === 0 && <div className="ft-empty">{w.empty}</div>}
                {shown.map((p) => (
                  <button key={p.id} className={`ft-item${selected === p.id ? ' on' : ''}${p.resolved === 'yes' ? ' done' : ''}`} onClick={() => choose(p.id)}>
                    <span className="ft-dot" style={{ background: p.resolved === 'yes' ? '#8a97a6' : KIND_COLOR[p.kind as Kind] }}>
                      <KindIcon kind={p.kind as Kind} resolved={p.resolved === 'yes'} />
                    </span>
                    <span>
                      <span className="ft-item-text">{p.text}</span>
                      <span className="ft-item-meta" style={{ display: 'block' }}>
                        {roomName(p.room)} · {name(p.author)}{p.resolved === 'yes' ? ` · ${w.resolvedTag}` : ''}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <div className="ft-how">
          <b>{w.change}</b>{w.how[0]} <code>{STORE}</code>{w.how[1]} <code>flat-tour/data/pins.json</code>. {w.how[2]}
          {w.prompts.map((p: string) => <q key={p}>“{p}”</q>)}
        </div>
      </div>
    </div>
  )
}
