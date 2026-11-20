/*
 * La partida en pantalla: vista con zoom y arrastre, panel de
 * habilidades, ritmo de salida, pausa, ×2, fuegos artificiales, minimapa y
 * pantalla final. El motor (motor.ts) hace la simulación; aquí solo se
 * dibuja y se convierten toques y teclas en órdenes.
 */

import { useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import {
  HABILIDADES, INTERVALO_MINIMO, KUNAI_RITMO, NINJA, PASOS_POR_SEGUNDO, TODAS,
  aplicar, kunobitoEn, nuevo, paso, pasosTotales, visible,
  type Estado, type Habilidad,
} from './motor'
import { crearNivel, type DefNivel } from './niveles'
import { Rico } from './Rico'
import { Sonidos } from './sonidos'
import type { NombreSonido } from './sintesis'
import {
  ANDAR, COMETA, GANCHO, HOJA, HUMO, KUNAI, PELDANO, PICO, PLANTON, POZO, SALTO, SIGILO, TREPAR, TUNEL,
  dibujarSprite, type Cinta, type Sprite,
} from './sprites'
import { actualizarCapas, chorro, dibujarMundo, dibujarParticulas, prepararCapas as capasDe, reducido, type Capas, type Particula } from './mundo'
import { ESCENARIOS } from './paisajes'
import { Estrellas, IconoReloj, IconoSonido, IconoTerminar } from './Iconos'

/* ---------- Habilidades: icono y panel (los nombres están en las palabras de la página) ---------- */

const ICONO: Record<Habilidad, Sprite> = {
  trepa: TREPAR[0], hoja: HOJA[0], planton: PLANTON[0], chispa: ANDAR[0],
  peldano: PELDANO[0], tunel: TUNEL[0], pico: PICO[2], pozo: POZO[0],
  gancho: GANCHO[0], salto: SALTO[1], humo: HUMO[1], kunai: KUNAI[1], sigilo: SIGILO[0], cometa: COMETA[0],
}

/**
 * Habilidades del panel de un nivel: las ocho de siempre en los niveles de
 * antes; en los que traen alguna ninja, solo las que trae (como mucho ocho).
 */
export function panelDe(hab: Partial<Record<Habilidad, number>>): Habilidad[] {
  const ninja = NINJA.some((h) => (hab[h] ?? 0) > 0)
  return ninja ? TODAS.filter((h) => (hab[h] ?? 0) > 0).slice(0, 8) : [...HABILIDADES]
}

function Icono({ h }: { h: Habilidad }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 48, 60)
    dibujarSprite(ctx, ICONO[h], 12, 30, 2)
    if (h === 'chispa') {
      ctx.fillStyle = '#ffe08a'
      ctx.font = 'bold 16px system-ui, sans-serif'
      ctx.fillText('5', 34, 16)
    }
  }, [h])
  return <canvas ref={ref} width={48} height={60} className="kp-icono" aria-hidden="true" />
}

type Aviso = { x: number; y: number; texto: string; vida: number; color: string }

const SILENCIO = 'kunobitos.silencio'
const leerSilencio = () => { try { return localStorage.getItem(SILENCIO) === '1' } catch { return false } }

/* ---------- Vista ---------- */

type Vista = { x: number; y: number; z: number }
const ZOOM_MIN = 1, ZOOM_MAX = 6

function encajar(v: Vista, anchoMundo: number, altoMundo: number, w: number, h: number) {
  v.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.z))
  const vw = w / v.z, vh = h / v.z
  v.x = vw >= anchoMundo ? (anchoMundo - vw) / 2 : Math.max(0, Math.min(anchoMundo - vw, v.x))
  v.y = vh >= altoMundo ? (altoMundo - vh) / 2 : Math.max(0, Math.min(altoMundo - vh, v.y))
}

/* ---------- Componente ---------- */

type Hud = {
  habilidades: Record<Habilidad, number>
  salidos: number; salvados: number; perdidos: number; total: number; minimo: number
  quedan: number; intervalo: number
  fin: Estado['fin']
}

