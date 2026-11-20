// La portada: el juego jugándose solo, con el motor y las preguntas de verdad.
// Dos jugadores de muestra se turnan: la pista aparece, la respuesta se escribe letra a letra,
// la letra se enciende y la cabra reacciona. El bucle va con requestAnimationFrame y su propio
// reloj (se para si la página no se ve); React solo se entera de cada jugada y de cada segundo.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { animoDe, Cabra } from './Cabra'
import { EDICIONES, type Edicion, type Idioma } from './ediciones'
import { Icono } from './Iconos'
import { useVez, type Palabras } from './Partida'
import { aplicar, crearPartida, preguntaActual, repartirPreguntas, tiempoDe, type Accion, type Partida, type Pregunta } from './reglas'
import { Rueda } from './Rueda'

const NOMBRES_DEMO: [string, string] = ['Lupe', 'Bruno']
const TIEMPO_DEMO_MS = 150_000
const JUGADAS_PREVIAS = 7
const PENSAR_MS = 800
const LETRA_MS = 105
const MANTENER_MS = 550
const REACCION_MS = 1500
const FINAL_MS = 4500

type Jugada = { accion: Accion; texto: string }
type Marca = 'bien' | 'mal' | 'pasa' | null

/** Lo que hará el jugador de muestra: casi siempre acierta, a veces falla y a veces pasa la cabra. */
function planear(p: Partida, edicion: Edicion): Jugada {
  const pregunta = preguntaActual(p)!
  const r = Math.random()
  if (r < 0.62) return { accion: { tipo: 'responder', texto: pregunta.respuestas[0] }, texto: pregunta.respuestas[0] }
  if (r < 0.82) {
    const banco = edicion.niveles.facil.banco
    const otra = banco[Math.floor(Math.random() * banco.length)]
    const texto = otra.letra === pregunta.letra ? banco[(banco.indexOf(otra) + 7) % banco.length].respuestas[0] : otra.respuestas[0]
    return { accion: { tipo: 'responder', texto }, texto }
  }
  return { accion: { tipo: 'pasar' }, texto: '' }
}

/** Una partida de muestra ya empezada, con unas cuantas letras jugadas para que las ruedas tengan color. */
function partidaDemo(edicion: Edicion, desde: number): { partida: Partida; reloj: number } {
  const preguntas = repartirPreguntas(edicion.niveles.facil.banco, edicion.letras)
  let reloj = desde
  let partida = aplicar(crearPartida({ nombres: NOMBRES_DEMO, preguntas, tiempoMs: TIEMPO_DEMO_MS }), { tipo: 'empezar' }, reloj)
  for (let i = 0; i < JUGADAS_PREVIAS && partida.fase === 'jugando'; i++) {
    reloj += 2_600
    partida = aplicar(partida, planear(partida, edicion).accion, reloj, edicion.corregir)
  }
  return { partida: { ...partida, ultimoEvento: null }, reloj }
}

type Escena = { partida: Partida; reloj: number; pregunta: Pregunta | null; turno: 0 | 1; marca: Marca; reaccion: boolean }

function usePrefiereQuieto(): boolean {
  const [quieto, setQuieto] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const consulta = matchMedia('(prefers-reduced-motion: reduce)')
    const cambio = () => setQuieto(consulta.matches)
    consulta.addEventListener('change', cambio)
    return () => consulta.removeEventListener('change', cambio)
  }, [])
  return quieto
}

