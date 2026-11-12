import * as React from 'react'
import * as THREE from 'three'
import * as kunobi from 'kunobi'
import { AREAS, BOUNDS, WALLS, blocked, makeCat, makeFish, makeHouse, makeYarn, type Cat } from './scene'
import { chomp, closeAudio, meow, unlock } from './sound'

/*
 * Every player moves their own cat around a house. The room holds each cat's place
 * (cat.<id>), its last meow (meow.<id>) and its kicks of the yarn balls (kick.<id>); only its
 * owner may write those. Each fish (catch.<n>) goes to the first cat that reaches it. A
 * ball rolls from its latest kick, simulated the same way on every screen. Where shared
 * state is unavailable the page is a one-cat game kept in memory.
 */

const ROOM = 'cat-chase-room'
const TO_WIN = 5
const FISH_OUT = 4
const SPEED = 5.2
const CAT_R = 0.45
const BALL_R = 0.32
const FUR = ['#f39c3d', '#8a8f98', '#2e2c36', '#f1ece3', '#c9a27a', '#6b5444']
const YARN = [
  { color: '#e5484d', x: -8, z: 9 },
  { color: '#f3aa08', x: 9, z: 4 },
  { color: '#5bcbf9', x: 1, z: -4 },
  { color: '#f72585', x: -12, z: -8 },
  { color: '#30ccd5', x: 11, z: -4 },
]

type Words = Record<string, any>
interface Room {
  status: string
  state?: Record<string, unknown>
  actor?: { id: string }
  participants?: { id: string; name?: string; self: boolean; role: string }[]
  apply?: (op: unknown) => Promise<{ status: string }>
}
interface Pose { x: number; z: number; r: number; j?: number }
interface Kick { x: number; z: number; vx: number; vz: number; at: number }

const K = kunobi as Record<string, any>
const useRoom: (name: string) => Room = typeof K.useSession === 'function' ? K.useSession : () => ({ status: 'refused' })

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}
const furOf = (id: string) => FUR[Math.floor(hash(id) * FUR.length)]
const r2 = (n: number) => Math.round(n * 100) / 100

/** A free spot in one of the rooms, the same on every screen for the same seed. */
function spot(seed: string, only?: string): [number, number] {
  const rooms = only ? AREAS.filter((a) => a.name === only) : AREAS
  for (let salt = 0; salt < 60; salt++) {
    const a = rooms[Math.floor(hash(`${seed}a${salt}`) * rooms.length)]
    const x = a.x0 + 1 + hash(`${seed}x${salt}`) * (a.x1 - a.x0 - 2)
    const z = a.z0 + 1 + hash(`${seed}z${salt}`) * (a.z1 - a.z0 - 2)
    if (!blocked(x, z, 0.9)) return [x, z]
  }
  return [-4, 6]
}
const fishSpots = new Map<number, [number, number]>()
const fishAt = (n: number) => {
  if (!fishSpots.has(n)) fishSpots.set(n, spot(`fish${n}`))
  return fishSpots.get(n)!
}

function caughtIn(st: Record<string, unknown>) {
  const out: Record<number, string> = {}
  for (const k in st) {
    if (!k.startsWith('catch.')) continue
    const n = Number(k.slice(6))
    if (Number.isInteger(n) && typeof st[k] === 'string') out[n] = st[k] as string
  }
  return out
}
function fishOut(caught: Record<number, string>) {
  const out: number[] = []
  for (let n = 0; out.length < FISH_OUT; n++) if (!(n in caught)) out.push(n)
  return out
}
/** Round winners so far, and each cat's fish in the round being played. */
function tally(caught: Record<number, string>) {
  const rounds: string[] = []
  let now: Record<string, number> = {}
  for (const n of Object.keys(caught).map(Number).sort((a, b) => a - b)) {
    const id = caught[n]
    now[id] = (now[id] ?? 0) + 1
    if (now[id] >= TO_WIN) {
      rounds.push(id)
      now = {}
    }
  }
  return { rounds, now }
}

