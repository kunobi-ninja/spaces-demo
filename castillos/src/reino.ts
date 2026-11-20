/*
 * El reino que se construye solo, para la portada: una partida de verdad entre
 * IAs (el mismo motor y la misma IA que el juego) dibujada en un canvas en
 * perspectiva, con las losetas ilustradas. Cada loseta cae con un muelle, los
 * estandartes brotan, lo que se cierra brilla y sus puntos suben flotando,
 * mientras la cámara se pasea despacio. Al acabarse el mazo empieza otro reino.
 *
 * No hay estado de React por fotograma: todo se dibuja aquí con
 * requestAnimationFrame, por tiempo transcurrido, y se para si la página está
 * oculta o el canvas fuera de la vista. Con `quieto` (movimiento reducido)
 * dibuja un solo fotograma de un reino ya avanzado.
 */

import { generador, semillaNueva } from './azar'
import { puntoDe } from './Estandarte'
import { accionesIA } from './ia'
import { girarCampos, girarSegmentos, tipo, type Sitio } from './losetas'
import { aplicar, nueva, type Accion, type Partida } from './reglas'
import { clave } from './tablero'
import { analizar } from './zonas'

export interface OpcionesReino {
  /** La imagen de cada loseta por su id, sin girar. */
  imagenes: Map<string, CanvasImageSource>
  /** Color de cada jugador (2 a 4). */
  colores: string[]
  /** Movimiento reducido: un solo fotograma, sin animación. */
  quieto: boolean
  /** La zona de la pantalla (en px CSS) donde se encuadra el reino, para dejar sitio al título. */
  encuadre: (ancho: number, alto: number) => { x: number; y: number; w: number; h: number }
}

interface Pieza {
  id: string
  giro: number
  x: number
  y: number
  nace: number
}
interface Bandera {
  en: string
  sitio: Sitio
  jugador: number
  nace: number
  /** Cuándo volvió a la mano (la zona se cerró); se hunde y desaparece. */
  muere?: number
}
interface Brillo {
  claves: string[]
  nace: number
}
interface Flotante {
  x: number
  y: number
  texto: string
  color: string
  nace: number
}

const PASO_TURNO = 820
const PASO_ESTANDARTE = 420
const CAIDA = 620
const BROTE = 520
const BRILLO = 1600
const FLOTA = 1700
const ESPERA_FINAL = 3200
const FUNDIDO = 900
const K = 0.62
const GROSOR = 0.085

/** Muelle amortiguado: 0 → 1 con un rebote suave. */
function muelle(t: number): number {
  if (t >= 1) return 1
  if (t <= 0) return 0
  return 1 - Math.exp(-6.5 * t) * Math.cos(9.5 * t)
}
const suave = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

const claveBandera = (en: string, sitio: Sitio) => `${en}|${JSON.stringify(sitio)}`

