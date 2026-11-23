/*
 * Pantalla de título: la escena que juega sola a pantalla completa, el
 * nombre del juego en píxeles, una frase y dos botones (Jugar y Por turnos).
 */

import { useState } from 'react'
import { EscenaViva } from './EscenaViva'
import type { DefNivel } from './niveles'
import { CINTAS, PALETA, type Cinta } from './sprites'
import { Estrella } from './Iconos'

const ORDEN: Cinta[] = ['dorada', 'verde', 'morada', 'blanca', 'negra']

export function Titulo({ w, niveles, cinta, siguiente, estrellas, quieta, onJugar, onTurnos, onNiveles, onAyuda }: {
  w: any
  niveles: DefNivel[]
  cinta: Cinta
  /** El nivel que toca (índice), o null si ya están todos superados. */
  siguiente: number | null
  estrellas: number
  /** Hay una hoja abierta encima: la escena se para. */
  quieta: boolean
  onJugar: () => void
  onTurnos: () => void
  onNiveles: () => void
  onAyuda: () => void
}) {
  const t = w.titulo
  const [demo, setDemo] = useState<DefNivel | null>(null)
  const ganadas = ORDEN.indexOf(cinta)
  const letras = 'KUNOBITOS'.split('')
  return (
    <section className="kt" aria-label="Kunobitos">
      <style>{ESTILO}</style>
      <EscenaViva niveles={niveles} cinta={cinta} quieta={quieta} onDemo={setDemo} />
      <div className="kt-velo" />

      <div className="kt-arriba">
        <button className="kt-chip" onClick={onNiveles} aria-label={t.verNiveles({ n: estrellas, total: niveles.length * 3 })}>
          <Estrella llena tam={2} /> <b>{estrellas}</b><span>/{niveles.length * 3}</span>
          <i className="kt-sep" />
          {t.niveles}
        </button>
      </div>

      <div className="kt-contenido">
        <h1 className="kt-nombre kb-pixel" aria-label="Kunobitos">
          {letras.map((l, i) => <span key={i} style={{ animationDelay: `${0.05 * i}s, ${0.6 + 0.12 * i}s` }}>{l}</span>)}
        </h1>
        <div className="kt-cintas" role="img" aria-label={t.cintas({ n: ganadas + 1 })}>
          {ORDEN.map((c, i) => {
            const [luz, medio, sombra] = CINTAS[c].map((x) => PALETA[x])
            return <i key={c} className={i <= ganadas ? 'kt-ganada' : ''} style={{ background: `linear-gradient(${luz}, ${medio} 50%, ${sombra})` }} />
          })}
        </div>
        <p className="kt-gancho">{t.gancho}</p>
        <div className="kt-botones">
          <button className="kb-btn kt-jugar" onClick={onJugar}>
            <span>
              {t.jugar}
              <small>{siguiente !== null ? t.nivelN({ n: siguiente + 1, nombre: niveles[siguiente].nombre }) : t.todos}</small>
            </span>
          </button>
          <button className="kb-btn kb-btn-2 kt-turnos" onClick={onTurnos}>
            <span>
              {t.turnos}
              <small>{t.turnosSub}</small>
            </span>
          </button>
        </div>
        <button className="kb-enlace kt-como" onClick={onAyuda}>{t.comoSeJuega}</button>
      </div>

      {demo && (
        <p className="kt-pie" key={demo.id}>
          <span className="kt-punto" />
          {t.escena({ grupo: demo.nombreGrupo, nivel: demo.nombre })}
        </p>
      )}
    </section>
  )
}

