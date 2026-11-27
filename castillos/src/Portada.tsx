/*
 * La portada: el reino construyéndose solo detrás, y delante el nombre, una
 * frase y dos botones (Jugar · Jugar con un amigo).
 */

import * as React from 'react'
import { useAtlas } from './atlas'
import { Icono } from './iconos'
import { PALETA } from './preferencias'
import { crearReino } from './reino'
import { useTextos } from './textos'

const ESTILO = `
  .cas-portada { position: relative; height: 100vh; height: 100svh; min-height: 600px; max-height: 1100px; overflow: hidden; isolation: isolate; }
  .cas-portada canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 0; }
  .cas-luz { position: absolute; inset: 0; pointer-events: none; z-index: 1;
    background:
      radial-gradient(ellipse 70% 60% at 12% 0%, rgba(255, 214, 140, 0.55), rgba(255, 214, 140, 0) 70%),
      radial-gradient(ellipse 120% 90% at 62% 55%, rgba(0,0,0,0) 55%, rgba(70, 36, 10, 0.42) 100%);
    mix-blend-mode: multiply; }
  .cas-sol { position: absolute; inset: 0; pointer-events: none; z-index: 1;
    background: radial-gradient(ellipse 60% 55% at 8% 6%, rgba(255, 236, 190, 0.75), rgba(255, 236, 190, 0) 65%); mix-blend-mode: screen; }
  .cas-velo { position: absolute; inset: 0; z-index: 2; pointer-events: none;
    background: linear-gradient(90deg, rgba(246, 234, 208, 0.96) 0%, rgba(246, 234, 208, 0.82) 26%, rgba(246, 234, 208, 0) 50%); }
  .cas-portada-texto { position: absolute; z-index: 3; left: clamp(24px, 6vw, 96px); top: 50%; transform: translateY(-50%); width: min(520px, 42vw); }
  .cas-cinta { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; font-size: 0.74em; color: var(--granate);
    animation: cas-entrar 700ms cubic-bezier(.2,1.2,.4,1) both; }
  .cas-cinta::before { content: ''; width: 28px; height: 2px; background: currentColor; border-radius: 2px; }
  .cas-portada h1 { margin: 10px 0 0; font-size: clamp(68px, 8.6vw, 136px); line-height: 0.92; font-weight: 900; letter-spacing: -0.035em;
    background: linear-gradient(180deg, #4a2c14 0%, #2d1a0a 60%, #6f2113 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 2px 0 rgba(255, 244, 220, 0.9)) drop-shadow(0 14px 18px rgba(90, 50, 10, 0.25));
    animation: cas-entrar 800ms 80ms cubic-bezier(.2,1.2,.4,1) both; }
  .cas-adorno { display: block; margin: 14px 0 0; color: var(--oro); animation: cas-entrar 800ms 160ms cubic-bezier(.2,1.2,.4,1) both; }
  .cas-lema { margin: 14px 0 0; font-family: 'Fraunces', Georgia, serif; font-style: italic; font-weight: 500; font-size: clamp(19px, 1.7vw, 25px); color: var(--tinta-2);
    animation: cas-entrar 800ms 220ms cubic-bezier(.2,1.2,.4,1) both; }
  .cas-portada-botones { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; animation: cas-entrar 800ms 320ms cubic-bezier(.2,1.2,.4,1) both; }
  .cas-portada-mas { margin-top: 14px; animation: cas-entrar 800ms 420ms cubic-bezier(.2,1.2,.4,1) both; }
  @media (max-width: 760px) {
    .cas-portada { min-height: 700px; }
    .cas-velo { background: linear-gradient(0deg, rgba(246, 234, 208, 0.98) 0%, rgba(246, 234, 208, 0.94) 42%, rgba(246, 234, 208, 0) 56%); }
    .cas-portada-texto { left: 20px; right: 20px; width: auto; top: 53%; bottom: auto; transform: none; }
    .cas-portada h1 { font-size: 64px; }
    .cas-adorno { margin-top: 8px; }
    .cas-lema { margin-top: 8px; font-size: 18px; }
    .cas-portada-botones { margin-top: 20px; flex-direction: column; }
    .cas-portada-botones .cas-btn { width: 100%; }
    .cas-portada-mas { margin-top: 6px; text-align: center; }
  }
  .cas-amigo-dibujo { width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center; color: #fff7e6; margin-bottom: 14px;
    background: linear-gradient(160deg, #d6a13c, #a3321f); box-shadow: 0 10px 20px -8px rgba(122, 36, 22, 0.6); }
  .cas-amigo-texto { margin: 8px 0 0; font-size: 1.05em; color: var(--tinta-2); }
  .cas-amigo-texto b { color: var(--tinta); white-space: nowrap; }
  .cas-amigo-botones { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
`

