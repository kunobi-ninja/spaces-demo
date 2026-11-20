/*
 * «Por turnos»: dos personas juegan el mismo nivel en este dispositivo, una
 * detrás de otra, y gana quien lleve más kunobitos al Dojo. Aquí están la
 * hoja para empezar (todo ya rellenado) y la pantalla final.
 */

import { useEffect, useRef, useState } from 'react'
import type { Resultado } from './motor'
import type { DefNivel } from './niveles'
import { abierto, type Progreso } from './progreso'
import { ANDAR, CINTAS, LLEGAR, PALETA, conCinta, dibujarSprite, type Cinta } from './sprites'
import { Estrellas } from './Iconos'

/** Cada jugador lleva su cinta, para saber de quién es cada turno. */
export const CINTA_JUGADOR: [Cinta, Cinta] = ['dorada', 'morada']
export const colorCinta = (c: Cinta) => PALETA[CINTAS[c][1]]

export function HojaTurnos({ w, niveles, progreso, inicial, nombres, onEmpezar, onCerrar }: {
  w: any
  niveles: DefNivel[]
  progreso: Progreso
  inicial: number
  nombres: [string, string]
  onEmpezar: (nivel: number, nombres: [string, string]) => void
  onCerrar: () => void
}) {
  const t = w.turnos
  const abiertos = niveles.map((_, i) => i).filter((i) => abierto(progreso, i))
  const [nivel, setNivel] = useState(abiertos.includes(inicial) ? inicial : abiertos[0] ?? 0)
  const [a, setA] = useState(nombres[0])
  const [b, setB] = useState(nombres[1])
  const pos = abiertos.indexOf(nivel)
  const mover = (d: number) => setNivel(abiertos[Math.max(0, Math.min(abiertos.length - 1, pos + d))])
  return (
    <div className="kb-hoja-fondo" onClick={onCerrar}>
      <style>{ESTILO}</style>
      <form
        className="kb-hoja kd"
        role="dialog"
        aria-label={t.titulo}
        onClick={(ev) => ev.stopPropagation()}
        onSubmit={(ev) => { ev.preventDefault(); onEmpezar(nivel, [a.trim() || t.jugador1, b.trim() || t.jugador2]) }}
      >
        <button type="button" className="kb-cerrar" onClick={onCerrar} aria-label={w.cerrar}>×</button>
        <h2>{t.titulo}</h2>
        <p>{t.explica}</p>
        <div className="kd-jugadores">
          {[[a, setA, t.primero, 0], [b, setB, t.despues, 1]].map(([v, set, etiqueta, i]) => (
            <label key={i as number} className="kd-jugador" style={{ ['--c' as string]: colorCinta(CINTA_JUGADOR[i as number]) }}>
              <span>{etiqueta as string}</span>
              <input value={v as string} maxLength={16} onChange={(ev) => (set as (x: string) => void)(ev.target.value)} />
            </label>
          ))}
        </div>
        <div className="kd-nivel">
          <span className="kd-etiqueta">{t.nivel}</span>
          <button type="button" className="kd-flecha" onClick={() => mover(-1)} disabled={pos <= 0} aria-label={t.anterior}>‹</button>
          <b>{nivel + 1} · {niveles[nivel]?.nombre}</b>
          <button type="button" className="kd-flecha" onClick={() => mover(1)} disabled={pos >= abiertos.length - 1} aria-label={t.posterior}>›</button>
        </div>
        <button type="submit" className="kb-btn kd-empezar">{t.empezar}</button>
      </form>
    </div>
  )
}

/** El kunobito de cada jugador, con su cinta; el que gana, saludando. */
function Retrato({ cinta, gana }: { cinta: Cinta; gana: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 24, 30)
    dibujarSprite(ctx, conCinta(gana ? LLEGAR[1] : ANDAR[0], cinta), 12, 30, 1)
  }, [cinta, gana])
  return <canvas ref={ref} width={24} height={30} className="kd-retrato" aria-hidden="true" />
}

