import * as THREE from 'three'

/*
 * A sunny afternoon: a flat orthographic camera looking down on the meadow, a warm sun from
 * the upper left, a blue sky light from above and soft, pale shadows.
 */

export function makeRenderer(canvas: HTMLCanvasElement) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true })
  gl.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1))
  gl.outputColorSpace = THREE.SRGBColorSpace
  gl.shadowMap.enabled = true
  gl.shadowMap.type = THREE.PCFSoftShadowMap
  return gl
}

/** How the camera frames the meadow. */
export interface Shot {
  /** The point the camera looks at. */
  at: THREE.Vector3
  /** Degrees round from straight ahead, and down from level. */
  turn: number
  tilt: number
  /** How many blocks fit between the top and the bottom of the picture. */
  height: number
}

export function sunlight(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xe3f4ff, 0x9fd36b, 1.5))
  scene.add(new THREE.AmbientLight(0xfff8ee, 0.5))
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.3)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.04
  // r180: shadows can be lighter than full shade, which keeps the toy-like look
  ;(sun.shadow as THREE.LightShadow & { intensity: number }).intensity = 0.5
  scene.add(sun, sun.target)

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1200)
  const dir = new THREE.Vector3()

  /** Points the camera (and the sun's shadow box) at `shot` for a picture `aspect` wide. */
  const frame = (shot: Shot, aspect: number) => {
    const turn = THREE.MathUtils.degToRad(shot.turn)
    const tilt = THREE.MathUtils.degToRad(shot.tilt)
    dir.set(Math.sin(turn) * Math.cos(tilt), Math.sin(tilt), Math.cos(turn) * Math.cos(tilt))
    camera.position.copy(shot.at).addScaledVector(dir, 400)
    camera.lookAt(shot.at)
    const h = shot.height / 2
    camera.top = h
    camera.bottom = -h
    camera.left = -h * aspect
    camera.right = h * aspect
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    sun.target.position.copy(shot.at)
    sun.position.copy(shot.at).add(new THREE.Vector3(-70, 140, 55))
    const r = Math.max(h * aspect, h) * 1.5
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 500 })
    sun.shadow.camera.updateProjectionMatrix()
  }

  const v = new THREE.Vector3()
  /** Where a point in the world appears, as fractions (0..1) of the picture's width and height. */
  const onScreen = (x: number, y: number, z: number): [number, number] => {
    v.set(x, y, z).project(camera)
    return [(v.x + 1) / 2, (1 - v.y) / 2]
  }

  return { camera, frame, onScreen }
}
