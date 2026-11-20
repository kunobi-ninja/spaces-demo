/*
 * «Niveles»: el mapa del juego. Cada grupo es una franja con el color de su
 * escenario; cada nivel, una ventana con su propio terreno en miniatura (el
 * Nido, el Dojo y el camino), sus estrellas o un candado.
 */

import { useEffect, useRef, useState } from 'react'
import { nuevo } from './motor'
import { crearNivel, type DefNivel } from './niveles'
import type { InfoGrupo } from './catalogo'
import { abierto, type Progreso } from './progreso'
import { dibujarMundo, prepararCapas } from './mundo'
import { CINTAS, PALETA, type Cinta } from './sprites'
import { Candado, Estrella, Estrellas, IconoCasa } from './Iconos'
import { ESCENARIOS } from './paisajes'

/** Color de cada grupo: el cielo de su escenario, o la noche de Kunobi para los de siempre. */
const tono = (d?: DefNivel) => (d?.escenario ? ESCENARIOS[d.escenario].cielo : ['#0f1d4a', '#1a2c66', '#24407e'])

/** El terreno de un nivel pintado una vez, a 1 píxel por píxel (el CSS lo amplía sin suavizar). */
function Miniatura({ def, orden }: { def: DefNivel; orden: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    // Una a una, para no parar la página al abrirla.
    const id = setTimeout(() => {
      const cv = ref.current
      if (!cv) return
      const e = nuevo(crearNivel(def))
      cv.width = e.mapa.ancho; cv.height = e.mapa.alto
      const ctx = cv.getContext('2d')!
      dibujarMundo(ctx, e, prepararCapas(e, def.escenario), { cinta: 'dorada', t: 0.4, escenario: def.escenario, ambienteOn: false })
    }, 30 + orden * 18)
    return () => clearTimeout(id)
  }, [def.id])
  return <canvas ref={ref} className="km-mini" aria-hidden="true" />
}

