/*
 * El juego completo y sus pantallas: el título (que juega solo), el mapa de
 * niveles, la partida y el modo por turnos. «Jugar» lleva directo al nivel
 * que toca; el mapa es para elegir otro.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Partida } from './Partida'
import { catalogo, cintaDe } from './catalogo'
import type { DatosNiveles } from './niveles'
import type { Resultado } from './motor'
import { abierto, apuntar, borrarProgreso, leerProgreso, type Progreso } from './progreso'
import { ESTILO_BASE } from './estilo'
import { Titulo } from './Titulo'
import { Mapa } from './Mapa'
import { Ayuda } from './Ayuda'
import { CINTA_JUGADOR, FinDuelo, HojaTurnos, colorCinta } from './Duelo'

type Pantalla =
  | { v: 'titulo'; hoja?: 'ayuda' | 'turnos' }
  | { v: 'mapa' }
  | { v: 'partida'; i: number }
  | { v: 'turno'; i: number; turno: 0 | 1; res: Resultado[]; ronda: number }
  | { v: 'finDuelo'; i: number; res: [Resultado, Resultado] }

/** `datos`: los niveles de data/niveles.json, ya traducidos. `w`: las palabras de la página. `locale`: para los números. */
export function Juego({ datos, w, locale }: { datos: DatosNiveles; w: any; locale: string }) {
  const { niveles: NIVELES, grupos: GRUPOS } = useMemo(() => catalogo(datos), [datos])
  const [progreso, setProgreso] = useState<Progreso>(() => leerProgreso())
  const [p, setP] = useState<Pantalla>({ v: 'titulo' })
  const [nombres, setNombres] = useState<[string, string]>([w.turnos.jugador1, w.turnos.jugador2])
  const ir = (x: Pantalla) => { setP(x); if (typeof window !== 'undefined') window.scrollTo?.({ top: 0 }) }

  const cinta = cintaDe(progreso)
  const estrellas = NIVELES.reduce((s, d) => s + (progreso[d.id] ?? 0), 0)
  /** El nivel que toca: el primero abierto sin superar. */
  const pendiente = NIVELES.findIndex((d, i) => abierto(progreso, i) && !(progreso[d.id] ?? 0))
  const siguiente = pendiente < 0 ? null : pendiente
  const ganar = (id: string, r: Resultado) => { if (r.ganado) setProgreso(apuntar(id, r.estrellas)) }

  let cuerpo: ReactNode
  if (p.v === 'partida') {
    const d = NIVELES[p.i]
    const hay = p.i + 1 < NIVELES.length
    cuerpo = (
      <Partida
        key={d.id}
        def={d}
        numero={p.i + 1}
        w={w}
        locale={locale}
        mejor={progreso[d.id] ?? 0}
        cinta={cinta}
        onFin={(r) => ganar(d.id, r)}
        onVolver={() => ir({ v: 'mapa' })}
        onSiguiente={hay ? () => ir({ v: 'partida', i: p.i + 1 }) : undefined}
      />
    )
  } else if (p.v === 'turno') {
    const d = NIVELES[p.i]
    const primero = p.turno === 0
    cuerpo = (
      <Partida
        key={`${d.id}-${p.turno}-${p.ronda}`}
        def={d}
        numero={p.i + 1}
        w={w}
        locale={locale}
        cinta={CINTA_JUGADOR[p.turno]}
        jugador={{ nombre: nombres[p.turno], color: colorCinta(CINTA_JUGADOR[p.turno]) }}
        sinRepetir
        onFin={(r) => { ganar(d.id, r); setP({ ...p, res: [...p.res.slice(0, p.turno), r] }) }}
        onVolver={() => ir({ v: 'titulo' })}
        textoSiguiente={primero ? w.turnos.ahoraJuega({ nombre: nombres[1] }) : w.turnos.verQuien}
        onSiguiente={() => {
          if (primero) ir({ v: 'turno', i: p.i, turno: 1, res: p.res, ronda: p.ronda })
          else ir({ v: 'finDuelo', i: p.i, res: [p.res[0], p.res[1]] })
        }}
      />
    )
  } else if (p.v === 'finDuelo') {
    const hay = p.i + 1 < NIVELES.length && abierto(progreso, p.i + 1)
    cuerpo = (
      <FinDuelo
        w={w}
        nombres={nombres}
        resultados={p.res}
        def={NIVELES[p.i]}
        onRevancha={() => ir({ v: 'turno', i: p.i, turno: 0, res: [], ronda: Date.now() })}
        onOtro={hay ? () => ir({ v: 'turno', i: p.i + 1, turno: 0, res: [], ronda: Date.now() }) : undefined}
        onInicio={() => ir({ v: 'titulo' })}
      />
    )
  } else if (p.v === 'mapa') {
    cuerpo = (
      <Mapa
        w={w}
        niveles={NIVELES}
        grupos={GRUPOS}
        progreso={progreso}
        cinta={cinta}
        siguiente={siguiente}
        onJugar={(i) => ir({ v: 'partida', i })}
        onInicio={() => ir({ v: 'titulo' })}
        onBorrar={() => setProgreso(borrarProgreso())}
      />
    )
  } else {
    cuerpo = (
      <>
        <Titulo
          w={w}
          niveles={NIVELES}
          cinta={cinta}
          siguiente={siguiente}
          estrellas={estrellas}
          quieta={!!p.hoja}
          onJugar={() => ir(siguiente !== null ? { v: 'partida', i: siguiente } : { v: 'mapa' })}
          onTurnos={() => setP({ v: 'titulo', hoja: 'turnos' })}
          onNiveles={() => ir({ v: 'mapa' })}
          onAyuda={() => setP({ v: 'titulo', hoja: 'ayuda' })}
        />
        {p.hoja === 'ayuda' && <Ayuda w={w} onCerrar={() => setP({ v: 'titulo' })} />}
        {p.hoja === 'turnos' && (
          <HojaTurnos
            w={w}
            niveles={NIVELES}
            progreso={progreso}
            inicial={siguiente ?? 0}
            nombres={nombres}
            onCerrar={() => setP({ v: 'titulo' })}
            onEmpezar={(i, n) => { setNombres(n); ir({ v: 'turno', i, turno: 0, res: [], ronda: Date.now() }) }}
          />
        )}
      </>
    )
  }

  return (
    <div className="kb">
      <style>{ESTILO_BASE}</style>
      {cuerpo}
    </div>
  )
}
