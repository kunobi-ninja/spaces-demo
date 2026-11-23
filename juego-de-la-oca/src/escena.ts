import * as THREE from 'three'
import { centroCasilla, pintarMadera, pintarTablero, TAMANO_CASILLA, type Celda } from './arte'
import { rollDie } from './dado.mjs'

/*
 * El tablero en 3D: una mesa de madera bajo una luz cálida, el tablero pintado, las fichas
 * lacadas, una oca que asoma y aletea al caer en su casilla, y un dado que rueda. Tiene dos modos:
 *  - 'demo': juega sola una partida de cuatro IA con las reglas de verdad, y la cámara sigue a la
 *    ficha que se mueve (la portada).
 *  - 'partida': enseña la partida que le pasan con `mostrar(game)`; anima cada tirada (dado, saltos
 *    casilla a casilla, salto especial) y avisa con `alMostrar` cuando la ha terminado de enseñar.
 * Todo se mueve en un bucle de requestAnimationFrame que se para cuando la página no se ve; con
 * `reducido` (prefers-reduced-motion) no hay bucle: cada cambio se pinta una vez, quieto.
 */

export interface Pieza { position: number; skip: number; well: boolean }
export interface Partida { pieces: Pieza[]; current: number; winner: number | null; roll: number | null; message: string }
interface Especial { id: string; name: string; icon: string; kind: string; destination?: number; again?: boolean; skip?: number; chant?: string }
export interface ReglasEscena {
  specials: Record<number, Especial>
  newGame: (count: number) => Partida
  playTurn: (game: Partida, roll: number) => Partida
}
export interface OpcionesEscena {
  celdas: Celda[]
  reglas: ReglasEscena
  colores: string[]
  salida: string
  reducido: boolean
  burbuja: HTMLElement
}

const PLANO = 9
const CASILLA = TAMANO_CASILLA(PLANO)
const ARRIBA = 0.401
const META = 63
const DURA_OCA = 1.8
const APILAR: Record<number, number[][]> = {
  1: [[0, 0]],
  2: [[-0.2, -0.1], [0.2, 0.1]],
  3: [[-0.22, -0.16], [0.22, -0.16], [0, 0.2]],
  4: [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.2], [0.21, 0.2]],
}
// Qué giro deja cada cara del dado hacia arriba (caras de la caja: +x 3, -x 4, +y 1, -y 6, +z 2, -z 5).
const CARA_ARRIBA: Record<number, THREE.Quaternion> = {
  1: new THREE.Quaternion(),
  6: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI),
  3: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
  4: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
  2: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
  5: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
}
const CARAS_CAJA = [3, 4, 1, 6, 2, 5]

const suave = (t: number) => 1 - Math.pow(1 - t, 3)
const mezcla = (a: number, b: number, t: number) => a + (b - a) * t

interface Tween { t: number; dur: number; fn: (t: number) => void; fin: () => void }
interface OcaViva { grupo: THREE.Group; alas: THREE.Object3D[]; cabeza: THREE.Object3D; fase: number; aletea: number }

function textura(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  return tex
}

function caraDado(valor: number) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(54, 50, 10, 64, 64, 90)
  g.addColorStop(0, '#fffdf6')
  g.addColorStop(1, '#eadfc6')
  ctx.fillStyle = '#d9cdb2'
  ctx.fillRect(0, 0, 128, 128)
  ctx.beginPath()
  ctx.roundRect(5, 5, 118, 118, 26)
  ctx.fillStyle = g
  ctx.fill()
  const p = 30
  const pos: Record<number, number[][]> = {
    1: [[0, 0]], 2: [[-p, -p], [p, p]], 3: [[-p, -p], [0, 0], [p, p]],
    4: [[-p, -p], [p, -p], [-p, p], [p, p]], 5: [[-p, -p], [p, -p], [0, 0], [-p, p], [p, p]],
    6: [[-p, -p], [p, -p], [-p, 0], [p, 0], [-p, p], [p, p]],
  }
  for (const [x, y] of pos[valor]) {
    ctx.beginPath()
    ctx.arc(64 + x, 64 + y, valor === 1 ? 15 : 11, 0, Math.PI * 2)
    ctx.fillStyle = valor === 1 ? '#b8322a' : '#2d1c10'
    ctx.fill()
  }
  return c
}