export function Mapa({ w, niveles, grupos, progreso, cinta, siguiente, onJugar, onInicio, onBorrar }: {
  w: any
  niveles: DefNivel[]
  grupos: InfoGrupo[]
  progreso: Progreso
  cinta: Cinta
  siguiente: number | null
  onJugar: (i: number) => void
  onInicio: () => void
  onBorrar: () => void
}) {
  const m = w.mapa
  const [seguro, setSeguro] = useState(false)
  const orden: Cinta[] = ['dorada', 'verde', 'morada', 'blanca', 'negra']
  const ganada = (c: Cinta) => orden.indexOf(c) <= orden.indexOf(cinta)
  const estrellas = niveles.reduce((s, d) => s + (progreso[d.id] ?? 0), 0)
  return (
    <section className="km">
      <style>{ESTILO}</style>
      <header className="km-cabeza">
        <button className="kb-btn kb-btn-2 kb-btn-chico" onClick={onInicio}><IconoCasa /> {m.inicio}</button>
        <h1 className="kb-pixel">{m.titulo}</h1>
        <span className="km-total" aria-label={w.lista.estrellas({ n: estrellas, total: niveles.length * 3 }).replace(/\*/g, '')}>
          <Estrella llena tam={3} /> <b>{estrellas}</b> / {niveles.length * 3}
        </span>
      </header>

      {grupos.map((g) => {
        const suyos = niveles.map((d, i) => ({ d, i })).filter(({ d }) => d.grupo === g.grupo)
        const [c0, c1, c2] = tono(suyos[0]?.d)
        return (
          <section key={g.grupo} className="km-grupo" style={{ background: `linear-gradient(135deg, ${c1} 0%, ${c0} 60%, ${c2 ?? c1} 140%)` }}>
            <div className="km-grupo-cabeza">
              <h2 className="kb-pixel">{g.nombre}</h2>
              <p>{g.texto}</p>
              {g.cinta && <Cintilla cinta={g.cinta} ganada={ganada(g.cinta)} w={w} />}
            </div>
            <div className="km-niveles">
              {suyos.map(({ d, i }) => {
                const libre = abierto(progreso, i)
                const e = progreso[d.id] ?? 0
                const toca = i === siguiente
                return (
                  <button
                    key={d.id}
                    className={'km-nivel' + (libre ? '' : ' km-cerrado') + (toca ? ' km-toca' : '')}
                    disabled={!libre}
                    onClick={() => onJugar(i)}
                    aria-label={`${i + 1}. ${d.nombre}. ${libre ? w.estrellas({ count: e }) : w.lista.cerrado}`}
                  >
                    <span className="km-ventana">
                      <Miniatura def={d} orden={i} />
                      <span className="km-num kb-pixel">{i + 1}</span>
                      {!libre && <span className="km-candado"><Candado tam={3} /></span>}
                      {toca && <span className="km-te-toca">{m.teToca}</span>}
                    </span>
                    <span className="km-pie">
                      <span className="km-nombre">{d.nombre}</span>
                      {libre && <Estrellas n={e} tam={2} />}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      <p className="km-final">
        {w.lista.pie}{' '}
        <button className="kb-enlace" onClick={() => {
          if (!seguro) { setSeguro(true); setTimeout(() => setSeguro(false), 3000); return }
          onBorrar(); setSeguro(false)
        }}>{seguro ? w.seguro : w.lista.borrar}</button>
      </p>
    </section>
  )
}

/** La cinta que da un grupo: una franja de su color, encendida si ya se ha ganado. */
function Cintilla({ cinta, ganada, w }: { cinta: Cinta; ganada: boolean; w: any }) {
  const [luz, medio, sombra] = CINTAS[cinta].map((c) => PALETA[c])
  const nombre = w.cintas[cinta]
  return (
    <span className={'km-cinta' + (ganada ? ' km-ganada' : '')} title={ganada ? w.cinta.ganadaTitulo({ nombre }) : w.cinta.alSuperar({ nombre })}>
      <i style={{ background: `linear-gradient(${luz}, ${medio} 45%, ${sombra})` }} />
      {ganada ? w.cinta.ganada({ nombre }) : w.cinta.nombre({ nombre })}
    </span>
  )
}

const ESTILO = `
  .km { max-width: 1240px; margin: 0 auto; padding: 22px clamp(14px, 3vw, 32px) 40px; }
  .km-cabeza { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; position: sticky; top: 0; z-index: 3; padding: 10px 0;
    background: linear-gradient(180deg, rgba(11,18,48,.96) 70%, rgba(11,18,48,0)); }
  .km-cabeza h1 { margin: 0; flex: 1; font-size: clamp(16px, 2.4vw, 26px); color: var(--kb-oro); text-shadow: 0 3px 0 #6b3c0c; }
  .km-total { display: inline-flex; align-items: center; gap: 6px; font-size: 1.05rem; color: var(--kb-suave); }
  .km-total b { color: var(--kb-oro); font-size: 1.2rem; }
  .km-grupo { position: relative; border-radius: 22px; padding: 18px 18px 20px; margin: 0 0 18px; overflow: hidden;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.08), inset 0 1px 0 rgba(255,255,255,.12), 0 6px 0 rgba(4,7,22,.6), 0 18px 40px rgba(0,0,0,.35); }
  .km-grupo::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .5;
    background-image: radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.5px); background-size: 14px 14px; }
  .km-grupo-cabeza { position: relative; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; margin-bottom: 14px; }
  .km-grupo-cabeza h2 { margin: 0; font-size: 15px; color: #fff; text-shadow: 0 3px 0 rgba(0,0,0,.45); }
  .km-grupo-cabeza p { margin: 0; color: rgba(244,241,230,.78); font-size: .98rem; }
  .km-cinta { display: inline-flex; align-items: center; gap: 7px; font-size: .85rem; padding: 4px 10px 4px 6px; border-radius: 999px; background: rgba(0,0,0,.25); opacity: .7; }
  .km-cinta i { width: 26px; height: 8px; border-radius: 2px; box-shadow: 0 1px 0 rgba(0,0,0,.5); }
  .km-ganada { opacity: 1; font-weight: 600; box-shadow: 0 0 0 1.5px rgba(255,215,94,.6); }
  .km-niveles { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
  @media (max-width: 900px) { .km-niveles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }
  .km-nivel { display: flex; flex-direction: column; padding: 0; border: 0; border-radius: 16px; overflow: hidden; text-align: left; background: rgba(6,10,30,.55);
    box-shadow: 0 0 0 2px rgba(255,255,255,.1), 0 5px 0 rgba(3,6,20,.7); transition: transform .16s cubic-bezier(.3,1.6,.5,1), box-shadow .16s; }
  .km-nivel:hover:not(:disabled) { transform: translateY(-3px) rotate(-.4deg); box-shadow: 0 0 0 2px var(--kb-oro), 0 8px 0 rgba(3,6,20,.7), 0 16px 30px rgba(0,0,0,.4); }
  .km-nivel:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 0 0 2px var(--kb-oro), 0 2px 0 rgba(3,6,20,.7); }
  .km-ventana { position: relative; display: block; aspect-ratio: 23 / 10; overflow: hidden; background: #0b1230; }
  .km-mini { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; image-rendering: pixelated; }
  .km-num { position: absolute; left: 8px; top: 8px; min-width: 30px; height: 30px; padding: 0 6px; display: grid; place-items: center; border-radius: 9px; font-size: 11px;
    color: #2a1606; background: linear-gradient(180deg, #ffe58f, var(--kb-oro2)); box-shadow: 0 3px 0 var(--kb-oro3); }
  .km-cerrado .km-mini { filter: grayscale(.55) brightness(.62) saturate(.8); }
  .km-cerrado .km-num { background: #3a4670; color: #c3cbe4; box-shadow: 0 3px 0 #1c2547; }
  .km-cerrado .km-pie { opacity: .6; }
  .km-candado { position: absolute; left: 50%; top: 50%; translate: -50% -50%; width: 52px; height: 52px; display: grid; place-items: center; border-radius: 50%;
    background: rgba(9,15,40,.78); box-shadow: inset 0 0 0 2px rgba(255,215,94,.35), 0 4px 12px rgba(0,0,0,.5); }
  .km-te-toca { position: absolute; right: 8px; top: 8px; padding: 4px 9px; border-radius: 999px; font-size: .8rem; font-weight: 600; color: #2a1606; background: var(--kb-oro);
    box-shadow: 0 2px 0 var(--kb-oro3); animation: km-bota 1.6s ease-in-out infinite; }
  @keyframes km-bota { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
  .km-toca { box-shadow: 0 0 0 3px var(--kb-oro), 0 5px 0 rgba(3,6,20,.7), 0 0 26px rgba(255,215,94,.35); }
  .km-pie { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 11px 10px; }
  .km-nombre { font-weight: 600; font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  @media (max-width: 520px) { .km-pie { flex-direction: column; align-items: flex-start; gap: 4px; } .km-nombre { font-size: .92rem; } }
  .km-final { text-align: center; color: var(--kb-tenue); font-size: .9rem; margin-top: 24px; }
`
