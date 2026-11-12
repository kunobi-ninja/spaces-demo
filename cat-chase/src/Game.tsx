import * as React from 'react'
import * as THREE from 'three'
import * as kunobi from 'kunobi'
import { BOUNDS, makeCat, makeFish, makeRoom, type Cat } from './scene'
import { chomp, closeAudio, meow, unlock } from './sound'

/*
 * Every player moves their own cat. The room holds each cat's place (cat.<id>, only its
 * owner may write it), each cat's last meow (meow.<id>) and who caught each fish
 * (catch.<n>, set once: the first cat there gets it). Where shared state is unavailable
 * the page is a one-cat game that keeps its fish in memory.
 */

const ROOM = 'cat-chase-room'
const TO_WIN = 5
const SPEED = 3.6
const FUR = ['#f39c3d', '#8a8f98', '#2e2c36', '#f1ece3', '#c9a27a', '#6b5444']

type Words = Record<string, any>
interface Room {
  status: string
  state?: Record<string, unknown>
  revision?: number
  actor?: { id: string }
  participants?: { id: string; name?: string; self: boolean; role: string }[]
  apply?: (op: unknown) => Promise<{ status: string }>
}
interface Pose { x: number; z: number; r: number }

const K = kunobi as Record<string, any>
const useRoom: (name: string) => Room = typeof K.useSession === 'function' ? K.useSession : () => ({ status: 'refused' })

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}
const furOf = (id: string) => FUR[Math.floor(hash(id) * FUR.length)]
const fishAt = (n: number): [number, number] => [
  BOUNDS.x0 + 0.8 + hash(`fish${n}x`) * (BOUNDS.x1 - BOUNDS.x0 - 1.6),
  BOUNDS.z0 + 0.8 + hash(`fish${n}z`) * (BOUNDS.z1 - BOUNDS.z0 - 1.6),
]
const startOf = (id: string): Pose => ({ x: (hash(`${id}x`) - 0.5) * 8, z: (hash(`${id}z`) - 0.5) * 5, r: 0 })

function catchesIn(st: Record<string, unknown>) {
  const out: string[] = []
  while (typeof st[`catch.${out.length}`] === 'string') out.push(st[`catch.${out.length}`] as string)
  return out
}

/** Round winners so far, and the fish each cat has in the round being played. */
function tally(catches: string[]) {
  const rounds: string[] = []
  let now: Record<string, number> = {}
  for (const id of catches) {
    now[id] = (now[id] ?? 0) + 1
    if (now[id] >= TO_WIN) {
      rounds.push(id)
      now = {}
    }
  }
  return { rounds, now }
}

