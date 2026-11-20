import * as React from 'react'
import { Token, useOca } from './Panel'
import type { Ajustes } from './PartidaLocal'

/* La portada sobre el tablero que juega solo, y el paso de ajustes (ya rellenos) antes de empezar. */

export function Portada({ alJugar, alAmigo }: { alJugar: () => void; alAmigo: () => void }) {
  const { w, abrirAyuda } = useOca()
  const p = w.portada
  return (
    <div className="oca-portada">
      <div className="oca-portada-texto">
        <p className="oca-kicker oca-entra">{p.kicker}</p>
        <h1 className="oca-entra">
          <span>{p.titleA}</span>
          <em>{p.titleB}</em>
        </h1>
        <p className="oca-gancho oca-entra">{p.hook}</p>
      </div>
      <div className="oca-portada-botones oca-entra">
        <button type="button" className="oca-boton oca-primario oca-grande" onClick={alJugar} autoFocus>
          <DadoIcono />{p.play}
        </button>
        <button type="button" className="oca-boton oca-secundario oca-grande" onClick={alAmigo}>{p.friend}</button>
        <button type="button" className="oca-enlace" onClick={abrirAyuda}><span aria-hidden="true">?</span>{p.how}</button>
      </div>
    </div>
  )
}

function DadoIcono() {
  return (
    <svg className="oca-dado-icono" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="8.5" cy="8.5" r="1.6" /><circle cx="15.5" cy="15.5" r="1.6" /><circle cx="12" cy="12" r="1.6" />
    </svg>
  )
}

export function PasoAjustes({ inicial, alEmpezar, alVolver }: { inicial: Ajustes; alEmpezar: (a: Ajustes) => void; alVolver: () => void }) {
  const { w } = useOca()
  const a = w.ajustes
  const [count, setCount] = React.useState(inicial.count)
  const [automated, setAutomated] = React.useState(inicial.automated)
  return (
    <div className="oca-portada">
      <form className="oca-ajustes oca-entra" onSubmit={event => {
        event.preventDefault()
        alEmpezar({ count, automated })
      }}>
        <h2>{a.title}</h2>
        <div className="oca-cuantos" role="radiogroup" aria-label={a.count}>
          {[2, 3, 4].map(value => (
            <label key={value} className="oca-cuanto">
              <input type="radio" name="oca-count" value={value} checked={count === value} onChange={() => setCount(value)} />
              <span>{value}</span>
            </label>
          ))}
        </div>
        <ul className="oca-asientos">
          {automated.slice(0, count).map((isAI, index) => (
            <li key={index}>
              <Token index={index} />
              <span className="oca-name">{(isAI ? w.ai : w.player)({ n: index + 1 })}</span>
              <div className="oca-quien" role="radiogroup" aria-label={w.player({ n: index + 1 })}>
                {[false, true].map(ai => (
                  <label key={String(ai)}>
                    <input type="radio" name={'oca-seat-' + index} checked={isAI === ai}
                      onChange={() => setAutomated(previous => previous.map((value, seat) => seat === index ? ai : value))} />
                    <span>{ai ? a.ai : a.person}</span>
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <button type="submit" className="oca-boton oca-primario oca-grande oca-ancho" autoFocus>{a.go}</button>
        <button type="button" className="oca-enlace" onClick={alVolver}>{a.back}</button>
      </form>
    </div>
  )
}