export function FinDuelo({ w, nombres, resultados, def, onRevancha, onOtro, onInicio }: {
  w: any
  nombres: [string, string]
  resultados: [Resultado, Resultado]
  def: DefNivel
  onRevancha: () => void
  onOtro?: () => void
  onInicio: () => void
}) {
  const t = w.turnos
  const [r0, r1] = resultados
  const ganador = r0.salvados === r1.salvados ? (r0.estrellas === r1.estrellas ? -1 : r0.estrellas > r1.estrellas ? 0 : 1) : r0.salvados > r1.salvados ? 0 : 1
  return (
    <section className="kd-fin">
      <style>{ESTILO}</style>
      <p className="kd-nivel-fin">{def.nombre}</p>
      <h1 className="kb-pixel">{ganador < 0 ? t.empate : t.gana({ nombre: nombres[ganador] })}</h1>
      <div className="kd-podio">
        {[0, 1].map((i) => (
          <div key={i} className={'kd-lado' + (ganador === i ? ' kd-gana' : '')} style={{ ['--c' as string]: colorCinta(CINTA_JUGADOR[i]) }}>
            {ganador === i && <span className="kd-corona" aria-hidden="true" />}
            <Retrato cinta={CINTA_JUGADOR[i]} gana={ganador === i} />
            <span className="kd-nombre">{nombres[i]}</span>
            <span className="kd-cuenta kb-pixel">{resultados[i].salvados}</span>
            <span className="kd-sub">{t.enElDojo({ count: resultados[i].salvados })}</span>
            <Estrellas n={resultados[i].estrellas} tam={3} titulo={w.estrellas({ count: resultados[i].estrellas })} />
          </div>
        ))}
      </div>
      <div className="kd-botones">
        <button className="kb-btn" onClick={onRevancha}>{t.revancha}</button>
        {onOtro && <button className="kb-btn kb-btn-2" onClick={onOtro}>{t.otroNivel}</button>}
        <button className="kb-enlace" onClick={onInicio}>{t.inicio}</button>
      </div>
    </section>
  )
}

const ESTILO = `
  .kd-jugadores { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0 12px; }
  .kd-jugador { display: flex; flex-direction: column; gap: 6px; font-size: .85rem; color: var(--kb-suave); }
  .kd-jugador input { font: inherit; font-size: 1.1rem; font-weight: 600; color: var(--kb-tinta); padding: 11px 12px 11px 14px; border-radius: 12px; border: 0; width: 100%;
    background: rgba(5,9,26,.55); box-shadow: inset 4px 0 0 var(--c), inset 0 0 0 1.5px rgba(127,211,234,.2); }
  .kd-jugador input:focus { outline: none; box-shadow: inset 4px 0 0 var(--c), inset 0 0 0 2px var(--kb-turq2); }
  .kd-nivel { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(5,9,26,.4); }
  .kd-nivel b { flex: 1; text-align: center; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kd-etiqueta { font-size: .85rem; color: var(--kb-suave); }
  .kd-flecha { width: 36px; height: 36px; border-radius: 10px; border: 0; background: rgba(255,255,255,.1); font-size: 1.4rem; line-height: 1; }
  .kd-flecha:disabled { opacity: .3; }
  .kd-empezar { display: flex; width: 100%; margin-top: 18px; }
  @media (max-width: 480px) { .kd-jugadores { grid-template-columns: 1fr; } }

  .kd-fin { min-height: max(620px, min(100vh, 1000px)); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 16px;
    background: radial-gradient(60% 50% at 50% 40%, rgba(255,215,94,.16), rgba(255,215,94,0) 70%); }
  .kd-nivel-fin { margin: 0; color: var(--kb-suave); }
  .kd-fin h1 { margin: 12px 0 30px; font-size: clamp(20px, 3.6vw, 40px); color: var(--kb-oro); text-shadow: 0 4px 0 #6b3c0c, 0 0 30px rgba(255,215,94,.3); animation: kb-sube .5s cubic-bezier(.2,1.4,.4,1); }
  .kd-podio { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; }
  .kd-lado { position: relative; width: 210px; padding: 22px 16px 18px; border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: 6px;
    background: linear-gradient(180deg, #1c2b5e, #121d47); box-shadow: inset 0 5px 0 var(--c), 0 6px 0 #070c22, 0 18px 40px rgba(0,0,0,.4); animation: kb-sube .5s cubic-bezier(.2,1.4,.4,1) both; }
  .kd-lado + .kd-lado { animation-delay: .1s; }
  .kd-gana { transform: translateY(-10px); box-shadow: inset 0 5px 0 var(--c), 0 0 0 3px var(--kb-oro), 0 6px 0 #070c22, 0 0 40px rgba(255,215,94,.35); }
  .kd-corona { position: absolute; top: -18px; left: 50%; width: 36px; height: 22px; translate: -50% 0; background: var(--kb-oro);
    clip-path: polygon(0 100%, 0 20%, 25% 60%, 50% 0, 75% 60%, 100% 20%, 100% 100%); filter: drop-shadow(0 3px 0 #6b3c0c); }
  .kd-retrato { width: 72px; height: 90px; image-rendering: pixelated; margin-top: -6px; filter: drop-shadow(0 4px 0 rgba(0,0,0,.35)); }
  .kd-gana .kd-retrato { animation: km-bota 1.2s ease-in-out infinite; }
  @keyframes km-bota { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
  .kd-nombre { font-weight: 600; font-size: 1.15rem; }
  .kd-cuenta { font-size: 34px; color: var(--kb-tinta); margin-top: 4px; }
  @media (max-width: 480px) { .kd-podio { flex-wrap: nowrap; gap: 10px; } .kd-lado { width: 50%; padding: 18px 8px 14px; } .kd-cuenta { font-size: 26px; } }
  .kd-sub { color: var(--kb-suave); font-size: .9rem; margin-bottom: 4px; }
  .kd-botones { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; align-items: center; margin-top: 34px; }
`
