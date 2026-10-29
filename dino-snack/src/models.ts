import * as THREE from 'three'

/*
 * The dinosaur, the fruit, the rocks and the meadow, built from flat-coloured boxes.
 * Units are blocks: the dinosaur stands about 20 tall. Everything stands on y = 0 and faces +z,
 * towards the camera. Each rig is posed from numbers alone (`pose*`), so the title screen,
 * the round and the ending all draw the same way.
 */

export const C = {
  dino: 0x7ccf4f,
  dinoDark: 0x5fb23a,
  belly: 0xfff1c9,
  spike: 0xf3aa08,
  spikeDark: 0xd98f00,
  claw: 0xfff8e6,
  ink: 0x06213f,
  mouth: 0xa8304a,
  tongue: 0xff8fa3,
  blush: 0xff9fb2,
  star: 0xffd84a,
  apple: 0xe8443a,
  appleDark: 0xc1302a,
  banana: 0xffd93b,
  bananaDark: 0xe8b81f,
  berry: 0xf2425c,
  berryDark: 0xc92a45,
  grape: 0x8e5bd6,
  grapeDark: 0x7044b8,
  orange: 0xff9a1f,
  orangeDark: 0xe67d0a,
  leaf: 0x55b33b,
  leafDark: 0x3f962c,
  stem: 0x7a4a24,
  rock: 0x9097a3,
  rockDark: 0x6f7682,
  rockLight: 0xb4bac4,
  grass: 0xa8e063,
  grassDark: 0x98d455,
  grassSide: 0x7cb342,
  sand: 0xf3dea6,
  sandDark: 0xe6cb87,
  trunk: 0x9a6232,
  trunkDark: 0x7d4c24,
  fern: 0x3fa34d,
  fernDark: 0x2f8a3d,
  flower: 0xff6fa3,
  white: 0xffffff,
  egg: 0xfff3dc,
  eggSpot: 0x30ccd5,
  nest: 0xb07a3c,
  volcano: 0x8a6a5c,
  volcanoDark: 0x6e5246,
  lava: 0xff7a1a,
  lavaHot: 0xffc23a,
  smoke: 0xe9e4ef,
  water: 0x5bcbf9,
  waterDark: 0x3aa8dc,
} as const

export type Fruit = 'apple' | 'banana' | 'strawberry' | 'grapes' | 'orange'
export const FRUITS: Fruit[] = ['apple', 'banana', 'strawberry', 'grapes', 'orange']
/** The colour of a fruit's splash when it lands, and of its "+1". */
export const JUICE: Record<Fruit, number> = {
  apple: C.apple,
  banana: C.banana,
  strawberry: C.berry,
  grapes: C.grape,
  orange: C.orange,
}

// ---------------------------------------------------------------- blocks

const cube = new THREE.BoxGeometry(1, 1, 1)
const lambert = new Map<number, THREE.MeshLambertMaterial>()

/** One shared material per colour, so static blocks of a colour can be drawn together. */
export function paint(color: number) {
  let m = lambert.get(color)
  if (!m) lambert.set(color, (m = new THREE.MeshLambertMaterial({ color })))
  return m
}

