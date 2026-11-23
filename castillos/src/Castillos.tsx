/*
 * La página entera: portada → partida (Jugar) o mesa en línea (Jugar con un
 * amigo). Las palabras y los nombres traducidos llegan de index.mdx y se
 * reparten con <ConTextos>.
 */

import * as React from 'react'
import { useSession } from 'kunobi'
import { Ayuda } from './Ayuda'
import { EnLinea } from './EnLinea'
import { ESTILO_BASE } from './estilo'
import { Juego } from './Juego'
import { HojaAmigo, Portada } from './Portada'
import { salaDe } from './red'
import { ConTextos, type Palabras, type Textos } from './textos'

type Pantalla = 'portada' | 'juego' | 'linea'

/**
 * Mira si aquí se puede abrir una mesa en línea (la sesión de la sala se abre)
 * y lo dice una vez. En una demo de la galería, una vista previa o un enlace sin
 * sala, la sesión no se abre.
 */
function SondaSala({ onAbierta, onCerrada }: { onAbierta: () => void; onCerrada: () => void }) {
  const sesion = useSession(salaDe(2), { model: 'map' }) as { status?: string }
  const estado = sesion?.status
  React.useEffect(() => {
    if (estado === 'open' || estado === 'paused') onAbierta()
    else if (estado && estado !== 'opening' && estado !== 'connecting') onCerrada()
  }, [estado, onAbierta, onCerrada])
  React.useEffect(() => {
    const t = setTimeout(onCerrada, 4000)
    return () => clearTimeout(t)
  }, [onCerrada])
  return null
}

export function Castillos({
  w,
  nombresLosetas,
  paleta,
}: {
  w: Palabras
  /** Nombre de cada loseta por su id, en el idioma del lector. */
  nombresLosetas: Record<string, string>
  paleta: { nombre: string; color: string }[]
}) {
  const [pantalla, setPantalla] = React.useState<Pantalla>('portada')
  const [amigo, setAmigo] = React.useState<'no' | 'mirando' | 'hoja'>('no')
  const [ayuda, setAyuda] = React.useState(false)
  const textos = React.useMemo<Textos>(
    () => ({
      w,
      nombreLoseta: (id) => nombresLosetas[id] ?? id,
      paleta,
      nombres: {
        color: (color) => paleta.find((c) => c.color === color)?.nombre,
        jugador: (n) => w.inicio.jugadorN({ n }),
      },
    }),
    [w, nombresLosetas, paleta],
  )
  const raiz = React.useRef<HTMLDivElement>(null)
  const ir = React.useCallback((p: Pantalla) => {
    setPantalla(p)
    setAmigo('no')
    raiz.current?.scrollIntoView?.({ block: 'start' })
  }, [])
  const abierta = React.useCallback(() => ir('linea'), [ir])
  const cerrada = React.useCallback(() => setAmigo((a) => (a === 'mirando' ? 'hoja' : a)), [])

  return (
    <ConTextos valor={textos}>
      <div className="cas-raiz" ref={raiz}>
        <style>{ESTILO_BASE}</style>
        {pantalla === 'portada' && (
          <Portada onJugar={() => ir('juego')} onAmigo={() => setAmigo('mirando')} onAyuda={() => setAyuda(true)} />
        )}
        {pantalla === 'juego' && <Juego onPortada={() => ir('portada')} />}
        {pantalla === 'linea' && <EnLinea onPortada={() => ir('portada')} />}
        {amigo === 'mirando' && <SondaSala onAbierta={abierta} onCerrada={cerrada} />}
        {amigo === 'hoja' && <HojaAmigo onJugarAqui={() => ir('juego')} onCerrar={() => setAmigo('no')} />}
        {ayuda && <Ayuda onCerrar={() => setAyuda(false)} />}
      </div>
    </ConTextos>
  )
}
