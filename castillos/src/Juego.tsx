/*
 * La partida en pantalla: inicio con nombres y colores que se recuerdan,
 * turno (girar, colocar, estandarte, deshacer), pausa, marcador, historial
 * completo y final con el detalle de los puntos. Todo el juego lo decide el
 * motor (reglas.ts); aquí solo se muestra.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { semillaNueva } from './azar'
import { elegirEstandarte, elegirJugada } from './ia'
import { LosetaIlustrada } from './LosetaIlustrada'
import { Ayuda } from './Ayuda'
import { Icono } from './iconos'
import { type Sitio } from './losetas'
import {
  guardarInicio,
  guardarPartida,
  guardarSilencio,
  leerInicio,
  leerPartida,
  leerSilencio,
  nombreDe,
  type Inicio as DatosInicio,
} from './preferencias'
import { aplicar, colocaciones, ganadores, nueva, sitiosLibres, type Accion, type Anotacion, type Partida } from './reglas'
import { ZONAS_PUNTOS, clasificacion, desglose, historial, type Jugada } from './resumen'
import type { NombreSonido } from './sintesis'
import { Sonidos } from './sonidos'
import type { Hueco } from './tablero'
import type { JugadaRed } from './red'
import { lista, useTextos, type Palabras } from './textos'
import { VistaTablero } from './VistaTablero'

/** Una anotación contada con palabras: quién, cuántos puntos y por qué zona. */
function texto(a: Anotacion, p: Partida, w: Palabras): string {
  const an = w.anotacion
  const quien = lista(
    a.ganadores.map((j) => p.jugadores[j].nombre),
    w.y,
  )
  let que: string
  if (a.zona === 'campo') que = an.campo({ count: a.castillos })
  else if (a.zona === 'ermita') que = an.ermita
  else {
    que = a.zona === 'castillo' ? an.castillo({ count: a.losetas }) : an.camino({ count: a.losetas })
    if (a.escudos) que = an.conEscudos({ que, count: a.escudos })
  }
  return (a.final ? an.final : an.cerrar)({ quien, puntos: a.puntos, que })
}

