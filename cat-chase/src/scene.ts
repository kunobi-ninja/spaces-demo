import * as THREE from 'three'

/* The house: 36 by 24 units, centred on the origin. */
export const BOUNDS = { x0: -18, x1: 18, z0: -12, z1: 12 }

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/* Shared by every cat and fish; small enough to keep for the page's life. */
const GEO = {
  ball: new THREE.SphereGeometry(0.5, 24, 16),
  ear: new THREE.ConeGeometry(0.13, 0.3, 4),
  leg: new THREE.CylinderGeometry(0.08, 0.07, 0.36, 10),
  tail: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v(0, 0, 0), v(0, 0.25, -0.22), v(0, 0.55, -0.28), v(0, 0.78, -0.12)]), 20, 0.065, 8),
  fin: new THREE.ConeGeometry(0.16, 0.22, 3),
  ring: new THREE.RingGeometry(0.42, 0.52, 40),
}

const shade = (m: THREE.Object3D) => m.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : null))

function part(geo: THREE.BufferGeometry, mat: THREE.Material, [x, y, z]: number[], scale?: number[]) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  if (scale) m.scale.set(scale[0], scale[1], scale[2])
  return m
}

export interface Cat {
  root: THREE.Group
  body: THREE.Group
  legs: THREE.Group[]
  tail: THREE.Group
  dispose: () => void
}

/** A round little cat facing +z, about 1.4 units tall. */
export function makeCat(color: string): Cat {
  const fur = new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  const cream = new THREE.MeshStandardMaterial({ color: '#fffaf2', roughness: 0.9 })
  const dark = new THREE.MeshStandardMaterial({ color: '#1b1b22', roughness: 0.35 })
  const pink = new THREE.MeshStandardMaterial({ color: '#ff9db4', roughness: 0.6 })

  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  body.add(part(GEO.ball, fur, [0, 0.62, 0], [0.74, 0.62, 1.06]))
  body.add(part(GEO.ball, cream, [0, 0.56, 0.36], [0.46, 0.44, 0.4]))

  const head = new THREE.Group()
  head.position.set(0, 1.04, 0.5)
  body.add(head)
  head.add(part(GEO.ball, fur, [0, 0, 0], [0.74, 0.7, 0.7]))
  head.add(part(GEO.ball, cream, [0, -0.09, 0.27], [0.34, 0.24, 0.2]))
  for (const s of [-1, 1]) {
    const ear = part(GEO.ear, fur, [s * 0.2, 0.3, -0.02])
    ear.rotation.set(0, Math.PI / 4, -s * 0.28)
    head.add(ear)
    const inner = part(GEO.ear, pink, [s * 0.2, 0.27, 0.03], [0.55, 0.6, 0.55])
    inner.rotation.copy(ear.rotation)
    head.add(inner)
    head.add(part(GEO.ball, dark, [s * 0.13, 0.04, 0.29], [0.11, 0.13, 0.08]))
  }
  head.add(part(GEO.ball, pink, [0, -0.04, 0.37], [0.08, 0.06, 0.06]))

  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const g = new THREE.Group()
    g.position.set(sx * 0.21, 0.38, sz * 0.32)
    g.add(part(GEO.leg, fur, [0, -0.19, 0]))
    g.add(part(GEO.ball, cream, [0, -0.36, 0.02], [0.18, 0.08, 0.2]))
    root.add(g)
    return g
  })

  const tail = new THREE.Group()
  tail.position.set(0, 0.62, -0.5)
  tail.add(new THREE.Mesh(GEO.tail, fur))
  body.add(tail)

  shade(root)
  return { root, body, legs, tail, dispose: () => [fur, cream, dark, pink].forEach((m) => m.dispose()) }
}

/** A fish to catch, and the ring on the floor that marks where it is. */
export function makeFish() {
  const blue = new THREE.MeshStandardMaterial({ color: '#5bcbf9', roughness: 0.25, metalness: 0.1 })
  const sun = new THREE.MeshStandardMaterial({ color: '#f3aa08', roughness: 0.4 })
  const fish = new THREE.Group()
  fish.add(part(GEO.ball, blue, [0, 0, 0], [0.62, 0.36, 0.2]))
  const fin = part(GEO.fin, sun, [-0.38, 0, 0])
  fin.rotation.z = Math.PI / 2
  fish.add(fin)
  fish.add(part(GEO.ball, new THREE.MeshStandardMaterial({ color: '#06213f' }), [0.17, 0.05, 0.08], [0.06, 0.06, 0.04]))
  shade(fish)
  const ring = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: '#f3aa08', transparent: true, opacity: 0.7 }))
  ring.rotation.x = -Math.PI / 2
  return { fish, ring }
}


