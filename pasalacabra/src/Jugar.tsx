// La página entera: la portada que se juega sola, la partida en un mismo dispositivo y la sala
// en línea, sin cambiar de página. Todo va sobre el mismo escenario (Estilos.tsx).

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'kunobi'
import type { Idioma } from './ediciones'
import { EnLinea } from './EnLinea'
import { Estilos, Fondo } from './Estilos'
import { Pasalacabra, type Palabras } from './Partida'
import { debeVolverALaSala } from './sala'
import { Titulo } from './Titulo'

type Vista = 'titulo' | 'local' | 'enLinea'

/** `idioma` es el de las preguntas con que se abren los ajustes: el de quien lee, si hay edición. */
export function Jugar({ w, idioma }: { w: Palabras; idioma: Idioma }) {
  const [vista, setVista] = useState<Vista>('titulo')
  // Mira la sala sin escribir en ella: si está abierta, «Jugar con un amigo» lleva a ella; y si
  // quien abre la página ya juega en la mesa o espera en la sala, vuelve a ella directamente.
  const sala = useSession('pasalacabra', { model: 'map', schema: 1 })
  const salaAbierta = sala.status === 'open'
  const debeVolver = salaAbierta && debeVolverALaSala(sala.state ?? {}, sala.actor?.id)
  const yaVolvio = useRef(false)
  useEffect(() => {
    if (!debeVolver || yaVolvio.current) return
    yaVolvio.current = true
    setVista('enLinea')
  }, [debeVolver])

  const aLaPortada = () => setVista('titulo')
  return (
    <div className="plc-escenario">
      <Estilos />
      <Fondo />
      {vista === 'titulo' ? (
        <Titulo w={w} idioma={idioma} salaAbierta={salaAbierta} onJugar={() => setVista('local')} onEnLinea={() => setVista('enLinea')} />
      ) : vista === 'local' ? (
        <Pasalacabra w={w} idioma={idioma} onSalir={aLaPortada} />
      ) : (
        <EnLinea w={w} idioma={idioma} onSalir={aLaPortada} />
      )}
    </div>
  )
}
