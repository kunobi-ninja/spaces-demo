import * as React from 'react'
import { crearReglas } from './reglas.mjs'
import { espiral } from './espiral'
import { EscenaOca, type ReglasEscena } from './escena'
import { ESTILOS } from './estilos'
import { Ayuda, HojaAmigo, OcaContext, type Especial, type Ficha, type Game, type Reglas } from './Panel'
import { PasoAjustes, Portada } from './Portada'
import { PartidaLocal, type Ajustes } from './PartidaLocal'
import { PartidaEnSala, ROOM, useRoom } from './PartidaEnSala'

type Words = Record<string, any>
type Pantalla = 'portada' | 'ajustes' | 'local' | 'sala'

/*
 * El juego: el tablero 3D de fondo en todas las pantallas, y encima la portada, los ajustes, la
 * partida en este dispositivo o la sala entre dispositivos.
 *  - Jugar: ajustes ya rellenos (tú contra la IA) y Empezar.
 *  - Jugar con un amigo: la sala si Kunobi la abre; si no (galería, vista previa, enlace web),
 *    una hoja que explica cómo hacer tuyo el juego y compartirlo.
 */
export function Juego({ w, tablero, fichas }: { w: Words; tablero: { especiales: Especial[] }; fichas: Ficha[] }) {
  const reglas = React.useMemo(() => crearReglas(tablero, w) as Reglas, [tablero, w])
  const [pantalla, setPantalla] = React.useState<Pantalla>('portada')
  const [hojaAmigo, setHojaAmigo] = React.useState(false)
  const [ayuda, setAyuda] = React.useState(false)
  const [ajustes, setAjustes] = React.useState<Ajustes>({ count: 2, automated: [false, true, true, true] })
  const [mostrada, setMostrada] = React.useState<Game | null>(null)
  const sala = useRoom(ROOM)
  const lienzo = React.useRef<HTMLDivElement>(null)
  const burbuja = React.useRef<HTMLDivElement>(null)
  const escena = React.useRef<EscenaOca | null>(null)
  const pendiente = React.useRef<Game | null>(null)

  const ver = React.useCallback((game: Game | null) => {
    pendiente.current = game
    if (!game) setMostrada(null)
    escena.current?.mostrar(game, shown => setMostrada(shown as Game))
  }, [])

  React.useEffect(() => {
    if (!lienzo.current || !burbuja.current) return
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const nueva = new EscenaOca(lienzo.current, {
      celdas: espiral,
      reglas: reglas as unknown as ReglasEscena,
      colores: fichas.map(ficha => ficha.color),
      salida: w.start,
      reducido,
      burbuja: burbuja.current,
    })
    escena.current = nueva
    if (pendiente.current) nueva.mostrar(pendiente.current, shown => setMostrada(shown as Game))
    return () => {
      nueva.dispose()
      escena.current = null
    }
  }, [reglas, fichas, w])

  React.useEffect(() => {
    if (pantalla === 'portada' || pantalla === 'ajustes') ver(null)
  }, [pantalla, ver])

  const abrirAyuda = React.useCallback(() => setAyuda(true), [])
  const oca = React.useMemo(() => ({ w, fichas, especiales: tablero.especiales, reglas, mostrada, ver, abrirAyuda }),
    [w, fichas, tablero, reglas, mostrada, ver, abrirAyuda])
  const inicio = React.useCallback(() => setPantalla('portada'), [])

  return (
    <OcaContext.Provider value={oca}>
      <div className="oca" data-pantalla={pantalla}>
        <style>{ESTILOS}</style>
        <div className="oca-lienzo" ref={lienzo} role="img" aria-label={w.boardLabel} />
        <div className="oca-luz" aria-hidden="true" />
        <div className="oca-burbuja" ref={burbuja} aria-hidden="true" data-visible="false" />
        {pantalla === 'portada' && (
          <Portada alJugar={() => setPantalla('ajustes')}
            alAmigo={() => (sala.status === 'open' ? setPantalla('sala') : setHojaAmigo(true))} />
        )}
        {pantalla === 'ajustes' && (
          <PasoAjustes inicial={ajustes} alVolver={inicio} alEmpezar={nuevos => {
            setAjustes(nuevos)
            setPantalla('local')
          }} />
        )}
        {pantalla === 'local' && <PartidaLocal ajustes={ajustes} alSalir={inicio} />}
        {pantalla === 'sala' && <PartidaEnSala alSalir={inicio} />}
        {hojaAmigo && (
          <HojaAmigo alCerrar={() => setHojaAmigo(false)} alJugarAqui={() => {
            setHojaAmigo(false)
            setPantalla('ajustes')
          }} />
        )}
        {ayuda && <Ayuda alCerrar={() => setAyuda(false)} />}
      </div>
    </OcaContext.Provider>
  )
}