const ESTILO = `
  .cas-juego { max-width: 1240px; margin: 0 auto; padding: 14px 16px 40px; outline: none; }
  .cas-barra { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
  .cas-iconos { display: flex; gap: 6px; flex: none; }
  .cas-boton { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 12px; padding: 9px 16px; font-weight: 700; color: var(--tinta);
    border: 1px solid rgba(58, 38, 20, 0.22); background: linear-gradient(180deg, #fff8e8 0%, #f1e0bb 100%);
    box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 -2px 0 rgba(120, 80, 30, 0.12) inset, 0 4px 10px -5px rgba(60, 32, 10, 0.35);
    transition: transform 150ms cubic-bezier(.3,1.6,.5,1), filter 150ms ease; }
  .cas-boton:hover { transform: translateY(-1px); }
  .cas-boton:active { transform: translateY(1px) scale(0.97); }
  .cas-boton:disabled { opacity: 0.45; cursor: default; transform: none; }
  .cas-boton-fuerte { color: #fff7e6; border-color: #7d2615; text-shadow: 0 1px 0 rgba(60, 10, 0, 0.35);
    background: linear-gradient(180deg, #cf5434 0%, #a3321f 55%, #8a2716 100%);
    box-shadow: 0 1px 0 rgba(255, 210, 170, 0.6) inset, 0 -3px 0 rgba(70, 10, 0, 0.25) inset, 0 8px 18px -8px rgba(122, 36, 22, 0.65); }
  .cas-boton-fuerte:hover { filter: brightness(1.06); }
  .cas-cuerpo { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
  .cas-panel { flex: 0 1 290px; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
  .cas-caja { position: relative; border-radius: 18px; border: 1px solid rgba(120, 84, 40, 0.22); padding: 16px; min-width: 0;
    background: linear-gradient(180deg, #fffaf0 0%, #f7ead0 100%); box-shadow: var(--sombra-suave); }
  .cas-caja h3 { margin: 0 0 10px; font-size: 1.15em; font-weight: 800; }
  .cas-mano { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .cas-mano-loseta { padding: 8px; border-radius: 14px; background: radial-gradient(circle at 50% 40%, #fff4d8, #ecd6a6); box-shadow: 0 1px 0 #fff inset, 0 0 0 1px rgba(120, 84, 40, 0.2); }
  .cas-mano-loseta svg { border-radius: 4px; box-shadow: 0 10px 18px -8px rgba(60, 32, 10, 0.6); }
  .cas-mano-nombre { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 1.05em; }
  .cas-fila { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .cas-turno { display: flex; align-items: center; gap: 10px; font-family: 'Fraunces', Georgia, serif; font-weight: 800; font-size: 1.25em; }
  .cas-ficha-color { width: 14px; height: 14px; border-radius: 50%; display: inline-block; flex: none; box-shadow: 0 0 0 2px #fff8e8, 0 0 0 3px rgba(58, 38, 20, 0.25); }
  .cas-marcador { width: 100%; border-collapse: collapse; font-size: 0.95em; }
  .cas-marcador td, .cas-marcador th { padding: 6px 4px; }
  .cas-marcador tbody tr + tr td { border-top: 1px solid var(--linea); }
  .cas-marcador th { text-align: left; font-weight: 700; color: var(--tinta-3); font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--linea); }
  .cas-marcador tr.cas-activo td { font-weight: 800; }
  .cas-marcador tr.cas-activo td:first-child { box-shadow: inset 3px 0 0 var(--oro); }
  .cas-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .cas-num-grande { font-family: 'Fraunces', Georgia, serif; font-weight: 800; font-size: 1.15em; }
  .cas-mano-est { display: inline-flex; align-items: center; gap: 3px; color: var(--tinta-2); }
  .cas-marcador th.cas-num { text-align: right; }
  .cas-ayuda { font-size: 0.88em; color: var(--tinta-2); margin: 0; }
  .cas-avisos { font-size: 0.9em; margin: 0; padding-left: 18px; }
  .cas-avisos li { margin-bottom: 4px; }
  .cas-historial { list-style: none; margin: 0; padding: 0; font-size: 0.88em; }
  .cas-historial li { padding: 6px 0; border-bottom: 1px solid var(--linea); }
  .cas-historial li:last-child { border-bottom: none; }
  .cas-historial-todo { max-height: 340px; overflow-y: auto; }
  .cas-jugada { display: flex; align-items: center; gap: 8px; }
  .cas-jugada-n { font-variant-numeric: tabular-nums; color: var(--tinta-3); min-width: 1.8em; }
  .cas-jugada-puntos { margin: 3px 0 0 calc(1.8em + 22px); color: var(--granate); font-weight: 700; }
  .cas-enlace { background: none; border: none; padding: 6px 0 0; color: var(--granate); font-weight: 700; font-size: 0.86em; }
  .cas-tablero-marco { position: relative; flex: 1 1 520px; min-width: 0; }
  .cas-tablero { position: relative; height: 620px; overflow: hidden; border-radius: 20px; touch-action: none; user-select: none; cursor: grab;
    border: 1px solid rgba(90, 60, 25, 0.35);
    background-color: #d8b77c;
    background-image: radial-gradient(ellipse 70% 60% at 20% 0%, rgba(255, 238, 196, 0.75), rgba(255, 238, 196, 0) 70%),
      radial-gradient(ellipse 120% 100% at 50% 50%, rgba(0,0,0,0) 55%, rgba(90, 50, 15, 0.35) 100%),
      radial-gradient(rgba(90, 60, 25, 0.12) 1px, transparent 1.2px);
    background-size: auto, auto, 22px 22px;
    box-shadow: 0 2px 0 rgba(255,255,255,0.5) inset, 0 18px 40px -20px rgba(60, 32, 10, 0.6); }
  .cas-pausa { cursor: default; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--tinta); text-align: center; padding: 16px; }
  .cas-pausa-titulo { font-family: 'Fraunces', Georgia, serif; font-weight: 800; font-size: 1.8em; }
  .cas-celda { position: absolute; }
  .cas-celda svg { display: block; box-shadow: 0 3px 0 #7d5630, 0 8px 12px -4px rgba(60, 32, 10, 0.45); }
  .cas-ultima { position: absolute; inset: 0; box-shadow: inset 0 0 0 3px rgba(255, 236, 170, 0.95), 0 0 18px rgba(255, 200, 90, 0.7); pointer-events: none; }
  .cas-hueco { position: absolute; box-sizing: border-box; border: 2px dashed rgba(90, 60, 25, 0.35); border-radius: 6px; background: rgba(255, 248, 230, 0.18); cursor: pointer; transition: background 150ms ease; }
  .cas-hueco:hover { background: rgba(255, 248, 230, 0.4); }
  .cas-hueco-si { border-color: rgba(63, 91, 43, 0.9); background: rgba(150, 200, 100, 0.35); animation: cas-latir 1.8s ease-in-out infinite; }
  @keyframes cas-latir { 50% { background: rgba(150, 200, 100, 0.55); } }
  .cas-previa { outline: 3px solid var(--oro-2); outline-offset: -1px; box-shadow: 0 14px 22px rgba(60, 32, 10, 0.45); cursor: pointer; transform: translateY(-4px); }
  .cas-sitio { position: absolute; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%; border: 3px solid; background: #fff8e8;
    font-family: 'Fraunces', Georgia, serif; font-weight: 900; font-size: 14px; line-height: 1; padding: 0; color: var(--tinta); box-shadow: 0 4px 10px rgba(40, 20, 4, 0.5); }
  .cas-sitio:hover { transform: scale(1.18); }
  .cas-zoom { position: absolute; right: 12px; top: 12px; display: flex; flex-direction: column; gap: 6px; }
  .cas-zoom button { width: 36px; height: 36px; border-radius: 10px; border: 1px solid rgba(58, 38, 20, 0.22); color: var(--tinta-2); display: grid; place-items: center; padding: 0;
    background: linear-gradient(180deg, #fffaf0, #f2e3c3); box-shadow: 0 3px 8px -4px rgba(60, 32, 10, 0.45); }
  .cas-inicio { max-width: 600px; margin: 24px auto; display: flex; flex-direction: column; gap: 16px; align-items: stretch; padding: 24px; }
  .cas-inicio h2 { margin: 0; font-size: 2em; font-weight: 900; letter-spacing: -0.02em; }
  .cas-jugadores { display: flex; flex-direction: column; gap: 10px; width: 100%; }
  .cas-jugador { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; text-align: left; padding: 10px; border-radius: 14px; background: rgba(255, 250, 238, 0.7); border: 1px solid var(--linea); }
  .cas-entrada { font: inherit; flex: 1 1 140px; min-width: 0; padding: 8px 12px; border: 1px solid rgba(58, 38, 20, 0.25); border-radius: 10px; background: #fffdf6; color: var(--tinta); }
  .cas-entrada:focus { outline: 3px solid rgba(211, 154, 44, 0.45); border-color: var(--oro); }
  .cas-entrada::placeholder { color: var(--tinta-3); font-style: italic; }
  .cas-quien { padding: 7px 12px; min-width: 104px; }
  .cas-quien-ia { background: linear-gradient(180deg, #4f6b37, #3a5226); color: #f6f1dc; border-color: #2f441e; }
  .cas-piensa { display: flex; align-items: center; gap: 8px; justify-content: center; font-size: 0.95em; color: var(--tinta-2); }
  .cas-piensa span { animation: cas-latido 1.2s ease-in-out infinite; }
  @keyframes cas-latido { 50% { opacity: 0.35; } }
  .cas-muestras { display: flex; gap: 6px; flex-wrap: wrap; }
  .cas-muestra { width: 26px; height: 26px; border-radius: 50%; border: 2px solid #fff8e8; padding: 0; box-shadow: 0 0 0 1px rgba(58, 38, 20, 0.3); transition: transform 140ms ease; }
  .cas-muestra:hover { transform: scale(1.12); }
  .cas-muestra-ocupada { opacity: 0.35; }
  .cas-muestra-si { box-shadow: 0 0 0 2px #fff8e8, 0 0 0 4px var(--tinta); opacity: 1; }
  .cas-guardada { width: 100%; border: 1px dashed rgba(120, 84, 40, 0.45); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 10px; align-items: center; text-align: center; background: rgba(255, 244, 214, 0.7); }
  .cas-final { margin-bottom: 16px; padding: 22px; animation: cas-subir 500ms cubic-bezier(.2,1.3,.4,1); }
  .cas-final-cabeza { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .cas-final-corona { width: 62px; height: 62px; border-radius: 18px; display: grid; place-items: center; color: #fff7e6; box-shadow: 0 10px 20px -8px rgba(60, 32, 10, 0.6), 0 1px 0 rgba(255,255,255,0.5) inset; }
  .cas-final h3 { font-size: 1.9em; font-weight: 900; margin: 0; letter-spacing: -0.02em; }
  .cas-final-gana { margin: 2px 0 0; font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 1.15em; color: var(--tinta-2); }
  .cas-cabecera { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
  .cas-mas { display: inline-block; margin-right: 4px; color: var(--bosque); font-weight: 800; animation: cas-sube 0.6s ease-out; }
  @keyframes cas-aparece { from { transform: scale(0.85) translateY(-6px); opacity: 0.2; } 60% { transform: scale(1.04); } to { transform: none; opacity: 1; } }
  @keyframes cas-sube { 0% { transform: translateY(6px) scale(0.7); opacity: 0; } 35% { transform: translateY(-2px) scale(1.15); opacity: 1; } 100% { transform: none; opacity: 1; } }
  @keyframes cas-entra { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .cas-nueva { animation: cas-aparece 0.38s cubic-bezier(.2,1.3,.4,1); }
  .cas-sitio { animation: cas-aparece 0.25s ease-out; }
  .cas-entra { animation: cas-entra 0.25s ease-out; }
  .cas-tabla-final { overflow-x: auto; margin: 14px 0; }
  .cas-detalles summary { cursor: pointer; font-family: 'Fraunces', Georgia, serif; font-weight: 800; font-size: 1.05em; color: var(--granate); margin-bottom: 8px; }
  .cas-tabla-final table { min-width: 460px; }
  .cas-detalle { display: block; font-size: 0.78em; font-weight: 500; color: var(--tinta-3); }
  /* Móvil: la loseta y los botones arriba, el tablero debajo y luego el marcador y el historial. */
  @media (max-width: 700px) {
    .cas-juego { padding: 10px 8px 32px; }
    .cas-marca { font-size: 1.4em; }
    .cas-cuerpo { gap: 10px; }
    .cas-panel { display: contents; }
    .cas-panel > *, .cas-cuerpo > .cas-tablero-marco { flex: 1 1 100%; }
    .cas-o-turno { order: 1; }
    .cas-cuerpo > .cas-tablero-marco { order: 2; }
    .cas-o-marcador { order: 3; }
    .cas-o-historial { order: 4; }
    .cas-tablero { height: min(60vh, 520px); min-height: 320px; }
    .cas-mano { flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 8px 12px; }
    .cas-mano-loseta svg { width: 72px; height: 72px; }
    .cas-mano > p { flex-basis: 100%; text-align: center; }
    .cas-entrada { font-size: 16px; }
    .cas-zoom button { width: 40px; height: 40px; }
    .cas-inicio { margin: 8px auto; padding: 18px; }
  }
`