export function crearReino(canvas: HTMLCanvasElement, op: OpcionesReino): { parar: () => void } {
  const ctx = canvas.getContext('2d')
  if (!ctx) return { parar: () => {} }
  const n = Math.max(2, Math.min(4, op.colores.length))

  let partida: Partida
  let azar: () => number
  let piezas = new Map<string, Pieza>()
  let banderas = new Map<string, Bandera>()
  let brillos: Brillo[] = []
  let flotantes: Flotante[] = []
  let pendiente: Accion | null = null
  let reloj = 0
  let proximo = 0
  let finDesde = -1
  let opacidad = 1

  // Cámara: centro (en losetas), escala (px por loseta), giro.
  const cam = { x: 0, y: 0, s: 90, listo: false }

  let ancho = 0
  let alto = 0
  let dpr = 1

  function empezar(ahora: number) {
    const semilla = semillaNueva()
    azar = generador(semilla ^ 0x5a5a)
    partida = nueva({ jugadores: op.colores.slice(0, n).map((_, i) => `IA ${i + 1}`), semilla })
    piezas = new Map()
    banderas = new Map()
    brillos = []
    flotantes = []
    pendiente = null
    finDesde = -1
    for (const k of partida.orden) {
      const c = partida.tablero[k]
      piezas.set(k, { id: c.id, giro: c.giro, x: c.x, y: c.y, nace: ahora - CAIDA })
    }
    proximo = ahora + 500
  }

  /** Aplica una acción de la IA y anota lo que cambió para dibujarlo. */
  function jugar(a: Accion, ahora: number) {
    const antes = partida
    partida = aplicar(partida, a)
    for (const k of partida.orden) {
      if (piezas.has(k)) continue
      const c = partida.tablero[k]
      piezas.set(k, { id: c.id, giro: c.giro, x: c.x, y: c.y, nace: ahora })
    }
    const vivas = new Set<string>()
    for (const e of partida.puestos) {
      const kb = claveBandera(e.en, e.sitio)
      vivas.add(kb)
      if (!banderas.has(kb)) banderas.set(kb, { en: e.en, sitio: e.sitio, jugador: e.jugador, nace: ahora })
    }
    for (const [kb, b] of banderas) if (!vivas.has(kb) && b.muere === undefined) b.muere = ahora + 350

    const nuevas = partida.anotaciones.slice(antes.anotaciones.length).filter((x) => !x.final && x.puntos > 0)
    if (nuevas.length) {
      const a = analizar(partida.tablero)
      const ultima = partida.orden[partida.orden.length - 1]
      const c = partida.tablero[ultima]
      for (const an of nuevas) {
        let claves: string[] = []
        if (an.zona === 'ermita') {
          for (const z of a.zonas.values()) {
            if (z.tipo !== 'ermita' || !z.cerrada) continue
            const [ex, ey] = z.losetas[0].split(',').map(Number)
            if (Math.abs(ex - c.x) <= 1 && Math.abs(ey - c.y) <= 1) {
              for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) claves.push(clave(ex + dx, ey + dy))
              break
            }
          }
        } else {
          for (const z of a.zonas.values()) {
            if (z.tipo === an.zona && z.cerrada && z.losetas.length === an.losetas && z.losetas.includes(ultima)) {
              claves = z.losetas
              break
            }
          }
        }
        if (!claves.length) claves = [ultima]
        brillos.push({ claves, nace: ahora + 120 })
        const xs = claves.map((k) => partida.tablero[k]).filter(Boolean)
        const mx = xs.reduce((s, p) => s + p.x, 0) / xs.length
        const my = xs.reduce((s, p) => s + p.y, 0) / xs.length
        const color = op.colores[an.ganadores[0]] ?? '#d79a2b'
        flotantes.push({ x: mx, y: my, texto: `+${an.puntos}`, color, nace: ahora + 260 })
      }
    }
  }

  /** Juega `turnos` turnos de golpe, ya asentados: el reino aparece abundante, con ciudades y estandartes. */
  function adelantar(turnos: number) {
    for (let i = 0; i < turnos && partida.fase !== 'fin'; i++) {
      const [x, y] = accionesIA(partida, azar)
      jugar(x, -1e6)
      jugar(y, -1e6)
    }
    brillos = []
    flotantes = []
    for (const p of piezas.values()) p.nace = -1e6
    for (const b of banderas.values()) b.nace = -1e6
  }

  function avanzar(ahora: number) {
    if (partida.fase === 'fin') {
      if (finDesde < 0) finDesde = ahora
      const t = ahora - finDesde
      opacidad = t < ESPERA_FINAL ? 1 : Math.max(0, 1 - (t - ESPERA_FINAL) / FUNDIDO)
      if (t > ESPERA_FINAL + FUNDIDO) {
        empezar(ahora)
        // El reino nuevo entra ya crecido (con el fundido), y sigue construyéndose.
        adelantar(30)
        opacidad = 0
      }
      return
    }
    if (opacidad < 1) opacidad = Math.min(1, opacidad + 0.04)
    if (ahora < proximo) return
    if (pendiente) {
      jugar(pendiente, ahora)
      pendiente = null
      proximo = ahora + PASO_TURNO
    } else if (partida.fase === 'colocar') {
      const [colocar, despues] = accionesIA(partida, azar)
      jugar(colocar, ahora)
      pendiente = despues
      proximo = ahora + PASO_ESTANDARTE
    }
  }

  /* ---------- dibujo ---------- */

  function medir() {
    dpr = Math.min(2, window.devicePixelRatio || 1)
    ancho = canvas.clientWidth
    alto = canvas.clientHeight
    const w = Math.max(1, Math.round(ancho * dpr))
    const h = Math.max(1, Math.round(alto * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
  }

  function apuntarCamara(dt: number, t: number) {
    const ps = [...piezas.values()]
    if (!ps.length) return
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const p of ps) {
      x0 = Math.min(x0, p.x)
      x1 = Math.max(x1, p.x)
      y0 = Math.min(y0, p.y)
      y1 = Math.max(y1, p.y)
    }
    const r = op.encuadre(ancho, alto)
    const th = TH
    // Tamaño del reino ya proyectado, con margen de una loseta.
    const esquinas = [
      [x0 - 0.6, y0 - 0.6],
      [x1 + 0.6, y0 - 0.6],
      [x0 - 0.6, y1 + 0.6],
      [x1 + 0.6, y1 + 0.6],
    ].map(([x, y]) => [x * Math.cos(th) - y * Math.sin(th), (x * Math.sin(th) + y * Math.cos(th)) * K])
    const ex0 = Math.min(...esquinas.map((e) => e[0]))
    const ex1 = Math.max(...esquinas.map((e) => e[0]))
    const ey0 = Math.min(...esquinas.map((e) => e[1]))
    const ey1 = Math.max(...esquinas.map((e) => e[1]))
    const pw = ex1 - ex0
    const ph = ey1 - ey0
    // Más grande que el encuadre: el reino se sale por los bordes y parece seguir más allá.
    // Cubre el encuadre (como background-size: cover), sin pasar de un tamaño de loseta cómodo.
    const tope = Math.min(r.w, r.h) / 2.8
    const s = Math.max(44, Math.min(tope, Math.max(r.w / pw, r.h / ph) * 1.05))
    // El centro del reino tal como se ve, devuelto a coordenadas de losetas, con un leve paseo.
    const pcx = (ex0 + ex1) / 2
    const pcy = (ey0 + ey1) / 2 / K
    // La cámara mira entre el centro del reino y la última loseta, con un leve paseo.
    const ult = piezas.get(partida.orden[partida.orden.length - 1])
    const cx0 = pcx * Math.cos(th) + pcy * Math.sin(th)
    const cy0 = -pcx * Math.sin(th) + pcy * Math.cos(th)
    const tx = (ult ? 0.6 * cx0 + 0.4 * ult.x : cx0) + 0.35 * Math.sin(t / 7300)
    const ty = (ult ? 0.6 * cy0 + 0.4 * ult.y : cy0) + 0.35 * Math.cos(t / 9100)
    if (!cam.listo) {
      cam.x = tx
      cam.y = ty
      cam.s = s
      cam.listo = true
      return
    }
    const f = 1 - Math.exp(-dt / 1400)
    cam.x += (tx - cam.x) * f
    cam.y += (ty - cam.y) * f
    cam.s += (s - cam.s) * (1 - Math.exp(-dt / 2200))
  }

  const TH = 0.62
  const COS = Math.cos(TH)
  const SEN = Math.sin(TH)
  /** Proyección a escala 1: losetas → unidades de pantalla. */
  const proy = (x: number, y: number) => [x * COS - y * SEN, K * (x * SEN + y * COS)] as const

  /** Dibuja losetas (cantos, cara ilustrada) con la matriz de escala `s` y origen (ox, oy), en px CSS × `escala`. */
  function pintarLosetas(g: CanvasRenderingContext2D, lista: [string, Pieza][], s: number, ox: number, oy: number, escala: number, subidas?: Map<string, number>) {
    const a = s * COS
    const b = s * K * SEN
    const c = -s * SEN
    const d = s * K * COS
    const px = (x: number, y: number) => [a * x + c * y + ox, b * x + d * y + oy] as const
    const grosor = s * GROSOR
    for (const [k, p] of lista) {
      const subida = subidas?.get(k) ?? 0
      const e = [px(p.x - 0.5, p.y - 0.5), px(p.x + 0.5, p.y - 0.5), px(p.x + 0.5, p.y + 0.5), px(p.x - 0.5, p.y + 0.5)]
      g.setTransform(escala, 0, 0, escala, 0, 0)
      if (subida > 0) {
        // Sombra en el suelo mientras cae: más oscura cuanto más cerca.
        const f = Math.max(0, 1 - subida / (s * 1.6))
        g.fillStyle = `rgba(52, 30, 10, ${0.1 + 0.3 * f})`
        g.beginPath()
        g.moveTo(e[0][0], e[0][1] + grosor)
        for (let i = 1; i < 4; i++) g.lineTo(e[i][0], e[i][1] + grosor)
        g.fill()
      }
      // Cantos: las dos caras que miran a la cámara.
      let abajo = 0
      for (let i = 1; i < 4; i++) if (e[i][1] > e[abajo][1]) abajo = i
      const izq = e[(abajo + 3) % 4][0] < e[(abajo + 1) % 4][0] ? (abajo + 3) % 4 : (abajo + 1) % 4
      const der = izq === (abajo + 3) % 4 ? (abajo + 1) % 4 : (abajo + 3) % 4
      const cara = (p1: readonly [number, number], p2: readonly [number, number], color: string) => {
        g.fillStyle = color
        g.beginPath()
        g.moveTo(p1[0], p1[1] - subida)
        g.lineTo(p2[0], p2[1] - subida)
        g.lineTo(p2[0], p2[1] - subida + grosor)
        g.lineTo(p1[0], p1[1] - subida + grosor)
        g.closePath()
        g.fill()
      }
      cara(e[izq], e[abajo], '#8a6238')
      cara(e[abajo], e[der], '#6a4826')
      // La cara de arriba: la loseta ilustrada, girada.
      const img = op.imagenes.get(p.id)
      if (img) {
        g.setTransform(a * escala, b * escala, c * escala, d * escala, ox * escala, (oy - subida) * escala)
        g.translate(p.x, p.y)
        g.rotate((p.giro * Math.PI) / 2)
        g.drawImage(img, -0.5, -0.5, 1, 1)
      }
    }
  }

  /*
   * Las losetas ya asentadas se pintan una vez en una capa (con su sombra) y
   * cada fotograma solo se copia esa capa, movida y escalada por la cámara. Se
   * rehace cuando se asienta otra loseta o la escala cambia bastante.
   */
  const capa = document.createElement('canvas')
  const cctx = capa.getContext('2d')
  const memo = { n: -1, s: 0, minX: 0, minY: 0, pad: 0, primera: '' }

  function rehacerCapa(asentadas: [string, Pieza][], s: number) {
    if (!cctx) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [, p] of asentadas) {
      for (const [dx, dy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
        const [u, v] = proy(p.x + dx, p.y + dy)
        minX = Math.min(minX, u)
        minY = Math.min(minY, v)
        maxX = Math.max(maxX, u)
        maxY = Math.max(maxY, v)
      }
    }
    const pad = 0.9
    const w = Math.ceil(((maxX - minX) + 2 * pad) * s * dpr)
    const h = Math.ceil(((maxY - minY) + 2 * pad) * s * dpr)
    if (w > 6000 || h > 6000) return
    capa.width = Math.max(1, w)
    capa.height = Math.max(1, h)
    const ox = (pad - minX) * s - 0
    const oy = (pad - minY) * s
    // Origen de la proyección dentro de la capa: el punto (0,0) de las losetas.
    const o0x = ox
    const o0y = oy
    cctx.setTransform(1, 0, 0, 1, 0, 0)
    cctx.clearRect(0, 0, capa.width, capa.height)
    // Sombra suave sobre la mesa: la huella del reino, en capas cada vez más anchas y claras.
    const a = s * COS
    const b = s * K * SEN
    const c = -s * SEN
    const d = s * K * COS
    const huella = (desp: number, dx: number, dy: number) => {
      cctx.beginPath()
      for (const [, p] of asentadas) {
        const e = [
          [p.x - 0.5 - desp, p.y - 0.5 - desp],
          [p.x + 0.5 + desp, p.y - 0.5 - desp],
          [p.x + 0.5 + desp, p.y + 0.5 + desp],
          [p.x - 0.5 - desp, p.y + 0.5 + desp],
        ].map(([x, y]) => [a * x + c * y + o0x + dx, b * x + d * y + o0y + dy])
        cctx.moveTo(e[0][0], e[0][1])
        for (let i = 1; i < 4; i++) cctx.lineTo(e[i][0], e[i][1])
        cctx.closePath()
      }
      cctx.fill()
    }
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    for (let i = 4; i >= 1; i--) {
      cctx.fillStyle = `rgba(52, 30, 10, ${0.07})`
      huella(0.04 * i, s * 0.06 * i, s * 0.07 * i)
    }
    const orden = [...asentadas].sort((p, q) => b * p[1].x + d * p[1].y - (b * q[1].x + d * q[1].y))
    pintarLosetas(cctx, orden, s, o0x, o0y, dpr)
    memo.s = s
    memo.minX = minX
    memo.minY = minY
    memo.pad = pad
  }

  function dibujar(t: number) {
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!piezas.size) return
    const r = op.encuadre(ancho, alto)
    const s = cam.s
    // Matriz de mundo (losetas) → pantalla (px CSS).
    const a = s * COS
    const b = s * K * SEN
    const c = -s * SEN
    const d = s * K * COS
    const ox = r.x + r.w / 2 - (a * cam.x + c * cam.y)
    const oy = r.y + r.h / 2 - (b * cam.x + d * cam.y)
    const px = (x: number, y: number) => [a * x + c * y + ox, b * x + d * y + oy] as const

    const asentadas: [string, Pieza][] = []
    const cayendo: [string, Pieza][] = []
    const alturas = new Map<string, number>()
    for (const e of piezas) {
      const u = (t - e[1].nace) / CAIDA
      if (u >= 1) asentadas.push(e)
      else {
        cayendo.push(e)
        alturas.set(e[0], (1 - muelle(u)) * s * 1.6)
      }
    }
    const primera = partida.orden[0] + partida.config.semilla
    if (asentadas.length !== memo.n || memo.primera !== primera || Math.abs(s / memo.s - 1) > 0.06) {
      memo.n = asentadas.length
      memo.primera = primera
      rehacerCapa(asentadas, s)
    }

    ctx.globalAlpha = opacidad
    // La capa, con la escala de la cámara: (P - Pmin + pad)·memo.s → (P·s + origen).
    const k = s / memo.s
    const [x0, y0] = [ox + (memo.minX - memo.pad) * s, oy + (memo.minY - memo.pad) * s]
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (capa.width > 1) ctx.drawImage(capa, x0, y0, (capa.width / dpr) * k, (capa.height / dpr) * k)
    // Las que caen, encima.
    pintarLosetas(ctx, cayendo, s, ox, oy, dpr, alturas)

    // Brillo de lo que se acaba de cerrar.
    ctx.globalCompositeOperation = 'lighter'
    for (const g of brillos) {
      const u = (t - g.nace) / BRILLO
      if (u < 0 || u > 1) continue
      const f = Math.sin(Math.PI * u) * 0.55
      ctx.setTransform(a * dpr, b * dpr, c * dpr, d * dpr, ox * dpr, oy * dpr)
      ctx.fillStyle = `rgba(255, 196, 92, ${f})`
      for (const k of g.claves) {
        const p = piezas.get(k)
        if (p) ctx.fillRect(p.x - 0.5, p.y - 0.5, 1, 1)
      }
    }
    ctx.globalCompositeOperation = 'source-over'

    // Estandartes, de pie, en pantalla.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const bs = [...banderas.values()].sort((p, q) => {
      const pp = piezas.get(p.en)
      const qq = piezas.get(q.en)
      return (pp ? b * pp.x + d * pp.y : 0) - (qq ? b * qq.x + d * qq.y : 0)
    })
    for (const ban of bs) {
      const p = piezas.get(ban.en)
      if (!p) continue
      const tl = tipo(p.id)
      const pt = puntoDe(ban.sitio, girarSegmentos(tl.segmentos, p.giro), girarCampos(tl.campos, p.giro))
      const [sx, sy0] = px(p.x - 0.5 + pt.x / 100, p.y - 0.5 + pt.y / 100)
      const sy = sy0 - (alturas.get(ban.en) ?? 0)
      let esc = muelle((t - ban.nace) / BROTE)
      if (ban.muere !== undefined) esc *= 1 - suave((t - ban.muere) / 400)
      if (esc <= 0.01) continue
      bandera(ctx, sx, sy, s * 0.36 * esc, op.colores[ban.jugador] ?? '#c8413b', pt.tumbado, t)
    }
    for (const [kb, ban] of banderas) if (ban.muere !== undefined && t - ban.muere > 450) banderas.delete(kb)

    // Puntos que suben.
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tam = Math.max(18, Math.min(40, s * 0.42))
    ctx.font = `800 ${tam}px Fraunces, Georgia, serif`
    for (const f of flotantes) {
      const u = (t - f.nace) / FLOTA
      if (u < 0 || u > 1) continue
      const [sx, sy] = px(f.x, f.y)
      const y = sy - s * 0.5 - suave(u) * s * 0.9
      ctx.globalAlpha = opacidad * (u < 0.15 ? u / 0.15 : 1 - suave((u - 0.6) / 0.4))
      ctx.lineWidth = Math.max(3, tam * 0.16)
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(58, 34, 14, 0.85)'
      ctx.strokeText(f.texto, sx, y)
      ctx.fillStyle = '#ffe3a0'
      ctx.fillText(f.texto, sx, y)
      ctx.fillStyle = f.color
      ctx.beginPath()
      ctx.arc(sx - tam * 1.15, y, tam * 0.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    flotantes = flotantes.filter((f) => t - f.nace < FLOTA)
    brillos = brillos.filter((g) => t - g.nace < BRILLO)
  }

  /* ---------- bucle ---------- */

  let raf = 0
  let ultimo = 0
  let visible = true
  let enVista = true
  let parado = false

  const fotograma = (ahora: number) => {
    raf = 0
    if (parado || !visible || !enVista) return
    const dt = ultimo ? Math.min(100, ahora - ultimo) : 16
    ultimo = ahora
    reloj += dt
    avanzar(reloj)
    apuntarCamara(dt, reloj)
    dibujar(reloj)
    raf = requestAnimationFrame(fotograma)
  }
  const seguir = () => {
    if (!raf && !parado && visible && enVista && !op.quieto) {
      ultimo = 0
      raf = requestAnimationFrame(fotograma)
    }
  }

  medir()
  empezar(0)
  adelantar(40)

  const pintarQuieto = () => {
    medir()
    cam.listo = false
    apuntarCamara(16, 0)
    dibujar(0)
  }
  if (op.quieto) pintarQuieto()

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => (op.quieto ? pintarQuieto() : medir())) : null
  ro?.observe(canvas)
  const io =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((es) => {
          enVista = es.some((e) => e.isIntersecting)
          seguir()
        })
      : null
  io?.observe(canvas)
  const alCambiarVisibilidad = () => {
    visible = document.visibilityState !== 'hidden'
    seguir()
  }
  document.addEventListener('visibilitychange', alCambiarVisibilidad)
  seguir()

  return {
    parar: () => {
      parado = true
      if (raf) cancelAnimationFrame(raf)
      ro?.disconnect()
      io?.disconnect()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    },
  }
}

