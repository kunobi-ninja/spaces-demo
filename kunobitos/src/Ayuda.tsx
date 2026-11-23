/*
 * «¿Cómo se juega?»: tres pasos con dibujos del propio juego (el Nido, un
 * kunobito, las habilidades y el Dojo), las estrellas y los controles.
 */

import { useEffect, useRef } from 'react'
import { DOJO, NIDO, dibujarDojo, dibujarNido } from './escenario'
import { ANDAR, COMETA, HOJA, PELDANO, SALTO, dibujarSprite, halo, type Sprite } from './sprites'
import { Estrellas } from './Iconos'
import { Rico } from './Rico'

/** Un dibujo de píxeles a escala `e`, pintado una vez. */
function Dibujo({ ancho, alto, e = 3, pintar, etiqueta }: { ancho: number; alto: number; e?: number; pintar: (ctx: CanvasRenderingContext2D) => void; etiqueta?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, ancho * e, alto * e)
    ctx.save(); ctx.scale(e, e); pintar(ctx); ctx.restore()
  }, [])
  return <canvas ref={ref} width={ancho * e} height={alto * e} className="ka-dibujo" style={{ width: ancho * e, height: alto * e }} aria-hidden="true" />
}

const px = (ctx: CanvasRenderingContext2D, ox: number, oy: number) => (x: number, y: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1) }

const sprite = (s: Sprite, x: number) => (ctx: CanvasRenderingContext2D) => dibujarSprite(ctx, s, x, 30, 1)

export function Ayuda({ w, onCerrar }: { w: any; onCerrar: () => void }) {
  const a = w.ayuda
  return (
    <div className="kb-hoja-fondo" onClick={onCerrar}>
      <style>{ESTILO}</style>
      <div className="kb-hoja ka" role="dialog" aria-label={a.titulo} onClick={(ev) => ev.stopPropagation()}>
        <button className="kb-cerrar" onClick={onCerrar} aria-label={w.cerrar}>×</button>
        <h2>{a.titulo}</h2>
        <ol className="ka-pasos">
          <li>
            <div className="ka-arte">
              <Dibujo ancho={58} alto={30} pintar={(ctx) => {
                halo(ctx, NIDO.salidaX, NIDO.salidaY + 3, 10, '#7ff0dc', 0.4)
                dibujarNido(px(ctx, 0, 4), 1)
                dibujarSprite(ctx, ANDAR[2], 42, 30, 1)
              }} />
            </div>
            <p><b>1</b>{a.paso1}</p>
          </li>
          <li>
            <div className="ka-arte ka-fila">
              {[SALTO[1], HOJA[0], PELDANO[0], COMETA[0]].map((s, i) => (
                <Dibujo key={i} ancho={24} alto={30} e={2} pintar={sprite(s, 12)} />
              ))}
            </div>
            <p><b>2</b>{a.paso2}</p>
          </li>
          <li>
            <div className="ka-arte">
              <Dibujo ancho={DOJO.ancho} alto={DOJO.alto} pintar={(ctx) => {
                halo(ctx, DOJO.puertaX, DOJO.sueloY - 5, 18, '#ffd75e', 0.4)
                dibujarDojo(px(ctx, 0, 0), 1)
              }} />
            </div>
            <p><b>3</b>{a.paso3}</p>
          </li>
        </ol>
        <div className="ka-estrellas">
          <span><Estrellas n={1} tam={2} /> {a.una}</span>
          <span><Estrellas n={2} tam={2} /> {a.dos}</span>
          <span><Estrellas n={3} tam={2} /> {a.tres}</span>
        </div>
        <p className="ka-controles"><Rico texto={a.controles} /></p>
        <button className="kb-btn ka-vale" onClick={onCerrar}>{a.entendido}</button>
      </div>
    </div>
  )
}

const ESTILO = `
  .ka { width: min(720px, 100%); }
  .ka-pasos { list-style: none; padding: 0; margin: 4px 0 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .ka-pasos li { background: rgba(255,255,255,.04); border-radius: 16px; padding: 14px 12px 12px; box-shadow: inset 0 0 0 1px rgba(127,211,234,.14); }
  .ka-arte { height: 112px; display: flex; align-items: flex-end; justify-content: center; border-radius: 12px; padding-bottom: 8px;
    background: radial-gradient(90% 90% at 50% 100%, rgba(63,182,200,.22), rgba(63,182,200,0) 70%); }
  .ka-fila { gap: 0; }
  .ka-dibujo { image-rendering: pixelated; display: block; }
  .ka-pasos p { margin: 10px 0 0; color: var(--kb-tinta); font-size: .98rem; line-height: 1.35; }
  .ka-pasos p b { display: inline-grid; place-items: center; width: 22px; height: 22px; margin-right: 8px; border-radius: 6px; background: var(--kb-oro); color: #2a1606; font-size: .85rem; vertical-align: 1px; }
  .ka-estrellas { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 18px 0 4px; color: var(--kb-tinta); font-size: .95rem; }
  .ka-estrellas span { display: inline-flex; align-items: center; gap: 8px; }
  .ka-controles { font-size: .9rem; }
  .ka-controles b { color: var(--kb-tinta); }
  .kb .ka-vale { display: flex; margin: 16px auto 0; }
  @media (max-width: 640px) {
    .ka-pasos { grid-template-columns: 1fr; }
    .ka-pasos li { display: grid; grid-template-columns: 120px 1fr; gap: 12px; align-items: center; padding: 10px; }
    .ka-arte { height: 84px; }
    .ka-arte canvas { width: auto !important; height: 64px !important; }
    .ka-fila canvas { height: 46px !important; }
    .ka-pasos p { margin: 0; }
  }
`