const hudDe = (e: Estado): Hud => ({
  habilidades: { ...e.habilidades },
  salidos: e.salidos, salvados: e.salvados, perdidos: e.perdidos, total: e.nivel.total, minimo: e.nivel.minimo,
  quedan: Math.max(0, Math.ceil((pasosTotales(e.nivel) - e.paso) / PASOS_POR_SEGUNDO)),
  intervalo: e.intervalo,
  fin: e.fin,
})

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function Partida({ def, numero, w, locale, onFin, onVolver, onSiguiente, mejor = 0, cinta = 'dorada', jugador, sinRepetir, textoSiguiente }: {
  def: DefNivel
  /** Número del nivel en el juego (1 a 28). */
  numero: number
  /** En el modo por turnos: de quién es el turno y su color. */
  jugador?: { nombre: string; color: string }
  /** Sin «Jugar otra vez» al acabar (en el modo por turnos cada uno tiene un intento). */
  sinRepetir?: boolean
  /** Texto del botón de seguir al acabar (si no, «Siguiente nivel»). */
  textoSiguiente?: string
  /** Las palabras de la página (ver WORDS en index.mdx). */
  w: any
  /** Para los números (el ritmo de salida). */
  locale: string
  /** Color de la cinta de los kunobitos (la que se ha ganado). */
  cinta?: Cinta
  /** Se llama una vez al acabar el nivel, con el resultado. */
  onFin?: (r: NonNullable<Estado['fin']>) => void
  /** Volver a la lista de niveles. */
  onVolver?: () => void
  /** Ir al nivel siguiente (si lo hay). */
  onSiguiente?: () => void
  /** Mejores estrellas conseguidas antes en este nivel. */
  mejor?: number
}) {
  const nivel = useRef(crearNivel(def)).current
  // Los efectos que se montan una vez leen las palabras de aquí (por si cambia el idioma).
  const palabras = useRef(w)
  palabras.current = w
  const pw = w.partida
  const nombre = (h: Habilidad): string => w.habilidades[h].nombre
  const caja = useRef<HTMLDivElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const mini = useRef<HTMLCanvasElement>(null)
  const estado = useRef<Estado>(nuevo(nivel))
  const vista = useRef<Vista>({ x: 0, y: 0, z: 2 })
  const ctl = useRef({ pausa: true, rapido: false, elegida: 'tunel' as Habilidad, encima: -1, acc: 0, tam: { w: 600, h: 320 } })

  const [hud, setHud] = useState<Hud>(() => hudDe(estado.current))
  const panel = useRef(panelDe(def.habilidades)).current
  const [elegida, setElegida] = useState<Habilidad>(() => panel.find((h) => (def.habilidades[h] ?? 0) > 0) ?? panel[0])
  const [pausa, setPausa] = useState(true)
  const [rapido, setRapido] = useState(false)
  const [empezada, setEmpezada] = useState(false)
  const [armado, setArmado] = useState(false)
  const [ayuda, setAyuda] = useState(false)
  const [silencio, setSilencio] = useState(leerSilencio)
  const sonidos = useRef(new Sonidos())
  sonidos.current.silencio = silencio
  const efectos = useRef<{ ps: Particula[]; avisos: Aviso[]; previos: Map<number, string>; cuentas: Map<number, number>; finSonado: boolean }>({ ps: [], avisos: [], previos: new Map(), cuentas: new Map(), finSonado: false })
  useEffect(() => () => sonidos.current.cerrar(), [])
  const cambiarSilencio = () => setSilencio((x) => { try { localStorage.setItem(SILENCIO, x ? '0' : '1') } catch { /* sin almacenamiento */ } return !x })

  // Al empezar un nivel ninja, su melodía.
  useEffect(() => {
    if (empezada && def.escenario) sonidos.current.tocar(`tema-${def.escenario}` as NombreSonido)
  }, [empezada])

  // Avisar una vez del final de cada partida.
  const avisado = useRef<Estado | null>(null)
  useEffect(() => {
    if (hud.fin && avisado.current !== estado.current) {
      avisado.current = estado.current
      onFin?.(hud.fin)
    }
  }, [hud.fin])

  ctl.current.elegida = elegida
  ctl.current.pausa = pausa || !empezada || ayuda
  ctl.current.rapido = rapido

  // Capas del mundo: fondo, terreno y agua.
  const capas = useRef<Capas | null>(null)
  const prepararCapas = () => { capas.current = capasDe(estado.current, def.escenario) }
  const reiniciar = () => {
    estado.current = nuevo(nivel)
    prepararCapas()
    ctl.current.acc = 0
    efectos.current = { ps: [], avisos: [], previos: new Map(), cuentas: new Map(), finSonado: false }
    setHud(hudDe(estado.current))
    setPausa(false)
    setArmado(false)
  }

  /** Da la habilidad elegida al kunobito del punto (en coordenadas del mundo). */
  const tocar = (wx: number, wy: number, margen = 3) => {
    const e = estado.current
    if (e.fin) return
    const h = ctl.current.elegida
    const k = kunobitoEn(e, wx, wy, h, margen)
    if (k && aplicar(e, { tipo: 'habilidad', id: k.id, habilidad: h })) {
      setHud(hudDe(e))
      sonidos.current.tocar('dar')
      efectos.current.avisos.push({ x: k.x, y: k.y - 34, texto: palabras.current.habilidades[h].nombre, vida: 0, color: '#7fd3ea' })
    } else if (k) {
      sonidos.current.tocar('nada')
      const pp = palabras.current.partida
      const motivo = e.habilidades[h] <= 0 ? pp.noQuedan({ nombre: palabras.current.habilidades[h].nombre }) : pp.ahoraNo
      efectos.current.avisos.push({ x: k.x, y: k.y - 34, texto: motivo, vida: 0, color: '#ffb48a' })
    }
  }

  const cambiarRitmo = (delta: number) => {
    if (aplicar(estado.current, { tipo: 'ritmo', delta })) setHud(hudDe(estado.current))
  }

  const fuegos = () => {
    if (!armado) { setArmado(true); setTimeout(() => setArmado(false), 2500); return }
    aplicar(estado.current, { tipo: 'fuegos' })
    setArmado(false)
    setHud(hudDe(estado.current))
  }

  // Bucle de dibujo y simulación.
  useEffect(() => {
    const cv = lienzo.current, contenedor = caja.current
    if (!cv || !contenedor) return
    const ctx = cv.getContext('2d')!
    prepararCapas()

    // Tamaño del lienzo según el ancho disponible.
    const medir = () => {
      const w = Math.max(280, contenedor.clientWidth)
      const h = Math.round(Math.max(280, Math.min(640, w * 0.56, window.innerHeight - 290)))
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
      cv.style.height = `${h}px`
      const primera = ctl.current.tam.w === 600 && ctl.current.tam.h === 320
      ctl.current.tam = { w, h }
      if (primera) {
        // Zoom para que el nivel llene la escena (como mucho, el alto entero), mirando al Nido.
        const v = vista.current
        v.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, h / nivel.mapa.alto, Math.max(w / nivel.mapa.ancho, 3)))
        v.x = nivel.nido.x - w / v.z / 3
        v.y = 0
      }
      encajar(vista.current, nivel.mapa.ancho, nivel.mapa.alto, w, h)
    }
    medir()
    // Cambiar el tamaño borra el lienzo: se vuelve a dibujar enseguida (sin esperar al siguiente cuadro).
    const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { medir(); dibujarTodo(performance.now(), false) }) : null
    obs?.observe(contenedor)

    let id = 0, ultimo = performance.now(), cuadro = 0, hudPrevio = ''
    const dibujarTodo = (ahora: number, seguir = true) => {
      const dt = Math.min(0.1, Math.max(0, (ahora - ultimo) / 1000))
      ultimo = ahora
      cuadro++
      const e = estado.current
      const c = ctl.current
      // Simulación.
      if (!c.pausa && !e.fin) {
        c.acc += dt * (c.rapido ? 2 : 1)
        let n = 0
        while (c.acc >= 1 / PASOS_POR_SEGUNDO && n < 8) { paso(e); c.acc -= 1 / PASOS_POR_SEGUNDO; n++ }
      }
      // Sucesos: sonidos y efectos según cómo cambió cada kunobito.
      const ef = efectos.current, son = sonidos.current, dojo = e.nivel.dojo
      const cavando = !!e.sucio
      for (const k of e.kunobitos) {
        const antes = ef.previos.get(k.id)
        if (antes === undefined) son.tocar('salida', 120)
        if (antes !== k.estado) {
          if (k.estado === 'llegando') {
            son.tocar('llegada', 90)
            chorro(ef.ps, dojo.x, dojo.y - 10, 10, ['#ffe08a', '#fff6c2', '#7fd3ea'], 40, k.id * 31, 0)
            ef.avisos.push({ x: dojo.x, y: dojo.y - 40, texto: '+1', vida: 0, color: '#ffe08a' })
          }
          if (k.estado === 'aturdido') son.tocar('aturdido', 120)
          if (k.estado === 'ahogado') { son.tocar('agua', 120); chorro(ef.ps, k.x, k.y, 10, ['#9be3fa', '#dff8ff'], 45, k.id * 17) }
          if (k.estado === 'chispa') {
            son.tocar('estallido', 60)
            chorro(ef.ps, k.x, k.y - 6, 26, ['#ffe08a', '#ff8a5a', '#5fd0e0', '#8a5636', '#70432c'], 70, k.id * 13)
          }
          if (k.estado === 'gancho') son.tocar('gancho', 80)
          if (k.estado === 'salto') son.tocar('salto', 80)
          if (k.estado === 'cometa') son.tocar('cometa', 120)
          if (k.estado === 'humo') {
            son.tocar('humo', 80)
            const humo = ['#d9dfee', '#8e9ab4', '#ffffff']
            chorro(ef.ps, k.x, k.y - 10, 16, humo, 30, k.id * 19, -10)
            if (k.tx !== undefined) chorro(ef.ps, k.tx, (k.ty ?? k.y) - 10, 16, humo, 30, k.id * 23, -10)
          }
          if (k.estado === 'pinchado') { son.tocar('pinchado', 120); chorro(ef.ps, k.x, k.y, 8, ['#e2cf8e', '#ffffff'], 35, k.id * 29) }
          if (k.estado === 'descubierto') {
            son.tocar('alarma', 200)
            ef.avisos.push({ x: k.x, y: k.y - 34, texto: palabras.current.partida.visto, vida: 0, color: '#ff7a6a' })
          }
          ef.previos.set(k.id, k.estado)
        }
        if (k.estado === 'kunai' && k.ax === k.x && k.t % KUNAI_RITMO === KUNAI_RITMO - 1) son.tocar('kunai', 60)
        if (cavando && (k.estado === 'tunel' || k.estado === 'pico' || k.estado === 'pozo')) {
          son.tocar('cavar', 160)
          if (k.t % 4 === 0) {
            const fx = k.estado === 'pozo' ? k.x : k.x + k.dir * 5
            const fy = k.estado === 'tunel' ? k.y - 4 : k.y + 1
            chorro(ef.ps, fx, fy, 2, ['#8a5636', '#b49a82'], 22, k.id * 7 + k.t)
          }
        }
        if (k.estado === 'peldano' && k.t % 4 === 3) son.tocar('tabla', 150)
        if (k.cuenta !== null) {
          const s = Math.ceil(k.cuenta / PASOS_POR_SEGUNDO)
          if (ef.cuentas.get(k.id) !== s) { ef.cuentas.set(k.id, s); son.tocar('tic', 100) }
        }
      }
      if (e.fin && !ef.finSonado) { ef.finSonado = true; son.tocar(e.fin.ganado ? 'victoria' : 'derrota') }
      // Terreno: solo lo cambiado; el agua, unas veces por segundo.
      const cp = capas.current!
      actualizarCapas(e, cp, ahora / 1000, cuadro % 4 === 0)

      // Dibujo.
      const { w, h } = c.tam
      const dpr = cv.width / w
      const v = vista.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = def.escenario ? ESCENARIOS[def.escenario].cielo[0] : '#0b1230'
      ctx.fillRect(0, 0, w, h)
      ctx.setTransform(dpr * v.z, 0, 0, dpr * v.z, -v.x * dpr * v.z, -v.y * dpr * v.z)
      const t = ahora / 1000
      const n = e.nivel
      const encima = e.kunobitos.find((k) => k.id === c.encima && visible(k))
      dibujarMundo(ctx, e, cp, { cinta, t, escenario: def.escenario, ambienteOn: !reducido() })
      // Partículas y avisos.
      ef.ps = dibujarParticulas(ctx, ef.ps, dt)
      ctx.textAlign = 'center'
      ctx.font = '600 8px Fredoka, system-ui, sans-serif'
      for (const a of ef.avisos) {
        a.vida += dt
        ctx.globalAlpha = Math.max(0, 1 - a.vida / 1.2)
        ctx.fillStyle = 'rgba(11,18,48,0.6)'
        ctx.fillText(a.texto, a.x + 0.6, a.y - a.vida * 10 + 0.6)
        ctx.fillStyle = a.color
        ctx.fillText(a.texto, a.x, a.y - a.vida * 10)
      }
      ef.avisos = ef.avisos.filter((a) => a.vida < 1.2)
      ctx.globalAlpha = 1
      // Marca del kunobito bajo el cursor.
      if (encima) {
        ctx.strokeStyle = '#7fd3ea'
        ctx.lineWidth = 1.5 / v.z * 2
        ctx.strokeRect(encima.x - 9, encima.y - 27, 18, 29)
      }

      // Pausa: velo y texto.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (c.pausa && !e.fin) {
        ctx.fillStyle = 'rgba(11,18,48,0.45)'
        ctx.fillRect(0, 0, w, h)
      }

      // Minimapa (unas veces por segundo).
      const m = mini.current
      if (m && (cuadro % 6 === 0 || !seguir || cuadro === 1)) {
        const mc = m.getContext('2d')!
        const sx = m.width / n.mapa.ancho, sy = m.height / n.mapa.alto
        mc.imageSmoothingEnabled = true
        mc.fillStyle = '#0b1230'
        mc.fillRect(0, 0, m.width, m.height)
        mc.drawImage(cp.tierra, 0, 0, m.width, m.height)
        mc.fillStyle = '#ffd75e'
        mc.fillRect(n.dojo.x * sx - 2, n.dojo.y * sy - 4, 4, 4)
        mc.fillStyle = '#7ff0dc'
        mc.fillRect(n.nido.x * sx - 2, n.nido.y * sy - 2, 4, 4)
        mc.fillStyle = '#f2b33c'
        for (const k of e.kunobitos) if (visible(k)) mc.fillRect(k.x * sx - 1, (k.y - 8) * sy - 1, 2, 3)
        mc.strokeStyle = '#ffffff'
        mc.lineWidth = 1
        mc.strokeRect(v.x * sx, v.y * sy, (w / v.z) * sx, (h / v.z) * sy)
      }

      // Marcador (solo si cambió).
      if (cuadro % 5 === 0 || e.fin) {
        const nuevoHud = hudDe(e)
        const clave = JSON.stringify(nuevoHud)
        if (clave !== hudPrevio) { hudPrevio = clave; setHud(nuevoHud) }
      }
      if (seguir) id = requestAnimationFrame((t) => dibujarTodo(t))
    }
    dibujarTodo(performance.now())
    return () => { cancelAnimationFrame(id); obs?.disconnect() }
  }, [])

  // Toques, arrastre, pellizco y rueda.
  useEffect(() => {
    const cv = lienzo.current
    if (!cv) return
    const dedos = new Map<number, { x: number; y: number }>()
    let inicio: { x: number; y: number } | null = null
    let movido = false
    let distPrevia = 0
    const local = (ev: { clientX: number; clientY: number }) => {
      const r = cv.getBoundingClientRect()
      return { x: ev.clientX - r.left, y: ev.clientY - r.top }
    }
    const aMundo = (p: { x: number; y: number }) => {
      const v = vista.current
      return { x: v.x + p.x / v.z, y: v.y + p.y / v.z }
    }
    const zoomEn = (p: { x: number; y: number }, factor: number) => {
      const v = vista.current
      const antes = aMundo(p)
      v.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.z * factor))
      v.x = antes.x - p.x / v.z
      v.y = antes.y - p.y / v.z
      encajar(v, nivel.mapa.ancho, nivel.mapa.alto, ctl.current.tam.w, ctl.current.tam.h)
    }
    let tipo = 'mouse'
    const abajo = (ev: PointerEvent) => {
      cv.setPointerCapture(ev.pointerId)
      sonidos.current.desbloquear()
      tipo = ev.pointerType
      const p = local(ev)
      if (ev.pointerType !== 'mouse') {
        const w = aMundo(p)
        const k = kunobitoEn(estado.current, w.x, w.y, ctl.current.elegida, 9)
        ctl.current.encima = k ? k.id : -1
      }
      if (ev.isPrimary) { dedos.clear(); inicio = p; movido = false }
      dedos.set(ev.pointerId, p)
      if (dedos.size === 2) {
        const [a, b] = [...dedos.values()]
        distPrevia = Math.hypot(a.x - b.x, a.y - b.y)
        movido = true
      }
    }
    const mover = (ev: PointerEvent) => {
      const p = local(ev)
      if (!dedos.has(ev.pointerId)) {
        // Ratón sin pulsar: marcar a quién se le daría la habilidad.
        const w = aMundo(p)
        const k = kunobitoEn(estado.current, w.x, w.y, ctl.current.elegida)
        ctl.current.encima = k ? k.id : -1
        return
      }
      const previo = dedos.get(ev.pointerId)!
      dedos.set(ev.pointerId, p)
      const v = vista.current
      if (dedos.size === 1) {
        if (inicio && Math.hypot(p.x - inicio.x, p.y - inicio.y) > 6) movido = true
        if (movido) {
          v.x -= (p.x - previo.x) / v.z
          v.y -= (p.y - previo.y) / v.z
          encajar(v, nivel.mapa.ancho, nivel.mapa.alto, ctl.current.tam.w, ctl.current.tam.h)
        }
      } else if (dedos.size === 2) {
        const [a, b] = [...dedos.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (distPrevia > 0) zoomEn({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d / distPrevia)
        distPrevia = d
      }
    }
    const arriba = (ev: PointerEvent) => {
      const p = local(ev)
      const eraUno = dedos.size === 1
      dedos.delete(ev.pointerId)
      if (eraUno && !movido) {
        const w = aMundo(p)
        tocar(w.x, w.y, tipo === 'mouse' ? 3 : 9)
        if (tipo !== 'mouse') setTimeout(() => { ctl.current.encima = -1 }, 250)
      }
      if (dedos.size < 2) distPrevia = 0
    }
    const rueda = (ev: WheelEvent) => {
      ev.preventDefault()
      zoomEn(local(ev), ev.deltaY < 0 ? 1.15 : 1 / 1.15)
    }
    const salir = () => { ctl.current.encima = -1 }
    cv.addEventListener('pointerdown', abajo)
    cv.addEventListener('pointermove', mover)
    cv.addEventListener('pointerup', arriba)
    cv.addEventListener('pointercancel', arriba)
    cv.addEventListener('pointerleave', salir)
    cv.addEventListener('wheel', rueda, { passive: false })
    return () => {
      cv.removeEventListener('pointerdown', abajo)
      cv.removeEventListener('pointermove', mover)
      cv.removeEventListener('pointerup', arriba)
      cv.removeEventListener('pointercancel', arriba)
      cv.removeEventListener('pointerleave', salir)
      cv.removeEventListener('wheel', rueda)
    }
  }, [])

  // Teclado.
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      sonidos.current.desbloquear()
      const k = ev.key.toLowerCase()
      if (k === '?' || k === 'h') { setAyuda((x) => !x); return }
      if (k === 'escape') { setAyuda(false); return }
      if (k === 'm') { cambiarSilencio(); return }
      const n = Number(k)
      if (n >= 1 && n <= panel.length) { setElegida(panel[n - 1]); sonidos.current.tocar('elegir'); return }
      if (k === 'p' || k === ' ') {
        if (k === ' ' && !caja.current?.contains(document.activeElement)) return
        ev.preventDefault()
        if (!empezadaRef.current) { setEmpezada(true); setPausa(false) } else setPausa((x) => !x)
      }
      if (k === 'f') setRapido((x) => !x)
      if (k === '+' || k === '=') cambiarRitmo(-3)
      if (k === '-') cambiarRitmo(3)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])
  const empezadaRef = useRef(empezada)
  empezadaRef.current = empezada

  // Minimapa: tocar para mover la vista.
  const irA = (ev: EventoPuntero<HTMLCanvasElement>) => {
    if (ev.buttons === 0 && ev.type !== 'pointerdown') return
    const m = mini.current!
    const r = m.getBoundingClientRect()
    const wx = ((ev.clientX - r.left) / r.width) * nivel.mapa.ancho
    const wy = ((ev.clientY - r.top) / r.height) * nivel.mapa.alto
    const v = vista.current, { w, h } = ctl.current.tam
    v.x = wx - w / v.z / 2
    v.y = wy - h / v.z / 2
    encajar(v, nivel.mapa.ancho, nivel.mapa.alto, w, h)
  }

  const zoomBoton = (f: number) => {
    const { w, h } = ctl.current.tam
    const v = vista.current
    const cx = v.x + w / v.z / 2, cy = v.y + h / v.z / 2
    v.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.z * f))
    v.x = cx - w / v.z / 2; v.y = cy - h / v.z / 2
    encajar(v, nivel.mapa.ancho, nivel.mapa.alto, w, h)
  }


  const fin = hud.fin
  const ritmo = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(hud.intervalo / PASOS_POR_SEGUNDO)
  const miniAncho = 200
  const miniAlto = Math.round((miniAncho * nivel.mapa.alto) / nivel.mapa.ancho)
  const empezar = () => { setEmpezada(true); setPausa(false) }
  const seguirDespues = !!onSiguiente && (!!fin?.ganado || !!jugador)

  return (
    <div className="kp" ref={caja} tabIndex={-1} onPointerDownCapture={() => sonidos.current.desbloquear()}>
      <style>{ESTILO}</style>

      <div className="kp-marcador" aria-live="polite">
        {onVolver && <button className="kb-btn kb-btn-2 kb-btn-chico kp-volver" onClick={onVolver}>{jugador ? pw.salir : pw.niveles}</button>}
        <span className="kp-titulo">
          <span className="kp-numero kb-pixel">{numero}</span>
          <b>{def.nombre}</b>
          {jugador && <span className="kp-jugador" style={{ ['--c' as string]: jugador.color }}>{w.turnos.turnoDe({ nombre: jugador.nombre })}</span>}
        </span>
        <span className="kp-datos">
          <span className="kp-dato"><Rico texto={pw.fuera({ n: hud.salidos, total: hud.total })} /></span>
          <span className={'kp-dato kp-casa' + (hud.salvados >= hud.minimo ? ' kp-ok' : '')}>
            <Rico texto={pw.enCasa({ n: hud.salvados, minimo: hud.minimo })} />
            <i style={{ width: `${Math.min(100, (hud.salvados / Math.max(1, hud.minimo)) * 100)}%` }} />
          </span>
          <span className="kp-dato"><Rico texto={pw.perdidos({ n: hud.perdidos })} /></span>
          <span className={'kp-dato kp-reloj' + (hud.quedan <= 20 && !fin ? ' kp-prisa' : '')}><IconoReloj /> <b>{reloj(hud.quedan)}</b></span>
        </span>
      </div>

      <div className="kp-escena">
        <canvas ref={lienzo} className="kp-lienzo" aria-label={pw.lienzo} />
        <div className="kp-zoom">
          <button onClick={() => setAyuda(true)} aria-label={pw.ayuda} title={pw.ayudaTecla}>?</button>
          <button onClick={cambiarSilencio} aria-label={silencio ? pw.activarSonido : pw.silenciar} title={pw.sonidoTecla}><IconoSonido on={!silencio} /></button>
          <button onClick={() => zoomBoton(1.25)} aria-label={pw.acercar}>+</button>
          <button onClick={() => zoomBoton(0.8)} aria-label={pw.alejar}>−</button>
        </div>

        {!empezada && !ayuda && (
          <div className="kp-velo">
            <div className="kp-tarjeta">
              {jugador && <p className="kp-turno" style={{ ['--c' as string]: jugador.color }}>{w.turnos.turnoDe({ nombre: jugador.nombre })}</p>}
              <p className="kp-eti kb-pixel">{pw.nivelN({ n: numero })}</p>
              <h3>{def.nombre}</h3>
              <p className="kp-pista">{def.pista}</p>
              <p className="kp-objetivo"><Rico texto={pw.objetivo({ minimo: def.minimo, total: def.total, tiempo: reloj(def.tiempo) })} /></p>
              {mejor > 0 && <p className="kp-mejor">{pw.mejor} <Estrellas n={mejor} tam={2} /></p>}
              <div className="kp-botones">
                <button className="kb-btn kp-grande" onClick={empezar}>{pw.aJugar}</button>
              </div>
            </div>
          </div>
        )}

        {fin && (
          <div className="kp-velo kp-velo-fin">
            <div className={'kp-tarjeta kp-final' + (fin.ganado ? ' kp-bien' : '')}>
              {jugador && <p className="kp-turno" style={{ ['--c' as string]: jugador.color }}>{jugador.nombre}</p>}
              <h3 className="kb-pixel">{fin.ganado ? pw.superado : pw.fallado}</h3>
              <div className="kp-estrellas-fin"><Estrellas n={fin.estrellas} tam={7} titulo={w.estrellas({ count: fin.estrellas })} /></div>
              <p><Rico texto={pw.llegaron({ n: fin.salvados, total: hud.total, minimo: hud.minimo })} /></p>
              <div className="kp-botones">
                {!sinRepetir && <button className={'kb-btn ' + (seguirDespues ? 'kb-btn-2' : '')} onClick={reiniciar}>{fin.ganado ? pw.otraVez : pw.reintentar}</button>}
                {seguirDespues && <button className="kb-btn" onClick={onSiguiente}>{textoSiguiente ?? pw.siguiente}</button>}
                {!jugador && onVolver && <button className="kb-enlace" onClick={onVolver}>{pw.niveles}</button>}
              </div>
            </div>
          </div>
        )}

        {ayuda && (
          <div className="kp-velo kp-velo-todo" onClick={() => setAyuda(false)}>
            <div className="kp-tarjeta kp-ayuda" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label={pw.ayuda}>
              <h3 className="kb-pixel">{pw.comoSeJuega}</h3>
              <p>{pw.objetivoGeneral}</p>
              <div className="kp-lista">
                {panel.map((h, i) => (
                  <div key={h} className="kp-fila"><Icono h={h} /><div><b>{i + 1} · {nombre(h)}</b><span>{w.habilidades[h].queHace}</span></div></div>
                ))}
              </div>
              {def.aviso && <p className="kp-teclas"><b>{def.nombreGrupo}:</b> {def.aviso}</p>}
              <p className="kp-teclas"><Rico texto={pw.controles({ n: panel.length })} /></p>
              <p className="kp-teclas">{pw.peligros}</p>
              <p className="kp-teclas"><Rico texto={pw.estrellasRegla} /></p>
              <button className="kb-btn kp-grande" onClick={() => setAyuda(false)}>{pw.entendido}</button>
            </div>
          </div>
        )}
      </div>

      <div className="kp-panel" role="toolbar" aria-label={pw.habilidades} style={{ ['--columnas' as string]: Math.max(4, panel.length) }}>
        {panel.map((h, i) => {
          const quedan = hud.habilidades[h]
          return (
            <button
              key={h}
              className={'kp-hab' + (elegida === h ? ' kp-elegida' : '') + (quedan === 0 ? ' kp-agotada' : '')}
              onClick={() => { setElegida(h); sonidos.current.desbloquear(); sonidos.current.tocar('elegir') }}
              aria-pressed={elegida === h}
              title={pw.tecla({ nombre: nombre(h), n: i + 1 })}
            >
              <Icono h={h} />
              <span className="kp-nombre">{nombre(h)}</span>
              <span className="kp-cuantas">{quedan}</span>
              <span className="kp-tecla">{i + 1}</span>
            </button>
          )
        })}
      </div>

      <div className="kp-controles">
        <div className="kp-grupo kp-ritmo-grupo" aria-label={pw.ritmo}>
          <button onClick={() => cambiarRitmo(3)} disabled={hud.intervalo >= nivel.intervalo} aria-label={pw.masDespacio}>−</button>
          <span className="kp-ritmo"><Rico texto={pw.saleUno({ s: ritmo })} /></span>
          <button onClick={() => cambiarRitmo(-3)} disabled={hud.intervalo <= INTERVALO_MINIMO} aria-label={pw.masDeprisa}>+</button>
        </div>
        <div className="kp-grupo">
          <button className="kp-play" onClick={() => { if (!empezada) empezar(); else setPausa((x) => !x) }} aria-pressed={pausa}>{pausa || !empezada ? pw.seguir : pw.pausa}</button>
          <button onClick={() => setRapido((x) => !x)} aria-pressed={rapido} className={rapido ? 'kp-activo' : ''}>×2</button>
          <button onClick={fuegos} className={armado ? 'kp-aviso' : ''} disabled={!!fin}><IconoTerminar /> {armado ? w.seguro : pw.fuegos}</button>
          {!sinRepetir && <button onClick={reiniciar}>{pw.reiniciar}</button>}
        </div>
        <canvas
          ref={mini}
          className="kp-mini"
          width={miniAncho}
          height={miniAlto}
          onPointerDown={irA}
          onPointerMove={irA}
          aria-label={pw.minimapa}
        />
      </div>
    </div>
  )
}

