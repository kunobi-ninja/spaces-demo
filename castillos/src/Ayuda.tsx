/*
 * «¿Cómo se juega?»: cuatro pasos ilustrados con losetas de verdad, en una hoja
 * sobre la pantalla. La sirven la portada y la partida.
 */

import * as React from 'react'
import { enWeb } from './entorno'
import { Icono } from './iconos'
import { LosetaIlustrada } from './LosetaIlustrada'
import { ESTANDARTES_POR_JUGADOR, PUNTOS } from './losetas'
import { PALETA } from './preferencias'
import { Rico, useTextos } from './textos'

const ESTILO = `
  .cas-pasos { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 12px; }
  .cas-paso { display: grid; grid-template-columns: 132px 1fr; gap: 16px; align-items: center; padding: 12px; border-radius: 14px;
    background: rgba(255, 250, 238, 0.7); border: 1px solid var(--linea); animation: cas-entrar 420ms cubic-bezier(.2,1.2,.4,1) both; }
  .cas-paso:nth-child(2) { animation-delay: 60ms; } .cas-paso:nth-child(3) { animation-delay: 120ms; } .cas-paso:nth-child(4) { animation-delay: 180ms; }
  .cas-paso h3 { margin: 0 0 2px; font-size: 1.15em; font-weight: 750; display: flex; align-items: baseline; gap: 8px; }
  .cas-paso h3 span { font-size: 0.8em; color: var(--granate); font-weight: 800; }
  .cas-paso p { margin: 0; color: var(--tinta-2); font-size: 0.94em; }
  .cas-dibujo { display: flex; justify-content: center; align-items: center; height: 72px; filter: drop-shadow(0 6px 6px rgba(60, 32, 10, 0.28)); }
  .cas-dibujo svg { border-radius: 3px; }
  .cas-dibujo-col { flex-direction: column; height: 100px; }
  .cas-ayuda-pie { margin: 14px 2px 0; font-size: 0.86em; color: var(--tinta-2); display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; justify-content: space-between; }
  .cas-ayuda-pie a { color: var(--granate); font-weight: 700; display: inline-flex; gap: 6px; align-items: center; }
  @media (max-width: 520px) {
    .cas-paso { grid-template-columns: 96px 1fr; gap: 12px; }
    .cas-dibujo { transform: scale(0.78); }
  }
`

export function Ayuda({ onCerrar }: { onCerrar: () => void }) {
  const { w } = useTextos()
  const wa = w.ayuda
  const rojo = PALETA[0].color
  const azul = PALETA[1].color
  React.useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])
  const pasos: [React.ReactNode, string, string][] = [
    [
      <div className="cas-dibujo" key="1">
        <LosetaIlustrada id="C1R" tam={64} />
        <LosetaIlustrada id="R2" giro={1} tam={64} />
      </div>,
      wa.colocaT,
      wa.coloca,
    ],
    [
      <div className="cas-dibujo" key="2">
        <LosetaIlustrada id="C2AR" tam={72} estandartes={[{ segmento: 0, color: rojo }]} />
      </div>,
      wa.plantaT,
      wa.planta({ n: ESTANDARTES_POR_JUGADOR }),
    ],
    [
      <div className="cas-dibujo" key="3">
        <LosetaIlustrada id="C1" giro={1} tam={64} estandartes={[{ segmento: 0, color: azul }]} />
        <LosetaIlustrada id="C1" giro={3} tam={64} />
      </div>,
      wa.cierraT,
      wa.cierra({
        loseta: PUNTOS.castilloCerrado.loseta,
        escudo: PUNTOS.castilloCerrado.escudo,
        camino: PUNTOS.camino,
        ermita: PUNTOS.ermitaCerrada,
      }),
    ],
    [
      <div className="cas-dibujo" key="4">
        <LosetaIlustrada id="R2C" tam={72} estandartes={[{ campo: 1, color: rojo }]} />
      </div>,
      wa.finalT,
      wa.final({ campo: PUNTOS.campoPorCastilloCerrado }),
    ],
  ]
  return (
    <div className="cas-velo-modal" role="presentation" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <style>{ESTILO}</style>
      <div className="cas-papel cas-hoja" role="dialog" aria-modal="true" aria-label={wa.titulo}>
        <button type="button" className="cas-icono-btn cas-hoja-cerrar" onClick={onCerrar} aria-label={wa.cerrar}>
          <Icono nombre="cerrar" />
        </button>
        <h2>{wa.titulo}</h2>
        <ol className="cas-pasos">
          {pasos.map(([dibujo, titulo, texto], i) => (
            <li key={i} className="cas-paso">
              {dibujo}
              <div>
                <h3>
                  <span>{i + 1}</span>
                  {titulo}
                </h3>
                <p>{texto}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="cas-ayuda-pie">
          <span>
            <Rico texto={wa.controles} />
          </span>
          {!enWeb() && (
            <a href="reglas.md">
              <Icono nombre="libro" tam={18} />
              {wa.completas}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