/** A block from corner (x0, y0, z0) to corner (x1, y1, z1) inside `parent`. */
export function block(parent: THREE.Object3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number) {
  const mesh = new THREE.Mesh(cube, paint(color))
  mesh.scale.set(x1 - x0, y1 - y0, z1 - z0)
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

/** The same block mirrored on both sides of x = 0. */
function mirrored(parent: THREE.Object3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number) {
  return [block(parent, x0, y0, z0, x1, y1, z1, color), block(parent, -x1, y0, z0, -x0, y1, z1, color)]
}

/** An empty group at (x, y, z): the point a limb or a prop turns about. */
export function pivot(parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}

// ---------------------------------------------------------------- the dinosaur

export interface DinoRig {
  root: THREE.Group
  /** Everything above the feet; hops, squashes and leans move this. */
  body: THREE.Group
  head: THREE.Group
  jaw: THREE.Group
  eyes: THREE.Group
  tail: THREE.Group[]
  legs: THREE.Group[]
  arms: THREE.Group[]
  /** Stars that circle the head after a rock lands on it. */
  stars: THREE.Group
}

/** A small, round, green dinosaur with orange back plates, big eyes and a wide smile. */
export function dinosaur(): DinoRig {
  const root = new THREE.Group()
  const body = pivot(root)

  // two sturdy legs that swing at the hip, with cream toes
  const legs = [-1, 1].map((s) => {
    const leg = pivot(body, s * 2.8, 6, -0.5)
    block(leg, -1.8, -4.5, -1.9, 1.8, 0.5, 1.9, C.dino)
    block(leg, -2, -6, -2.1, 2, -4.5, 3.2, C.dinoDark)
    for (const x of [-1.2, 0, 1.2]) block(leg, x - 0.35, -6, 3.2, x + 0.35, -5.2, 3.8, C.claw)
    return leg
  })

  // the round body and its pale belly
  block(body, -4.6, 4.6, -5.5, 4.6, 13, 4.2, C.dino)
  block(body, -4, 13, -4.5, 4, 14, 2.5, C.dino)
  block(body, -3.4, 5.4, 4.2, 3.4, 12.2, 4.9, C.belly)
  for (const y of [7.2, 9.2, 11.2]) block(body, -3.4, y, 4.85, 3.4, y + 0.3, 5, C.sand)

  // tiny arms that wave
  const arms = [-1, 1].map((s) => {
    const arm = pivot(body, s * 4.5, 10.6, 2.6)
    block(arm, -0.8, -3.2, -0.8, 0.8, 0.4, 0.8, C.dino)
    block(arm, -0.6, -3.8, 0.2, 0.6, -3.2, 1.2, C.claw)
    return arm
  })

  // a tail in three pieces, each turning a little more than the one before
  const tail: THREE.Group[] = []
  let parent: THREE.Object3D = body
  const pieces: [number, number, number, number][] = [
    // half width, bottom, top, length
    [3.4, -2.6, 2.6, 5],
    [2.4, -1.8, 1.8, 4.5],
    [1.4, -1.1, 1.1, 4],
  ]
  pieces.forEach(([w, y0, y1, len], i) => {
    const joint = pivot(parent, 0, i === 0 ? 8 : 0, i === 0 ? -5.2 : -pieces[i - 1][3] + 0.3)
    block(joint, -w, y0, -len, w, y1, 0.3, i === 2 ? C.dinoDark : C.dino)
    block(joint, -0.7, y1, -len * 0.7, 0.7, y1 + 1.4 - i * 0.3, -len * 0.25, C.spike)
    tail.push(joint)
    parent = joint
  })

  // back plates, biggest in the middle
  const plates: [number, number, number][] = [
    [12.6, 1.2, 1.6],
    [13.4, -1.4, 2.4],
    [12.6, -4.2, 2],
  ]
  for (const [y, z, h] of plates) {
    block(body, -0.9, y, z - 1.1, 0.9, y + h, z + 1.1, C.spike)
    block(body, -0.9, y + h, z - 0.6, 0.9, y + h + 0.8, z + 0.6, C.spikeDark)
  }

  // the head, a little too big, on a short neck
  const head = pivot(body, 0, 12.5, 2.2)
  block(head, -4.3, -0.5, -3.4, 4.3, 7, 4.6, C.dino)
  block(head, -3.6, 0.6, 4.6, 3.6, 4.6, 8.6, C.dino)
  block(head, -1.8, 7, -2.2, 1.8, 8.2, 1.8, C.spike)
  // nostrils
  mirrored(head, 0.9, 3.6, 8.6, 1.7, 4.2, 8.75, C.dinoDark)
  // the inside of the mouth shows when the jaw drops
  block(head, -3.1, 0.2, 2.5, 3.1, 0.65, 8.2, C.mouth)
  // two little teeth
  mirrored(head, 1.3, -0.1, 7.9, 2, 0.6, 8.4, C.white)
  // the lower jaw, hinged near the back of the head
  const jaw = pivot(head, 0, 0.6, 2.4)
  block(jaw, -3.4, -1.9, 0, 3.4, -0.2, 6.2, C.dino)
  block(jaw, -2.6, -0.4, 0.6, 2.6, -0.15, 5.4, C.tongue)
  // a smile line along the jaw
  block(head, -3.65, 0.45, 4.6, 3.65, 0.75, 8.62, C.dinoDark)
  // pink cheeks
  mirrored(head, 3.3, 1.4, 3.4, 4.35, 2.6, 5, C.blush)

  // big round eyes, which blink by squashing this group
  const eyes = pivot(head, 0, 4.4, 4.6)
  mirrored(eyes, 1.1, -1.5, 0, 3.7, 1.7, 0.35, C.white)
  mirrored(eyes, 1.8, -1.2, 0.35, 3.3, 0.9, 0.6, C.ink)
  mirrored(eyes, 2.5, 0.1, 0.6, 3.05, 0.65, 0.7, C.white)

  // stars, hidden until a rock lands on the dinosaur
  const stars = pivot(head, 0, 10, 0.5)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const s = block(stars, -0.8, -0.8, -0.8, 0.8, 0.8, 0.8, C.star)
    s.castShadow = false
    s.position.set(Math.cos(a) * 5.5, 0, Math.sin(a) * 5.5)
  }
  stars.visible = false

  return { root, body, head, jaw, eyes, tail, legs, arms, stars }
}

