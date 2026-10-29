import * as THREE from 'three'
import { instanceStaticMeshes } from '@vixi/helpers/three'
import {
  block, burst, bush, C, dinosaur, fern, flower, fruit, ground, JUICE, marker, nest, palm, pivot, poseDinosaur, rock, smoke, TILE, volcano,
  type Fruit, type Mood,
} from './models'
import type { Shot } from './light'
import { chomp, LANE, SKY, type Kind, type World } from './world'

/*
 * The meadow the dinosaur lives in, and everything in it posed from a World. The title screen,
 * the round and the ending all draw through `meadow(...).draw`.
 */

/** Words that float up over the meadow: "Yum!", "Ouch!". */
export interface Pop {
  text: string
  x: number
  y: number
  z: number
  age: number
  color: number
  big: boolean
}

/**
 * The camera's framing: the whole path fits across the picture, the path sits a quarter of the
 * way up from the bottom (so a tall picture gains sky to fall from), and the camera drifts a
 * little after the dinosaur.
 */
export const shot = (aspect: number, dinoX: number): Shot => {
  const height = Math.max(102, 124 / aspect)
  return { at: new THREE.Vector3(dinoX * 0.1, height * 0.27, 0), turn: -7, tilt: 20, height }
}

const SKY_BLUE = 0x9fdcf5
const VOLCANO = { x: 80, z: -106, size: 0.62 }
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** The ground, plants, nest, pond, volcano and far hills; none of it moves. */
function scenery() {
  const g = new THREE.Group()
  const pond = (x: number, z: number) => x >= -100 && x <= -70 && z >= -70 && z <= -50
  for (let x = -195; x <= 195; x += TILE)
    for (let z = -175; z <= 145; z += TILE) {
      if (Math.abs(z) < TILE) {
        ground(g, 'sand', x, z)
        continue
      }
      if (pond(x, z)) {
        ground(g, 'water', x, z)
        continue
      }
      ground(g, (Math.round(x / TILE) + Math.round(z / TILE)) % 2 ? 'grass' : 'grassDark', x, z)
      const h = hash(x, z)
      if (h > 0.93 && Math.abs(z) > 14) flower(g, [C.flower, C.star, C.white][Math.floor(h * 300) % 3]).position.set(x + 2, 0, z - 2)
    }

  // the ends of the path, so the lane reads as a place
  for (const s of [-1, 1]) {
    fern(g, 1.3).position.set(s * (LANE + 16), 0, -2)
    bush(g).position.set(s * (LANE + 26), 0, 4)
    rock().position.set(s * (LANE + 12), 2.6, 7)
  }

  // the near edge: a few low plants at the corners, clear of the lane
  for (const [x, z, k] of [[-95, 28, 1.1], [-78, 36, 0.8], [92, 30, 1.2], [76, 40, 0.9], [-20, 44, 0.7], [34, 50, 0.8]]) fern(g, k).position.set(x, 0, z)

  // the back: palms, bushes, ferns, the nest and the pond's reeds
  const palms: [number, number, number, number][] = [
    [-112, -34, 1.1, -0.15], [-70, -48, 1.2, 0.1], [72, -46, 1, -0.12], [108, -34, 1.2, 0.1],
    [140, -62, 1, -0.1], [-150, -68, 1.1, 0.12],
  ]
  for (const [x, z, h, lean] of palms) palm(g, h, lean).position.set(x, 0, z)
  for (const [x, z] of [[-85, -26], [-6, -28], [42, -24], [86, -24], [126, -28], [-138, -30]]) bush(g).position.set(x, 0, z)
  for (const [x, z, k] of [[-40, -26, 1], [26, -56, 1.2], [-118, -54, 1], [120, -50, 1.1], [0, -44, 0.9]]) fern(g, k).position.set(x, 0, z)
  nest(g).position.set(-44, 0, -36)
  for (const [x, z] of [[-102, -48], [-68, -72], [-104, -66]]) {
    block(g, x - 0.4, 0, z - 0.4, x + 0.4, 7, z + 0.4, C.leafDark)
    block(g, x - 0.7, 7, z - 0.7, x + 0.7, 9.5, z + 0.7, C.trunk)
  }

  const peak = volcano(g)
  peak.position.set(VOLCANO.x, 0, VOLCANO.z)
  peak.scale.setScalar(VOLCANO.size)

  // a light wood at the sides, and only low plants behind the middle where the fruit falls
  for (let x = -190; x <= 190; x += 16)
    for (let z = -165; z <= -80; z += 16) {
      const h = hash(x * 0.37, z * 0.53)
      const jx = x + (hash(z, x) - 0.5) * 10
      const jz = z + (hash(x, x + z) - 0.5) * 10
      if (Math.hypot(jx - VOLCANO.x, (jz - VOLCANO.z) * 1.3) < 40 || pond(jx, jz)) continue
      const side = Math.abs(jx) > 70
      if (side && h < 0.28) palm(g, 0.75 + hash(jx, 7) * 0.5, (hash(jz, 3) - 0.5) * 0.3).position.set(jx, 0, jz)
      else if (h > 0.86) bush(g).position.set(jx, 0, jz)
      else if (h > 0.74) fern(g, 0.9 + hash(jx, jz) * 0.4).position.set(jx, 0, jz)
    }

  // low hills along the horizon
  for (let x = -230; x <= 230; x += 30) {
    const h = 1.5 + hash(x, 1) * 3.5
    block(g, x - 20, 0, -182, x + 20, h, -176, C.leafDark)
  }

  // draw each colour of block in one go
  g.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })
  const batched = instanceStaticMeshes(meshes)
  return batched
}