const turnTo = (from: number, to: number, k: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k

interface Shown { cat: Cat; pos: THREE.Vector3; target: Pose; moving: number; tag: HTMLDivElement; bubbleUntil: number; lastMeow?: unknown }

export function Game({ w }: { w: Words }) {
  const room = useRoom(ROOM)
  const live = room.status === 'open'
  const st = (live || room.status === 'paused') && room.state ? room.state : {}
  const me = live && room.actor ? room.actor.id : 'me'
  const [solo, setSolo] = React.useState<string[]>([])
  const catches = live || room.status === 'paused' ? catchesIn(st) : solo
  const { rounds, now } = tally(catches)

  const here = (room.participants ?? []).filter((p) => p.role !== 'reader')
  const nameOf = (id: string) => (id === me ? w.you : here.find((p) => p.id === id)?.name ?? w.guest)
  const players = live ? here.map((p) => p.id) : [me]

  // The animation loop reads the latest room through this ref.
  const latest = React.useRef({ room, st, me, live, catches, nameOf })
  latest.current = { room, st, me, live, catches, nameOf }

  const wrap = React.useRef<HTMLDivElement>(null)
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const tags = React.useRef<HTMLDivElement>(null)
  const meowNow = React.useRef<() => void>(() => {})

  // A short banner when a round is won.
  const [banner, setBanner] = React.useState<string | null>(null)
  const seenRounds = React.useRef(rounds.length)
  React.useEffect(() => {
    if (rounds.length <= seenRounds.current) return
    seenRounds.current = rounds.length
    setBanner(rounds[rounds.length - 1])
    const t = setTimeout(() => setBanner(null), 3200)
    return () => clearTimeout(t)
  }, [rounds.length])

  React.useEffect(() => {
    const box = wrap.current!
    const gl = new THREE.WebGLRenderer({ canvas: canvas.current!, antialias: true })
    gl.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1))
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.shadowMap.enabled = true
    gl.shadowMap.type = THREE.PCFSoftShadowMap

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#fdf3e3')
    makeRoom(scene)
    const { fish, ring } = makeFish()
    scene.add(fish, ring)

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100)
    const fit = () => {
      const width = box.clientWidth
      const height = box.clientHeight
      gl.setSize(width, height, false)
      camera.aspect = width / Math.max(1, height)
      const far = Math.max(1, 1.25 / camera.aspect)
      camera.position.set(0, 11.5 * far, 10.5 * far)
      camera.lookAt(0, 0, -0.3)
      camera.updateProjectionMatrix()
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(box)

    const shown = new Map<string, Shown>()
    const show = (id: string, at: Pose) => {
      let s = shown.get(id)
      if (!s) {
        const cat = makeCat(furOf(id))
        scene.add(cat.root)
        const tag = document.createElement('div')
        tag.className = 'cc-tag'
        tag.innerHTML = '<b></b><span></span>'
        tags.current!.appendChild(tag)
        s = { cat, pos: new THREE.Vector3(at.x, 0, at.z), target: { ...at }, moving: 0, tag, bubbleUntil: 0 }
        cat.root.rotation.y = at.r
        shown.set(id, s)
      }
      return s
    }
    const drop = (id: string) => {
      const s = shown.get(id)
      if (!s) return
      scene.remove(s.cat.root)
      s.cat.dispose()
      s.tag.remove()
      shown.delete(id)
    }

    // Input: arrow keys or WASD, or tap the floor to walk there.
    const keys = new Set<string>()
    let goal: THREE.Vector3 | null = null
    const DIRS: Record<string, [number, number]> = {
      ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0],
    }
    const down = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return
      unlock()
      if (DIRS[k]) {
        keys.add(k)
        e.preventDefault()
      } else if (k === 'm' && !e.repeat) meowNow.current()
    }
    const up = (e: KeyboardEvent) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)

    const ray = new THREE.Raycaster()
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const tap = (e: PointerEvent) => {
      unlock()
      const r = box.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = ray.ray.intersectPlane(floor, new THREE.Vector3())
      if (hit) goal = hit
    }
    const cnv = canvas.current!
    cnv.addEventListener('pointerdown', tap)

    let sentAt = 0
    let sent: Pose | null = null
    let claimed = -1
    const send = (op: unknown) => void latest.current.room.apply?.(op)?.catch?.(() => {})

    meowNow.current = () => {
      unlock()
      const { me, live } = latest.current
      const mine = shown.get(me)
      if (mine) mine.bubbleUntil = performance.now() + 1400
      meow(0.9 + hash(me) * 0.3)
      if (live) send({ type: 'set', key: `meow.${me}`, value: Date.now() })
    }

    const head = new THREE.Vector3()
    let last = performance.now()
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    // A hidden frame gets no animation frames, so keep going on a slow timer there.
    const next = () => (document.hidden ? (timer = setTimeout(() => frame(performance.now()), 100)) : (raf = requestAnimationFrame(frame)))
    function frame(t: number) {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      const { st, me, live, catches, nameOf } = latest.current
      const mine = show(me, (st[`cat.${me}`] as Pose) ?? startOf(me))

      // Move my cat.
      let dx = 0
      let dz = 0
      for (const k of keys) {
        dx += DIRS[k][0]
        dz += DIRS[k][1]
      }
      if (dx || dz) goal = null
      else if (goal) {
        dx = goal.x - mine.pos.x
        dz = goal.z - mine.pos.z
        if (Math.hypot(dx, dz) < 0.1) (goal = null), (dx = dz = 0)
      }
      const len = Math.hypot(dx, dz)
      if (len) {
        mine.pos.x = THREE.MathUtils.clamp(mine.pos.x + (dx / len) * SPEED * dt, BOUNDS.x0, BOUNDS.x1)
        mine.pos.z = THREE.MathUtils.clamp(mine.pos.z + (dz / len) * SPEED * dt, BOUNDS.z0, BOUNDS.z1)
        mine.target.r = Math.atan2(dx, dz)
      }
      mine.moving = len ? 1 : Math.max(0, mine.moving - dt * 4)
      mine.target.x = mine.pos.x
      mine.target.z = mine.pos.z

      // Tell the room where I am, a few times a second while moving.
      if (live) {
        const pose = { x: +mine.pos.x.toFixed(2), z: +mine.pos.z.toFixed(2), r: +mine.target.r.toFixed(2) }
        const changed = !sent || sent.x !== pose.x || sent.z !== pose.z || sent.r !== pose.r
        if (changed && (t - sentAt > 140 || !len)) {
          send({ type: 'set', key: `cat.${me}`, value: pose })
          sent = pose
          sentAt = t
        }
      }

      // Everyone else, eased towards their last known place.
      const present = new Set([me])
      if (live) {
        const people = latest.current.room.participants ?? []
        for (const p of people) {
          const pose = st[`cat.${p.id}`] as Pose | undefined
          if (p.id === me || !pose || p.role === 'reader') continue
          present.add(p.id)
          const s = show(p.id, pose)
          const was = s.pos.clone()
          s.target = pose
          s.pos.lerp(new THREE.Vector3(pose.x, 0, pose.z), 1 - Math.exp(-dt * 10))
          s.moving = s.pos.distanceTo(was) > 0.002 ? 1 : Math.max(0, s.moving - dt * 4)
          const m = st[`meow.${p.id}`]
          if (s.lastMeow !== undefined && m !== s.lastMeow) {
            s.bubbleUntil = t + 1400
            meow(0.9 + hash(p.id) * 0.3, 0.05)
          }
          s.lastMeow = m ?? null
        }
      }
      for (const id of [...shown.keys()]) if (!present.has(id)) drop(id)

      // The fish, and catching it.
      const n = catches.length
      const [fx, fz] = fishAt(n)
      fish.position.set(fx, 0.5 + Math.sin(t / 260) * 0.08, fz)
      fish.rotation.y = t / 700
      ring.position.set(fx, 0.02, fz)
      ring.scale.setScalar(1 + Math.sin(t / 200) * 0.08)
      if (claimed !== n && Math.hypot(mine.pos.x - fx, mine.pos.z - fz) < 0.8) {
        claimed = n
        chomp()
        if (live) send({ type: 'set', key: `catch.${n}`, value: me })
        else setSolo((s) => (s.length === n ? [...s, me] : s))
      }

      // Pose every cat and place its name tag.
      const r = box.getBoundingClientRect()
      for (const [id, s] of shown) {
        const { cat } = s
        cat.root.position.copy(s.pos)
        cat.root.rotation.y = turnTo(cat.root.rotation.y, s.target.r, 1 - Math.exp(-dt * 12))
        const step = Math.sin(t / 70) * 0.55 * s.moving
        cat.legs.forEach((leg, i) => (leg.rotation.x = i === 0 || i === 3 ? step : -step))
        cat.body.position.y = Math.abs(Math.sin(t / 70)) * 0.05 * s.moving
        cat.tail.rotation.z = Math.sin(t / 380 + hash(id) * 6) * 0.35
        head.copy(s.pos).setY(1.75).project(camera)
        s.tag.style.transform = `translate(${((head.x + 1) / 2) * r.width}px, ${((1 - head.y) / 2) * r.height}px) translate(-50%, -100%)`
        s.tag.classList.toggle('talk', t < s.bubbleUntil)
        s.tag.classList.toggle('self', id === me)
        const name = nameOf(id)
        const label = s.tag.lastChild as HTMLElement
        if (label.textContent !== name) label.textContent = name
        const bubble = s.tag.firstChild as HTMLElement
        if (bubble.textContent !== w.meow) bubble.textContent = w.meow
      }

      gl.render(scene, camera)
      next()
    }
    frame(performance.now())

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      watch.disconnect()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      cnv.removeEventListener('pointerdown', tap)
      for (const id of [...shown.keys()]) drop(id)
      gl.dispose()
      closeAudio()
    }
  }, [])

  const status = room.status === 'paused' ? w.paused : live ? (players.length < 2 ? w.alone : null) : w.solo

  return (
    <div className="cc">
      <style>{CSS}</style>
      <div className="cc-stage" ref={wrap}>
        <canvas ref={canvas} />
        <div className="cc-tags" ref={tags} />
        <div className="cc-hud">
          <h1>{w.title}</h1>
          <ol>
            {players.map((id) => (
              <li key={id}>
                <i style={{ background: furOf(id) }} />
                <span>{nameOf(id)}</span>
                <b>{'🐟'.repeat(now[id] ?? 0) || '·'}</b>
                {rounds.filter((r) => r === id).length > 0 && <em>👑 {rounds.filter((r) => r === id).length}</em>}
              </li>
            ))}
          </ol>
        </div>
        {banner && <div className="cc-banner">{banner === me ? w.youWin : w.theyWin(nameOf(banner))}</div>}
        <button className="cc-meow" onClick={() => meowNow.current()}>
          {w.meow}
        </button>
      </div>
      <p className="cc-foot">
        {status && <strong>{status}</strong>}
        <span>{w.how(TO_WIN)}</span>
      </p>
    </div>
  )
}