export type Mood = 'idle' | 'run' | 'dizzy' | 'happy' | 'sad'

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))

/**
 * Poses the dinosaur. `t` is the animation clock in seconds, `stride` how far it has run,
 * `chomp` 0..1 through a bite, `look` 0..1 how far it looks up at something falling.
 */
export function poseDinosaur(d: DinoRig, mood: Mood, t: number, stride: number, chomp: number, look: number) {
  const { body, head, jaw, eyes, tail, legs, arms, stars } = d
  body.position.set(0, 0, 0)
  body.rotation.set(0, 0, 0)
  body.scale.set(1, 1, 1)
  head.rotation.set(0, 0, 0)
  legs.forEach((l) => l.rotation.set(0, 0, 0))
  arms.forEach((a) => a.rotation.set(0, 0, 0))
  stars.visible = false
  eyes.scale.set(1, 1, 1)

  // a blink every few seconds, so stillness never looks dead
  if ((t % 3.4) / 3.4 > 0.965) eyes.scale.y = 0.12

  const sway = (speed: number, amount: number) =>
    tail.forEach((p, i) => {
      p.rotation.y = Math.sin(t * speed - i * 0.7) * amount
      p.rotation.x = -0.05 * i
    })

  if (mood === 'run') {
    const s = Math.sin(stride * 0.32)
    legs[0].rotation.x = s * 0.75
    legs[1].rotation.x = -s * 0.75
    arms[0].rotation.x = -s * 0.6
    arms[1].rotation.x = s * 0.6
    body.position.y = Math.abs(Math.cos(stride * 0.32)) * 1.1
    body.rotation.x = 0.08
    sway(14, 0.22)
  } else if (mood === 'dizzy') {
    // squashed flat by the rock, then wobbling back up
    body.scale.set(1.12, 0.84, 1.12)
    body.rotation.z = Math.sin(t * 9) * 0.08
    head.rotation.z = Math.sin(t * 7) * 0.15
    eyes.scale.y = 0.2
    stars.visible = true
    stars.rotation.y = t * 5
    sway(4, 0.1)
  } else if (mood === 'happy') {
    // hops up and down with both arms in the air
    const hop = Math.abs(Math.sin(t * 6))
    body.position.y = hop * 5
    body.scale.set(1 - 0.06 * (1 - hop), 1 + 0.08 * hop, 1 - 0.06 * (1 - hop))
    arms.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * (2.4 + Math.sin(t * 12) * 0.25)))
    arms.forEach((a) => (a.rotation.x = -0.4))
    legs.forEach((l) => (l.rotation.x = -0.3 * hop))
    head.rotation.x = -0.25
    jaw.rotation.x = 0.35
    sway(10, 0.35)
    return
  } else if (mood === 'sad') {
    body.position.y = -1.2
    body.rotation.x = 0.12
    head.rotation.x = 0.35
    eyes.scale.y = 0.45
    stars.visible = true
    stars.rotation.y = t * 2
    sway(1.5, 0.08)
  } else {
    // idle: a slow breath and a lazy tail
    body.scale.y = 1 + Math.sin(t * 2.4) * 0.02
    arms.forEach((a, i) => (a.rotation.x = Math.sin(t * 2.4 + i) * 0.1))
    sway(2.2, 0.18)
  }

  // looking up at what is falling, then the bite
  head.rotation.x += -0.35 * clamp(look)
  const bite = chomp > 0 && chomp < 1 ? Math.sin(chomp * Math.PI) : 0
  jaw.rotation.x = 0.7 * bite + (mood === 'run' ? 0.08 : 0.04)
  if (bite > 0) head.rotation.x -= 0.2 * bite
}