/* A box on the floor that cats and balls cannot pass: [x0, z0, x1, z1]. */
export type Block = [number, number, number, number]
export interface Area { x0: number; z0: number; x1: number; z1: number; floor: string; name: string }

/* Rooms, for floors, the minimap and where fish may appear. */
export const AREAS: Area[] = [
  { name: 'kitchen', x0: -18, z0: -12, x1: -2, z1: 0, floor: '#e8e4da' },
  { name: 'living', x0: -18, z0: 0, x1: -2, z1: 12, floor: '#e9cfa6' },
  { name: 'hall', x0: -2, z0: -12, x1: 4, z1: 12, floor: '#d8b98f' },
  { name: 'bedroom', x0: 4, z0: -12, x1: 18, z1: 0, floor: '#f4dfe0' },
  { name: 'garden', x0: 4, z0: 0, x1: 18, z1: 12, floor: '#9fd36b' },
]

const T = 0.3
/** A straight wall from `a` to `b` along x (at z = at) or z (at x = at), with gaps for doors. */
function wall(axis: 'x' | 'z', at: number, a: number, b: number, doors: number[] = [], gap = 3): Block[] {
  const cuts = [a, ...doors.flatMap((d) => [d - gap / 2, d + gap / 2]), b]
  const out: Block[] = []
  for (let i = 0; i < cuts.length; i += 2) {
    const [s, e] = [cuts[i], cuts[i + 1]]
    out.push(axis === 'x' ? [s, at - T / 2, e, at + T / 2] : [at - T / 2, s, at + T / 2, e])
  }
  return out
}

export const WALLS: Block[] = [
  ...wall('x', -12, -18, 18),
  ...wall('x', 12, -18, 4),
  ...wall('z', -18, -12, 12),
  ...wall('z', -2, -12, 12, [-6, 6]),
  ...wall('x', 0, -18, -2, [-10]),
  ...wall('z', 4, -12, 12, [-6, 6]),
]
export const FENCE: Block[] = [...wall('x', 12, 4, 18), ...wall('z', 18, -12, 12), ...wall('x', 0, 4, 18, [11])]

interface Piece { at: Block; h: number; color: string; y?: number; solid?: boolean }
const PIECES: Piece[] = [
  // Kitchen
  { at: [-17.8, -11.8, -6, -10.6], h: 0.95, color: '#ffffff' },
  { at: [-17.8, -11.8, -6, -10.6], h: 0.06, y: 0.95, color: '#9aa9bb', solid: false },
  { at: [-17.8, -9.6, -16.4, -8], h: 2.1, color: '#dfe7ef' },
  { at: [-12.2, -6.4, -7.8, -3.6], h: 0.78, color: '#c98b52' },
  // Living room
  { at: [-17.8, 3, -16.4, 9], h: 0.55, color: '#0984c8' },
  { at: [-17.8, 3, -17.4, 9], h: 1.05, color: '#0874b0', solid: false },
  { at: [-15, 0.2, -11.5, 0.8], h: 0.6, color: '#3c3a46' },
  { at: [-14.3, 0.35, -12.2, 0.55], h: 0.9, y: 0.6, color: '#111318', solid: false },
  { at: [-11.6, 5.2, -9.6, 6.8], h: 0.45, color: '#f3aa08' },
  // Hall
  { at: [3.1, -2, 3.8, 2], h: 0.5, color: '#8a5a3c' },
  // Bedroom
  { at: [12, -11.8, 17.8, -7], h: 0.55, color: '#5bcbf9' },
  { at: [12, -11.8, 17.8, -11], h: 1.1, color: '#e6eef7', solid: false },
  { at: [4.4, -11.8, 6.4, -10.6], h: 2.2, color: '#b88a63' },
  { at: [15.2, -3.2, 17.8, -0.6], h: 0.75, color: '#ffffff' },
  // Garden
  { at: [12.6, 5.6, 13.4, 6.4], h: 1.6, color: '#8a5a3c' },
  { at: [6.8, 7.8, 9.2, 10.2], h: 0.04, color: '#5bcbf9' },
]
export const BLOCKS: Block[] = [...WALLS, ...FENCE, ...PIECES.filter((p) => p.solid !== false).map((p) => p.at)]