/** Blocky clouds that drift across the sky. */
function clouds(scene: THREE.Scene) {
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const shade = new THREE.MeshBasicMaterial({ color: 0xe8f4fb })
  const cube = new THREE.BoxGeometry(1, 1, 1)
  const list = [0, 1, 2, 3, 4, 5].map((i) => {
    const c = new THREE.Group()
    // a flat base with rounded lumps on top
    const base = new THREE.Mesh(cube, shade)
    const w = 22 + hash(i, 1) * 12
    base.scale.set(w, 3, 8)
    c.add(base)
    const n = 3 + (i % 2)
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(cube, white)
      const lw = 7 + hash(i, k) * 5
      m.scale.set(lw, 3 + hash(k, i) * 3, 7)
      m.position.set((k / (n - 1) - 0.5) * (w - lw), 2.5 + hash(i + k, 3) * 1.5, 0.5)
      c.add(m)
    }
    scene.add(c)
    return { c, x: -230 + i * 80, y: -24 + (i % 3) * 4, z: -260 - (i % 2) * 10 }
  })
  return (t: number) =>
    list.forEach((k) => {
      const x = ((k.x + t * 4 + 260) % 520) - 260
      k.c.position.set(x, k.y, k.z)
    })
}

/** Confetti that rains on the dinosaur when the round is won. */
function confetti(parent: THREE.Object3D) {
  const g = pivot(parent)
  const colors = [C.spike, 0x30ccd5, 0x5bcbf9, C.flower, C.star, C.white]
  const bits = Array.from({ length: 36 }, (_, i) => {
    const b = block(g, -0.8, -0.4, -0.8, 0.8, 0.4, 0.8, colors[i % colors.length])
    b.castShadow = false
    return { b, x: (hash(i, 9) - 0.5) * 70, z: (hash(9, i) - 0.5) * 30, speed: 14 + hash(i, i) * 16, phase: hash(i, 5) }
  })
  g.visible = false
  return (on: boolean, t: number, cx: number) => {
    g.visible = on
    if (!on) return
    for (const p of bits) {
      const q = (t * p.speed) / 70 + p.phase
      const y = 70 - (q % 1) * 70
      p.b.position.set(cx + p.x + Math.sin(t * 2 + p.phase * 9) * 3, y, p.z)
      p.b.rotation.set(t * 3 + p.phase * 6, t * 2, p.phase * 4)
    }
  }
}

