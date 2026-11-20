/*
 * Castillos en línea: cada jugador en su dispositivo, en una sala en vivo
 * de Kunobi. Los invitados también pueden entrar desde el navegador. La sala la aloja el dispositivo del dueño del Space (el anfitrión).
 *
 *   1. Cada uno elige mesa (2, 3 o 4 asientos), escribe su nombre y elige color.
 *   2. Cada uno ocupa un asiento; el orden de los asientos es el orden de juego.
 *   3. El anfitrión empieza la partida (pone la semilla). Kunobi solo deja jugar
 *      al asiento al que le toca, y cada pantalla rehace la partida con el motor.
 *
 * La sala no se guarda: cada dispositivo guarda la partida y el anfitrión puede
 * retomarla si la sala se vació.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'kunobi'
import { semillaNueva } from './azar'
import { enWeb } from './entorno'
import { Juego } from './Juego'
import { PALETA, leerInicio } from './preferencias'
import { Icono } from './iconos'
import { useTextos } from './textos'
import {
  TAMANOS,
  claveJugada,
  leerSala,
  mesaNueva,
  miAsiento,
  nombresYColores,
  partidaDeSala,
  salaDe,
  turnoTras,
  type Guardado,
  type JugadaRed,
} from './red'

const ESTILO = `
  .cel { max-width: 760px; margin: 0 auto; padding: 14px 16px 40px; }
  .cel-caja { position: relative; border-radius: 18px; border: 1px solid rgba(120, 84, 40, 0.22); padding: 18px; margin-bottom: 14px; min-width: 0;
    background: linear-gradient(180deg, #fffaf0 0%, #f7ead0 100%); box-shadow: var(--sombra-suave); animation: cas-entrar 420ms cubic-bezier(.2,1.2,.4,1) both; }
  .cel-caja h3 { margin: 0 0 10px; font-size: 1.3em; font-weight: 800; }
  .cel-titulo { margin: 4px 0 4px; font-size: 2.4em; font-weight: 900; letter-spacing: -0.02em; }
  .cel-boton { display: inline-flex; align-items: center; gap: 6px; border-radius: 12px; padding: 9px 16px; font-weight: 700; color: var(--tinta);
    border: 1px solid rgba(58, 38, 20, 0.22); background: linear-gradient(180deg, #fff8e8 0%, #f1e0bb 100%);
    box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 4px 10px -5px rgba(60, 32, 10, 0.35); transition: transform 150ms cubic-bezier(.3,1.6,.5,1); }
  .cel-boton:hover { transform: translateY(-1px); }
  .cel-boton:active { transform: scale(0.97); }
  .cel-boton:disabled { opacity: 0.45; cursor: default; transform: none; }
  .cel-fuerte { color: #fff7e6; border-color: #7d2615; background: linear-gradient(180deg, #cf5434 0%, #a3321f 55%, #8a2716 100%);
    box-shadow: 0 1px 0 rgba(255, 210, 170, 0.6) inset, 0 8px 18px -8px rgba(122, 36, 22, 0.65); }
  .cel-mesas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .cel-mesa { flex-direction: column; padding: 16px 10px; font-size: 1.05em; }
  .cel-mesa b { font-family: 'Fraunces', Georgia, serif; font-size: 2em; line-height: 1; }
  .cel-fila { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .cel-ayuda { font-size: 0.88em; color: var(--tinta-2); margin: 8px 0 0; }
  .cel-aviso { font-size: 0.9em; padding: 9px 12px; border-radius: 10px; background: rgba(211, 154, 44, 0.14); border: 1px solid rgba(211, 154, 44, 0.45); margin: 10px 0 0; }
  .cel-error { background: rgba(163, 50, 31, 0.1); border-color: rgba(163, 50, 31, 0.4); }
  .cel-entrada { font: inherit; font-size: 16px; flex: 1 1 160px; min-width: 0; padding: 8px 12px; border: 1px solid rgba(58, 38, 20, 0.25); border-radius: 10px; background: #fffdf6; color: var(--tinta); }
  .cel-muestra { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #fff8e8; padding: 0; box-shadow: 0 0 0 1px rgba(58, 38, 20, 0.3); }
  .cel-muestra-si { box-shadow: 0 0 0 2px #fff8e8, 0 0 0 4px var(--tinta); }
  .cel-asientos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .cel-asientos li { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px; border-radius: 12px; background: rgba(255, 250, 238, 0.7); border: 1px solid var(--linea); }
  .cel-punto { width: 16px; height: 16px; border-radius: 50%; display: inline-block; flex: none; }
  .cel-barra { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; font-size: 0.92em; color: var(--tinta-2); }
  .cel-barra b { color: var(--tinta); }
  .cel-barra .cel-boton { padding: 6px 12px; }
  @media (max-width: 520px) { .cel-titulo { font-size: 1.9em; } }
`

/* ---------- guardar en este dispositivo ---------- */

