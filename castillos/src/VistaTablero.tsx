/*
 * El tablero de la partida: losetas colocadas, huecos donde cabe la loseta de
 * la mano, vista previa de la colocación y sitios donde poner estandarte.
 * Se arrastra para moverlo y se amplía con la rueda, los botones o pellizcando
 * con dos dedos.
 */

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { puntoDe } from './Estandarte'
import { LosetaIlustrada } from './LosetaIlustrada'
import { girarCampos, girarSegmentos, tipo, type Sitio } from './losetas'
import type { Partida } from './reglas'
import { zonaDeSitio } from './resumen'
import { clave, type Hueco } from './tablero'
import { Icono } from './iconos'
import { useTextos } from './textos'

const BASE = 88
/** Ancho de la columna de botones de zoom, con sus márgenes. */
const BOTONES = 60

type Props = {
  partida: Partida
  /** Colocaciones legales de la loseta de la mano. */
  legales: Hueco[]
  /** La casilla elegida para colocar y con qué giro (vista previa). */
  eleccion: Hueco | null
  onCasilla: (x: number, y: number) => void
  /** Sitios libres de la última loseta, en la fase de estandarte. */
  sitios: Sitio[]
  onSitio: (s: Sitio) => void
  /** Color de cada jugador, en el orden de la partida. */
  colores: string[]
}

const Pieza = memo(function Pieza({ id, giro, tam, puestos }: { id: string; giro: number; tam: number; puestos: string }) {
  const est = puestos ? (JSON.parse(puestos) as (Sitio & { color: string })[]) : []
  return <LosetaIlustrada id={id} giro={giro} tam={tam} estandartes={est} />
})

/** Separa los círculos de estandarte que quedarían uno encima de otro. */
function separar(pts: { x: number; y: number }[], min = 30): { x: number; y: number }[] {
  const r = pts.map((p) => ({ ...p }))
  for (let vuelta = 0; vuelta < 30; vuelta++) {
    let movido = false
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        let dx = r[j].x - r[i].x
        let dy = r[j].y - r[i].y
        let d = Math.hypot(dx, dy)
        if (d >= min) continue
        if (d < 0.01) {
          dx = Math.cos(j * 2.4)
          dy = Math.sin(j * 2.4)
          d = 1
        }
        const empuje = (min - d) / 2
        r[i].x -= (dx / d) * empuje
        r[i].y -= (dy / d) * empuje
        r[j].x += (dx / d) * empuje
        r[j].y += (dy / d) * empuje
        movido = true
      }
    }
    if (!movido) break
  }
  return r
}

