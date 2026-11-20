/*
 * La escena de la pantalla de título: niveles de verdad que se juegan solos
 * (ver demo.ts), uno de cada escenario, a pantalla completa. La cámara sigue
 * a la fila de kunobitos; el fondo se mueve más despacio que el terreno y
 * delante pasan hojas, nieve o brasas más grandes. Al llegar al Dojo, destellos.
 *
 * Todo se dibuja en el lienzo con requestAnimationFrame, sin estado de React
 * por fotograma. Se para cuando la página no se ve, y con «menos movimiento»
 * se queda en un fotograma quieto.
 */

import { useEffect, useRef } from 'react'
import { PASOS_POR_SEGUNDO, visible } from './motor'
import type { DefNivel } from './niveles'
import { ESCENARIOS, ambiente } from './paisajes'
import type { Cinta } from './sprites'
import { DEMOS, avanzarDemo, empezar, type Jugada } from './demo'
import { actualizarCapas, chorro, dibujarMundo, dibujarParticulas, prepararCapas, reducido, type Capas, type Particula } from './mundo'

/** Pasos del motor por segundo en la demo: algo más deprisa que jugando. */
const RITMO = PASOS_POR_SEGUNDO * 2.2
/** Segundos que se queda la escena tras acabar el nivel, y lo que dura el fundido. */
const RESPIRO = 2.2, FUNDIDO = 0.7