const turnTo = (from: number, to: number, k: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k
/** Height of a jump that started at `j` (ms), at `now`. */
const hop = (j: number | undefined, now: number) => {
  const p = j ? (now - j) / 600 : 1
  return p >= 0 && p < 1 ? 4 * 1.3 * p * (1 - p) : 0
}

interface Shown { cat: Cat; pos: THREE.Vector3; target: Pose; moving: number; tag: HTMLDivElement; bubbleUntil: number; lastMeow?: unknown }
interface Ball { mesh: THREE.Group; kick: Kick | null; x: number; z: number; vx: number; vz: number; t: number }

export function Game({ w }: { w: Words }) {
  const room = useRoom(ROOM)
  const live = room.status === 'open'
  const st = (live || room.status === 'paused') && room.state ? room.state : {}
  const me = live && room.actor ? room.actor.id : 'me'
  const [solo, setSolo] = React.useState<Record<number, string>>({})
  const caught = live || room.status === 'paused' ? caughtIn(st) : solo
  const { rounds, now } = tally(caught)

  const here = (room.participants ?? []).filter((p) => p.role !== 'reader')
  const nameOf = (id: string) => (id === me ? w.you : here.find((p) => p.id === id)?.name ?? w.guest)
  const players = live ? here.map((p) => p.id) : [me]

  const latest = React.useRef({ room, st, me, live, caught, nameOf })
  latest.current = { room, st, me, live, caught, nameOf }

  const wrap = React.useRef<HTMLDivElement>(null)
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const map = React.useRef<HTMLCanvasElement>(null)
  const tags = React.useRef<HTMLDivElement>(null)
  const meowNow = React.useRef<() => void>(() => {})
  const jumpNow = React.useRef<() => void>(() => {})

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
    scene.background = new THREE.Color('#cfe9a8')
    const { follow } = makeHouse(scene)
    const fishes = Array.from({ length: FISH_OUT }, () => {
      const f = makeFish()
      scene.add(f.fish, f.ring)
      return f
    })
    const balls: Ball[] = YARN.map((y) => {
      const mesh = makeYarn(y.color)
      scene.add(mesh)
      return { mesh, kick: null, x: y.x, z: y.z, vx: 0, vz: 0, t: 0 }
    })

    // The camera follows my cat; the wheel zooms.
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
    let zoom = 1.4
    const fit = () => {
      gl.setSize(box.clientWidth, box.clientHeight, false)
      camera.aspect = box.clientWidth / Math.max(1, box.clientHeight)
      camera.updateProjectionMatrix()
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(box)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      zoom = THREE.MathUtils.clamp(zoom * (1 + e.deltaY * 0.0015), 0.55, 2.4)
    }
    box.addEventListener('wheel', wheel, { passive: false })

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

    // Input: arrows or WASD, Space to jump, M to meow, or tap the floor to walk there.
    const keys = new Set<string>()
    let goal: THREE.Vector3 | null = null
    let jumpAt = 0
    jumpNow.current = () => {
      if (Date.now() - jumpAt > 650) jumpAt = Date.now()
    }
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
      } else if (k === ' ') {
        e.preventDefault()
        jumpNow.current()
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
    let sent = ''
    const claimed = new Set<number>()
    const myKicks: Record<number, Kick> = {}
    const kickedAt = YARN.map(() => 0)
    const send = (op: unknown) => void latest.current.room.apply?.(op)?.catch?.(() => {})

    meowNow.current = () => {
      unlock()
      const { me, live } = latest.current
      const mine = shown.get(me)
      if (mine) mine.bubbleUntil = performance.now() + 1400
      meow(0.9 + hash(me) * 0.3)
      if (live) send({ type: 'set', key: `meow.${me}`, value: Date.now() })
    }

    /** Rolls a ball forward to `until` (wall-clock ms) in fixed steps, bouncing off walls. */
    const roll = (b: Ball, until: number) => {
      let steps = 0
      while (b.t < until && steps++ < 240 && (Math.abs(b.vx) > 0.02 || Math.abs(b.vz) > 0.02)) {
        const dt = 1 / 60
        const f = Math.pow(0.35, dt)
        b.vx *= f
        b.vz *= f
        const nx = b.x + b.vx * dt
        if (blocked(nx, b.z, BALL_R)) b.vx = -b.vx * 0.7
        else b.x = nx
        const nz = b.z + b.vz * dt
        if (blocked(b.x, nz, BALL_R)) b.vz = -b.vz * 0.7
        else b.z = nz
        b.t += 1000 / 60
      }
      if (Math.abs(b.vx) <= 0.02 && Math.abs(b.vz) <= 0.02) b.t = Math.max(b.t, until)
    }

    const [sx, sz] = spot(`start${latest.current.me}`, 'living')
    const startPose: Pose = { x: sx, z: sz, r: 0 }
    const look = new THREE.Vector3(sx, 0, sz)

    const head = new THREE.Vector3()
    const ctx = map.current!.getContext('2d')!
    let last = performance.now()
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    // A hidden frame gets no animation frames, so keep going on a slow timer there.
    const next = () => (document.hidden ? (timer = setTimeout(() => frame(performance.now()), 100)) : (raf = requestAnimationFrame(frame)))

    function frame(t: number) {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      const clock = Date.now()
      const { st, me, live, caught, nameOf } = latest.current
      const mine = show(me, (st[`cat.${me}`] as Pose) ?? startPose)

      // Move my cat, sliding along walls.
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
        if (Math.hypot(dx, dz) < 0.15) (goal = null), (dx = dz = 0)
      }
      const len = Math.hypot(dx, dz)
      if (len) {
        const fx = mine.pos.x
        const fz = mine.pos.z
        const nx = mine.pos.x + (dx / len) * SPEED * dt
        if (!blocked(nx, mine.pos.z, CAT_R)) mine.pos.x = nx
        const nz = mine.pos.z + (dz / len) * SPEED * dt
        if (!blocked(mine.pos.x, nz, CAT_R)) mine.pos.z = nz
        if (goal && fx === mine.pos.x && fz === mine.pos.z) goal = null
        mine.target.r = Math.atan2(dx, dz)
      }
      mine.moving = len ? 1 : Math.max(0, mine.moving - dt * 4)
      mine.target.x = mine.pos.x
      mine.target.z = mine.pos.z
      mine.target.j = jumpAt

      if (live) {
        const pose = { x: r2(mine.pos.x), z: r2(mine.pos.z), r: r2(mine.target.r), j: jumpAt }
        const key = JSON.stringify(pose)
        if (key !== sent && (t - sentAt > 140 || !len)) {
          send({ type: 'set', key: `cat.${me}`, value: pose })
          sent = key
          sentAt = t
        }
      }

      // Everyone else, eased towards their last known place.
      const present = new Set([me])
      if (live) {
        for (const p of latest.current.room.participants ?? []) {
          const pose = st[`cat.${p.id}`] as Pose | undefined
          if (p.id === me || !pose || p.role === 'reader') continue
          present.add(p.id)
          const s = show(p.id, pose)
          const wasX = s.pos.x
          const wasZ = s.pos.z
          s.target = pose
          const k = 1 - Math.exp(-dt * 10)
          s.pos.x += (pose.x - s.pos.x) * k
          s.pos.z += (pose.z - s.pos.z) * k
          s.moving = Math.hypot(s.pos.x - wasX, s.pos.z - wasZ) > 0.002 ? 1 : Math.max(0, s.moving - dt * 4)
          const m = st[`meow.${p.id}`]
          if (s.lastMeow !== undefined && m !== s.lastMeow) {
            s.bubbleUntil = t + 1400
            meow(0.9 + hash(p.id) * 0.3, 0.05)
          }
          s.lastMeow = m ?? null
        }
      }
      for (const id of [...shown.keys()]) if (!present.has(id)) drop(id)

      // Yarn: each ball rolls from its latest kick, whoever made it.
      balls.forEach((b, i) => {
        let newest: Kick | null = myKicks[i] ?? null
        if (live) {
          for (const k in st) {
            if (!k.startsWith('kick.')) continue
            const kk = (st[k] as Record<number, Kick> | undefined)?.[i]
            if (kk && typeof kk.at === 'number' && (!newest || kk.at > newest.at)) newest = kk
          }
        }
        if (newest && (!b.kick || newest.at !== b.kick.at)) {
          b.kick = newest
          Object.assign(b, { x: newest.x, z: newest.z, vx: newest.vx, vz: newest.vz, t: newest.at })
        }
        roll(b, clock)
        // My cat bumps it.
        const gap = Math.hypot(b.x - mine.pos.x, b.z - mine.pos.z)
        if (mine.moving > 0.5 && gap < CAT_R + BALL_R + 0.12 && clock - kickedAt[i] > 250) {
          kickedAt[i] = clock
          const ux = (b.x - mine.pos.x) / (gap || 1)
          const uz = (b.z - mine.pos.z) / (gap || 1)
          const kick = { x: r2(b.x), z: r2(b.z), vx: r2(ux * 9), vz: r2(uz * 9), at: clock }
          myKicks[i] = kick
          b.kick = kick
          Object.assign(b, { x: kick.x, z: kick.z, vx: kick.vx, vz: kick.vz, t: clock })
          if (live) send({ type: 'set', key: `kick.${me}`, value: { ...myKicks } })
        }
        b.mesh.position.set(b.x, BALL_R, b.z)
        b.mesh.rotation.x += (b.vz * dt) / BALL_R
        b.mesh.rotation.z -= (b.vx * dt) / BALL_R
      })

      // Fish, and catching them.
      const out = fishOut(caught)
      out.forEach((n, i) => {
        const [fx, fz] = fishAt(n)
        const { fish, ring } = fishes[i]
        fish.position.set(fx, 0.5 + Math.sin(t / 260 + i) * 0.08, fz)
        fish.rotation.y = t / 700 + i
        ring.position.set(fx, 0.02, fz)
        ring.scale.setScalar(1 + Math.sin(t / 200 + i) * 0.08)
        if (!claimed.has(n) && Math.hypot(mine.pos.x - fx, mine.pos.z - fz) < 0.9) {
          claimed.add(n)
          chomp()
          if (live) send({ type: 'set', key: `catch.${n}`, value: me })
          else setSolo((s) => (s[n] ? s : { ...s, [n]: me }))
        }
      })

      // The camera and the sun follow my cat.
      const ease = 1 - Math.exp(-dt * 5)
      look.x += (mine.pos.x - look.x) * ease
      look.z += (mine.pos.z - look.z) * ease
      const far = zoom * Math.max(1, 1.1 / camera.aspect)
      camera.position.set(look.x, 10 * far, look.z + 8.5 * far)
      camera.lookAt(look.x, 0, look.z - 0.6)
      follow(look.x, look.z)

      // Pose the cats and their name tags.
      const r = box.getBoundingClientRect()
      for (const [id, s] of shown) {
        const { cat } = s
        const y = hop(s.target.j, clock)
        cat.root.position.set(s.pos.x, y, s.pos.z)
        cat.root.rotation.y = turnTo(cat.root.rotation.y, s.target.r, 1 - Math.exp(-dt * 12))
        const step = Math.sin(t / 70) * 0.55 * s.moving
        cat.legs.forEach((leg, i) => (leg.rotation.x = y > 0 ? (i < 2 ? -0.6 : 0.6) : i === 0 || i === 3 ? step : -step))
        cat.body.position.y = Math.abs(Math.sin(t / 70)) * 0.05 * s.moving
        cat.tail.rotation.z = Math.sin(t / 380 + hash(id) * 6) * 0.35
        head.set(s.pos.x, 1.75 + y, s.pos.z).project(camera)
        const inView = Math.abs(head.x) < 1.1 && Math.abs(head.y) < 1.1 && head.z < 1
        s.tag.style.display = inView ? '' : 'none'
        s.tag.style.transform = `translate(${((head.x + 1) / 2) * r.width}px, ${((1 - head.y) / 2) * r.height}px) translate(-50%, -100%)`
        s.tag.classList.toggle('talk', t < s.bubbleUntil)
        s.tag.classList.toggle('self', id === me)
        const name = nameOf(id)
        const label = s.tag.lastChild as HTMLElement
        if (label.textContent !== name) label.textContent = name
        const bubble = s.tag.firstChild as HTMLElement
        if (bubble.textContent !== w.meow) bubble.textContent = w.meow
      }

      // Minimap: rooms, walls, fish, yarn and every cat.
      const W = ctx.canvas.width
      const H = ctx.canvas.height
      const sc = W / (BOUNDS.x1 - BOUNDS.x0)
      const mx = (x: number) => (x - BOUNDS.x0) * sc
      const mz = (z: number) => (z - BOUNDS.z0) * sc
      ctx.clearRect(0, 0, W, H)
      for (const a of AREAS) {
        ctx.fillStyle = a.floor
        ctx.fillRect(mx(a.x0), mz(a.z0), (a.x1 - a.x0) * sc, (a.z1 - a.z0) * sc)
      }
      ctx.fillStyle = 'rgba(6,33,63,.55)'
      for (const [x0, z0, x1, z1] of WALLS) ctx.fillRect(mx(x0), mz(z0), Math.max(2, (x1 - x0) * sc), Math.max(2, (z1 - z0) * sc))
      const px = W / 180
      const dot = (x: number, z: number, rad: number, fill: string, ring?: string) => {
        ctx.beginPath()
        ctx.arc(mx(x), mz(z), rad * px, 0, Math.PI * 2)
        ctx.fillStyle = fill
        ctx.fill()
        if (ring) {
          ctx.lineWidth = 2 * px
          ctx.strokeStyle = ring
          ctx.stroke()
        }
      }
      for (const n of out) {
        const [fx, fz] = fishAt(n)
        dot(fx, fz, 3.5, '#5bcbf9', '#06213f')
      }
      balls.forEach((b, i) => dot(b.x, b.z, 2.5, YARN[i].color))
      for (const [id, s] of shown) dot(s.pos.x, s.pos.z, id === me ? 5 : 4, furOf(id), id === me ? '#f3aa08' : '#ffffff')

      gl.render(scene, camera)
      next()
    }
    frame(performance.now())

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      watch.disconnect()
      box.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      cnv.removeEventListener('pointerdown', tap)
      for (const id of [...shown.keys()]) drop(id)
      gl.dispose()
      closeAudio()
    }
  }, [])

  const status = room.status === 'paused' ? w.paused : live ? (players.length < 2 ? w.alone : null) : w.solo
  const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1)

  return (
    <div className="cc">
      <style>{CSS}</style>
      <div className="cc-stage" ref={wrap}>
        <canvas ref={canvas} className="cc-world" />
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
        <canvas className="cc-map" ref={map} width={180 * dpr} height={120 * dpr} />
        {banner && <div className="cc-banner">{banner === me ? w.youWin : w.theyWin(nameOf(banner))}</div>}
        <div className="cc-buttons">
          <button onClick={() => jumpNow.current()}>{w.jump}</button>
          <button onClick={() => meowNow.current()}>{w.meow}</button>
        </div>
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
.cc-stage { position: relative; width: 100%; height: min(82vh, 62vw); min-height: 360px; border-radius: 22px; overflow: hidden; background: #cfe9a8; touch-action: none; user-select: none; }
.cc-world { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.cc-tags { position: absolute; inset: 0; pointer-events: none; }
.cc-tag { position: absolute; left: 0; top: 0; display: grid; justify-items: center; gap: 4px; }
.cc-tag span { font-weight: 600; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: rgba(6,33,63,.72); color: #fff; white-space: nowrap; }
.cc-tag.self span { background: #f3aa08; color: #06213f; }
.cc-tag b { visibility: hidden; font-family: Parkinsans, system-ui, sans-serif; font-weight: 800; font-size: 16px; padding: 4px 12px; border-radius: 14px; background: #fff; color: #06213f; box-shadow: 0 4px 14px rgba(6,33,63,.18); }
.cc-tag.talk b { visibility: visible; }
.cc-hud { position: absolute; left: 16px; top: 14px; pointer-events: none; color: #06213f; }
.cc-hud h1 { margin: 0 0 8px; font-family: Parkinsans, system-ui, sans-serif; font-weight: 800; font-size: clamp(20px, 3vw, 30px); line-height: 1; }
.cc-hud ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.cc-hud li { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; background: rgba(255,255,255,.8); padding: 3px 10px 3px 6px; border-radius: 999px; width: max-content; }
.cc-hud li i { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(6,33,63,.25); }
.cc-hud li b { font-weight: 400; letter-spacing: 1px; }
.cc-hud li em { font-style: normal; font-size: 12px; }
.cc-map { position: absolute; right: 16px; top: 14px; width: 180px; height: 120px; border-radius: 12px; background: rgba(255,255,255,.85); box-shadow: 0 4px 16px rgba(6,33,63,.18); pointer-events: none; }
.cc-banner { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); font-family: Parkinsans, system-ui, sans-serif; font-weight: 800;
  font-size: clamp(26px, 5vw, 52px); color: #06213f; background: #f3aa08; padding: 10px 28px; border-radius: 20px; box-shadow: 0 10px 30px rgba(6,33,63,.25); white-space: nowrap; pointer-events: none; }
.cc-buttons { position: absolute; right: 16px; bottom: 16px; display: flex; gap: 10px; }
.cc-buttons button { all: unset; cursor: pointer; font-family: Parkinsans, system-ui, sans-serif; font-weight: 800; font-size: 18px;
  padding: 12px 22px; border-radius: 999px; background: #06213f; color: #fff; box-shadow: 0 6px 18px rgba(6,33,63,.3); }
.cc-buttons button:first-child { background: #f3aa08; color: #06213f; }
.cc-buttons button:active { transform: scale(.96); }
.cc-foot { display: flex; flex-wrap: wrap; gap: 6px 16px; justify-content: center; margin: 12px 0 0; font-size: 14px; color: hsl(var(--muted-foreground)); }
.cc-foot strong { color: hsl(var(--foreground)); font-weight: 600; }
@media (max-width: 640px) {
  .cc-stage { height: 120vw; max-height: 80vh; }
  .cc-map { width: 120px; height: 80px; right: 12px; top: 10px; }
  .cc-buttons { right: 12px; bottom: 12px; }
  .cc-buttons button { font-size: 15px; padding: 9px 16px; }
  .cc-hud { left: 12px; top: 10px; }
}
`