// ---------------------------------------------------------------- fruit and rocks

/** One falling fruit, centred on its middle. */
export function fruit(kind: Fruit) {
  const g = new THREE.Group()
  if (kind === 'apple') {
    block(g, -2.6, -2.4, -2.6, 2.6, 2, 2.6, C.apple)
    block(g, -2, 2, -2, 2, 2.6, 2, C.apple)
    block(g, -2.6, -2.4, -2.6, 2.6, -1.8, 2.6, C.appleDark)
    block(g, -0.3, 2.4, -0.3, 0.3, 4, 0.3, C.stem)
    block(g, 0.3, 3, -0.4, 2.2, 3.6, 0.4, C.leaf)
    block(g, -1.8, 0.2, 2.6, -0.9, 1.3, 2.75, C.white)
  } else if (kind === 'banana') {
    // a curved bunch of blocks, ends turned up
    block(g, -1.5, -1.3, -1.1, 1.5, 0.9, 1.1, C.banana)
    block(g, 1.3, -0.8, -1, 3.3, 1.4, 1, C.banana)
    block(g, -3.3, -0.8, -1, -1.3, 1.4, 1, C.banana)
    block(g, 3, 1, -0.8, 4.4, 3, 0.8, C.bananaDark)
    block(g, -4.4, 1, -0.8, -3, 3, 0.8, C.bananaDark)
    block(g, 3.5, 3, -0.4, 4.3, 3.8, 0.4, C.stem)
    block(g, -4.3, 3, -0.4, -3.5, 3.6, 0.4, C.stem)
  } else if (kind === 'strawberry') {
    block(g, -2.6, -0.6, -2.4, 2.6, 2.2, 2.4, C.berry)
    block(g, -2, -2.4, -1.9, 2, -0.6, 1.9, C.berry)
    block(g, -1.1, -3.6, -1, 1.1, -2.4, 1, C.berryDark)
    for (const [x, y] of [[-1.4, 1], [0.4, 1.4], [1.6, 0.2], [-0.6, -0.4], [0.9, -1.6], [-1.3, -1.4]])
      block(g, x - 0.25, y - 0.3, 2.3, x + 0.25, y + 0.3, 2.55, C.star)
    block(g, -2.2, 2.2, -2.2, 2.2, 2.8, 2.2, C.leaf)
    block(g, -0.3, 2.8, -0.3, 0.3, 3.8, 0.3, C.leafDark)
  } else if (kind === 'grapes') {
    const at: [number, number, number][] = [
      [-1.6, 1.4, 0], [0, 1.6, 0], [1.6, 1.4, 0],
      [-0.8, -0.2, 0.6], [0.8, -0.2, 0.6], [0, -1.8, 0.3],
      [-0.8, 0, -1], [0.8, 0, -1],
    ]
    for (const [x, y, z] of at) block(g, x - 1.1, y - 1.1, z - 1.1, x + 1.1, y + 1.1, z + 1.1, y > 1 ? C.grape : C.grapeDark)
    block(g, -0.3, 2.6, -0.3, 0.3, 4, 0.3, C.stem)
    block(g, 0.3, 3.2, -0.3, 2.2, 3.8, 0.3, C.leaf)
  } else {
    block(g, -2.5, -2.5, -2.5, 2.5, 2.5, 2.5, C.orange)
    block(g, -2.1, -2.9, -2.1, 2.1, 2.9, 2.1, C.orange)
    block(g, -2.5, -2.5, -2.5, 2.5, -1.9, 2.5, C.orangeDark)
    block(g, -0.4, 2.9, -0.4, 0.4, 3.4, 0.4, C.stem)
    block(g, 0.4, 2.9, -0.4, 2.4, 3.5, 0.4, C.leaf)
    block(g, -1.6, 0.6, 2.5, -0.8, 1.4, 2.65, C.white)
  }
  return g
}