export function meadow(scene: THREE.Scene) {
  scene.background = new THREE.Color(SKY_BLUE)
  scene.add(scenery())
  const steamRoot = pivot(scene, VOLCANO.x, 0, VOLCANO.z)
  steamRoot.scale.setScalar(VOLCANO.size)
  const steam = smoke(steamRoot)
  const drift = clouds(scene)

  const dino = dinosaur()
  scene.add(dino.root)
  const party = confetti(scene)

  const items = new Map<number, { root: THREE.Group; shape: THREE.Group; spot: THREE.Mesh; kind: Kind }>()
  const bursts = new Map<string, (q: number) => void>()
  const burstRoots = new Map<string, THREE.Group>()
  let face = 0.2
  let lastT = 0

  /** Poses everything as `w` is now; `clock` drives the idle motion. Returns the words to show. */
  const draw = (w: World, clock: number): Pop[] => {
    const dt = Math.min(0.1, Math.max(0, clock - lastT))
    lastT = clock
    steam(clock)
    drift(clock)

    // the dinosaur
    const d = w.dino
    const dizzy = w.t < d.dizzyUntil
    const mood: Mood = w.over === 'win' ? 'happy' : w.over === 'lose' ? 'sad' : dizzy ? 'dizzy' : d.vx !== 0 ? 'run' : 'idle'
    const want = w.over ? 0.15 : d.vx > 0 ? 1.0 : d.vx < 0 ? -1.0 : 0.2
    face += (want - face) * Math.min(1, dt * 10)
    dino.root.position.set(d.x, 0, 0)
    dino.root.rotation.y = face
    let look = 0
    for (const it of w.items)
      if (it.landed < 0 && it.kind !== 'rock' && Math.abs(it.x - d.x) < 14 && it.y < 60) look = Math.max(look, Math.min(1, (60 - it.y) / 30))
    poseDinosaur(dino, mood, clock, d.stride, chomp(w), look)
    // a flash while the dinosaur is safe after a rock
    dino.root.visible = !(w.t < d.safeUntil && !dizzy && Math.floor(w.t * 12) % 2 === 0)

    // fruit and rocks
    const alive = new Set<number>()
    for (const it of w.items) {
      alive.add(it.id)
      let rig = items.get(it.id)
      if (!rig) {
        const root = new THREE.Group()
        const shape = it.kind === 'rock' ? rock() : fruit(it.kind)
        shape.scale.setScalar(it.kind === 'rock' ? 1.25 : 1.35)
        root.add(shape)
        const spot = marker()
        scene.add(root, spot)
        rig = { root, shape, spot, kind: it.kind }
        items.set(it.id, rig)
      }
      rig.root.position.set(it.x, it.landed >= 0 ? 3 : it.y, 0)
      if (it.kind === 'rock') rig.shape.rotation.set(w.t * 2 + it.spin, it.spin, w.t * 1.3)
      else rig.shape.rotation.set(Math.sin(w.t * 3 + it.spin) * 0.25, w.t * 2.2 + it.spin, Math.sin(w.t * 2 + it.spin) * 0.2)
      if (it.landed >= 0) rig.shape.rotation.set(0, it.spin, 0.2)
      const near = 1 - it.y / SKY
      rig.spot.visible = it.landed < 0
      rig.spot.position.set(it.x, 0.08, 0)
      rig.spot.scale.setScalar(2 + 4 * near)
      ;(rig.spot.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.28 * near
      ;(rig.spot.material as THREE.MeshBasicMaterial).color.set(it.kind === 'rock' ? 0xa8304a : C.ink)
    }
    for (const [id, rig] of items)
      if (!alive.has(id)) {
        scene.remove(rig.root, rig.spot)
        rig.spot.geometry.dispose()
        ;(rig.spot.material as THREE.Material).dispose()
        items.delete(id)
      }

    // bursts and floating words for what just happened
    const pops: Pop[] = []
    const fresh = new Set<string>()
    for (const e of w.events) {
      const age = w.t - e.at
      const key = `${e.type}:${e.at}`
      fresh.add(key)
      let set = bursts.get(key)
      if (!set) {
        const root = new THREE.Group()
        scene.add(root)
        burstRoots.set(key, root)
        if (e.type === 'catch') {
          root.position.set(e.x, 16, 6)
          set = burst(root, JUICE[e.kind], 8, 5)
        } else if (e.type === 'splat') {
          root.position.set(e.x, 0, 0)
          set = burst(root, JUICE[e.kind], 10, 7)
        } else if (e.type === 'bonk') {
          root.position.set(e.x, 22, 0)
          set = burst(root, C.star, 8, 6)
        } else {
          root.position.set(e.x, 0, 0)
          set = burst(root, C.rockLight, 10, 8)
        }
        bursts.set(key, set)
      }
      set(age / 0.55)
      if (e.type === 'catch') pops.push({ text: 'Yum!', x: e.x, y: 30, z: 0, age, color: JUICE[e.kind as Fruit], big: e.score % 5 === 0 })
      if (e.type === 'bonk') pops.push({ text: 'Ouch!', x: e.x, y: 32, z: 0, age, color: 0xffffff, big: true })
    }
    for (const [key, root] of burstRoots)
      if (!fresh.has(key)) {
        scene.remove(root)
        burstRoots.delete(key)
        bursts.delete(key)
      }

    party(w.over === 'win', clock, d.x)
    return pops
  }

  return { draw }
}