const ESTILO = `
  .kp { position: relative; max-width: 1240px; margin: 0 auto; padding: 16px clamp(10px, 2.4vw, 28px) 28px; display: flex; flex-direction: column; gap: 12px; outline: none; }
  .kp-marcador { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
  .kp-titulo { display: inline-flex; align-items: center; gap: 10px; flex: 1; min-width: 0; font-size: 1.15rem; }
  .kp-titulo b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kp-numero { display: grid; place-items: center; min-width: 34px; height: 34px; padding: 0 6px; border-radius: 10px; font-size: 12px; color: #2a1606;
    background: linear-gradient(180deg, #ffe58f, var(--kb-oro2)); box-shadow: 0 3px 0 var(--kb-oro3); }
  .kp-jugador, .kp-turno { display: inline-block; padding: 3px 10px 3px 8px; border-radius: 999px; font-size: .85rem; font-weight: 600; background: rgba(0,0,0,.3); box-shadow: inset 4px 0 0 var(--c); }
  .kp-datos { display: flex; flex-wrap: wrap; gap: 8px; }
  .kp-dato { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 11px; font-size: .92rem; color: var(--kb-suave);
    background: var(--kb-panel); box-shadow: inset 0 0 0 1px var(--kb-borde); white-space: nowrap; overflow: hidden; }
  .kp-dato b { color: var(--kb-tinta); font-weight: 600; }
  .kp-casa i { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--kb-turq); transition: width .3s; }
  .kp-ok { box-shadow: inset 0 0 0 1.5px var(--kb-turq); } .kp-ok b { color: var(--kb-turq2); } .kp-ok i { background: var(--kb-oro); }
  .kp-prisa { box-shadow: inset 0 0 0 1.5px var(--kb-rojo); } .kp-prisa b { color: var(--kb-rojo); }

  .kp-escena { position: relative; border-radius: 18px; overflow: hidden; background: #0b1230;
    box-shadow: 0 0 0 2px rgba(127,211,234,.18), 0 6px 0 #050817, 0 24px 50px rgba(0,0,0,.45); }
  .kp-lienzo { display: block; width: 100%; touch-action: none; cursor: crosshair; image-rendering: pixelated; }
  .kp-zoom { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; gap: 8px; z-index: 2; }
  .kp-zoom button { width: 40px; height: 40px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 12px; font-weight: 700; font-size: 1.15rem; color: #fff;
    background: rgba(9,15,40,.72); box-shadow: inset 0 0 0 1.5px rgba(127,211,234,.35), 0 3px 0 rgba(0,0,0,.5); }
  .kp-zoom button:hover { box-shadow: inset 0 0 0 1.5px var(--kb-oro), 0 3px 0 rgba(0,0,0,.5); }
  .kp-zoom button:active { transform: translateY(2px); }

  .kp-velo { position: absolute; inset: 0; z-index: 3; display: flex; align-items: center; justify-content: center; padding: 14px; background: rgba(6,10,30,.5); animation: kb-aparece .25s ease-out; }
  .kp-velo-fin { background: radial-gradient(60% 70% at 50% 50%, rgba(6,10,30,.55), rgba(6,10,30,.85)); }
  .kp-tarjeta { width: min(440px, 100%); max-height: 100%; overflow: auto; text-align: center; border-radius: 20px; padding: 20px 22px;
    background: linear-gradient(180deg, #1c2b5e 0%, #121d47 100%); box-shadow: 0 0 0 2px rgba(127,211,234,.22), 0 7px 0 #070c22, 0 26px 60px rgba(0,0,0,.55); animation: kb-sube .35s cubic-bezier(.2,1.4,.4,1); }
  .kp-tarjeta h3 { margin: 4px 0 8px; font-size: 1.5rem; }
  .kp-tarjeta p { margin: 8px 0; line-height: 1.4; color: var(--kb-suave); }
  .kp-tarjeta p b { color: var(--kb-tinta); }
  .kp-eti { margin: 0 !important; font-size: 10px; color: var(--kb-turq2) !important; }
  .kp-pista { color: var(--kb-tinta) !important; }
  .kp-objetivo { padding: 8px 10px; border-radius: 12px; background: rgba(0,0,0,.22); }
  .kp-mejor { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .kp-final h3 { font-size: clamp(14px, 2.2vw, 20px); line-height: 1.5; color: var(--kb-tinta); text-shadow: 0 3px 0 rgba(0,0,0,.5); }
  .kp-bien h3 { color: var(--kb-oro); text-shadow: 0 3px 0 #6b3c0c; }
  .kp-estrellas-fin { display: flex; justify-content: center; margin: 10px 0 6px; }
  .kp-estrellas-fin .kb-estrella { animation: kp-estrella .5s cubic-bezier(.2,1.6,.4,1) both; }
  .kp-estrellas-fin .kb-estrella:nth-child(2) { animation-delay: .15s; } .kp-estrellas-fin .kb-estrella:nth-child(3) { animation-delay: .3s; }
  @keyframes kp-estrella { from { opacity: 0; transform: scale(.3) rotate(-30deg) } to { opacity: 1; transform: none } }
  .kp-botones { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; align-items: center; margin-top: 14px; }
  .kp-grande { padding: 13px 30px; font-size: 1.2rem; }
  @media (max-width: 480px) { .kp-tarjeta { padding: 14px 14px; } .kp-tarjeta h3 { font-size: 1.2rem; } .kp-tarjeta p { margin: 5px 0; font-size: .92rem; } .kp-botones .kb-btn { padding: 11px 18px; font-size: 1rem; } }

  .kp-velo-todo { align-items: flex-start; overflow: auto; }
  .kp-ayuda { width: min(640px, 100%); text-align: left; }
  .kp-ayuda h3 { text-align: center; font-size: 15px; line-height: 1.5; color: var(--kb-oro); margin-bottom: 12px; }
  .kp-ayuda .kp-grande { display: flex; margin: 14px auto 0; }
  .kp-lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px 14px; margin: 10px 0; }
  .kp-fila { display: flex; gap: 10px; align-items: center; font-size: .88rem; line-height: 1.3; color: var(--kb-suave); }
  .kp-fila b { display: block; color: var(--kb-tinta); }
  .kp-fila .kp-icono { flex: none; width: 30px; height: 38px; }
  .kp-teclas { font-size: .88rem; }

  .kp-panel { display: grid; grid-template-columns: repeat(var(--columnas, 8), minmax(0, 1fr)); gap: 8px; }
  @media (max-width: 640px) { .kp-panel { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  .kp-hab { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px 8px; min-width: 0; border: 0; border-radius: 14px;
    background: linear-gradient(180deg, #22336b, #16244f); box-shadow: inset 0 0 0 1.5px rgba(127,211,234,.18), 0 4px 0 #070c22; transition: transform .12s cubic-bezier(.3,1.6,.5,1), box-shadow .12s; }
  .kp-hab:hover { transform: translateY(-2px); }
  .kp-hab:active { transform: translateY(3px); box-shadow: inset 0 0 0 1.5px rgba(127,211,234,.3), 0 1px 0 #070c22; }
  .kp-icono { width: 38px; height: 48px; image-rendering: pixelated; }
  .kp-nombre { font-size: .8rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .kp-cuantas { position: absolute; top: 5px; right: 6px; min-width: 22px; height: 22px; display: grid; place-items: center; border-radius: 7px; font-weight: 700; font-size: .85rem; color: #2a1606; background: var(--kb-oro); box-shadow: 0 2px 0 var(--kb-oro3); }
  .kp-tecla { position: absolute; top: 6px; left: 8px; font-size: .7rem; opacity: .5; }
  .kp-elegida { background: linear-gradient(180deg, #2c4f8a, #1b3570); box-shadow: inset 0 0 0 2.5px var(--kb-oro), 0 4px 0 #070c22, 0 0 22px rgba(255,215,94,.25); transform: translateY(-2px); }
  .kp-agotada { opacity: .4; } .kp-agotada .kp-cuantas { background: #3a4670; color: #c3cbe4; box-shadow: none; }

  .kp-controles { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
  .kp-grupo { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .kp-controles button { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border: 0; border-radius: 12px; font-weight: 500;
    background: linear-gradient(180deg, #22336b, #16244f); box-shadow: inset 0 0 0 1.5px rgba(127,211,234,.2), 0 4px 0 #070c22; transition: transform .1s; }
  .kp-controles button:active:not(:disabled) { transform: translateY(3px); box-shadow: inset 0 0 0 1.5px rgba(127,211,234,.3), 0 1px 0 #070c22; }
  .kp-controles button:disabled { opacity: .4; }
  .kp-ritmo-grupo button { width: 38px; justify-content: center; padding: 9px 0; font-size: 1.1rem; font-weight: 700; }
  .kp-ritmo { font-size: .9rem; color: var(--kb-suave); } .kp-ritmo b { color: var(--kb-tinta); }
  .kp-controles .kp-play { color: #2a1606; font-weight: 600; background: linear-gradient(180deg, #ffe58f, var(--kb-oro2)); box-shadow: 0 4px 0 var(--kb-oro3); }
  .kp-controles .kp-activo { box-shadow: inset 0 0 0 2px var(--kb-turq2), 0 4px 0 #070c22; }
  .kp-controles .kp-aviso { box-shadow: inset 0 0 0 2px var(--kb-oro), 0 4px 0 #070c22; color: var(--kb-oro); }
  .kp-mini { width: 200px; max-width: 100%; height: auto; border-radius: 10px; cursor: pointer; touch-action: none; box-shadow: 0 0 0 2px rgba(127,211,234,.25), 0 4px 0 #070c22; }
  @media (max-width: 640px) {
    .kp { padding-top: 10px; gap: 10px; }
    .kp-titulo { font-size: 1rem; } .kp-numero { min-width: 30px; height: 30px; font-size: 11px; }
    .kp-datos { width: 100%; gap: 6px; } .kp-dato { padding: 5px 8px; font-size: .8rem; gap: 4px; }
    .kp-mini { width: min(100%, 260px); margin: 0 auto; }
    .kp-zoom { gap: 6px; right: 8px; top: 8px; } .kp-zoom button { width: 32px; height: 32px; border-radius: 9px; font-size: 1rem; }
  }
` as string