function DemoEnVivo({ w, idioma }: { w: Palabras; idioma: Idioma }) {
  const edicion = EDICIONES[idioma]
  const quieto = usePrefiereQuieto()
  const raiz = useRef<HTMLDivElement>(null)
  const escrito = useRef<HTMLSpanElement>(null)
  const [escena, setEscena] = useState<Escena>(() => {
    const { partida, reloj } = partidaDemo(edicion, 0)
    return { partida, reloj, pregunta: preguntaActual(partida), turno: partida.turno, marca: null, reaccion: false }
  })

  useEffect(() => {
    const primera = escena.partida
    // Quieto: una escena compuesta, con media respuesta escrita.
    if (quieto) {
      const q = preguntaActual(primera)
      if (escrito.current && q) escrito.current.textContent = q.respuestas[0].slice(0, Math.ceil(q.respuestas[0].length * 0.6))
      return
    }
    let visible = true
    const observador = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([e]) => { visible = e.isIntersecting })
      : null
    if (raiz.current) observador?.observe(raiz.current)

    const m = {
      partida: primera,
      reloj: escena.reloj,
      fase: 'pensar' as 'pensar' | 'escribir' | 'mantener' | 'reaccion' | 'final',
      desde: escena.reloj,
      jugada: null as Jugada | null,
      escritas: -1,
      segundo: -1,
      pregunta: preguntaActual(primera),
      marca: null as Marca,
    }
    const escribir = (texto: string) => { if (escrito.current) escrito.current.textContent = texto }
    const publicar = () => setEscena({
      partida: m.partida, reloj: m.reloj, pregunta: m.pregunta, turno: m.partida.turno, marca: m.marca,
      reaccion: m.fase === 'reaccion' || m.fase === 'final',
    })
    const cambiarA = (fase: typeof m.fase) => { m.fase = fase; m.desde = m.reloj }

    let previo = performance.now()
    let id = requestAnimationFrame(function paso(t) {
      id = requestAnimationFrame(paso)
      const dt = Math.min(100, t - previo)
      previo = t
      if (!visible || document.hidden) return
      m.reloj += dt
      const enFase = m.reloj - m.desde
      if (m.fase === 'pensar' && enFase >= PENSAR_MS) {
        m.jugada = planear(m.partida, edicion)
        m.escritas = -1
        cambiarA('escribir')
      } else if (m.fase === 'escribir' && m.jugada) {
        const n = Math.min(m.jugada.texto.length, Math.floor(enFase / LETRA_MS))
        if (n !== m.escritas) {
          m.escritas = n
          escribir(m.jugada.texto.slice(0, n))
        }
        if (n >= m.jugada.texto.length) cambiarA('mantener')
      } else if (m.fase === 'mantener' && m.jugada && enFase >= MANTENER_MS) {
        m.partida = aplicar(m.partida, m.jugada.accion, m.reloj, edicion.corregir)
        const ev = m.partida.ultimoEvento
        m.marca = ev?.tipo === 'acierto' || ev?.tipo === 'rueda-completa' ? 'bien' : ev?.tipo === 'fallo' ? 'mal' : ev?.tipo === 'pasa' ? 'pasa' : null
        cambiarA(m.partida.fase === 'final' ? 'final' : 'reaccion')
        publicar()
      } else if (m.fase === 'reaccion' && enFase >= REACCION_MS) {
        m.partida = aplicar(m.partida, { tipo: 'tick' }, m.reloj)
        m.pregunta = preguntaActual(m.partida)
        m.marca = null
        escribir('')
        cambiarA(m.partida.fase === 'final' ? 'final' : 'pensar')
        publicar()
      } else if (m.fase === 'final' && enFase >= FINAL_MS) {
        const nueva = partidaDemo(edicion, m.reloj)
        m.partida = nueva.partida
        m.reloj = nueva.reloj
        m.pregunta = preguntaActual(m.partida)
        m.marca = null
        escribir('')
        cambiarA('pensar')
        publicar()
      }
      // El reloj de quien tiene el turno: React solo se entera cuando cambia el segundo.
      const segundo = Math.ceil(tiempoDe(m.partida, m.partida.turno, m.reloj) / 1000)
      if (segundo !== m.segundo) {
        m.segundo = segundo
        publicar()
      }
    })
    return () => {
      cancelAnimationFrame(id)
      observador?.disconnect()
    }
    // La escena inicial solo arranca el bucle; después manda el bucle.
  }, [edicion, quieto])

  const { partida, reloj, pregunta, turno, marca, reaccion } = escena
  const vez = useVez(partida.ultimoEvento)
  const animo = reaccion ? animoDe(partida.ultimoEvento, partida.fase === 'final') : 'atenta'
  return (
    <div ref={raiz} className="plc-demo">
      <div className="plc-tarima">
        <Rueda jugador={partida.jugadores[0]} restanteMs={tiempoDe(partida, 0, reloj)} activa={turno === 0} enJuego asiento={0} w={w} className="plc-rueda-entra" />
        <Cabra animo={animo} vez={vez} bocadillo={w.pasa} />
        <Rueda jugador={partida.jugadores[1]} restanteMs={tiempoDe(partida, 1, reloj)} activa={turno === 1} enJuego asiento={1} w={w} className="plc-rueda-entra" />
      </div>
      {pregunta && (
        <div className={`plc-panel plc-pista-tarjeta plc-pista-${turno}`} lang={idioma}>
          <span className="plc-letra-grande">{pregunta.letra}</span>
          <div className="plc-pista-tipo">
            {pregunta.tipo === 'empieza' ? w.empieza : w.contiene} {pregunta.letra}
            <span className="plc-pista-quien"> · {partida.jugadores[turno].nombre}</span>
          </div>
          <p className="plc-pista">{pregunta.pista}</p>
          {/* La respuesta del jugador de muestra: se escribe sola; no es un campo. */}
          <div className={`plc-escribe plc-escribe-${marca ?? 'nada'}`} aria-hidden="true">
            <span className="plc-escribe-quien">{partida.jugadores[turno].nombre}</span>
            <span ref={escrito} className="plc-escribe-texto" />
            <i className="plc-cursor" />
            <span className="plc-pensando"><i /><i /><i /></span>
            {marca === 'pasa' && <span className="plc-escribe-pasa-texto">{w.pasa}</span>}
            {(marca === 'bien' || marca === 'mal') && <Icono nombre={marca} className="plc-escribe-marca" />}
          </div>
        </div>
      )}
    </div>
  )
}