const claveGuardado = (n: number) => `castillos.red.${n}`

function leerGuardado(n: number): Guardado | null {
  try {
    const g = JSON.parse(window.localStorage.getItem(claveGuardado(n)) ?? 'null') as Guardado | null
    return g && g.n === n && Array.isArray(g.jugadas) && Array.isArray(g.asientos) ? g : null
  } catch {
    return null
  }
}

function guardar(g: Guardado | null, n: number) {
  try {
    if (g) window.localStorage.setItem(claveGuardado(n), JSON.stringify(g))
    else window.localStorage.removeItem(claveGuardado(n))
  } catch {
    /* sin almacenamiento no se puede retomar desde este dispositivo */
  }
}

/** Mi nombre y color en línea, para volver a ponerlos solos si la sala se vació. */
const claveYo = (actor: string) => `castillos.red.yo.${actor}`
function leerYo(actor: string | undefined): { nombre: string; color: string } | null {
  if (!actor) return null
  try {
    const y = JSON.parse(window.localStorage.getItem(claveYo(actor)) ?? 'null')
    return y && typeof y.nombre === 'string' && PALETA.some((c) => c.color === y.color) ? y : null
  } catch {
    return null
  }
}
function guardarYo(actor: string, y: { nombre: string; color: string }) {
  try {
    window.localStorage.setItem(claveYo(actor), JSON.stringify(y))
  } catch {
    /* sin almacenamiento, hay que escribirlo cada vez */
  }
}

/* ---------- elegir mesa ---------- */

export function EnLinea({ onPortada }: { onPortada?: () => void }) {
  const { w } = useTextos()
  const wl = w.linea
  const [n, setN] = useState<number | null>(null)
  const [intento, setIntento] = useState(0)
  if (n) return <Mesa key={`${n}:${intento}`} n={n} onSalir={() => setN(null)} onReintentar={() => setIntento((i) => i + 1)} />
  return (
    <div className="cel">
      <style>{ESTILO}</style>
      {onPortada && (
        <button type="button" className="cas-marca" onClick={onPortada}>
          <Icono nombre="atras" />
          {w.portada.titulo}
        </button>
      )}
      <h2 className="cel-titulo">{wl.titulo}</h2>
      <div className="cel-caja">
        <h3>{wl.eligeMesa}</h3>
        <p className="cel-ayuda" style={{ marginTop: 0, marginBottom: 14 }}>
          {wl.eligeMesaAyuda}
        </p>
        <div className="cel-mesas">
          {TAMANOS.map((k) => (
            <button key={k} type="button" className="cel-boton cel-fuerte cel-mesa" onClick={() => setN(k)}>
              <b>{k}</b>
              {wl.jugadores}
            </button>
          ))}
        </div>
        <p className="cel-ayuda">{wl.recargar}</p>
        {!enWeb() && <p className="cel-ayuda">{wl.retomarAnfitrion}</p>}
      </div>
    </div>
  )
}

/* ---------- la mesa ---------- */

type Respuesta = { status?: string; reason?: string } | undefined