/** Un estandarte de pie (o tumbado, si es labriego) con la tela ondeando. */
function bandera(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string, tumbado: boolean, t: number) {
  ctx.save()
  ctx.translate(x, y)
  // Sombra en el suelo.
  ctx.fillStyle = 'rgba(40, 22, 6, 0.35)'
  ctx.beginPath()
  ctx.ellipse(h * 0.12, h * 0.04, h * 0.32, h * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()
  if (tumbado) {
    ctx.rotate(-1.25)
    h *= 0.8
  }
  // Mástil.
  ctx.strokeStyle = '#4a2f17'
  ctx.lineWidth = Math.max(1.2, h * 0.07)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -h)
  ctx.stroke()
  // Tela.
  const w = h * 0.62
  const o = tumbado ? 0 : Math.sin(t / 260 + x * 0.05) * h * 0.06
  ctx.fillStyle = color
  ctx.strokeStyle = 'rgba(30, 16, 4, 0.55)'
  ctx.lineWidth = Math.max(0.8, h * 0.035)
  ctx.beginPath()
  ctx.moveTo(0, -h)
  ctx.quadraticCurveTo(w * 0.5, -h - h * 0.08 + o, w, -h + h * 0.04 + o * 0.6)
  ctx.lineTo(w * 0.8, -h + h * 0.22 + o * 0.4)
  ctx.lineTo(w, -h + h * 0.42 + o)
  ctx.quadraticCurveTo(w * 0.5, -h + h * 0.36 + o, 0, -h + h * 0.42)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // Brillo de la tela.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.beginPath()
  ctx.moveTo(0, -h)
  ctx.quadraticCurveTo(w * 0.5, -h - h * 0.08 + o, w, -h + h * 0.04 + o * 0.6)
  ctx.lineTo(w * 0.9, -h + h * 0.12 + o * 0.5)
  ctx.quadraticCurveTo(w * 0.5, -h + h * 0.04 + o, 0, -h + h * 0.1)
  ctx.closePath()
  ctx.fill()
  // Remate.
  ctx.fillStyle = '#e6b84e'
  ctx.beginPath()
  ctx.arc(0, -h, Math.max(1.4, h * 0.07), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