/** A grey rock with a cracked, lumpy face. */
export function rock() {
  const g = new THREE.Group()
  block(g, -3, -2.6, -2.8, 3, 2.4, 2.8, C.rock)
  block(g, -2.4, 2.4, -2, 2.2, 3.4, 2, C.rockLight)
  block(g, -3.6, -1.6, -1.8, -3, 1.4, 1.6, C.rockDark)
  block(g, 3, -1.8, -1.2, 3.7, 1, 1.8, C.rockDark)
  block(g, -2.6, -3.3, -2.2, 2.4, -2.6, 2.2, C.rockDark)
  // a crack across the front
  block(g, -1.6, 0.4, 2.8, 0.2, 0.8, 2.95, C.rockDark)
  block(g, 0, -0.6, 2.8, 0.4, 0.6, 2.95, C.rockDark)
  block(g, 0.2, -1, 2.8, 1.6, -0.6, 2.95, C.rockDark)
  return g
}

/** A flat dark disc on the ground that shows where something is about to land. */
export function marker() {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(1, 20),
    new THREE.MeshBasicMaterial({ color: C.ink, transparent: true, opacity: 0.25, depthWrite: false }),
  )
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.08
  m.renderOrder = 1
  return m
}

/** A burst of blocks, posed by `q` from 0 (start) to 1 (gone). */
export function burst(parent: THREE.Object3D, color: number, count = 9, reach = 6) {
  const g = pivot(parent)
  const bits = Array.from({ length: count }, (_, i) => {
    const b = block(g, -0.7, -0.7, -0.7, 0.7, 0.7, 0.7, color)
    b.castShadow = false
    return { b, a: (i / count) * Math.PI * 2, up: 3 + ((i * 37) % 5) }
  })
  g.visible = false
  return (q: number) => {
    g.visible = q > 0 && q < 1
    const k = Math.sqrt(clamp(q))
    for (const { b, a, up } of bits) {
      b.position.set(Math.cos(a) * reach * k, up * Math.sin(Math.PI * clamp(q)) + 1, Math.sin(a) * reach * k * 0.6)
      b.scale.setScalar(1.5 * (1 - clamp(q)) + 0.01)
    }
  }
}

// ---------------------------------------------------------------- the meadow

export const TILE = 10