export class EscenaOca {
  private o: OpcionesEscena
  private contenedor: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camara = new THREE.PerspectiveCamera(30, 1, 0.1, 120)
  private fichas: THREE.Group[] = []
  private anillo: THREE.Mesh
  private dado: THREE.Mesh
  private ocas = new Map<number, OcaViva>()
  private texturaTablero: THREE.CanvasTexture
  private canvasTablero = document.createElement('canvas')
  private tweens: Tween[] = []
  private reloj = 0
  private tiro = 0
  private media = 1 / 60
  private cuadros = 0
  private ultimo = 0
  private raf = 0
  private visible = true
  private enPantalla = true
  private ancho = 1
  private alto = 1
  private modo: 'demo' | 'partida' = 'demo'
  private ficha = 0
  private ganador: number | null = null
  private actual = 0
  private turnoDemo = 0
  private cola: Partida[] = []
  private mostrada: Partida | null = null
  private procesando = false
  private alMostrar: (game: Partida) => void = () => {}
  private burbujaHasta = 0
  private burbujaFicha = 0
  private objetivo = new THREE.Vector3()
  private objetivoSuave = new THREE.Vector3()
  private observador: ResizeObserver
  private interseccion: IntersectionObserver
  private desechables: { dispose: () => void }[] = []