/** True when a circle of radius `r` at (x, z) overlaps a wall, the furniture or the edge. */
export function blocked(x: number, z: number, r: number) {
  if (x < BOUNDS.x0 + r || x > BOUNDS.x1 - r || z < BOUNDS.z0 + r || z > BOUNDS.z1 - r) return true
  for (const [x0, z0, x1, z1] of BLOCKS) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true
  return false
}

function tiles() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#f2efe8'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#dcd6ca'
  g.fillRect(0, 0, 32, 32)
  g.fillRect(32, 32, 32, 32)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(8, 6)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** The whole house, its lights, and a sun that can follow the camera. */
export function makeHouse(scene: THREE.Scene) {
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
  const box = ([x0, z0, x1, z1]: Block, h: number, m: THREE.Material, y = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), m)
    b.position.set((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2)
    return b
  }
  const house = new THREE.Group()
  const ground = box([-60, -50, 60, 50], 0.2, mat('#cfe9a8'), -0.31)
  house.add(ground)
  for (const a of AREAS) {
    const m = a.name === 'kitchen' ? new THREE.MeshStandardMaterial({ map: tiles(), roughness: 0.6 }) : mat(a.floor)
    house.add(box([a.x0, a.z0, a.x1, a.z1], 0.2, m, -0.2))
  }
  const rug = (x: number, z: number, r: number, color: string, y = 0.015) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 48), mat(color))
    c.position.set(x, y, z)
    house.add(c)
  }
  rug(-10, 6, 2.8, '#5bcbf9')
  rug(-10, 6, 2, '#30ccd5', 0.03)
  rug(11, -5, 2.4, '#f7b7c3')
  house.add(box([-0.2, -10, 2.2, 10], 0.03, mat('#b5523b')))

  const wallMat = mat('#f7e6cf')
  for (const w of WALLS) house.add(box(w, 1.2, wallMat))
  const fenceMat = mat('#c08a5a')
  for (const f of FENCE) house.add(box(f, 0.7, fenceMat))
  for (const p of PIECES) house.add(box(p.at, p.h, mat(p.color), p.y ?? 0))

  // Plants, a tree, flowers and a cat bed.
  const ball = (x: number, y: number, z: number, r: number, color: string) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat(color))
    s.position.set(x, y, z)
    house.add(s)
  }
  ball(13, 2.4, 6, 1.5, '#3ea86b')
  ball(12.2, 2.0, 6.6, 1.0, '#4cbf7a')
  ball(-17, 0.7, 11, 0.6, '#3ea86b')
  for (let i = 0; i < 9; i++) ball(5 + i * 1.4, 0.35, 11.3, 0.45, i % 2 ? '#3ea86b' : '#57c27f')
  for (let i = 0; i < 7; i++) ball(17.2, 0.25, 1.5 + i * 1.3, 0.25, ['#f72585', '#f3aa08', '#ffffff'][i % 3])
  const bed = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.28, 14, 32), mat('#ff7a59'))
  bed.rotation.x = -Math.PI / 2
  bed.position.set(-4.5, 0.22, 10.5)
  house.add(bed)

  shade(house)
  scene.add(house)

  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xd9c29c, 1.5))
  scene.add(new THREE.AmbientLight(0xffffff, 0.25))
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.03
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 })
  scene.add(sun, sun.target)
  /** Keeps the sun's shadow box around the point the camera looks at. */
  const follow = (x: number, z: number) => {
    sun.target.position.set(x, 0, z)
    sun.position.set(x - 6, 14, z + 8)
  }
  follow(0, 0)
  return { follow }
}

/** A ball of wool, with a few loose strands. */
export function makeYarn(color: string) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
  const g = new THREE.Group()
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), m))
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.025, 6, 32), m)
    t.rotation.set(i * 1.1, i * 0.7, 0)
    g.add(t)
  }
  shade(g)
  return g
}