const CSS = `
.cc { width: 100%; padding: 12px 16px 24px; box-sizing: border-box; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
.cc-stage { position: relative; width: 100%; aspect-ratio: 16 / 9; max-height: 78vh; border-radius: 22px; overflow: hidden; background: #fdf3e3; touch-action: none; user-select: none; }
.cc-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.cc-tags { position: absolute; inset: 0; pointer-events: none; }
.cc-tag { position: absolute; left: 0; top: 0; display: grid; justify-items: center; gap: 4px; }
.cc-tag span { font-weight: 600; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: rgba(6,33,63,.72); color: #fff; white-space: nowrap; }
.cc-tag.self span { background: #f3aa08; color: #06213f; }
.cc-tag b { visibility: hidden; font-family: Parkinsans, system-ui, sans-serif; font-weight: 800; font-size: 16px; padding: 4px 12px; border-radius: 14px; background: #fff; color: #06213f; box-shadow: 0 4px 14px rgba(6,33,63,.18); }
.cc-tag.talk b { visibility: visible; }
.cc-hud { position: absolute; left: 16px; top: 14px; pointer-events: none; color: #06213f; }
.cc-hud h1 { margin: 0 0 8px; font-family: Parkinsans, system-ui, sans-serif; font-weight: 800; font-size: clamp(20px, 3vw, 30px); line-height: 1; }
.cc-hud ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.cc-hud li { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; background: rgba(255,255,255,.75); padding: 3px 10px 3px 6px; border-radius: 999px; width: max-content; }
.cc-hud li i { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(6,33,63,.25); }
.cc-hud li b { font-weight: 400; letter-spacing: 1px; }
.cc-hud li em { font-style: normal; font-size: 12px; }
.cc-banner { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); font-family: Parkinsans, system-ui, sans-serif; font-weight: 800;
  font-size: clamp(26px, 5vw, 52px); color: #06213f; background: #f3aa08; padding: 10px 28px; border-radius: 20px; box-shadow: 0 10px 30px rgba(6,33,63,.25); white-space: nowrap; pointer-events: none; }
.cc-meow { all: unset; cursor: pointer; position: absolute; right: 16px; bottom: 16px; font-family: Parkinsans, system-ui, sans-serif; font-weight: 800; font-size: 18px;
  padding: 12px 22px; border-radius: 999px; background: #06213f; color: #fff; box-shadow: 0 6px 18px rgba(6,33,63,.3); }
.cc-meow:active { transform: scale(.96); }
.cc-foot { display: flex; flex-wrap: wrap; gap: 6px 16px; justify-content: center; margin: 12px 0 0; font-size: 14px; color: hsl(var(--muted-foreground)); }
.cc-foot strong { color: hsl(var(--foreground)); font-weight: 600; }
@media (max-width: 640px) { .cc-stage { aspect-ratio: 1 / 1; } .cc-meow { font-size: 15px; padding: 9px 16px; right: 12px; bottom: 12px; } .cc-hud { left: 12px; top: 10px; } }
`