/** `**negrita**` en un texto de las palabras. */
function conNegritas(texto: string): ReactNode[] {
  return texto.split(/\*\*(.+?)\*\*/g).map((trozo, i) => (i % 2 ? <strong key={i}>{trozo}</strong> : trozo))
}

function Hoja({ titulo, onCerrar, w, ancha = false, children }: { titulo: string; onCerrar: () => void; w: Palabras; ancha?: boolean; children: ReactNode }) {
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [onCerrar])
  return (
    <div className="plc-velo" onClick={(e) => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className={`plc-hoja${ancha ? ' plc-hoja-ancha' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <button type="button" className="plc-boton plc-boton-cristal plc-redondo plc-hoja-cerrar" onClick={onCerrar} aria-label={w.cerrar} title={w.cerrar}>
          <Icono nombre="cerrar" />
        </button>
        {children}
      </div>
    </div>
  )
}

/** Dibujos de los pasos de «¿Cómo se juega?». */
function Dibujo({ paso }: { paso: number }) {
  const ficha = (x: number, y: number, letra: string, relleno: string, borde: string, texto = '#fff4e3') => (
    <g transform={`translate(${x} ${y})`}>
      <circle r="17" fill={relleno} stroke={borde} strokeWidth="3" />
      <text dy="0.36em" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="18" fill={texto}>{letra}</text>
    </g>
  )
  switch (paso) {
    case 0:
      return (
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <rect x="26" y="14" width="50" height="40" rx="9" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
          <path d="M36 28h30M36 37h22M36 46h26" stroke="#fff4e3" strokeOpacity="0.6" strokeWidth="3.5" strokeLinecap="round" />
          {ficha(22, 50, 'A', '#ffc145', '#fff1c2', '#3a1c00')}
        </svg>
      )
    case 1:
      return (
        <svg viewBox="0 0 80 80" aria-hidden="true">
          {ficha(24, 44, 'B', '#12a866', '#34d892')}
          <path d="M44 44h14m-5-6 6 6-6 6" fill="none" stroke="#fff4e3" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {ficha(66, 44, 'C', '#ffc145', '#fff1c2', '#3a1c00')}
          <circle cx="36" cy="28" r="9" fill="#34d892" />
          <path d="M31.5 28.5l3 3 5.5-6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 2:
      return (
        <svg viewBox="0 0 80 80" aria-hidden="true">
          {ficha(22, 30, 'D', '#d42d4c', '#ff5d73')}
          <circle cx="58" cy="54" r="15" fill="none" stroke="#39d7c6" strokeWidth="3.5" />
          <path d="M58 46v8l6 4" fill="none" stroke="#39d7c6" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M30 52c4 10 12 14 20 14" fill="none" stroke="#fff4e3" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
          <path d="M44 61l6 5-5 6" fill="none" stroke="#fff4e3" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 4:
      return (
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <path d="M24 14h32v18a16 16 0 0 1-32 0z" fill="#ffc145" stroke="#b85f00" strokeWidth="2.5" />
          <path d="M24 20H14v4a10 10 0 0 0 10 10M56 20h10v4a10 10 0 0 1-10 10" fill="none" stroke="#ffc145" strokeWidth="4" />
          <path d="M40 48v10M28 70h24l-3-12H31z" fill="#ff9a1f" stroke="#b85f00" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M33 22l4 4 8-8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    default:
      return <Cabra animo="bala" />
  }
}

function HojaReglas({ w, onCerrar }: { w: Palabras; onCerrar: () => void }) {
  const reglas: string[] = w.reglas
  return (
    <Hoja titulo={w.comoSeJuega} onCerrar={onCerrar} w={w} ancha>
      <h2>{w.comoSeJuega}</h2>
      <ol className="plc-pasos">
        {reglas.map((texto, i) => (
          <li key={i} className="plc-paso" style={{ '--plc-i': i } as CSSProperties}>
            <Dibujo paso={i} />
            <span>{texto}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="plc-boton plc-boton-oro" onClick={onCerrar} autoFocus>{w.entendido}</button>
    </Hoja>
  )
}

function HojaAmigo({ w, onCerrar, onJugarAqui }: { w: Palabras; onCerrar: () => void; onJugarAqui: () => void }) {
  return (
    <Hoja titulo={w.amigoTitulo} onCerrar={onCerrar} w={w}>
      <Cabra animo="feliz" />
      <h2>{w.amigoTitulo}</h2>
      <p>{conNegritas(w.amigoTexto)}</p>
      <div className="plc-fila">
        <button type="button" className="plc-boton plc-boton-oro" onClick={onJugarAqui} autoFocus>
          <Icono nombre="jugar" /> {w.jugarAqui}
        </button>
        <button type="button" className="plc-boton plc-boton-cristal" onClick={onCerrar}>{w.cerrar}</button>
      </div>
    </Hoja>
  )
}

/**
 * `salaAbierta`: la sala en línea funciona (un espacio propio en Kunobi). Si no, «Jugar con un
 * amigo» explica cómo hacer suyo el juego para invitar a alguien.
 */
export function Titulo({ w, idioma, salaAbierta, onJugar, onEnLinea }: {
  w: Palabras
  idioma: Idioma
  salaAbierta: boolean
  onJugar: () => void
  onEnLinea: () => void
}) {
  const [hoja, setHoja] = useState<'amigo' | 'reglas' | null>(null)
  const cerrar = () => setHoja(null)
  return (
    <div className="plc plc-titulo">
      <h1 className="plc-marca">{w.titulo}</h1>
      <p className="plc-gancho">{w.gancho}</p>
      <DemoEnVivo w={w} idioma={idioma} />
      <div className="plc-botones">
        <button type="button" className="plc-boton plc-boton-oro plc-boton-grande" onClick={onJugar}>
          <Icono nombre="jugar" /> {w.jugar}
        </button>
        <button type="button" className="plc-boton plc-boton-cristal plc-boton-grande" onClick={() => (salaAbierta ? onEnLinea() : setHoja('amigo'))}>
          <Icono nombre="amigos" /> {w.jugarAmigo}
        </button>
      </div>
      <button type="button" className="plc-enlace" onClick={() => setHoja('reglas')}>
        <Icono nombre="pregunta" /> {w.comoSeJuega}
      </button>
      {hoja === 'amigo' && <HojaAmigo w={w} onCerrar={cerrar} onJugarAqui={onJugar} />}
      {hoja === 'reglas' && <HojaReglas w={w} onCerrar={cerrar} />}
    </div>
  )
}
