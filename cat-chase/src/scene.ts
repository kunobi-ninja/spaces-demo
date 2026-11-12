import * as THREE from 'three'

/* Where a cat may walk: the floor in front of the furniture. */
export const BOUNDS = { x0: -5.4, x1: 5.4, z0: -3.0, z1: 3.6 }

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

/** A warm living room: floor, rug, two walls, a sofa, a plant and a cat bed. */
export function makeRoom(scene: THREE.Scene) {
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
  const box = (w: number, h: number, d: number, color: string, at: number[]) => part(new THREE.BoxGeometry(w, h, d), mat(color), at)
  const room = new THREE.Group()

  room.add(box(15, 0.2, 10.5, '#e9cfa6', [0, -0.1, 0]))
  const rug = part(new THREE.CylinderGeometry(2.7, 2.7, 0.03, 56), mat('#5bcbf9'), [0, 0.015, 0.3])
  const rugIn = part(new THREE.CylinderGeometry(1.9, 1.9, 0.035, 56), mat('#30ccd5'), [0, 0.02, 0.3])
  room.add(rug, rugIn)
  room.add(box(15, 4.2, 0.2, '#f7e6cf', [0, 2, -5.1]))
  room.add(box(0.2, 4.2, 10.5, '#f2dcc0', [-7.4, 2, 0]))
  room.add(box(3.2, 1.9, 0.06, '#ffffff', [2.6, 2.4, -4.98]))
  room.add(box(2.9, 1.6, 0.08, '#bfe9fb', [2.6, 2.4, -4.95]))

  // Sofa
  room.add(box(3.6, 0.55, 1.25, '#0984c8', [-3, 0.3, -4.25]))
  room.add(box(3.6, 0.95, 0.38, '#0984c8', [-3, 0.8, -4.75]))
  for (const s of [-1, 1]) room.add(box(0.36, 0.8, 1.25, '#0874b0', [-3 + s * 1.8, 0.42, -4.25]))
  room.add(box(1.1, 0.45, 0.25, '#f3aa08', [-3.8, 0.85, -4.45]))

  // Plant
  room.add(part(new THREE.CylinderGeometry(0.42, 0.32, 0.7, 20), mat('#f3aa08'), [6.1, 0.35, -4.3]))
  for (const [x, y, z, r] of [[6.1, 1.2, -4.3, 0.6], [5.75, 1.6, -4.15, 0.42], [6.4, 1.7, -4.4, 0.45], [6.05, 2.05, -4.3, 0.36]]) {
    room.add(part(new THREE.SphereGeometry(r, 18, 12), mat('#3ea86b'), [x, y, z]))
  }

  // Cat bed and a ball of wool
  const bed = part(new THREE.TorusGeometry(0.75, 0.28, 14, 32), mat('#ff7a59'), [-6.3, 0.22, 3.1])
  bed.rotation.x = -Math.PI / 2
  room.add(bed, part(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 32), mat('#ffd9c9'), [-6.3, 0.08, 3.1]))
  room.add(part(new THREE.SphereGeometry(0.28, 20, 14), mat('#e5484d'), [6.2, 0.28, 2.8]))

  shade(room)
  room.traverse((o) => (o.castShadow = false))
  rug.receiveShadow = rugIn.receiveShadow = true
  scene.add(room)

  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xe0c49c, 1.5))
  scene.add(new THREE.AmbientLight(0xffffff, 0.25))
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.1)
  sun.position.set(-5, 11, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.03
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 })
  scene.add(sun)
}