export type Ground = 'grass' | 'grassDark' | 'sand' | 'water'
const GROUND: Record<Ground, [number, number]> = {
  grass: [C.grass, C.grassSide],
  grassDark: [C.grassDark, C.grassSide],
  sand: [C.sand, C.sandDark],
  water: [C.water, C.waterDark],
}

/** A square of ground with its top at y = 0; water sits a little lower. */
export function ground(parent: THREE.Object3D, kind: Ground, x: number, z: number) {
  const [top, side] = GROUND[kind]
  const g = pivot(parent, x, 0, z)
  const surface = kind === 'water' ? -1 : 0
  block(g, -TILE / 2, -4, -TILE / 2, TILE / 2, surface - 0.5, TILE / 2, side)
  block(g, -TILE / 2, surface - 0.5, -TILE / 2, TILE / 2, surface, TILE / 2, top)
  return g
}

/** A palm tree: a leaning, ringed trunk and drooping fronds. */
export function palm(parent: THREE.Object3D, height = 1, lean = 0.12) {
  const g = pivot(parent)
  const trunk = pivot(g)
  trunk.rotation.z = lean
  const rings = Math.round(5 + 3 * height)
  for (let i = 0; i < rings; i++) block(trunk, -1.3, i * 3, -1.3, 1.3, i * 3 + 3, 1.3, i % 2 ? C.trunk : C.trunkDark)
  const top = pivot(trunk, 0, rings * 3, 0)
  block(top, -1.6, -0.5, -1.6, 1.6, 1.2, 1.6, C.leafDark)
  for (let i = 0; i < 5; i++) {
    const frond = pivot(top, 0, 0.6, 0)
    frond.rotation.y = (i / 5) * Math.PI * 2 + 0.4
    block(frond, -1.2, -0.5, 0, 1.2, 0.5, 5, C.leaf)
    block(frond, -1, -2, 4.5, 1, -0.6, 8.5, C.leaf)
    block(frond, -0.7, -3.4, 8, 0.7, -2, 10, C.leafDark)
  }
  // two coconuts
  block(top, -2.2, -2.4, 0.4, -0.6, -0.8, 2, C.trunkDark)
  block(top, 0.4, -2.6, 0.6, 2, -1, 2.2, C.trunkDark)
  return g
}

/** A low fern of fanned leaves. */
export function fern(parent: THREE.Object3D, size = 1) {
  const g = pivot(parent)
  g.scale.setScalar(size)
  for (let i = 0; i < 6; i++) {
    const leaf = pivot(g)
    leaf.rotation.y = (i / 6) * Math.PI * 2
    leaf.rotation.x = -0.5
    block(leaf, -0.9, 0, 0, 0.9, 0.8, 5.5, i % 2 ? C.fern : C.fernDark)
    block(leaf, -0.6, 0.4, 5.5, 0.6, 1, 7, C.fern)
  }
  block(g, -1.2, 0, -1.2, 1.2, 1.6, 1.2, C.fernDark)
  return g
}

/** A round bush with a few berries. */
export function bush(parent: THREE.Object3D) {
  const g = pivot(parent)
  block(g, -4, 0, -3, 4, 4, 3, C.leafDark)
  block(g, -3, 4, -2.2, 3, 5.6, 2.2, C.leaf)
  for (const [x, y] of [[-2.4, 2.6], [1.2, 3.4], [2.6, 1.4]]) block(g, x - 0.5, y - 0.5, 3, x + 0.5, y + 0.5, 3.3, C.berry)
  return g
}

/** A flower on a stalk. */
export function flower(parent: THREE.Object3D, color: number = C.flower) {
  const g = pivot(parent)
  block(g, -0.25, 0, -0.25, 0.25, 2.6, 0.25, C.leafDark)
  block(g, -1.1, 2.6, -1.1, 1.1, 3.4, 1.1, color)
  block(g, -0.45, 3.4, -0.45, 0.45, 3.7, 0.45, C.star)
  return g
}