/* ---------- inicio ---------- */

type Guardada = { partida: Partida; colores: string[]; ias: boolean[] }

function Inicio({
  inicial,
  guardada,
  onEmpezar,
  onContinuar,
  onDescartar,
  onVolver,
}: {
  inicial: DatosInicio
  guardada: Guardada | null
  onEmpezar: (i: DatosInicio) => void
  onContinuar: () => void
  onDescartar: () => void
  onVolver?: () => void
}) {
  const { w, paleta, nombres } = useTextos()
  const wi = w.inicio
  const [ini, setIni] = useState<DatosInicio>(inicial)
  const activos = ini.jugadores.slice(0, ini.cuantos)

  const nombrar = (i: number, nombre: string) =>
    setIni((a) => ({ ...a, jugadores: a.jugadores.map((j, k) => (k === i ? { ...j, nombre } : j)) }))

  /** Elegir un color que ya tiene otro jugador los intercambia. */
  const elegirColor = (i: number, color: string) =>
    setIni((a) => {
      const js = a.jugadores.map((j) => ({ ...j }))
      const otro = js.findIndex((j) => j.color === color)
      if (otro >= 0) js[otro].color = js[i].color
      js[i].color = color
      return { ...a, jugadores: js }
    })

  const g = guardada?.partida
  return (
    <div className="cas-inicio cas-caja">
      {onVolver && (
        <button type="button" className="cas-marca" onClick={onVolver} style={{ alignSelf: 'flex-start', fontSize: '1.1em' }}>
          <Icono nombre="atras" />
          {w.portada.titulo}
        </button>
      )}
      <h2>{wi.titulo}</h2>
      {g && (
        <div className="cas-guardada">
          <div>{wi.guardada({ nombres: lista(g.jugadores.map((j) => j.nombre), w.y), count: g.orden.length - 1 })}</div>
          <div className="cas-fila">
            <button type="button" className="cas-boton cas-boton-fuerte" onClick={onContinuar}>
              {wi.continuar}
            </button>
            <button type="button" className="cas-boton" onClick={onDescartar}>
              {wi.descartar}
            </button>
          </div>
        </div>
      )}
      <p className="cas-ayuda" style={{ margin: 0 }}>
        {wi.explicacion}
      </p>
      <div className="cas-fila" role="group" aria-label={wi.numeroJugadores}>
        {[2, 3, 4].map((k) => (
          <button
            key={k}
            type="button"
            className={`cas-boton ${ini.cuantos === k ? 'cas-boton-fuerte' : ''}`}
            onClick={() => setIni((a) => ({ ...a, cuantos: k }))}
          >
            {wi.cuantos({ n: k })}
          </button>
        ))}
      </div>
      <div className="cas-jugadores">
        {activos.map((j, i) => (
          <div key={i} className="cas-jugador">
            <span className="cas-ficha-color" style={{ background: j.color, width: 18, height: 18 }} />
            <input
              className="cas-entrada"
              type="text"
              value={j.nombre}
              maxLength={20}
              placeholder={nombreDe({ ...j, nombre: '' }, i, nombres)}
              aria-label={wi.nombreJugador({ n: i + 1 })}
              onChange={(e) => nombrar(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onEmpezar(ini)
              }}
            />
            <button
              type="button"
              className={`cas-boton cas-quien ${j.ia ? 'cas-quien-ia' : ''}`}
              aria-pressed={j.ia}
              aria-label={wi.quien({ n: i + 1, quien: j.ia ? wi.quienIa : wi.quienPersona })}
              title={wi.cambiarQuien}
              onClick={() => setIni((a) => ({ ...a, jugadores: a.jugadores.map((x, k) => (k === i ? { ...x, ia: !x.ia } : x)) }))}
            >
              <Icono nombre={j.ia ? 'robot' : 'persona'} tam={18} />
              {j.ia ? wi.ia : wi.persona}
            </button>
            <div className="cas-muestras" role="group" aria-label={wi.colorJugador({ n: i + 1 })}>
              {paleta.map((c) => {
                const ocupada = activos.some((o, k) => k !== i && o.color === c.color)
                return (
                  <button
                    key={c.color}
                    type="button"
                    title={ocupada ? wi.colorOcupado({ color: c.nombre }) : c.nombre}
                    aria-label={c.nombre}
                    aria-pressed={j.color === c.color}
                    className={`cas-muestra ${j.color === c.color ? 'cas-muestra-si' : ocupada ? 'cas-muestra-ocupada' : ''}`}
                    style={{ background: c.color }}
                    onClick={() => elegirColor(i, c.color)}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="cas-boton cas-boton-fuerte" style={{ padding: '13px 22px', fontSize: '1.08em' }} onClick={() => onEmpezar(ini)}>
        <Icono nombre="jugar" />
        {wi.empezar}
      </button>
      {g && <p className="cas-ayuda">{wi.sustituye}</p>}
    </div>
  )
}

/* ---------- historial ---------- */

function LineaJugada({ j, p, colores }: { j: Jugada; p: Partida; colores: string[] }) {
  const { w, nombreLoseta } = useTextos()
  const est = j.estandarte === undefined ? w.historial.decidiendo : j.estandarte === null ? w.historial.sinEstandarte : w.estandarteEn[j.estandarte]
  return (
    <li>
      <div className="cas-jugada">
        <span className="cas-jugada-n">{j.n}</span>
        <span className="cas-ficha-color" style={{ background: colores[j.jugador] }} />
        <span>
          <b>{p.jugadores[j.jugador].nombre}</b> · {nombreLoseta(j.loseta)} · {est}
        </span>
      </div>
      {j.puntos.map((a, i) => (
        <div key={i} className="cas-jugada-puntos">
          {texto(a, p, w)}
        </div>
      ))}
    </li>
  )
}

function Historial({ p, colores }: { p: Partida; colores: string[] }) {
  const { w } = useTextos()
  const [todo, setTodo] = useState(false)
  const jugadas = useMemo(() => historial(p), [p])
  if (!jugadas.length) return null
  const lista = (todo ? jugadas : jugadas.slice(-4)).slice().reverse()
  return (
    <div className="cas-caja cas-o-historial">
      <h3>{w.historial.titulo}</h3>
      <ol className={`cas-historial ${todo ? 'cas-historial-todo' : ''}`} aria-label={w.historial.aria}>
        {lista.map((j) => (
          <LineaJugada key={j.n} j={j} p={p} colores={colores} />
        ))}
      </ol>
      {jugadas.length > 4 && (
        <button type="button" className="cas-enlace" onClick={() => setTodo(!todo)}>
          {todo ? w.historial.verUltimas : w.historial.verTodo({ count: jugadas.length })}
        </button>
      )}
    </div>
  )
}

/* ---------- final ---------- */

function Final({ p, colores, onRevancha, onNueva, textoNueva }: { p: Partida; colores: string[]; onRevancha?: () => void; onNueva: () => void; textoNueva: string }) {
  const { w } = useTextos()
  const wf = w.final
  const g = ganadores(p)
  const d = desglose(p)
  const finales = p.anotaciones.filter((a) => a.final)
  const conPuntos = finales.filter((a) => a.puntos > 0)
  const sinPuntos = finales.length - conPuntos.length
  const tabla = clasificacion(p)
  return (
    <div className="cas-caja cas-final">
      <div className="cas-final-cabeza">
        <div className="cas-final-corona" style={{ background: `linear-gradient(160deg, ${colores[g[0]]}, #3a2614 140%)` }}>
          <Icono nombre="corona" tam={34} />
        </div>
        <div>
          <h3>{wf.titulo}</h3>
          <p className="cas-final-gana">
            {(g.length > 1 ? wf.empate : wf.gana)({ nombres: lista(g.map((j) => p.jugadores[j].nombre), w.y), puntos: p.jugadores[g[0]].puntos })}
          </p>
        </div>
      </div>
      <p className="cas-ayuda" style={{ marginTop: 10 }}>
        {p.descartadas.length ? wf.reinoApartadas({ n: p.orden.length, count: p.descartadas.length }) : wf.reino({ n: p.orden.length })}
      </p>
      <div className="cas-fila" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
        {onRevancha && (
          <button type="button" className="cas-boton cas-boton-fuerte" onClick={onRevancha}>
            <Icono nombre="jugar" tam={18} />
            {wf.revancha}
          </button>
        )}
        <button type="button" className="cas-boton" onClick={onNueva}>
          {textoNueva}
        </button>
      </div>
      <div className="cas-tabla-final">
        <table className="cas-marcador">
          <thead>
            <tr>
              <th />
              <th>{wf.jugador}</th>
              {ZONAS_PUNTOS.map((z) => (
                <th key={z} className="cas-num">
                  {w.zonas[z]}
                </th>
              ))}
              <th className="cas-num">{wf.total}</th>
            </tr>
          </thead>
          <tbody>
            {tabla.map(({ jugador, puesto }) => (
              <tr key={jugador} className={g.includes(jugador) ? 'cas-activo' : ''}>
                <td>{wf.puesto({ n: puesto })}</td>
                <td>
                  <span className="cas-jugada">
                    <span className="cas-ficha-color" style={{ background: colores[jugador] }} /> {p.jugadores[jugador].nombre}
                  </span>
                </td>
                {ZONAS_PUNTOS.map((z) => {
                  const durante = d[jugador].partida[z]
                  const alFinal = d[jugador].final[z]
                  return (
                    <td key={z} className="cas-num">
                      {durante + alFinal}
                      {alFinal > 0 && durante > 0 && <span className="cas-detalle">{wf.masAlFinal({ durante, final: alFinal })}</span>}
                      {alFinal > 0 && durante === 0 && <span className="cas-detalle">{wf.alFinal}</span>}
                    </td>
                  )
                })}
                <td className="cas-num">
                  <b>{d[jugador].total}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="cas-detalles">
      <summary>{wf.puntosFinal}</summary>
      {conPuntos.length ? (
        <ul className="cas-avisos">
          {conPuntos.map((a, i) => (
            <li key={i}>{texto(a, p, w)}</li>
          ))}
        </ul>
      ) : (
        <p className="cas-ayuda">{wf.ninguno}</p>
      )}
      {sinPuntos > 0 && (
        <p className="cas-ayuda" style={{ marginTop: 4 }}>
          {wf.camposSinPuntos({ count: sinPuntos })}
        </p>
      )}
      </details>
    </div>
  )
}

/* ---------- la partida ---------- */

/**
 * Partida en línea: la partida viene de la sala y este dispositivo solo
 * juega en su asiento. Colocar y deshacer se quedan aquí; al decidir el estandarte
 * (o ninguno) se envía el turno entero.
 */
export interface Red {
  partida: Partida
  colores: string[]
  /** El asiento de este dispositivo; -1 si solo mira. */
  asiento: number
  /** La sala está abierta y acepta jugadas de este asiento. */
  puedeJugar: boolean
  /** Envía el turno; devuelve null si la sala lo aceptó o el motivo si no. */
  enviar: (j: JugadaRed) => Promise<string | null>
  /** Solo el anfitrión: otra partida con los mismos asientos. */
  onRevancha?: () => void
  onSalir: () => void
  /** Lo que se muestra encima (mesa, quién está, avisos de la sala). */
  cabecera?: ReactNode
}

export function Juego({ semilla, red, onPortada }: { semilla?: number; red?: Red; onPortada?: () => void }) {
  const { w, nombres, nombreLoseta } = useTextos()
  const wt = w.turno
  const [inicio, setInicio] = useState<DatosInicio>(() => leerInicio())
  // Jugar empieza ya: la partida a medias si la hay; si no, una nueva con lo último elegido (de serie, tú contra la IA).
  const [arranque] = useState<Guardada | null>(() => {
    if (red) return null
    const g = leerPartida()
    if (g) return g
    const js = inicio.jugadores.slice(0, inicio.cuantos)
    return {
      partida: nueva({ jugadores: js.map((j, i) => nombreDe(j, i, nombres)), semilla: semilla ?? semillaNueva() }),
      colores: js.map((j) => j.color),
      ias: js.map((j) => j.ia),
    }
  })
  const [guardada, setGuardada] = useState<Guardada | null>(null)
  const [partidaLocal, setPartida] = useState<Partida | null>(arranque?.partida ?? null)
  // En línea: la colocación de este turno que aún no se ha enviado, el giro de la mano y si se está enviando.
  const [pendiente, setPendiente] = useState<Hueco | null>(null)
  const [giroRed, setGiroRed] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const base = red ? red.partida : null
  const miTurnoRed = !!red && !!base && base.fase !== 'fin' && base.turno === red.asiento
  const partida = useMemo(() => {
    if (!red || !base) return partidaLocal
    if (miTurnoRed && pendiente && base.fase === 'colocar') {
      try {
        return aplicar(base, { tipo: 'colocar', ...pendiente })
      } catch {
        return base
      }
    }
    return miTurnoRed && base.fase === 'colocar' ? { ...base, giro: giroRed } : base
  }, [red, base, partidaLocal, miTurnoRed, pendiente, giroRed])
  // Cuando llega una jugada nueva de la sala, lo pendiente de este dispositivo ya no vale.
  const jugadasRed = base ? base.acciones.length : 0
  useEffect(() => {
    setPendiente(null)
    setGiroRed(0)
  }, [jugadasRed])
  const [colores, setColores] = useState<string[]>(arranque?.colores ?? [])
  const [ias, setIas] = useState<boolean[]>(arranque?.ias ?? [])
  const [eleccion, setEleccion] = useState<Hueco | null>(null)
  const [error, setError] = useState('')
  const [ayuda, setAyuda] = useState(false)

  // Sonido: se desbloquea con el primer gesto y se recuerda si está quitado.
  const sonidos = useRef<Sonidos | null>(null)
  if (!sonidos.current) sonidos.current = new Sonidos()
  const [silencio, setSilencio] = useState(leerSilencio)
  sonidos.current.silencio = silencio
  useEffect(() => () => sonidos.current?.cerrar(), [])
  const tocar = (n: NombreSonido) => sonidos.current?.tocar(n)
  const cambiarSilencio = () => {
    const s = !silencio
    setSilencio(s)
    guardarSilencio(s)
  }

  // Cada cambio de la partida suena según lo que ha pasado (también las jugadas de la IA).
  const previa = useRef<Partida | null>(null)
  useEffect(() => {
    const a = previa.current
    previa.current = partida
    if (!a || !partida || partida.acciones.length <= a.acciones.length || partida.config.semilla !== a.config.semilla) return
    const nuevas = partida.anotaciones.slice(a.anotaciones.length).filter((x) => x.puntos > 0)
    if (partida.fase === 'fin') tocar('fin')
    else if (nuevas.length) tocar(Math.max(...nuevas.map((x) => x.puntos)) >= 8 ? 'puntosGrandes' : 'puntos')
    else if (partida.puestos.length > a.puestos.length) tocar('estandarte')
    else if (partida.orden.length > a.orden.length) tocar('colocar')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partida])

  /** Le toca a la IA (y la partida sigue en marcha). */
  const turnoIA = !red && !!partida && partida.fase !== 'fin' && !partida.pausada && !!ias[partida.turno]
  /** En línea: le toca a otro dispositivo (o este solo mira). */
  const turnoAjeno = !!red && !!partida && partida.fase !== 'fin' && !miTurnoRed
  const bloqueado = turnoIA || turnoAjeno || enviando || (red ? !red.puedeJugar : false)
  const legales = useMemo(() => (partida && !partida.pausada && !bloqueado ? colocaciones(partida) : []), [partida, bloqueado])
  const sitios = useMemo(() => (partida && !partida.pausada && !bloqueado ? sitiosLibres(partida) : []), [partida, bloqueado])

  useEffect(() => {
    if (partida && !red) guardarPartida(partida, colores, ias)
  }, [partida, colores, ias, red])

  /* La IA juega en dos pasos, con una pausa entre ellos para que se vea: coloca y luego pone (o no) el estandarte. */
  useEffect(() => {
    if (!turnoIA || !partida) return
    const espera = ias.every(Boolean) ? 400 : 750
    const t = setTimeout(() => {
      try {
        if (partida.fase === 'colocar') setPartida(aplicar(partida, { tipo: 'colocar', ...elegirJugada(partida).colocar }))
        else {
          const s = elegirEstandarte(partida)
          setPartida(aplicar(partida, s ? { tipo: 'estandarte', sitio: s } : { tipo: 'pasar' }))
        }
      } catch {
        setError(wt.noVale)
      }
    }, espera)
    return () => clearTimeout(t)
  }, [partida, turnoIA, ias])

  const empezar = (ini: DatosInicio) => {
    const js = ini.jugadores.slice(0, ini.cuantos)
    guardarInicio(ini)
    setInicio(ini)
    setGuardada(null)
    setColores(js.map((j) => j.color))
    setIas(js.map((j) => j.ia))
    setPartida(nueva({ jugadores: js.map((j, i) => nombreDe(j, i, nombres)), semilla: semilla ?? semillaNueva() }))
    setEleccion(null)
    setError('')
  }

  const hacer = (a: Accion) => {
    if (!partida) return
    if (red) {
      if (!miTurnoRed || bloqueado) return
      setEleccion(null)
      if (a.tipo === 'colocar') {
        try {
          aplicar(partida, a)
          setPendiente({ x: a.x, y: a.y, giro: a.giro ?? partida.giro })
          setError('')
        } catch {
          setError(wt.noVale)
        }
      } else if (a.tipo === 'deshacer') setPendiente(null)
      else if ((a.tipo === 'estandarte' || a.tipo === 'pasar') && pendiente) {
        setEnviando(true)
        setError('')
        red
          .enviar({ ...pendiente, estandarte: a.tipo === 'estandarte' ? a.sitio : null })
          .then((motivo) => {
            if (motivo) setError(wt.salaNoAcepto({ motivo }))
          })
          .finally(() => setEnviando(false))
      }
      return
    }
    try {
      setPartida(aplicar(partida, a))
      setError('')
    } catch {
      setError(wt.noVale)
    }
    setEleccion(null)
  }

  if (!partida) {
    return (
      <div className="cas-juego" onPointerDownCapture={() => sonidos.current?.desbloquear()}>
        <style>{ESTILO}</style>
        <Inicio
          inicial={inicio}
          guardada={guardada}
          onEmpezar={empezar}
          onContinuar={() => {
            if (!guardada) return
            setColores(guardada.colores)
            setIas(guardada.ias)
            setPartida(guardada.partida)
            setGuardada(null)
          }}
          onDescartar={() => {
            guardarPartida(null, [], [])
            setGuardada(null)
          }}
          onVolver={onPortada}
        />
      </div>
    )
  }

  const p = partida
  const quedan = p.mazoRio.length + p.mazo.length
  const cols = red ? red.colores : colores
  const color = cols[p.turno]
  /** Puntos que acaba de ganar cada jugador (los del último turno), para resaltarlos en el marcador. */
  const recientes = p.jugadores.map(() => 0)
  for (const a of p.anotaciones) if (!a.final && a.turno === p.orden.length && p.fase === 'colocar') for (const j of a.ganadores) recientes[j] += a.puntos

  /** Volver al inicio: la partida queda guardada para continuarla. */
  const alInicio = () => {
    if (red) return red.onSalir()
    const sinPausa = p.pausada ? aplicar(p, { tipo: 'reanudar' }) : p
    setGuardada(p.fase === 'fin' || p.orden.length <= 1 ? null : { partida: sinPausa, colores, ias })
    setPartida(null)
    setEleccion(null)
    setError('')
  }

  /** Toque en un hueco: lo elige con un giro que valga; otro toque en el mismo hueco prueba el siguiente giro. */
  const tocarCasilla = (x: number, y: number) => {
    const giros = legales.filter((h) => h.x === x && h.y === y).map((h) => h.giro)
    if (!giros.length) return
    let giro: number
    if (eleccion && eleccion.x === x && eleccion.y === y) {
      giro = giros[(giros.indexOf(eleccion.giro) + 1) % giros.length]
      if (giros.length > 1) tocar('giro')
    }
    else giro = giros.includes(p.giro) ? p.giro : giros[0]
    setEleccion({ x, y, giro })
  }

  const girar = (sentido: 1 | -1) => {
    tocar('giro')
    if (eleccion) {
      const giros = legales.filter((h) => h.x === eleccion.x && h.y === eleccion.y).map((h) => h.giro)
      const i = giros.indexOf(eleccion.giro)
      setEleccion({ ...eleccion, giro: giros[(i + sentido + giros.length) % giros.length] })
      return
    }
    if (red) {
      if (p.fase === 'colocar') setGiroRed((g) => (((g + sentido) % 4) + 4) % 4)
      return
    }
    try {
      setPartida(aplicar(p, { tipo: 'girar', sentido }))
    } catch {
      /* fuera de la fase de colocar no se gira */
    }
  }

  const pausar = () => {
    if (p.fase === 'fin' || red) return
    setPartida(aplicar(p, { tipo: p.pausada ? 'reanudar' : 'pausar' }))
    setEleccion(null)
  }

  return (
    <div
      className="cas-juego"
      tabIndex={0}
      onPointerDownCapture={() => sonidos.current?.desbloquear()}
      onKeyDown={(e) => {
        sonidos.current?.desbloquear()
        if ((e.key === 'p' || e.key === 'P') && p.fase !== 'fin') return pausar()
        if (e.key === '?') return setAyuda(!ayuda)
        if (p.pausada || bloqueado) return
        if (p.fase === 'colocar' && (e.key === 'r' || e.key === 'R')) girar(e.key === 'r' ? 1 : -1)
        if (p.fase === 'colocar' && e.key === 'Enter' && eleccion) hacer({ tipo: 'colocar', ...eleccion })
        if (p.fase === 'estandarte' && e.key === 'Enter') hacer({ tipo: 'pasar' })
      }}
    >
      <style>{ESTILO}</style>
      {ayuda && <Ayuda onCerrar={() => setAyuda(false)} />}
      <div className="cas-barra">
        {onPortada ? (
          <button type="button" className="cas-marca" onClick={onPortada} aria-label={w.portada.titulo}>
            <Icono nombre="atras" />
            {w.portada.titulo}
          </button>
        ) : (
          <span className="cas-marca">{w.portada.titulo}</span>
        )}
        <span className="cas-iconos">
          <button type="button" className="cas-icono-btn" onClick={() => setAyuda(!ayuda)} aria-pressed={ayuda} aria-label={wt.ayuda} title={`${wt.ayuda} (?)`}>
            <Icono nombre="ayuda" />
          </button>
          <button
            type="button"
            className="cas-icono-btn"
            onClick={cambiarSilencio}
            aria-pressed={silencio}
            aria-label={silencio ? wt.ponerSonido : wt.quitarSonido}
            title={silencio ? wt.sinSonido : wt.conSonido}
          >
            <Icono nombre={silencio ? 'mudo' : 'sonido'} />
          </button>
          {!red && (
            <button type="button" className="cas-icono-btn" onClick={alInicio} aria-label={wt.ajustes} title={wt.ajustes}>
              <Icono nombre="ajustes" />
            </button>
          )}
          {!red && p.fase !== 'fin' && (
            <button type="button" className="cas-icono-btn" onClick={pausar} aria-pressed={p.pausada} aria-label={wt.pausa} title={`${wt.pausa} (P)`}>
              <Icono nombre="pausa" />
            </button>
          )}
        </span>
      </div>
      {red?.cabecera}
      {p.fase === 'fin' && (
        <Final
          p={p}
          colores={cols}
          onRevancha={red ? red.onRevancha : () => empezar(inicio)}
          onNueva={alInicio}
          textoNueva={red ? w.linea.salir : w.final.nueva}
        />
      )}
      <div className="cas-cuerpo">
        <div className="cas-panel">
          {p.fase !== 'fin' && p.pausada && (
            <div className="cas-caja cas-o-turno">
              <div className="cas-turno" style={{ marginBottom: 8 }}>
                <Icono nombre="pausa" />
                {wt.pausada}
              </div>
              <p className="cas-ayuda" style={{ marginBottom: 10 }}>
                {wt.leToca({ nombre: p.jugadores[p.turno].nombre })}
              </p>
              <div className="cas-fila" style={{ justifyContent: 'flex-start' }}>
                <button type="button" className="cas-boton cas-boton-fuerte" onClick={pausar}>
                  {wt.reanudar}
                </button>
                <button type="button" className="cas-boton" onClick={alInicio}>
                  {wt.volverInicio}
                </button>
              </div>
              <p className="cas-ayuda" style={{ marginTop: 8 }}>
                {wt.guardadaAlVolver}
              </p>
            </div>
          )}
          {p.fase !== 'fin' && !p.pausada && (
            <div className="cas-caja cas-o-turno">
              <div className="cas-turno cas-cabecera">
                <span className="cas-jugada cas-entra" key={p.orden.length * 10 + p.turno}>
                  <span className="cas-ficha-color" style={{ background: color }} /> {wt.turnoDe({ nombre: p.jugadores[p.turno].nombre })}
                </span>
              </div>
              {turnoIA && (
                <div className="cas-mano">
                  {p.fase === 'colocar' && p.actual && (
                    <div className="cas-nueva cas-mano-loseta" key={p.orden.length}>
                      <LosetaIlustrada id={p.actual} giro={0} tam={120} />
                    </div>
                  )}
                  {p.fase === 'colocar' && p.actual && <div className="cas-mano-nombre">{nombreLoseta(p.actual)}</div>}
                  <div className="cas-piensa">
                    <Icono nombre="robot" tam={18} /> <span>{p.fase === 'colocar' ? wt.pensando : wt.decidiendo}</span>
                  </div>
                </div>
              )}
              {turnoAjeno && (
                <div className="cas-mano">
                  {p.fase === 'colocar' && p.actual && (
                    <div className="cas-nueva cas-mano-loseta" key={p.orden.length}>
                      <LosetaIlustrada id={p.actual} giro={0} tam={120} />
                    </div>
                  )}
                  {p.fase === 'colocar' && p.actual && <div className="cas-mano-nombre">{nombreLoseta(p.actual)}</div>}
                  <div className="cas-piensa">
                    <Icono nombre="reloj" tam={18} /> <span>{red && red.asiento < 0 ? wt.mirando : wt.esperando({ nombre: p.jugadores[p.turno].nombre })}</span>
                  </div>
                </div>
              )}
              {!turnoIA && !turnoAjeno && p.fase === 'colocar' && p.actual && (
                <div className="cas-mano">
                  <div className="cas-nueva cas-mano-loseta" key={p.orden.length}>
                    <LosetaIlustrada id={p.actual} giro={eleccion ? eleccion.giro : p.giro} tam={120} />
                  </div>
                  <div className="cas-mano-nombre">{nombreLoseta(p.actual)}</div>
                  <div className="cas-fila">
                    <button type="button" className="cas-boton" disabled={bloqueado} onClick={() => girar(-1)} aria-label={wt.girarIzquierda}><Icono nombre="girarIzq" /></button>
                    <button type="button" className="cas-boton" disabled={bloqueado} onClick={() => girar(1)} aria-label={wt.girarDerecha}><Icono nombre="girarDer" /></button>
                    <button
                      type="button"
                      className="cas-boton cas-boton-fuerte"
                      disabled={bloqueado || !eleccion}
                      onClick={() => eleccion && hacer({ tipo: 'colocar', ...eleccion })}
                    >
                      {wt.colocar}
                    </button>
                  </div>
                  <p className="cas-ayuda">{eleccion ? wt.tocaOtraVez : wt.tocaHueco}</p>
                </div>
              )}
              {!turnoIA && !turnoAjeno && p.fase === 'estandarte' && (
                <div className="cas-mano">
                  <p className="cas-ayuda">
                    {sitios.length ? wt.tocaCirculo : p.jugadores[p.turno].enMano === 0 ? wt.sinEstandartes : wt.sinSitio}
                  </p>
                  <div className="cas-fila">
                    <button type="button" className="cas-boton" disabled={bloqueado} onClick={() => hacer({ tipo: 'deshacer' })}>
                      {wt.deshacer}
                    </button>
                    <button type="button" className="cas-boton cas-boton-fuerte" disabled={bloqueado} onClick={() => hacer({ tipo: 'pasar' })}>
                      {wt.sinEstandarte}
                    </button>
                  </div>
                  {enviando && <p className="cas-ayuda">{wt.enviando}</p>}
                </div>
              )}
              <p className="cas-ayuda" style={{ marginTop: 8 }}>
                {p.mazoRio.length ? wt.quedanRio({ count: quedan, rio: p.mazoRio.length }) : wt.quedan({ count: quedan })}
                {p.descartadas.length ? ` ${wt.apartadas({ n: p.descartadas.length })}` : ''}
              </p>
              {error && <p className="cas-ayuda" style={{ color: 'var(--granate)', fontWeight: 700 }}>{error}</p>}
            </div>
          )}

          <div className="cas-caja cas-o-marcador">
            <h3>{wt.marcador}</h3>
            <table className="cas-marcador">
              <tbody>
                {p.jugadores.map((j, i) => (
                  <tr key={i} className={i === p.turno && p.fase !== 'fin' ? 'cas-activo' : ''}>
                    <td>
                      <span className="cas-ficha-color" style={{ background: cols[i] }} />
                    </td>
                    <td>
                      {j.nombre}
                      {ias[i] && (
                        <span title={w.inicio.ia} style={{ display: 'inline-block', verticalAlign: '-3px', marginLeft: 6, color: 'var(--tinta-3)' }}>
                          <Icono nombre="robot" tam={16} />
                        </span>
                      )}
                    </td>
                    <td className="cas-num">
                      {recientes[i] > 0 && (
                        <span className="cas-mas" key={p.anotaciones.length}>
                          +{recientes[i]}
                        </span>
                      )}{' '}
                      <span className="cas-num-grande">{j.puntos}</span>
                    </td>
                    <td className="cas-num" title={wt.enMano}>
                      <span className="cas-mano-est">
                        <Icono nombre="estandarte" tam={15} />
                        {j.enMano}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Historial p={p} colores={cols} />
        </div>

        {p.pausada ? (
          <div className="cas-tablero-marco">
            <div className="cas-tablero cas-pausa">
              <Icono nombre="pausa" tam={44} />
              <div className="cas-pausa-titulo">{wt.enPausa}</div>
              <button type="button" className="cas-boton cas-boton-fuerte" onClick={pausar}>
                {wt.reanudar}
              </button>
            </div>
          </div>
        ) : (
          <VistaTablero
            partida={p}
            legales={legales}
            eleccion={eleccion}
            onCasilla={(x, y) => p.fase === 'colocar' && !bloqueado && tocarCasilla(x, y)}
            sitios={sitios}
            onSitio={(s: Sitio) => hacer({ tipo: 'estandarte', sitio: s })}
            colores={cols}
          />
        )}
      </div>
    </div>
  )
}