export function VistaTablero({ partida, legales, eleccion, onCasilla, sitios, onSitio, colores }: Props) {
  const { w } = useTextos()
  const caja = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [desp, setDesp] = useState({ x: 0, y: 0 })
  const arrastre = useRef<{ x: number; y: number; dx: number; dy: number; movido: boolean } | null>(null)
  /** Dedos (o punteros) apoyados ahora, para pellizcar. */
  const dedos = useRef(new Map<number, { x: number; y: number }>())
  const pellizco = useRef<{ d0: number; z0: number; desp0: { x: number; y: number }; mx: number; my: number } | null>(null)
  const [medida, setMedida] = useState({ w: 0, h: 0 })
  const tam = Math.round(BASE * zoom)

  // El tamaño real del tablero, para que el dibujo y los toques usen el mismo centro.
  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    const medir = () => setMedida({ w: el.clientWidth, h: el.clientHeight })
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Rueda para ampliar (sin desplazar la página).
  useEffect(() => {
    const el = caja.current
    if (!el) return
    const rueda = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((z) => Math.min(2, Math.max(0.35, z * Math.exp(-e.deltaY * 0.0015))))
    }
    el.addEventListener('wheel', rueda, { passive: false })
    return () => el.removeEventListener('wheel', rueda)
  }, [])

  /** Centra el reino y lo amplía o reduce para que quepa entero, con sitio para los huecos. */
  const encuadrar = () => {
    const cs = Object.values(partida.tablero)
    const xs = cs.map((c) => c.x)
    const ys = cs.map((c) => c.y)
    const [x0, x1, y0, y1] = [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...ys) - 1, Math.max(...ys) + 1]
    const w = medida.w || 600
    const h = medida.h || 560
    // A la derecha están los botones de zoom: el reino se centra en el resto, para no quedar debajo
    // (en el móvil, un toque cerca de un botón acaba en el botón).
    const z = Math.min(1.2, Math.max(0.35, Math.min((w - BOTONES - 30) / ((x1 - x0 + 1) * BASE), (h - 30) / ((y1 - y0 + 1) * BASE))))
    const t = Math.round(BASE * z)
    setZoom(z)
    setDesp({ x: -((x0 + x1) / 2) * t - BOTONES / 2, y: -((y0 + y1) / 2) * t })
  }

  const centro = () => ({ cx: (medida.w || 600) / 2 + desp.x, cy: (medida.h || 560) / 2 + desp.y })

  const casillaEn = (clientX: number, clientY: number) => {
    const r = caja.current!.getBoundingClientRect()
    const { cx, cy } = centro()
    return { x: Math.floor((clientX - r.left - cx) / tam + 0.5), y: Math.floor((clientY - r.top - cy) / tam + 0.5) }
  }

  const { cx, cy } = centro()

  // Si la última loseta se sale de la vista, se vuelve a encuadrar el reino.
  const ultimaPuesta = partida.orden[partida.orden.length - 1]
  useEffect(() => {
    if (!medida.w) return
    const c = partida.tablero[ultimaPuesta]
    if (!c) return
    const l = cx + (c.x - 0.5) * tam
    const t = cy + (c.y - 0.5) * tam
    if (l < tam * 0.5 || t < tam * 0.5 || l + tam * 1.5 > medida.w || t + tam * 1.5 > medida.h) encuadrar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimaPuesta, medida.w, medida.h])

  const pos = (x: number, y: number) => ({ left: cx + (x - 0.5) * tam, top: cy + (y - 0.5) * tam })

  // Estandartes por loseta.
  const porLoseta = new Map<string, (Sitio & { color: string })[]>()
  for (const e of partida.puestos) {
    const { jugador, en, sitio } = e
    porLoseta.set(en, [...(porLoseta.get(en) ?? []), { ...sitio, color: colores[jugador] }])
  }

  const huecosGiro = new Map<string, boolean>()
  for (const h of legales) {
    const k = clave(h.x, h.y)
    huecosGiro.set(k, huecosGiro.get(k) || h.giro === partida.giro)
  }
  const ultima = partida.fase === 'estandarte' ? partida.tablero[partida.orden[partida.orden.length - 1]] : null
  const ultimaClave = partida.orden[partida.orden.length - 1]

  return (
    <div className="cas-tablero-marco">
      <div
        ref={caja}
        className="cas-tablero"
        onPointerDown={(e) => {
          // El primer dedo de un toque nuevo: se olvidan los que no avisaron al levantarse.
          if (e.isPrimary) {
            dedos.current.clear()
            pellizco.current = null
          }
          dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (dedos.current.size === 2) {
            // Dos dedos: empieza un pellizco y deja de ser un arrastre o un toque.
            const [p, q] = [...dedos.current.values()]
            const r = caja.current!.getBoundingClientRect()
            pellizco.current = { d0: Math.hypot(p.x - q.x, p.y - q.y) || 1, z0: zoom, desp0: desp, mx: (p.x + q.x) / 2 - r.left, my: (p.y + q.y) / 2 - r.top }
            arrastre.current = null
            return
          }
          if (dedos.current.size > 2) return
          arrastre.current = { x: e.clientX, y: e.clientY, dx: desp.x, dy: desp.y, movido: false }
        }}
        onPointerMove={(e) => {
          if (dedos.current.has(e.pointerId)) dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          const pz = pellizco.current
          if (pz && dedos.current.size >= 2) {
            const [p, q] = [...dedos.current.values()]
            const z = Math.min(2, Math.max(0.35, (pz.z0 * Math.hypot(p.x - q.x, p.y - q.y)) / pz.d0))
            // El punto del reino que estaba entre los dedos se queda entre los dedos.
            const w = (medida.w || 600) / 2
            const h = (medida.h || 560) / 2
            const t0 = Math.round(BASE * pz.z0)
            const t1 = Math.round(BASE * z)
            const mundoX = (pz.mx - w - pz.desp0.x) / t0
            const mundoY = (pz.my - h - pz.desp0.y) / t0
            setZoom(z)
            setDesp({ x: pz.mx - w - mundoX * t1, y: pz.my - h - mundoY * t1 })
            return
          }
          const a = arrastre.current
          if (!a) return
          const mx = e.clientX - a.x
          const my = e.clientY - a.y
          if (!a.movido && Math.hypot(mx, my) < 5) return
          a.movido = true
          setDesp({ x: a.dx + mx, y: a.dy + my })
        }}
        onPointerUp={(e) => {
          dedos.current.delete(e.pointerId)
          if (dedos.current.size < 2) pellizco.current = null
          const a = arrastre.current
          arrastre.current = null
          if (a && !a.movido) {
            const c = casillaEn(e.clientX, e.clientY)
            if (huecosGiro.has(clave(c.x, c.y))) onCasilla(c.x, c.y)
          }
        }}
        onPointerLeave={(e) => {
          dedos.current.delete(e.pointerId)
          if (dedos.current.size < 2) pellizco.current = null
          arrastre.current = null
        }}
        onLostPointerCapture={(e) => {
          dedos.current.delete(e.pointerId)
          if (dedos.current.size < 2) pellizco.current = null
        }}
        onPointerCancel={(e) => {
          dedos.current.delete(e.pointerId)
          pellizco.current = null
          arrastre.current = null
        }}
      >
        {Object.entries(partida.tablero).map(([k, c]) => (
          <div key={k} className={`cas-celda ${k === ultimaClave ? 'cas-nueva' : ''}`} style={{ ...pos(c.x, c.y), width: tam, height: tam }}>
            <Pieza id={c.id} giro={c.giro} tam={tam} puestos={porLoseta.has(k) ? JSON.stringify(porLoseta.get(k)) : ''} />
            {k === ultimaClave && <div className="cas-ultima" />}
          </div>
        ))}

        {[...huecosGiro.entries()].map(([k, conEsteGiro]) => {
          const [x, y] = k.split(',').map(Number)
          if (eleccion && eleccion.x === x && eleccion.y === y) return null
          return (
            <div
              key={`h${k}`}
              className={`cas-hueco ${conEsteGiro ? 'cas-hueco-si' : ''}`}
              style={{ ...pos(x, y), width: tam, height: tam }}
              data-hueco={k}
              title={conEsteGiro ? w.tablero.cabeAsi : w.tablero.cabeGirandola}
            />
          )
        })}

        {eleccion && partida.actual && (
          <div className="cas-celda cas-previa" style={{ ...pos(eleccion.x, eleccion.y), width: tam, height: tam }} data-previa={clave(eleccion.x, eleccion.y)}>
            <LosetaIlustrada id={partida.actual} giro={eleccion.giro} tam={tam} />
          </div>
        )}

        {ultima &&
          separar(
            sitios.map((s) => {
              const t = tipo(ultima.id)
              const p = puntoDe(s, girarSegmentos(t.segmentos, ultima.giro), girarCampos(t.campos, ultima.giro))
              const { left, top } = pos(ultima.x, ultima.y)
              return { x: left + (p.x / 100) * tam, y: top + (p.y / 100) * tam }
            }),
          ).map((q, i) => {
            const s = sitios[i]
            const zona = zonaDeSitio(s, ultima.id)
            return (
              <button
                key={i}
                type="button"
                className={`cas-sitio cas-sitio-${zona}`}
                style={{ left: q.x, top: q.y, borderColor: colores[partida.turno] }}
                title={w.sitio[zona]}
                aria-label={w.sitio[zona]}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={() => onSitio(s)}
              >
                {w.letra[zona]}
              </button>
            )
          })}
      </div>

      <div className="cas-zoom">
        <button type="button" onClick={() => setZoom((z) => Math.min(2, z * 1.2))} aria-label={w.tablero.ampliar}><Icono nombre="mas" /></button>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.35, z / 1.2))} aria-label={w.tablero.reducir}><Icono nombre="menos" /></button>
        <button type="button" onClick={encuadrar} aria-label={w.tablero.centrar} title={w.tablero.verTodo}><Icono nombre="centrar" /></button>
      </div>
    </div>
  )
}