/** A nest of three spotted eggs. */
export function nest(parent: THREE.Object3D) {
  const g = pivot(parent)
  block(g, -5, 0, -4, 5, 1.6, 4, C.nest)
  block(g, -4.2, 1.6, -3.2, 4.2, 2.4, 3.2, C.trunk)
  for (const [x, z, h] of [[-2, -0.6, 5], [1.8, -1, 4.4], [0, 1.4, 4.8]]) {
    block(g, x - 1.5, 1.4, z - 1.4, x + 1.5, 1.4 + h, z + 1.4, C.egg)
    block(g, x - 1.55, 1.4 + h * 0.55, z + 0.2, x - 0.6, 1.4 + h * 0.75, z + 1.45, C.eggSpot)
  }
  return g
}

/** A volcano: a lumpy cone with a glowing crater and lava running down; `smoke` is posed separately. */
export function volcano(parent: THREE.Object3D) {
  const g = pivot(parent)
  // many thin tiers, each nudged off centre, so the cone reads as rough rock, not steps
  const tiers: [number, number, number, number][] = Array.from({ length: 11 }, (_, i) => {
    const w = 34 - i * 2.2
    return [w, 3, Math.sin(i * 2.1) * 1.2, Math.cos(i * 1.7) * 0.8]
  })
  let y = 0
  tiers.forEach(([w, h, sx, sz], i) => {
    block(g, -w + sx, y, -w * 0.75 + sz, w + sx, y + h, w * 0.75 + sz, i < 3 ? C.volcanoDark : C.volcano)
    y += h
  })
  // the crater rim and the lava inside it
  block(g, -11, y, -8.5, 11, y + 1.5, 8.5, C.volcanoDark)
  block(g, -7.5, y + 0.4, -5.5, 7.5, y + 1.7, 5.5, C.lava)
  block(g, -4.5, y + 1.7, -3, 4.5, y + 2.2, 3, C.lavaHot)
  // two lava streams that run over each tier's top and down its front, so they read unbroken
  const fronts = tiers.map(([w, , , sz]) => w * 0.75 + sz)
  const bottoms = tiers.map((_, k) => tiers.slice(0, k).reduce((sum, t) => sum + t[1], 0))
  const stream = (x: number, from: number, w: number) => {
    for (let k = from; k >= 0; k--) {
      const [, h, sx] = tiers[k]
      // down the front of tier k
      block(g, x + sx - w / 2, bottoms[k], fronts[k] - 0.1, x + sx + w / 2, bottoms[k] + h + 0.3, fronts[k] + 0.4, C.lava)
      // across the top of the tier below, out to its front
      if (k > 0) {
        const below = tiers[k - 1][2]
        block(g, x + below - w / 2, bottoms[k], fronts[k] - 0.1, x + below + w / 2, bottoms[k] + 0.3, fronts[k - 1] + 0.1, C.lava)
      }
    }
  }
  stream(-3, tiers.length - 1, 5)
  stream(7, tiers.length - 3, 3.6)
  // a few boulders at the foot
  for (const [x, z, s] of [[-30, 26, 3], [24, 27, 2.4], [-14, 28, 2]]) block(g, x - s, 0, z - s, x + s, s * 1.3, z + s, C.volcanoDark)
  return g
}

/** Puffs of smoke rising from the volcano, looping on the clock. */
export function smoke(parent: THREE.Object3D) {
  const g = pivot(parent)
  const puffs = Array.from({ length: 5 }, () => {
    const b = block(g, -2, -2, -2, 2, 2, 2, C.smoke)
    b.castShadow = false
    return b
  })
  return (t: number) =>
    puffs.forEach((b, i) => {
      const q = (t * 0.18 + i / puffs.length) % 1
      b.position.set(Math.sin(q * 5 + i) * 3 + q * 10, 36 + q * 34, 0)
      b.scale.setScalar(1 + q * 2.4)
      b.rotation.set(q * 2, q * 3, 0)
    })
}