export function EscenaViva({ niveles, cinta, quieta = false, onDemo }: {
  niveles: DefNivel[]
  cinta: Cinta
  /** Con una hoja abierta encima, la escena se para (no gasta nada). */
  quieta?: boolean
  /** Cada vez que empieza una demo, con su nivel. */
  onDemo?: (def: DefNivel) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const props = useRef({ cinta, onDemo })
  props.current = { cinta, onDemo }
  const control = useRef<{ quieta: (q: boolean) => void } | null>(null)
  useEffect(() => control.current?.quieta(quieta), [quieta])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    const demos = DEMOS.map((d) => ({ demo: d, def: niveles.find((n) => n.id === d.id) })).filter((x) => x.def)
    if (!demos.length) return

    let actual = 0
    let jugada: Jugada, capas: Capas
    let ps: Particula[] = []
    let acc = 0, fin = 0, luz = 0, camX = NaN
    let previos = new Map<number, string>()
    const empezarDemo = (i: number) => {
      actual = i % demos.length
      const { demo, def } = demos[actual]
      jugada = empezar(def!, demo)
      capas = prepararCapas(jugada.e, def!.escenario)
      ps = []; acc = 0; fin = 0; luz = 0; camX = NaN; previos = new Map()
      props.current.onDemo?.(def!)
    }
    empezarDemo(0)

    const tam = { w: 0, h: 0, dpr: 1 }
    const medir = () => {
      const r = cv.getBoundingClientRect()
      tam.dpr = Math.min(2, window.devicePixelRatio || 1)
      tam.w = Math.max(1, r.width); tam.h = Math.max(1, r.height)
      cv.width = Math.round(tam.w * tam.dpr); cv.height = Math.round(tam.h * tam.dpr)
    }

    const dibujar = (t: number, dt: number) => {
      const e = jugada.e
      const { w, h, dpr } = tam
      const { ancho, alto } = e.mapa
      // Encuadre: el nivel entero, con los kunobitos pequeños. En pantallas anchas ocupa
      // el 60 % de la derecha (a la izquierda quedan el título y los botones) y se apoya
      // abajo; en el móvil va a todo el ancho, encima de los botones.
      const ancha = w > 760
      const x0 = ancha ? w * 0.4 : 0
      const bajo = ancha ? h * 0.04 : h * 0.3
      const z = Math.max(1, Math.min((w - x0 - (ancha ? w * 0.03 : 0)) / ancho, (h - bajo) / alto, 4))
      const vh = (h - bajo) / z
      const sobra = (w - x0) / z - ancho
      if (sobra >= 0) camX = -(x0 / z + sobra / 2)
      else {
        // Nivel más ancho que el hueco: la cámara sigue a la fila.
        const vivos = e.kunobitos.filter(visible)
        const objetivo = vivos.length ? vivos.reduce((s, k) => s + k.x, 0) / vivos.length : e.nivel.nido.x
        const vw = (w - x0) / z
        const deseado = Math.max(0, Math.min(ancho - vw, objetivo - vw / 2)) - x0 / z
        camX = Number.isNaN(camX) ? deseado : camX + (deseado - camX) * Math.min(1, dt * 1.6)
      }
      const camY = alto - vh

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      const escenario = jugada.def.escenario
      ctx.fillStyle = escenario ? ESCENARIOS[escenario].cielo[0] : '#0b1230'
      ctx.fillRect(0, 0, w, h)
      // Fondo: el cielo del escenario a todo el ancho, apoyado abajo, que deriva despacio (paralaje).
      const zf = Math.max(w / ancho, z) * 1.08
      const huecoF = Math.max(0, ancho - w / zf)
      const fx = huecoF * (0.5 + 0.5 * Math.sin(t * 0.06)), fy = alto - (h - bajo) / zf
      ctx.setTransform(dpr * zf, 0, 0, dpr * zf, -fx * dpr * zf, -fy * dpr * zf)
      ctx.drawImage(capas.fondo, 0, 0)
      // Terreno, Nido, Dojo y kunobitos.
      ctx.setTransform(dpr * z, 0, 0, dpr * z, -camX * dpr * z, -camY * dpr * z)
      dibujarMundo(ctx, e, capas, { cinta: props.current.cinta, t, escenario, conFondo: false, brilloDojo: luz })
      ps = dibujarParticulas(ctx, ps, dt)
      if (bajo) {
        // Debajo del nivel, la tierra se pierde en la noche.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const g = ctx.createLinearGradient(0, h - bajo, 0, h)
        g.addColorStop(0, '#24160f'); g.addColorStop(1, '#0b1230')
        ctx.fillStyle = g
        ctx.fillRect(0, h - bajo - 1, w, bajo + 1)
      }
      // Delante: partículas más grandes que pasan más deprisa.
      if (escenario && !reducido()) {
        const zc = z * 2.4
        ctx.setTransform(dpr * zc, 0, 0, dpr * zc, 0, 0)
        ctx.globalAlpha = 0.5
        ambiente(ctx, escenario, Math.ceil(w / zc), Math.ceil(h / zc), t * 1.3)
        ctx.globalAlpha = 1
      }
      // Fundido entre demos.
      const negro = fin > RESPIRO ? Math.min(1, (fin - RESPIRO) / FUNDIDO) : Math.max(0, 1 - (e.paso / RITMO) / 0.5)
      if (negro > 0) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.globalAlpha = negro
        ctx.fillStyle = '#0b1230'
        ctx.fillRect(0, 0, w, h)
        ctx.globalAlpha = 1
      }
    }

    const sucesos = () => {
      const e = jugada.e
      for (const k of e.kunobitos) {
        if (previos.get(k.id) !== k.estado) {
          if (k.estado === 'llegando') {
            luz = 1
            chorro(ps, e.nivel.dojo.x, e.nivel.dojo.y - 10, 14, ['#ffe08a', '#fff6c2', '#7fd3ea'], 46, k.id * 31 + e.paso, 0)
          }
          if (k.estado === 'humo') chorro(ps, k.x, k.y - 10, 12, ['#d9dfee', '#8e9ab4', '#ffffff'], 26, k.id * 19, -10)
          previos.set(k.id, k.estado)
        }
      }
    }

    // Menos movimiento: un fotograma quieto, con la fila a mitad de camino.
    if (reducido()) {
      medir()
      for (let i = 0; i < 230 && !jugada.e.fin; i++) avanzarDemo(jugada)
      actualizarCapas(jugada.e, capas, 0, true)
      camX = NaN
      dibujar(0, 1)
      const alCambiar = () => { medir(); camX = NaN; dibujar(0, 1) }
      const obs = new ResizeObserver(alCambiar)
      obs.observe(cv)
      return () => obs.disconnect()
    }

    let id = 0, ultimo = 0, cuadro = 0, enPantalla = true, corriendo = false, parada = quieta
    const bucle = (ahora: number) => {
      const dt = Math.min(0.1, Math.max(0, (ahora - ultimo) / 1000))
      ultimo = ahora
      cuadro++
      const e = jugada.e
      if (!e.fin) {
        acc += dt * RITMO
        let n = 0
        while (acc >= 1 && n < 6) { avanzarDemo(jugada); acc--; n++ }
        sucesos()
      } else {
        fin += dt
        if (fin > RESPIRO + FUNDIDO) empezarDemo(actual + 1)
      }
      luz = Math.max(0, luz - dt * 1.5)
      actualizarCapas(jugada.e, capas, ahora / 1000, cuadro % 4 === 0)
      dibujar(ahora / 1000, dt)
      id = requestAnimationFrame(bucle)
    }
    const arrancar = () => {
      if (corriendo || parada || !enPantalla || document.hidden) return
      corriendo = true
      ultimo = performance.now()
      id = requestAnimationFrame(bucle)
    }
    const parar = () => { corriendo = false; cancelAnimationFrame(id) }
    const alVer = () => (document.hidden ? parar() : arrancar())
    const io = new IntersectionObserver(([en]) => { enPantalla = en.isIntersecting; enPantalla ? arrancar() : parar() })
    const obs = new ResizeObserver(() => { medir(); camX = NaN })
    medir()
    io.observe(cv); obs.observe(cv)
    document.addEventListener('visibilitychange', alVer)
    control.current = { quieta: (q) => { parada = q; q ? parar() : arrancar() } }
    arrancar()
    return () => { control.current = null; parar(); io.disconnect(); obs.disconnect(); document.removeEventListener('visibilitychange', alVer) }
  }, [niveles])

  return <canvas ref={ref} className="kt-lienzo" aria-hidden="true" />
}