  constructor(contenedor: HTMLElement, o: OpcionesEscena) {
    this.o = o
    this.contenedor = contenedor
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.setAttribute('aria-hidden', 'true')
    // Sin tarjeta gráfica (render por software) se dibuja más pequeño y sin sombras.
    const gl = this.renderer.getContext()
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const tarjeta = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    if (/swiftshader|llvmpipe|software/i.test(tarjeta)) {
      this.renderer.setPixelRatio(0.6)
      this.renderer.shadowMap.enabled = false
    }
    contenedor.appendChild(this.renderer.domElement)

    const fondo = new THREE.Color('#1c110a')
    this.scene.background = fondo
    this.scene.fog = new THREE.Fog(fondo, 16, 40)

    this.scene.add(new THREE.HemisphereLight('#ffe9c9', '#3a2414', 0.85))
    const sol = new THREE.DirectionalLight('#ffd7a3', 2.6)
    sol.position.set(-5, 12, 6)
    sol.castShadow = true
    sol.shadow.mapSize.set(1024, 1024)
    sol.shadow.camera.left = sol.shadow.camera.bottom = -7
    sol.shadow.camera.right = sol.shadow.camera.top = 7
    sol.shadow.camera.near = 2
    sol.shadow.camera.far = 30
    sol.shadow.bias = -0.0006
    sol.shadow.radius = 5
    this.scene.add(sol)
    const contra = new THREE.DirectionalLight('#9fc0ff', 0.35)
    contra.position.set(6, 5, -8)
    this.scene.add(contra)

    // Mesa y tablero
    const mesaTex = textura(pintarMadera(document.createElement('canvas'), '#4f2c16', '#1e0d05'), this.renderer)
    mesaTex.wrapS = mesaTex.wrapT = THREE.RepeatWrapping
    mesaTex.repeat.set(5, 5)
    const mesa = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: mesaTex, roughness: 0.78 }))
    mesa.rotation.x = -Math.PI / 2
    mesa.receiveShadow = true
    this.scene.add(mesa)

    const marcoTex = textura(pintarMadera(document.createElement('canvas'), '#4a2412', '#1a0904', 512), this.renderer)
    const marco = new THREE.Mesh(new THREE.BoxGeometry(PLANO + 0.5, 0.4, PLANO + 0.5),
      new THREE.MeshStandardMaterial({ map: marcoTex, roughness: 0.5 }))
    marco.position.y = 0.2
    marco.castShadow = true
    marco.receiveShadow = true
    this.scene.add(marco)

    this.texturaTablero = textura(this.canvasTablero, this.renderer)
    this.pintar()
    const tablero = new THREE.Mesh(new THREE.PlaneGeometry(PLANO, PLANO),
      new THREE.MeshStandardMaterial({ map: this.texturaTablero, roughness: 0.82 }))
    tablero.rotation.x = -Math.PI / 2
    tablero.position.y = ARRIBA
    tablero.receiveShadow = true
    this.scene.add(tablero)
    document.fonts?.load(`800 50px Fraunces`).then(() => {
      this.pintar()
      this.pedirCuadro()
    }).catch(() => {})

    // Fichas
    const perfil = [[0.001, 0], [0.3, 0], [0.31, 0.045], [0.27, 0.09], [0.19, 0.125], [0.145, 0.21], [0.11, 0.38], [0.095, 0.47],
      [0.19, 0.51], [0.2, 0.545], [0.11, 0.58], [0.001, 0.585]].map(([x, y]) => new THREE.Vector2(x, y))
    const cuerpo = new THREE.LatheGeometry(perfil, 36)
    const cabeza = new THREE.SphereGeometry(0.165, 28, 18)
    this.desechables.push(cuerpo, cabeza)
    for (const color of o.colores) {
      const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 })
      const grupo = new THREE.Group()
      const base = new THREE.Mesh(cuerpo, mat)
      const bola = new THREE.Mesh(cabeza, mat)
      bola.position.y = 0.7
      for (const m of [base, bola]) {
        m.castShadow = true
        grupo.add(m)
      }
      grupo.visible = false
      grupo.scale.setScalar(0.88)
      this.scene.add(grupo)
      this.fichas.push(grupo)
    }

    this.anillo = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.47, 48),
      new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.85, depthWrite: false }))
    this.anillo.rotation.x = -Math.PI / 2
    this.anillo.position.y = ARRIBA + 0.006
    this.scene.add(this.anillo)

    // Dado
    const caras = CARAS_CAJA.map(valor => new THREE.MeshStandardMaterial({ map: textura(caraDado(valor), this.renderer), roughness: 0.4 }))
    this.dado = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), caras)
    this.dado.castShadow = true
    this.dado.visible = false
    this.scene.add(this.dado)

    this.crearOcas()

    this.observador = new ResizeObserver(() => this.medir())
    this.observador.observe(contenedor)
    this.interseccion = new IntersectionObserver(([entrada]) => {
      this.enPantalla = entrada.isIntersecting
      this.actualizarBucle()
    })
    this.interseccion.observe(contenedor)
    document.addEventListener('visibilitychange', this.alCambiarVisibilidad)
    this.medir()
    this.actualizarBucle()
    this.demo()
  }

  private pintar() {
    pintarTablero(this.canvasTablero, this.o.celdas, this.o.reglas.specials, this.o.salida)
    this.texturaTablero.needsUpdate = true
  }

  private crearOcas() {
    const blanco = new THREE.MeshStandardMaterial({ color: '#fbf7ee', roughness: 0.62 })
    const pluma = new THREE.MeshStandardMaterial({ color: '#e9e0cc', roughness: 0.7 })
    const naranja = new THREE.MeshStandardMaterial({ color: '#f08a1c', roughness: 0.5 })
    const tinta = new THREE.MeshStandardMaterial({ color: '#1d120a', roughness: 0.3 })
    const esfera = new THREE.SphereGeometry(0.5, 22, 16)
    const cono = new THREE.ConeGeometry(0.5, 1, 14)
    const cilindro = new THREE.CylinderGeometry(0.5, 0.5, 1, 14)
    this.desechables.push(esfera, cono, cilindro)
    const pieza = (geo: THREE.BufferGeometry, mat: THREE.Material, [x, y, z]: number[], [sx, sy, sz]: number[], rz = 0) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      m.scale.set(sx, sy, sz)
      m.rotation.z = rz
      m.castShadow = true
      return m
    }
    for (const [posicion, especial] of Object.entries(this.o.reglas.specials)) {
      if (especial.kind !== 'oca') continue
      const celda = this.o.celdas[Number(posicion)]
      if (!celda) continue
      const grupo = new THREE.Group()
      grupo.add(pieza(esfera, blanco, [0, 0.55, 0], [1.25, 0.78, 0.85]))
      grupo.add(pieza(cono, blanco, [-0.66, 0.72, 0], [0.32, 0.42, 0.3], 1.0))
      grupo.add(pieza(cilindro, blanco, [0.46, 0.98, 0], [0.26, 0.72, 0.26], -0.38))
      const cabeza = new THREE.Group()
      cabeza.position.set(0.6, 1.38, 0)
      cabeza.add(pieza(esfera, blanco, [0, 0, 0], [0.46, 0.42, 0.42]))
      cabeza.add(pieza(cono, naranja, [0.3, -0.04, 0], [0.15, 0.3, 0.15], -Math.PI / 2))
      for (const z of [-0.15, 0.15]) cabeza.add(pieza(esfera, tinta, [0.13, 0.07, z], [0.07, 0.07, 0.07]))
      grupo.add(cabeza)
      const alas: THREE.Object3D[] = []
      for (const lado of [-1, 1]) {
        const pivote = new THREE.Group()
        pivote.position.set(0, 0.82, lado * 0.33)
        pivote.add(pieza(esfera, pluma, [-0.14, -0.14, lado * 0.04], [0.82, 0.34, 0.1]))
        grupo.add(pivote)
        alas.push(pivote)
      }
      for (const z of [-0.15, 0.15]) {
        grupo.add(pieza(cilindro, naranja, [0.05, 0.17, z], [0.07, 0.34, 0.07]))
        grupo.add(pieza(esfera, naranja, [0.13, 0.02, z], [0.26, 0.05, 0.18]))
      }
      const { x, z } = centroCasilla(celda.row, celda.column, PLANO)
      grupo.position.set(x + CASILLA * 0.24, ARRIBA, z - CASILLA * 0.2)
      grupo.scale.setScalar(0)
      grupo.visible = false
      const fase = Number(posicion) * 1.7
      grupo.rotation.y = 0.5 + Math.sin(fase) * 0.5
      this.scene.add(grupo)
      this.ocas.set(Number(posicion), { grupo, alas, cabeza, fase, aletea: 0 })
    }
  }

  // ——— bucle ———

  private alCambiarVisibilidad = () => {
    this.visible = document.visibilityState !== 'hidden'
    this.actualizarBucle()
  }

  private actualizarBucle() {
    const correr = !this.o.reducido && this.visible && this.enPantalla
    if (correr && !this.raf) {
      this.ultimo = performance.now()
      this.raf = requestAnimationFrame(this.cuadro)
    } else if (!correr && this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
  }

  private pedirCuadro() {
    if (this.o.reducido || !this.raf) this.dibujar(0)
  }

  private cuadro = (ahora: number) => {
    this.raf = requestAnimationFrame(this.cuadro)
    const paso = Math.max(0, (ahora - this.ultimo) / 1000)
    this.ultimo = ahora
    this.ajustarResolucion(paso)
    this.dibujar(Math.min(0.05, paso))
  }

  /** Si los cuadros van lentos (equipo modesto), baja la resolución hasta 1× para seguir fluido. */
  private ajustarResolucion(paso: number) {
    if (paso <= 0 || paso > 0.5) return
    this.media = this.media * 0.9 + paso * 0.1
    this.cuadros += 1
    const ratio = this.renderer.getPixelRatio()
    if (this.cuadros > 30 && this.media > 0.034 && ratio > 1) {
      this.renderer.setPixelRatio(Math.max(1, ratio * 0.75))
      this.medir()
      this.cuadros = 0
    }
  }

  private dibujar(dt: number) {
    this.reloj += dt
    for (const tween of [...this.tweens]) {
      tween.t = Math.min(1, tween.t + dt / tween.dur)
      tween.fn(tween.t)
      if (tween.t >= 1) {
        this.tweens.splice(this.tweens.indexOf(tween), 1)
        tween.fin()
      }
    }
    const t = this.reloj
    // Las ocas solo aparecen como reacción: salen del tablero, aletean, saltan y se esconden.
    for (const oca of this.ocas.values()) {
      const u = (t - (oca.aletea - DURA_OCA)) / DURA_OCA
      oca.grupo.visible = u >= 0 && u < 1
      if (!oca.grupo.visible) continue
      const entra = Math.min(1, u / 0.18)
      const muelle = 1 + Math.sin(entra * Math.PI) * 0.25 * (1 - entra)
      const escala = u < 0.82 ? suave(entra) * muelle : 1 - suave((u - 0.82) / 0.18)
      oca.grupo.scale.setScalar(0.42 * escala)
      oca.cabeza.rotation.z = Math.sin(t * 3 + oca.fase) * 0.15
      for (const [i, ala] of oca.alas.entries()) ala.rotation.x = (i ? -1 : 1) * (0.7 + Math.sin(t * 24) * 0.6)
      oca.grupo.position.y = ARRIBA + Math.abs(Math.sin(t * 9)) * 0.2 * escala
    }
    const ficha = this.fichas[this.ficha]
    if (this.ganador !== null) {
      const g = this.fichas[this.ganador]
      g.position.y = ARRIBA + Math.abs(Math.sin(t * 5)) * 0.35
    }
    const foco = this.fichas[this.actual]
    this.anillo.visible = Boolean(foco?.visible) && this.ganador === null
    if (this.anillo.visible) {
      this.anillo.position.x = foco.position.x
      this.anillo.position.z = foco.position.z
      this.anillo.scale.setScalar(1 + Math.sin(t * 3.2) * 0.07)
    }
    this.moverCamara(dt, ficha)
    this.colocarBurbuja()
    this.renderer.render(this.scene, this.camara)
  }

  private moverCamara(dt: number, ficha: THREE.Group | undefined) {
    const movil = this.ancho < 720
    const demo = this.modo === 'demo'
    if (demo && ficha?.visible) {
      this.objetivo.set(ficha.position.x, ARRIBA, ficha.position.z)
    } else {
      this.objetivo.set(0, 0, 0)
      if (ficha?.visible && this.procesando) {
        this.objetivo.x = ficha.position.x * 0.18
        this.objetivo.z = ficha.position.z * 0.18
      }
    }
    const k = dt === 0 ? 1 : 1 - Math.exp(-dt * (demo ? 1.6 : 2.4))
    this.objetivoSuave.lerp(this.objetivo, k)
    const pausa = this.o.reducido ? 0 : this.reloj
    const giro = demo ? 0.35 + Math.sin(pausa * 0.07) * 0.32 : Math.sin(pausa * 0.06) * 0.03
    const inclinacion = demo ? (movil ? 0.78 : 0.6) : (movil ? 1.02 : 0.98)
    let distancia: number
    let fx = 0.5
    let fy = 0.5
    if (demo) {
      distancia = movil ? 15 : 11.5
      if (!movil) fx = 0.63
      else fy = 0.5
    } else {
      const panel = movil ? 0 : Math.min(440, this.ancho * 0.4)
      const libreAncho = this.ancho - panel
      const libreAlto = movil ? this.alto * 0.5 : this.alto
      fx = libreAncho / 2 / this.ancho
      fy = movil ? 0.25 : 0.5
      const tan = Math.tan(THREE.MathUtils.degToRad(this.camara.fov / 2))
      const radio = PLANO / 2 + 0.45
      const mitadAlto = radio * Math.sin(inclinacion) + 0.7
      const mitadAncho = radio * 1.04
      distancia = Math.max(
        mitadAlto / (tan * libreAlto / this.alto),
        mitadAncho / (tan * this.camara.aspect * libreAncho / this.ancho),
      ) * 1.08
    }
    const niebla = this.scene.fog as THREE.Fog
    niebla.near = distancia + 2
    niebla.far = distancia + 26
    const s = this.objetivoSuave
    this.camara.position.set(
      s.x + Math.sin(giro) * Math.cos(inclinacion) * distancia,
      s.y + Math.sin(inclinacion) * distancia,
      s.z + Math.cos(giro) * Math.cos(inclinacion) * distancia,
    )
    this.camara.lookAt(s)
    this.camara.setViewOffset(this.ancho, this.alto, -(fx - 0.5) * this.ancho, -(fy - 0.5) * this.alto, this.ancho, this.alto)
  }

  private colocarBurbuja() {
    const b = this.o.burbuja
    const activa = this.burbujaHasta > this.reloj
    b.dataset.visible = activa ? 'true' : 'false'
    if (!activa) return
    const f = this.fichas[this.burbujaFicha]
    const p = new THREE.Vector3(f.position.x, f.position.y + 1.05, f.position.z).project(this.camara)
    const x = Math.min(this.ancho - 120, Math.max(120, (p.x + 1) / 2 * this.ancho))
    const y = (1 - p.y) / 2 * this.alto
    b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
  }

  private medir() {
    const { width, height } = this.contenedor.getBoundingClientRect()
    this.ancho = Math.max(1, Math.round(width))
    this.alto = Math.max(1, Math.round(height))
    this.renderer.setSize(this.ancho, this.alto, false)
    this.camara.aspect = this.ancho / this.alto
    this.camara.updateProjectionMatrix()
    this.pedirCuadro()
  }

  // ——— animación ———

  private animar(dur: number, fn: (t: number) => void): Promise<void> {
    if (this.o.reducido) {
      fn(1)
      return Promise.resolve()
    }
    return new Promise(fin => this.tweens.push({ t: 0, dur, fn, fin }))
  }

  private esperar(segundos: number) {
    return this.animar(segundos, () => {})
  }

  /** Termina de golpe lo que se esté animando (al cambiar de modo). */
  private cortar() {
    for (const tween of this.tweens.splice(0)) {
      tween.fn(1)
      tween.fin()
    }
    this.burbujaHasta = 0
  }

  private centro(posicion: number) {
    const celda = this.o.celdas[posicion]
    return centroCasilla(celda.row, celda.column, PLANO)
  }

  /** Cada ficha en su casilla, repartidas cuando comparten casilla. */
  private colocar(game: Partida, animado = false) {
    const ocupadas = new Map<number, number[]>()
    game.pieces.forEach((pieza, i) => ocupadas.set(pieza.position, [...(ocupadas.get(pieza.position) ?? []), i]))
    const destinos: THREE.Vector3[] = []
    this.fichas.forEach((ficha, i) => {
      ficha.visible = i < game.pieces.length
      if (!ficha.visible) return
      const pieza = game.pieces[i]
      const grupo = ocupadas.get(pieza.position)!
      const [dx, dz] = APILAR[Math.min(grupo.length, 4)][grupo.indexOf(i)] ?? [0, 0]
      const { x, z } = this.centro(pieza.position)
      destinos[i] = new THREE.Vector3(x + dx * CASILLA, ARRIBA, z + dz * CASILLA)
    })
    this.actual = game.current
    this.ganador = game.winner
    if (!animado) {
      destinos.forEach((d, i) => d && this.fichas[i].position.copy(d))
      this.pedirCuadro()
      return Promise.resolve()
    }
    const desde = this.fichas.map(f => f.position.clone())
    return this.animar(0.28, t => destinos.forEach((d, i) => d && this.fichas[i].position.lerpVectors(desde[i], d, suave(t))))
  }

  private saltar(i: number, a: number, dur: number, altura: number) {
    const ficha = this.fichas[i]
    const desde = ficha.position.clone()
    const { x, z } = this.centro(a)
    return this.animar(dur, t => {
      ficha.position.set(mezcla(desde.x, x, t), ARRIBA + Math.sin(Math.PI * t) * altura, mezcla(desde.z, z, t))
      const aplastar = t > 0.85 ? 1 - Math.sin((t - 0.85) / 0.15 * Math.PI) * 0.14 : 1
      ficha.scale.set((2 - aplastar) * 0.88, aplastar * 0.88, (2 - aplastar) * 0.88)
    })
  }

  private async tirarDado(valor: number, cerca: THREE.Vector3) {
    const dado = this.dado
    this.tiro += 1
    // Cae junto a la ficha, hacia el centro del tablero para no salirse.
    const fin = new THREE.Vector3(cerca.x - Math.sign(cerca.x || 1) * 0.85, ARRIBA + 0.23, cerca.z - Math.sign(cerca.z || 1) * 0.75)
    const inicio = fin.clone().add(new THREE.Vector3(-2.2, 2.8, -1.4))
    const qFin = CARA_ARRIBA[valor].clone().premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2))
    const eje = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize()
    const giro = new THREE.Quaternion()
    dado.visible = true
    dado.scale.setScalar(1)
    await this.animar(0.95, t => {
      const e = suave(t)
      dado.position.x = mezcla(inicio.x, fin.x, e)
      dado.position.z = mezcla(inicio.z, fin.z, e)
      dado.position.y = t < 0.6 ? mezcla(inicio.y, fin.y, (t / 0.6) ** 2)
        : t < 0.85 ? fin.y + Math.sin((t - 0.6) / 0.25 * Math.PI) * 0.32 : fin.y
      giro.setFromAxisAngle(eje, Math.PI * 5 * (1 - e))
      dado.quaternion.copy(qFin).multiply(giro)
    })
  }

  private aletear(posicion: number) {
    const oca = this.ocas.get(posicion)
    if (oca && !this.o.reducido) oca.aletea = this.reloj + DURA_OCA
  }

  private hablar(i: number, texto: string, segundos = 1.9) {
    this.o.burbuja.textContent = texto
    this.burbujaFicha = i
    this.burbujaHasta = this.reloj + segundos
  }

  /** Anima una tirada: de `antes` a `despues`. Devuelve false si se ha cortado. */
  private async transicion(antes: Partida, despues: Partida, turno: number) {
    const sigue = () => turno === this.turnoDemo
    if (despues.roll == null || antes.pieces.length !== despues.pieces.length || this.o.reducido) {
      await this.colocar(despues)
      return sigue()
    }
    const i = antes.current
    this.ficha = i
    const ficha = this.fichas[i]
    await this.tirarDado(despues.roll, ficha.position)
    if (!sigue()) return false
    let posicion = antes.pieces[i].position
    let direccion = 1
    for (let paso = 0; paso < despues.roll; paso++) {
      if (posicion === META) direccion = -1
      posicion += direccion
      await this.saltar(i, posicion, 0.21, 0.42)
      if (!sigue()) return false
    }
    const especial = this.o.reglas.specials[posicion]
    const final = despues.pieces[i].position
    if (especial && posicion !== 0 && posicion !== META) {
      this.aletear(posicion)
      this.hablar(i, especial.chant ?? especial.name)
      if (final !== posicion) {
        await this.esperar(0.35)
        await this.saltar(i, final, 0.8, 1.9)
        this.aletear(final)
        if (!sigue()) return false
      }
    } else if (posicion === META) {
      this.hablar(i, this.o.reglas.specials[META]?.name ?? String(META), 2.4)
    }
    await this.colocar(despues, true)
    // El dado se recoge solo, sin hacer esperar a la siguiente jugada.
    const tiro = this.tiro
    const dado = this.dado
    this.animar(0.9, t => {
      if (tiro === this.tiro) dado.scale.setScalar(t < 0.6 ? 1 : 1 - suave((t - 0.6) / 0.4))
    }).then(() => {
      if (tiro === this.tiro) dado.visible = false
    })
    return sigue()
  }

  // ——— modos ———

  private async demo() {
    const turno = ++this.turnoDemo
    const { reglas } = this.o
    let game = reglas.newGame(4)
    if (this.o.reducido) {
      game = { ...game, current: 2, pieces: [9, 19, 23, 6].map(position => ({ position, skip: 0, well: false })) }
      this.ficha = 2
      this.colocar(game)
      return
    }
    this.colocar(game)
    while (turno === this.turnoDemo) {
      await this.esperar(0.6)
      if (turno !== this.turnoDemo) return
      const despues = reglas.playTurn(game, rollDie())
      if (!(await this.transicion(game, despues, turno))) return
      game = despues
      if (game.winner !== null) {
        await this.esperar(2.6)
        if (turno !== this.turnoDemo) return
        game = reglas.newGame(4)
        this.ficha = 0
        await this.colocar(game, true)
      }
    }
  }

  /** La partida que hay que enseñar, o null para volver a la demo. */
  mostrar(game: Partida | null, alMostrar: (game: Partida) => void) {
    this.alMostrar = alMostrar
    if (!game) {
      if (this.modo !== 'demo') {
        this.modo = 'demo'
        this.cola = []
        this.mostrada = null
        this.cortar()
        this.demo()
      }
      return
    }
    if (this.modo === 'demo') {
      this.modo = 'partida'
      this.turnoDemo += 1
      this.cortar()
      this.dado.visible = false
      this.mostrada = null
    }
    const ultima = this.cola[this.cola.length - 1] ?? this.mostrada
    if (ultima && JSON.stringify(ultima) === JSON.stringify(game)) return
    this.cola.push(game)
    this.procesar()
  }

  private async procesar() {
    if (this.procesando) return
    this.procesando = true
    const turno = this.turnoDemo
    while (this.cola.length && turno === this.turnoDemo) {
      const siguiente = this.cola.shift()!
      const antes = this.mostrada
      const nueva = !antes || siguiente.roll == null || antes.pieces.length !== siguiente.pieces.length
      if (nueva) await this.colocar(siguiente)
      else await this.transicion(antes, siguiente, turno)
      if (turno !== this.turnoDemo) break
      this.mostrada = siguiente
      this.ficha = siguiente.winner ?? siguiente.current
      this.alMostrar(siguiente)
    }
    this.procesando = false
    if (this.cola.length && this.modo === 'partida') this.procesar()
  }

  dispose() {
    this.turnoDemo += 1
    this.cortar()
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.observador.disconnect()
    this.interseccion.disconnect()
    document.removeEventListener('visibilitychange', this.alCambiarVisibilidad)
    this.scene.traverse(objeto => {
      const malla = objeto as THREE.Mesh
      if (!malla.isMesh) return
      malla.geometry.dispose()
      for (const mat of ([] as THREE.Material[]).concat(malla.material)) {
        ;(mat as THREE.MeshStandardMaterial).map?.dispose()
        mat.dispose()
      }
    })
    for (const d of this.desechables) d.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
