// Rueda de letras de un jugador, en SVG: un anillo de bombillas con las letras alrededor,
// pintadas según su estado, y en el centro el nombre, el reloj y la cuenta.
// `asiento` da el color del jugador (0 naranja, 1 turquesa). Los efectos son de CSS (estilos.ts).

import { useId } from 'react'
import type { Jugador, Turno } from './reglas'
import { aciertos, fallos } from './reglas'
import { formatear } from './reloj'
import type { Palabras } from './Partida'

const TAM = 300
const CENTRO = TAM / 2
const RADIO = 120
const BOMBILLAS = 40

function punto(i: number, n: number, radio: number) {
  const angulo = -Math.PI / 2 + (i * 2 * Math.PI) / n
  return { x: CENTRO + radio * Math.cos(angulo), y: CENTRO + radio * Math.sin(angulo) }
}

const BOMBILLAS_PUNTOS = Array.from({ length: BOMBILLAS }, (_, i) => punto(i + 0.5, BOMBILLAS, 145))

type Props = {
  jugador: Jugador
  restanteMs: number
  /** Es el turno de este jugador. */
  activa: boolean
  /** Marcar la letra actual (no en la pantalla final). */
  enJuego: boolean
  asiento: Turno
  w: Palabras
  className?: string
}

export function Rueda({ jugador, restanteMs, activa, enJuego, asiento, w, className = '' }: Props) {
  const id = useId().replace(/:/g, '')
  const n = jugador.preguntas.length
  const poco = enJuego && restanteMs <= 10_000
  const bien = aciertos(jugador)
  const mal = fallos(jugador)
  return (
    <svg
      className={`plc-rueda plc-rueda-${asiento}${activa ? ' plc-activa' : ''} ${className}`}
      viewBox={`0 0 ${TAM} ${TAM}`}
      role="img"
      aria-label={w.rueda({ nombre: jugador.nombre, bien, mal, tiempo: formatear(restanteMs) })}
    >
      <defs>
        <radialGradient id={`${id}-disco`} cx="50%" cy="40%" r="60%">
          <stop offset="0" className="plc-disco-1" />
          <stop offset="1" className="plc-disco-2" />
        </radialGradient>
        <radialGradient id={`${id}-brillo`}>
          <stop offset="0.76" className="plc-brillo" stopOpacity="0" />
          <stop offset="0.84" className="plc-brillo" stopOpacity="0.55" />
          <stop offset="1" className="plc-brillo" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-letra`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="plc-aro-luz" cx={CENTRO} cy={CENTRO} r={172} fill={`url(#${id}-brillo)`} />
      <circle className="plc-disco" cx={CENTRO} cy={CENTRO} r={140} fill={`url(#${id}-disco)`} />
      <g className="plc-bombillas">
        {BOMBILLAS_PUNTOS.map(({ x, y }, i) => <circle key={i} className={i % 2 ? 'plc-b-par' : 'plc-b-impar'} cx={x} cy={y} r={2.4} />)}
      </g>
      <circle className="plc-anillo" cx={CENTRO} cy={CENTRO} r={RADIO} />
      {jugador.preguntas.map((p, i) => {
        const { x, y } = punto(i, n, RADIO)
        const actual = enJuego && i === jugador.posicion
        return (
          <g key={p.letra} className={`plc-letra plc-${jugador.estados[i]}${actual ? ' plc-actual' : ''}`} transform={`translate(${x} ${y})`}>
            {actual && <circle className="plc-halo" r={21} />}
            <circle className="plc-ficha" r={15.5} />
            <circle r={15.5} fill={`url(#${id}-letra)`} />
            <text dy="0.36em" textAnchor="middle">{p.letra}</text>
          </g>
        )
      })}
      <text className="plc-nombre" x={CENTRO} y={CENTRO - 34} textAnchor="middle">{jugador.nombre}</text>
      <text className={`plc-reloj${poco ? ' plc-poco' : ''}`} x={CENTRO} y={CENTRO + 14} textAnchor="middle">{formatear(restanteMs)}</text>
      <g className="plc-cuenta" transform={`translate(${CENTRO} ${CENTRO + 44})`}>
        <circle cx={-34} cy={0} r={9} className="plc-c-bien-f" />
        <path d="M-38.5 0.5l3 3 5.5-6" className="plc-c-trazo" />
        <text x={-20} dy="0.36em" className="plc-c-num">{bien}</text>
        <circle cx={12} cy={0} r={9} className="plc-c-mal-f" />
        <path d="M8.5 -3.5l7 7M15.5 -3.5l-7 7" className="plc-c-trazo" />
        <text x={26} dy="0.36em" className="plc-c-num">{mal}</text>
      </g>
    </svg>
  )
}