/** El nombre del juego con su filigrana. */
function Adorno() {
  return (
    <svg className="cas-adorno" width="220" height="16" viewBox="0 0 220 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M2 8h86M132 8h86" />
      <path d="M96 8c4-6 10-6 14 0 4 6 10 6 14 0" />
      <path d="M110 2.5l3 5.5-3 5.5-3-5.5z" fill="currentColor" />
      <circle cx="92" cy="8" r="1.6" fill="currentColor" />
      <circle cx="128" cy="8" r="1.6" fill="currentColor" />
    </svg>
  )
}

function useMovimientoReducido(): boolean {
  const [r, setR] = React.useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  React.useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!m) return
    const cambio = () => setR(m.matches)
    m.addEventListener('change', cambio)
    return () => m.removeEventListener('change', cambio)
  }, [])
  return r
}

/** El reino que se construye solo, a pantalla completa. */
function ReinoVivo() {
  const lienzo = React.useRef<HTMLCanvasElement>(null)
  const { atlas, oculto } = useAtlas()
  const quieto = useMovimientoReducido()
  React.useEffect(() => {
    const c = lienzo.current
    if (!c || !atlas) return
    const reino = crearReino(c, {
      imagenes: atlas,
      colores: PALETA.slice(0, 3).map((p) => p.color),
      quieto,
      encuadre: (w, h) => (w >= 760 ? { x: w * 0.42, y: h * 0.02, w: w * 0.64, h: h * 1.02 } : { x: -w * 0.08, y: -h * 0.05, w: w * 1.16, h: h * 0.6 }),
    })
    return () => reino.parar()
  }, [atlas, quieto])
  return (
    <>
      {oculto}
      <canvas ref={lienzo} aria-hidden />
    </>
  )
}

export function Portada({ onJugar, onAmigo, onAyuda }: { onJugar: () => void; onAmigo: () => void; onAyuda: () => void }) {
  const { w } = useTextos()
  const wp = w.portada
  return (
    <section className="cas-portada" aria-label={wp.titulo}>
      <style>{ESTILO}</style>
      <ReinoVivo />
      <div className="cas-luz" />
      <div className="cas-sol" />
      <div className="cas-velo" />
      <div className="cas-portada-texto">
        <div className="cas-cinta">{wp.cinta}</div>
        <h1>{wp.titulo}</h1>
        <Adorno />
        <p className="cas-lema">{wp.lema}</p>
        <div className="cas-portada-botones">
          <button type="button" className="cas-btn cas-btn-fuerte cas-btn-grande" onClick={onJugar}>
            <Icono nombre="jugar" />
            {wp.jugar}
          </button>
          <button type="button" className="cas-btn cas-btn-grande" onClick={onAmigo}>
            <Icono nombre="amigos" />
            {wp.amigo}
          </button>
        </div>
        <div className="cas-portada-mas">
          <button type="button" className="cas-btn cas-btn-plano" onClick={onAyuda}>
            <Icono nombre="ayuda" tam={18} />
            {wp.como}
          </button>
        </div>
      </div>
    </section>
  )
}

/** La hoja de «Jugar con un amigo» cuando aquí no se puede abrir una mesa en línea. */
export function HojaAmigo({ onJugarAqui, onCerrar }: { onJugarAqui: () => void; onCerrar: () => void }) {
  const { w } = useTextos()
  const wa = w.amigo
  React.useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])
  // «**texto**» en negrita.
  const partes = String(wa.texto).split(/(\*\*[^*]+\*\*)/g)
  return (
    <div className="cas-velo-modal" role="presentation" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <style>{ESTILO}</style>
      <div className="cas-papel cas-hoja" role="dialog" aria-modal="true" aria-label={wa.titulo} style={{ width: 'min(460px, 100%)' }}>
        <button type="button" className="cas-icono-btn cas-hoja-cerrar" onClick={onCerrar} aria-label={wa.cerrar}>
          <Icono nombre="cerrar" />
        </button>
        <div className="cas-amigo-dibujo">
          <Icono nombre="chispas" tam={34} />
        </div>
        <h2>{wa.titulo}</h2>
        <p className="cas-amigo-texto">{partes.map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p))}</p>
        <div className="cas-amigo-botones">
          <button type="button" className="cas-btn cas-btn-fuerte" onClick={onJugarAqui}>
            <Icono nombre="jugar" />
            {wa.jugarAqui}
          </button>
          <button type="button" className="cas-btn cas-btn-plano" onClick={onCerrar}>
            {wa.cerrar}
          </button>
        </div>
      </div>
    </div>
  )
}