function Mesa({ n, onSalir, onReintentar }: { n: number; onSalir: () => void; onReintentar: () => void }) {
  const { w, nombres, paleta } = useTextos()
  const wl = w.linea
  const op = wl.operaciones
  const sesion = useSession(salaDe(n), { model: 'map' }) as {
    status: string
    reason?: string
    refusal?: { status?: string; reason?: string }
    state?: Record<string, unknown>
    actor?: { id: string; kind: string }
    canEdit?: boolean
    participants?: { id: string; self?: boolean; name?: string; role?: string }[]
    apply: (op: unknown, opciones?: unknown) => Promise<Respuesta> | Respuesta
  }
  const legible = sesion.status === 'open' || sesion.status === 'paused'
  const estado = (legible && sesion.state) || {}
  const yo = legible ? sesion.actor?.id : undefined
  const puedoEscribir = sesion.status === 'open' && !!yo && sesion.canEdit !== false
  const anfitrion = yo === 'Me'
  const sala = useMemo(() => leerSala(estado, n), [estado, n])
  const rehecha = useMemo(() => partidaDeSala(sala, nombres), [sala, nombres])
  const asiento = miAsiento(sala, yo)
  const nc = nombresYColores(sala, nombres)
  const [aviso, setAviso] = useState('')

  // Mi nombre y color: los que usé en línea la última vez (o los del inicio local).
  const inicial = leerInicio().jugadores[0]
  const mio = yo ? sala.jugadores[yo] : undefined
  const recordado = leerYo(yo)
  const [nombre, setNombre] = useState(inicial.nombre)
  const [color, setColor] = useState(inicial.color)
  useEffect(() => {
    const y = mio ?? recordado
    if (y) {
      setNombre(y.nombre)
      setColor(y.color)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yo, !!mio])
  // Si la sala no tiene mi nombre (es nueva o se vació) y lo tengo guardado, lo pongo solo.
  useEffect(() => {
    if (puedoEscribir && yo && !mio && recordado && recordado.nombre.trim())
      void Promise.resolve(sesion.apply({ type: 'set', key: `jugador.${yo}`, value: recordado })).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedoEscribir, yo, !!mio])

  /** Envía una operación y devuelve null si se aplicó, o el motivo. */
  const enviar = async (op: unknown, que: string): Promise<string | null> => {
    try {
      const r = await Promise.resolve(sesion.apply(op))
      if (r && r.status && r.status !== 'applied' && r.status !== 'duplicate') {
        const motivo = `${r.status}${r.reason ? `: ${r.reason}` : ''}`
        setAviso(`${que}: ${motivo}`)
        return motivo
      }
      setAviso('')
      return null
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      setAviso(`${que}: ${motivo}`)
      return motivo
    }
  }

  // Este dispositivo guarda la partida para poder retomarla.
  useEffect(() => {
    if (!anfitrion) return
    if (sala.mesa && sala.jugadas.length && rehecha && rehecha.partida.fase !== 'fin')
      guardar({ n, semilla: sala.mesa.semilla, jugadas: sala.jugadas, asientos: sala.asientos }, n)
    if (rehecha && rehecha.partida.fase === 'fin') guardar(null, n)
  }, [anfitrion, sala, rehecha, n])
  const guardado = anfitrion ? leerGuardado(n) : null

  const empezar = async (previas: JugadaRed[] = [], semilla = semillaNueva()) => {
    if (await enviar({ type: 'set', key: 'mesa', value: mesaNueva(semilla, previas) }, op.empezar)) return
    const turno = turnoTras(previas.length, n)
    if (sala.turn !== turno) await enviar({ type: 'set', key: 'turn', value: turno }, op.turno)
  }

  const barra = (
    <div className="cel-barra">
      <span>
        <b>{wl.barra({ n })}</b>
        {asiento >= 0 ? ` · ${wl.tuAsiento({ n: asiento + 1 })}` : yo ? ` · ${wl.estasMirando}` : ''}
        {sesion.status === 'paused' ? ` · ⏸ ${wl.anfitrionDesconectado}` : ''}
        {sesion.status === 'open' && !puedoEscribir && ` · ${wl.espectador}`}
      </span>
      <button type="button" className="cel-boton" onClick={onSalir}>
        {wl.salir}
      </button>
    </div>
  )

  if (!legible) {
    const motivo = sesion.refusal?.reason ?? sesion.reason ?? ''
    return (
      <div className="cel">
        <style>{ESTILO}</style>
        {barra}
        <div className="cel-caja">
          <h3>{sesion.status === 'opening' ? wl.abriendo : wl.noDisponible}</h3>
          <p className="cel-ayuda" style={{ marginTop: 0 }}>
            {wl.estadoSala} <code>{sesion.status}</code>
            {motivo ? ` · ${motivo}` : ''}
          </p>
          {sesion.status !== 'opening' && (
            <>
              <p className="cel-ayuda">
                {enWeb() ? wl.compruebaWeb : wl.compruebaKunobi}
              </p>
              <button type="button" className="cel-boton" onClick={onReintentar}>{wl.reintentar}</button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Partida en marcha (o acabada) con todos los asientos ocupados.
  if (rehecha && sala.mesa) {
    return (
      <Juego
        key={sala.mesa.id}
        red={{
          partida: rehecha.partida,
          colores: nc.map((j) => j.color),
          asiento,
          puedeJugar: puedoEscribir && rehecha.jugadaMala === null && sala.turn === asiento,
          enviar: (j) => enviar({ type: 'set', key: claveJugada(sala.mesa!.id, sala.jugadas.length), value: j }, op.jugada),
          onRevancha: anfitrion && puedoEscribir ? () => void empezar() : undefined,
          onSalir,
          cabecera: (
            <div className="cel">
              <style>{ESTILO}</style>
              {barra}
              {(aviso || rehecha.jugadaMala !== null) && (
                <p className="cel-aviso cel-error">{rehecha.jugadaMala !== null ? wl.jugadaMala({ n: rehecha.jugadaMala }) : aviso}</p>
              )}
            </div>
          ),
        }}
      />
    )
  }

  // Antes de empezar: nombres, asientos y el botón del anfitrión.
  const libres = sala.asientos.filter((a) => !a).length
  return (
    <div className="cel">
      <style>{ESTILO}</style>
      {barra}
      <div className="cel-caja">
        <h3>{wl.tu}</h3>
        <div className="cel-fila">
          <input
            className="cel-entrada"
            type="text"
            value={nombre}
            maxLength={20}
            placeholder={wl.tuNombre}
            aria-label={wl.tuNombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <div className="cel-fila" role="group" aria-label={wl.tuColor}>
            {paleta.map((c) => (
              <button
                key={c.color}
                type="button"
                aria-label={c.nombre}
                aria-pressed={color === c.color}
                className={`cel-muestra ${color === c.color ? 'cel-muestra-si' : ''}`}
                style={{ background: c.color }}
                onClick={() => setColor(c.color)}
              />
            ))}
          </div>
          <button
            type="button"
            className="cel-boton cel-fuerte"
            disabled={!puedoEscribir}
            onClick={() => {
              if (yo) guardarYo(yo, { nombre: nombre.trim(), color })
              void enviar({ type: 'set', key: `jugador.${yo}`, value: { nombre: nombre.trim(), color } }, op.nombre)
            }}
          >
            {mio ? wl.cambiar : wl.guardar}
          </button>
        </div>
        <p className="cel-ayuda">{wl.mismoColor}</p>
      </div>

      <div className="cel-caja">
        <h3>{wl.asientos}</h3>
        <ul className="cel-asientos">
          {sala.asientos.map((id, i) => (
            <li key={i}>
              <span className="cel-punto" style={{ background: id ? nc[i].color : 'transparent', border: '1px solid hsl(var(--border))' }} />
              <b>{i + 1}.</b>
              <span style={{ flex: 1 }}>
                {id ? (
                  <>
                    {nc[i].nombre}
                    {id === yo ? ` (${wl.tuMinuscula})` : ''}
                  </>
                ) : (
                  <i style={{ opacity: 0.7 }}>{wl.libre}</i>
                )}
              </span>
              {!id && asiento < 0 && (
                <button type="button" className="cel-boton cel-fuerte" disabled={!puedoEscribir} onClick={() => void enviar({ type: 'set', key: `seat.${i}`, value: yo }, op.sentarte)}>
                  {wl.sentarme}
                </button>
              )}
              {id && anfitrion && (
                <button type="button" className="cel-boton" disabled={!puedoEscribir} onClick={() => void enviar({ type: 'delete', key: `seat.${i}` }, op.liberar)} title={wl.soloAnfitrion}>
                  {wl.liberar}
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="cel-ayuda">{wl.asientosAyuda}</p>
      </div>

      <div className="cel-caja">
        <h3>{wl.empezar}</h3>
        {libres > 0 ? (
          <p className="cel-ayuda" style={{ marginTop: 0 }}>
            {wl.faltan({ count: libres })}
          </p>
        ) : anfitrion ? (
          <div className="cel-fila">
            <button type="button" className="cel-boton cel-fuerte" disabled={!puedoEscribir} onClick={() => void empezar()}>
              {wl.empezarPartida}
            </button>
            {guardado && guardado.jugadas.length > 0 && guardado.asientos.join('|') === sala.asientos.join('|') && (
              <button type="button" className="cel-boton" disabled={!puedoEscribir} onClick={() => void empezar(guardado.jugadas, guardado.semilla)}>
                {wl.retomar({ count: guardado.jugadas.length })}
              </button>
            )}
          </div>
        ) : (
          <p className="cel-ayuda" role="status">{wl.esperandoAnfitrion}</p>
        )}
        {aviso && <p className="cel-aviso">{aviso}</p>}
      </div>

      {(sesion.participants ?? []).length > 0 && (
        <p className="cel-ayuda">
          {wl.enLaSala({
            lista: (sesion.participants ?? []).map((p) => (p.self ? wl.tuMinuscula : p.name ?? wl.otraPersona) + (p.role === 'reader' ? ` (${wl.mirando})` : '')).join(', '),
          })}
        </p>
      )}
    </div>
  )
}