const ESTILO = `
  .kt { position: relative; height: max(620px, min(100vh, 1000px)); overflow: hidden; background: #0b1230; }
  .kt-lienzo { position: absolute; inset: 0; width: 100%; height: 100%; display: block; image-rendering: pixelated; }
  .kt-velo { position: absolute; inset: 0; pointer-events: none;
    background:
      linear-gradient(90deg, rgba(6, 10, 30, 0.85) 0%, rgba(6, 10, 30, 0.5) 26%, rgba(6, 10, 30, 0) 42%),
      linear-gradient(180deg, rgba(6, 10, 30, 0.45) 0%, rgba(6, 10, 30, 0) 22%, rgba(6, 10, 30, 0) 72%, rgba(6, 10, 30, 0.7) 100%); }
  .kt-arriba { position: absolute; top: 18px; right: 18px; z-index: 3; }
  .kt-chip { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 999px; border: 0;
    background: rgba(9, 15, 40, 0.82); box-shadow: inset 0 0 0 1.5px rgba(127, 211, 234, 0.3), 0 6px 18px rgba(0,0,0,.35);
    font-weight: 500; font-size: 0.95rem; transition: transform .15s; }
  .kt-chip:hover { transform: translateY(-1px); box-shadow: inset 0 0 0 1.5px rgba(255, 215, 94, 0.6), 0 6px 18px rgba(0,0,0,.35); }
  .kt-chip b { color: var(--kb-oro); font-weight: 600; } .kt-chip span { opacity: .6; }
  .kt-sep { width: 1px; height: 16px; background: rgba(255,255,255,.2); margin: 0 4px; }

  .kt-contenido { position: absolute; z-index: 2; left: clamp(24px, 6.5vw, 110px); top: 50%; transform: translateY(-52%); width: min(560px, 46vw); }
  .kt-nombre { margin: 0; font-size: clamp(30px, 5.4vw, 80px); line-height: 1; color: var(--kb-oro); white-space: nowrap;
    text-shadow: 0 0.06em 0 #c98a1c, 0 0.12em 0 #6b3c0c, 0 0.2em 0 rgba(5, 8, 24, 0.55), 0 0 0.6em rgba(255, 215, 94, 0.28); }
  .kt-nombre span { display: inline-block; animation: kt-cae .7s cubic-bezier(.2,1.5,.4,1) both, kt-flota 3.2s ease-in-out infinite; }
  @keyframes kt-cae { from { opacity: 0; transform: translateY(-0.9em) scale(.8) } to { opacity: 1; transform: none } }
  @keyframes kt-flota { 0%, 100% { translate: 0 0 } 50% { translate: 0 -0.06em } }
  .kt-cintas { display: flex; gap: 6px; margin: 26px 0 0; }
  .kt-cintas i { display: block; width: 34px; height: 10px; border-radius: 2px; opacity: .28; box-shadow: 0 2px 0 rgba(0,0,0,.45); }
  .kt-cintas i.kt-ganada { opacity: 1; box-shadow: 0 2px 0 rgba(0,0,0,.45), 0 0 14px rgba(255, 215, 94, .35); }
  .kt-gancho { margin: 18px 0 30px; font-size: clamp(1.05rem, 1.5vw, 1.35rem); line-height: 1.4; color: #e6e9f5; max-width: 30ch; text-shadow: 0 2px 10px rgba(0,0,0,.6); }
  .kt-botones { display: flex; flex-wrap: wrap; gap: 16px 14px; align-items: stretch; }
  .kt-botones .kb-btn { text-align: left; min-width: 200px; padding: 15px 26px 14px; font-size: 1.3rem; }
  .kt-jugar { animation: kt-late 2.4s ease-in-out 1.4s infinite; }
  @keyframes kt-late { 0%, 100% { filter: brightness(1) } 8% { filter: brightness(1.18) } 16% { filter: brightness(1) } }
  .kt-como { margin-top: 18px; font-size: 1rem; }
  .kt-pie { position: absolute; z-index: 2; left: clamp(24px, 6.5vw, 110px); bottom: 20px; margin: 0; display: flex; align-items: center; gap: 10px;
    font-size: .9rem; color: rgba(244, 241, 230, .78); animation: kb-aparece .6s ease-out; }
  .kt-punto { width: 8px; height: 8px; border-radius: 2px; background: #ff5a5a; box-shadow: 0 0 10px #ff5a5a; animation: kt-parpadea 1.4s steps(2) infinite; }
  @keyframes kt-parpadea { 50% { opacity: .25 } }

  @media (max-width: 760px) {
    .kt { height: max(640px, min(100vh, 900px)); }
    .kt-velo { background: linear-gradient(180deg, rgba(6,10,30,.82) 0%, rgba(6,10,30,.35) 34%, rgba(6,10,30,0) 50%, rgba(6,10,30,.55) 66%, rgba(6,10,30,.92) 100%); }
    .kt-arriba { top: 12px; right: 12px; }
    .kt-contenido { position: absolute; inset: 0; transform: none; width: auto; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 74px 20px 54px; pointer-events: none; }
    .kt-contenido > * { pointer-events: auto; }
    .kt-nombre { font-size: clamp(26px, 8.6vw, 40px); }
    .kt-cintas { margin-top: 18px; }
    .kt-cintas i { width: 26px; height: 8px; }
    .kt-gancho { margin: 14px auto 0; font-size: 1.05rem; }
    .kt-botones { margin-top: auto; width: 100%; flex-direction: column; gap: 14px; }
    .kt-botones .kb-btn { width: 100%; text-align: center; justify-content: center; }
    .kt-como { margin-top: 10px; }
    .kt-pie { left: 0; right: 0; justify-content: center; bottom: 14px; font-size: .8rem; }
  }
`
