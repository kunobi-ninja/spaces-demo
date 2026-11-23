// El aspecto de Pasalacabra: un escenario de noche con focos cálidos, cristal y bombillas.
// El juego pinta su propio fondo, así se ve igual con el tema claro y con el oscuro de Kunobi.
// Fredoka para los títulos, los relojes y los botones; Figtree para el texto.

const CSS = `
.plc-escenario {
  --plc-noche-1: #140a2b; --plc-noche-2: #2a1250; --plc-noche-3: #3b1a5e;
  --plc-oro: #ffc145; --plc-oro-2: #ff9a1f; --plc-oro-sombra: #b85f00;
  --plc-bien: #34d892; --plc-bien-2: #12a866; --plc-mal: #ff5d73; --plc-mal-2: #d42d4c;
  --plc-crema: #fff4e3; --plc-suave: rgba(255, 244, 227, 0.7); --plc-tenue: rgba(255, 244, 227, 0.45);
  --plc-cristal: rgba(255, 255, 255, 0.07); --plc-cristal-2: rgba(255, 255, 255, 0.12); --plc-borde: rgba(255, 255, 255, 0.16);
  --plc-j0: #ff9f43; --plc-j0-osc: #7a3510; --plc-j1: #39d7c6; --plc-j1-osc: #0e5a5a;
  --plc-display: 'Fredoka', 'Figtree', system-ui, sans-serif;
  --plc-texto: 'Figtree', system-ui, sans-serif;
  position: relative; isolation: isolate; overflow: clip; min-height: 100vh; min-height: 100dvh;
  color: var(--plc-crema); font-family: var(--plc-texto);
  background:
    radial-gradient(120% 60% at 50% 115%, rgba(255, 138, 61, 0.28), transparent 60%),
    radial-gradient(80% 55% at 50% -12%, rgba(140, 80, 230, 0.45), transparent 65%),
    linear-gradient(180deg, var(--plc-noche-1), var(--plc-noche-2) 55%, #1b0c36);
}
.plc-escenario *, .plc-escenario *::before, .plc-escenario *::after { box-sizing: border-box; }
.plc-estrellas { position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: 0.55;
  background-image:
    radial-gradient(1.2px 1.2px at 12% 18%, #fff, transparent), radial-gradient(1px 1px at 72% 12%, #fff, transparent),
    radial-gradient(1.4px 1.4px at 38% 32%, #ffe9b8, transparent), radial-gradient(1px 1px at 88% 40%, #fff, transparent),
    radial-gradient(1px 1px at 22% 62%, #fff, transparent), radial-gradient(1.3px 1.3px at 58% 8%, #ffe9b8, transparent);
  background-size: 420px 380px; }
.plc-foco { position: absolute; top: -10%; width: 46vw; height: 125%; z-index: -1; pointer-events: none;
  background: conic-gradient(from 160deg at 50% 0, transparent 0deg, rgba(255, 214, 140, 0.16) 13deg, rgba(255, 224, 160, 0.24) 20deg, rgba(255, 214, 140, 0.16) 27deg, transparent 40deg);
  -webkit-mask-image: linear-gradient(180deg, #000 30%, transparent 85%); mask-image: linear-gradient(180deg, #000 30%, transparent 85%);
  transform-origin: 50% 0; transform: rotate(var(--plc-giro)); will-change: transform; animation: plc-foco 11s ease-in-out infinite alternate; }
.plc-foco-i { left: -6vw; --plc-giro: -24deg; }
.plc-foco-d { right: -6vw; --plc-giro: 24deg; animation-delay: -5s; }
@keyframes plc-foco { from { transform: rotate(calc(var(--plc-giro) - 6deg)); } to { transform: rotate(calc(var(--plc-giro) + 6deg)); } }
.plc-suelo { position: absolute; left: 50%; bottom: -18vh; width: 130vw; height: 42vh; transform: translateX(-50%); z-index: -1; pointer-events: none;
  background: radial-gradient(closest-side, rgba(255, 170, 80, 0.35), rgba(120, 50, 160, 0.18) 60%, transparent); }

.plc { position: relative; max-width: 1180px; margin: 0 auto; padding: 16px 32px 48px; }
@media (max-width: 700px) { .plc { padding: 12px 16px 32px; } }
.plc h1, .plc h2, .plc h3 { font-family: var(--plc-display); font-weight: 700; letter-spacing: 0.005em; margin: 0; }
.plc h2 { font-size: 1.9rem; }
.plc-sub { color: var(--plc-suave); margin: 0.4em 0 1em; }
.plc-barra { display: flex; align-items: center; gap: 8px; min-height: 44px; }
.plc-barra-hueco { flex: 1; }

/* Botones */
:where(.plc) :is(button, input, select) { font: inherit; color: inherit; }
.plc button { cursor: pointer; }
.plc button:disabled { opacity: 0.45; cursor: default; }
.plc :is(button, input, select, summary):focus-visible { outline: 3px solid var(--plc-oro); outline-offset: 2px; }
.plc-boton { display: inline-flex; align-items: center; justify-content: center; gap: 10px; border: 0; border-radius: 999px;
  padding: 14px 26px; font-family: var(--plc-display); font-weight: 600; font-size: 1.1rem; line-height: 1.1;
  transition: transform 160ms cubic-bezier(.3,1.6,.5,1), box-shadow 160ms, background 160ms; }
.plc-boton .plc-icono { width: 1.25em; height: 1.25em; }
.plc-boton-oro { color: #3a1c00; background: linear-gradient(180deg, #ffd978, var(--plc-oro) 45%, var(--plc-oro-2));
  box-shadow: 0 6px 0 var(--plc-oro-sombra), 0 14px 34px rgba(255, 154, 31, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.7); }
.plc-boton-oro:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 8px 0 var(--plc-oro-sombra), 0 18px 40px rgba(255, 154, 31, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.7); }
.plc-boton-oro:not(:disabled):active { transform: translateY(4px); box-shadow: 0 2px 0 var(--plc-oro-sombra), 0 8px 20px rgba(255, 154, 31, 0.4); }
.plc-boton-cristal { color: var(--plc-crema); background: var(--plc-cristal-2); border: 1px solid var(--plc-borde);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12); }
.plc-boton-cristal:not(:disabled):hover { transform: translateY(-2px); background: rgba(255, 255, 255, 0.17); }
.plc-boton-cristal:not(:disabled):active { transform: translateY(2px); }
.plc-boton-peligro { color: #fff; background: linear-gradient(180deg, #ff7d8e, var(--plc-mal-2)); box-shadow: 0 5px 0 #8e1530, 0 12px 28px rgba(212, 45, 76, 0.4); }
.plc-boton-grande { font-size: 1.35rem; padding: 18px 40px; }
.plc-redondo { width: 44px; height: 44px; padding: 0; border-radius: 50%; }
.plc-redondo .plc-icono { width: 22px; height: 22px; }
.plc-enlace { background: none; border: 0; color: var(--plc-suave); font-weight: 600; display: inline-flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; }
.plc-enlace:hover { color: var(--plc-crema); }
.plc-enlace .plc-icono { width: 20px; height: 20px; }

/* Paneles */
.plc-panel { background: linear-gradient(180deg, rgba(62, 32, 104, 0.88), rgba(34, 16, 64, 0.88)); border: 1px solid var(--plc-borde);
  border-radius: 24px; padding: 22px 24px; box-shadow: 0 24px 60px rgba(8, 2, 24, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.10); }
.plc-fila { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.plc-centrada { justify-content: center; }
.plc-sala-estado { max-width: 720px; margin: 8px auto; text-align: center; color: var(--plc-suave); }

/* Campos y selectores */
.plc input, .plc select { background: rgba(10, 4, 26, 0.45); border: 1px solid var(--plc-borde); border-radius: 14px; padding: 12px 14px; color: var(--plc-crema); }
.plc input::placeholder { color: var(--plc-tenue); }
.plc select option { color: #1b0c36; }
.plc-segmento { display: flex; padding: 4px; gap: 4px; border-radius: 16px; background: rgba(10, 4, 26, 0.45); border: 1px solid var(--plc-borde); }
.plc .plc-segmento button { flex: 1; border: 0; border-radius: 12px; padding: 10px 6px; background: transparent; color: var(--plc-suave); font-family: var(--plc-display); font-weight: 600; font-size: 1rem; transition: background 160ms, color 160ms, transform 160ms; }
.plc .plc-segmento button:hover { color: var(--plc-crema); background: rgba(255, 255, 255, 0.06); }
.plc .plc-segmento button[aria-pressed="true"] { background: linear-gradient(180deg, #ffd978, var(--plc-oro)); color: #3a1c00; box-shadow: 0 3px 0 var(--plc-oro-sombra); }
.plc kbd { font-family: var(--plc-display); border: 1px solid var(--plc-borde); border-bottom-width: 3px; border-radius: 7px; padding: 0 6px; font-size: 0.85em; color: var(--plc-crema); }

/* Título */
.plc-titulo { display: grid; justify-items: center; text-align: center; gap: 18px; padding-top: 2vh; }
.plc-marca { font-size: clamp(3.4rem, 10vw, 7.6rem); line-height: 0.95; letter-spacing: -0.01em;
  background: linear-gradient(180deg, #fffaf0 10%, #ffd36b 55%, #ff9a1f 95%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 4px 0 #8a3f00) drop-shadow(0 14px 30px rgba(255, 150, 40, 0.45)); animation: plc-entra 900ms cubic-bezier(.2,1.5,.4,1) both; }
.plc-gancho { margin: -4px 0 0; font-size: clamp(1.02rem, 2vw, 1.3rem); color: var(--plc-suave); max-width: 34ch; animation: plc-entra 900ms 120ms cubic-bezier(.2,1.5,.4,1) both; }
@keyframes plc-entra { from { opacity: 0; transform: translateY(18px) scale(0.92); } to { opacity: 1; transform: none; } }
.plc-tarima { position: relative; display: grid; grid-template-columns: minmax(0, 340px) 200px minmax(0, 340px); align-items: center; justify-content: center; gap: 8px; width: 100%; }
.plc-tarima .plc-cabra-caja { align-self: end; margin-bottom: 18px; }
.plc-botones { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; animation: plc-entra 900ms 260ms cubic-bezier(.2,1.5,.4,1) both; }
.plc-titulo-esquina { position: absolute; top: 12px; right: 16px; z-index: 2; }
@media (max-width: 700px) {
  .plc-tarima { grid-template-columns: 1fr 1fr; gap: 6px; padding-bottom: 56px; }
  .plc-tarima .plc-cabra-caja { position: absolute; left: 50%; bottom: -6px; width: 96px; transform: translateX(-50%); margin: 0; }
  .plc-botones { flex-direction: column; width: 100%; max-width: 360px; }
  .plc-botones .plc-boton { width: 100%; }
}

/* Pista */
.plc-pista-tarjeta { width: min(620px, 100%); display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; align-items: center; text-align: left; padding: 18px 22px; }
.plc-pista-tarjeta .plc-pista { min-height: 2.6em; }
.plc-demo { display: grid; justify-items: center; gap: 14px; width: 100%; }
.plc-pista-quien { text-transform: none; letter-spacing: 0; font-weight: 600; }
.plc-pista-0 .plc-pista-quien { color: var(--plc-j0); }
.plc-pista-1 .plc-pista-quien { color: var(--plc-j1); }
.plc-escribe-marca { width: 22px; height: 22px; margin-left: auto; }
.plc-escribe-bien .plc-escribe-marca { color: var(--plc-bien); }
.plc-escribe-mal .plc-escribe-marca { color: var(--plc-mal); }
.plc-escribe-texto { white-space: pre; overflow: hidden; text-overflow: ellipsis; }
.plc-inicio > .plc-cabra-caja { width: 110px; margin: 0 auto -6px; }
.plc-letra-grande { grid-row: span 2; display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%;
  font-family: var(--plc-display); font-weight: 700; font-size: 2rem; color: #3a1c00;
  background: radial-gradient(circle at 35% 30%, #fff1c2, var(--plc-oro) 55%, var(--plc-oro-2)); box-shadow: 0 0 0 4px rgba(255, 193, 69, 0.25), 0 0 34px rgba(255, 193, 69, 0.55); }
.plc-pista-tipo { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--plc-oro); font-weight: 700; }
.plc-pista { margin: 0; font-size: 1.22rem; font-weight: 600; line-height: 1.3; }
.plc-escribe { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; height: 52px; margin-top: 6px; padding-top: 10px;
  border-top: 1px dashed var(--plc-borde); font-family: var(--plc-display); font-size: 1.35rem; font-weight: 600; }
.plc-escribe-quien { flex: none; font-size: 0.8rem; font-weight: 600; padding: 4px 10px; border-radius: 999px; color: #1b0c36; }
.plc-pista-0 .plc-escribe-quien { background: var(--plc-j0); }
.plc-pista-1 .plc-escribe-quien { background: var(--plc-j1); }
.plc-cursor { width: 3px; height: 1.1em; border-radius: 2px; background: var(--plc-oro); animation: plc-parpadeo 0.9s steps(1) infinite; }
@keyframes plc-parpadeo { 50% { opacity: 0; } }
.plc-escribe-texto:empty ~ .plc-cursor, .plc-escribe:not(.plc-escribe-nada) .plc-cursor { display: none; }
.plc-pensando { display: inline-flex; gap: 5px; }
.plc-pensando i { width: 7px; height: 7px; border-radius: 50%; background: var(--plc-suave); animation: plc-puntos 1s ease-in-out infinite; }
.plc-pensando i:nth-child(2) { animation-delay: 0.15s; } .plc-pensando i:nth-child(3) { animation-delay: 0.3s; }
@keyframes plc-puntos { 50% { transform: translateY(-5px); opacity: 0.4; } }
.plc-escribe-texto:not(:empty) ~ .plc-pensando, .plc-escribe:not(.plc-escribe-nada) .plc-pensando { display: none; }
.plc-escribe-bien .plc-escribe-texto { color: var(--plc-bien); }
.plc-escribe-mal .plc-escribe-texto { color: var(--plc-mal); text-decoration: line-through; text-decoration-thickness: 2px; }
.plc-escribe-pasa-texto { color: #ff8fc8; }

/* Ruedas */
.plc-ruedas { display: grid; grid-template-columns: minmax(0, 360px) 150px minmax(0, 360px); justify-content: center; align-items: center; gap: 8px; margin: 4px 0 14px; }
.plc-ruedas .plc-cabra-caja { align-self: end; }
@media (max-width: 700px) {
  .plc-ruedas { grid-template-columns: 1fr 1fr; position: relative; padding-bottom: 40px; }
  .plc-ruedas .plc-cabra-caja { position: absolute; left: 50%; bottom: -10px; width: 84px; transform: translateX(-50%); }
}
.plc-rueda { display: block; width: 100%; height: auto; overflow: visible; opacity: 0.62; transform: scale(0.94); transition: opacity 350ms, transform 450ms cubic-bezier(.3,1.5,.5,1); }
.plc-rueda.plc-activa { opacity: 1; transform: none; }
.plc-rueda-entra { animation: plc-gira 1300ms cubic-bezier(.2,1.25,.35,1) backwards; }
.plc-rueda-1.plc-rueda-entra { animation-delay: 140ms; }
@keyframes plc-gira { from { opacity: 0; transform: rotate(-200deg) scale(0.4); } to { opacity: 1; } }
.plc-rueda-0 { --plc-jugador: var(--plc-j0); --plc-jugador-osc: var(--plc-j0-osc); }
.plc-rueda-1 { --plc-jugador: var(--plc-j1); --plc-jugador-osc: var(--plc-j1-osc); }
.plc-disco-1 { stop-color: #3a1d63; }
.plc-disco-2 { stop-color: #170a30; }
.plc-disco { stroke: var(--plc-jugador); stroke-opacity: 0.45; stroke-width: 2; }
.plc-brillo { stop-color: var(--plc-jugador); }
.plc-aro-luz { opacity: 0.25; transition: opacity 400ms; }
.plc-activa .plc-aro-luz { opacity: 1; }
.plc-anillo { fill: none; stroke: rgba(255, 255, 255, 0.06); stroke-width: 34; }
.plc-bombillas circle { fill: var(--plc-oro); opacity: 0.3; }
.plc-activa .plc-b-par { animation: plc-bombilla 1.4s steps(1) infinite; }
.plc-activa .plc-b-impar { animation: plc-bombilla 1.4s steps(1) -0.7s infinite; }
@keyframes plc-bombilla { 0% { opacity: 1; } 50% { opacity: 0.25; } }
.plc-ficha { fill: rgba(20, 8, 44, 0.9); stroke: var(--plc-jugador); stroke-width: 2; transition: fill 300ms, stroke 300ms; }
.plc-letra text { font-family: var(--plc-display); font-weight: 700; font-size: 15px; fill: var(--plc-crema); pointer-events: none; }
.plc-acierto .plc-ficha { fill: var(--plc-bien-2); stroke: var(--plc-bien); }
.plc-fallo .plc-ficha { fill: var(--plc-mal-2); stroke: var(--plc-mal); }
.plc-acierto .plc-ficha, .plc-fallo .plc-ficha { animation: plc-salta 500ms cubic-bezier(.3,1.8,.5,1); transform-box: fill-box; transform-origin: center; }
@keyframes plc-salta { 0% { transform: scale(0.6); } 100% { transform: scale(1); } }
.plc-actual .plc-ficha { fill: var(--plc-oro); stroke: #fff4c9; }
.plc-actual text { fill: #3a1c00; }
.plc-halo { fill: none; stroke: var(--plc-oro); stroke-width: 3; opacity: 0.7; transform-box: fill-box; transform-origin: center; animation: plc-halo 1.2s ease-out infinite; }
@keyframes plc-halo { from { transform: scale(0.75); opacity: 0.9; } to { transform: scale(1.25); opacity: 0; } }
.plc-nombre { font-family: var(--plc-display); font-size: 19px; font-weight: 600; fill: var(--plc-jugador); }
.plc-reloj { font-family: var(--plc-display); font-size: 50px; font-weight: 700; fill: var(--plc-crema); font-variant-numeric: tabular-nums; }
.plc-reloj.plc-poco { fill: var(--plc-mal); }
.plc-activa .plc-reloj.plc-poco { animation: plc-latido 1s ease-in-out infinite; }
@keyframes plc-latido { 50% { opacity: 0.35; } }
.plc-c-bien-f { fill: var(--plc-bien-2); }
.plc-c-mal-f { fill: var(--plc-mal-2); }
.plc-c-trazo { fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.plc-c-num { font-family: var(--plc-display); font-size: 17px; font-weight: 600; fill: var(--plc-crema); }

/* Cabra */
.plc-cabra-caja { position: relative; width: 100%; max-width: 200px; justify-self: center; }
.plc-tarima > .plc-cabra-caja::before, .plc-ruedas > .plc-cabra-caja::before { content: ''; position: absolute; left: 50%; bottom: -2%; width: 120%; height: 34%; transform: translateX(-50%); z-index: -1;
  background: radial-gradient(closest-side, rgba(255, 200, 110, 0.38), transparent); }
.plc-cabra { display: block; width: 100%; height: auto; overflow: visible; }
.plc-cabra-cuerpo { transform-box: fill-box; transform-origin: 50% 90%; }
.plc-cabra-atenta .plc-cabra-cuerpo { animation: plc-respira 3.2s ease-in-out infinite; }
.plc-cabra-feliz .plc-cabra-cuerpo { animation: plc-brinca 750ms cubic-bezier(.3,1.6,.5,1); }
.plc-cabra-triste .plc-cabra-cuerpo { animation: plc-niega 600ms ease-in-out; }
.plc-cabra-bala .plc-cabra-cuerpo { animation: plc-bala 900ms ease-in-out; }
.plc-cabra-bala .plc-boca-bala { transform-box: fill-box; transform-origin: center; animation: plc-boca 180ms ease-in-out 5 alternate; }
.plc-ojos { transform-box: fill-box; transform-origin: center; animation: plc-parpadea 4.5s infinite; }
.plc-oreja-i, .plc-oreja-d { transform-box: fill-box; }
.plc-oreja-i { transform-origin: 100% 50%; } .plc-oreja-d { transform-origin: 0 50%; }
.plc-cabra-feliz .plc-oreja-i { animation: plc-oreja-i 700ms ease-out; } .plc-cabra-feliz .plc-oreja-d { animation: plc-oreja-d 700ms ease-out; }
@keyframes plc-respira { 50% { transform: translateY(-3px) rotate(-1.5deg); } }
@keyframes plc-brinca { 0% { transform: translateY(0) scale(1, 1); } 25% { transform: translateY(4px) scale(1.06, 0.92); } 55% { transform: translateY(-22px) scale(0.96, 1.05); } 100% { transform: none; } }
@keyframes plc-niega { 20% { transform: rotate(-9deg); } 45% { transform: rotate(8deg); } 70% { transform: rotate(-5deg); } 100% { transform: none; } }
@keyframes plc-bala { 30% { transform: rotate(-7deg) translateY(-6px); } 70% { transform: rotate(-4deg) translateY(-4px); } }
@keyframes plc-boca { to { transform: scale(1.25, 1.5); } }
@keyframes plc-parpadea { 0%, 92%, 100% { transform: none; } 95% { transform: scaleY(0.1); } }
@keyframes plc-oreja-i { 40% { transform: rotate(18deg); } } @keyframes plc-oreja-d { 40% { transform: rotate(-18deg); } }
.plc-bocadillo { position: absolute; left: 50%; bottom: 96%; z-index: 2; white-space: nowrap; transform: translateX(-50%);
  font-family: var(--plc-display); font-weight: 700; font-size: 1.1rem; color: #3a1c00; padding: 10px 16px; border-radius: 18px;
  background: linear-gradient(180deg, #fffaf0, #ffe6b0); box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35); animation: plc-globo 1.6s cubic-bezier(.3,1.6,.5,1) both; }
.plc-bocadillo::after { content: ''; position: absolute; left: 50%; top: 100%; border: 9px solid transparent; border-top-color: #ffe6b0; transform: translateX(-50%); }
@keyframes plc-globo { 0% { opacity: 0; transform: translateX(-50%) scale(0.4); } 15% { opacity: 1; transform: translateX(-50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translateX(-50%) translateY(-6px); } }
@media (max-width: 700px) { .plc-bocadillo { font-size: 0.9rem; padding: 7px 11px; } }

/* Hojas (avisos sobre el escenario) */
.plc-velo { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 16px; background: rgba(8, 2, 20, 0.74); animation: plc-aparece 220ms ease-out both; }
@keyframes plc-aparece { from { opacity: 0; } }
.plc-hoja { position: relative; width: min(520px, 100%); max-height: calc(100dvh - 32px); overflow: auto; text-align: center; color: var(--plc-crema);
  background: linear-gradient(180deg, #34175c, #1d0d3a); border: 1px solid var(--plc-borde); border-radius: 28px; padding: 28px 24px 24px;
  box-shadow: 0 40px 90px rgba(0, 0, 0, 0.55); animation: plc-entra 420ms cubic-bezier(.2,1.4,.4,1) both; font-family: var(--plc-texto); }
.plc-hoja h2 { font-family: var(--plc-display); font-size: 1.7rem; margin: 6px 0 10px; }
.plc-hoja p { color: var(--plc-suave); line-height: 1.5; margin: 0 0 20px; font-size: 1.05rem; }
.plc-hoja p strong { color: var(--plc-crema); }
.plc-hoja .plc-cabra-caja { width: 110px; margin: -6px auto 0; }
.plc-hoja-cerrar { position: absolute; top: 12px; right: 12px; }
.plc-hoja .plc-fila { justify-content: center; }
.plc-hoja-ancha { width: min(860px, 100%); }
.plc-pasos { list-style: none; padding: 0; margin: 4px 0 22px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; text-align: left; counter-reset: paso; }
.plc-paso { position: relative; display: grid; align-content: start; gap: 10px; padding: 16px 14px 14px; border-radius: 20px; background: var(--plc-cristal); border: 1px solid var(--plc-borde);
  animation: plc-entra 520ms cubic-bezier(.2,1.4,.4,1) both; animation-delay: calc(var(--plc-i) * 80ms); }
.plc-paso::before { counter-increment: paso; content: counter(paso); position: absolute; top: 10px; left: 12px; font-family: var(--plc-display); font-weight: 700; color: var(--plc-tenue); }
.plc-paso svg { width: 76px; height: 76px; justify-self: center; overflow: visible; }
.plc-paso .plc-cabra-caja { width: 76px; height: 76px; justify-self: center; }
.plc-paso .plc-cabra-caja svg { width: 100%; height: 100%; }
.plc-paso span { font-size: 0.95rem; line-height: 1.4; }
@media (max-width: 560px) { .plc-pasos { grid-template-columns: 1fr; } .plc-paso { grid-template-columns: 64px 1fr; align-items: center; } .plc-paso svg { width: 60px; height: 60px; } .plc-paso::before { display: none; } }

/* Ajustes */
.plc-inicio { width: min(560px, 100%); margin: 6px auto; display: grid; gap: 16px; padding: 24px; }
.plc-inicio h2 { text-align: center; font-size: 1.8rem; }
.plc-nombres { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; }
.plc-nombres input { min-width: 0; width: 100%; font-family: var(--plc-display); font-weight: 600; font-size: 1.1rem; }
.plc-nombres input:nth-child(1) { border-color: var(--plc-j0); box-shadow: inset 0 -3px 0 var(--plc-j0); }
.plc-nombres input:nth-child(3) { border-color: var(--plc-j1); box-shadow: inset 0 -3px 0 var(--plc-j1); }
.plc-contra { font-family: var(--plc-display); font-weight: 700; color: var(--plc-oro); }
.plc-opcion { display: grid; gap: 6px; }
.plc-opcion-nombre { font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--plc-tenue); }
.plc-inicio .plc-boton-oro { width: 100%; margin-top: 4px; }
.plc-ayuda { color: var(--plc-tenue); font-size: 0.85rem; margin: 0; text-align: center; }
@media (max-width: 420px) { .plc .plc-segmento button { font-size: 0.92rem; padding: 9px 2px; } }

/* Juego */
.plc-pregunta { max-width: 720px; margin: 0 auto; }
.plc-cabecera { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; }
.plc-turno { min-width: 0; }
.plc-turno { color: var(--plc-suave); }
.plc-turno strong { color: var(--plc-crema); font-family: var(--plc-display); font-weight: 600; }
.plc-controles { display: flex; gap: 8px; }
.plc-pregunta-cuerpo { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; align-items: center; margin: 12px 0 14px; }
.plc-respuesta { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
.plc-respuesta input { min-width: 0; width: 100%; font-size: 1.15rem; padding: 14px 16px; }
.plc-respuesta .plc-pasa { grid-column: 1 / -1; }
.plc-pasa { color: #2a0c2a; background: linear-gradient(180deg, #ffd0ec, #ff8fc8); box-shadow: 0 5px 0 #a0346f, 0 12px 28px rgba(255, 120, 190, 0.35); }
.plc-pasa .plc-cabra-mini { width: 30px; height: 30px; margin: -6px 0; }
.plc-aviso { margin-top: 12px; font-weight: 600; min-height: 1.5em; }
.plc-aviso-bien { color: var(--plc-bien); }
.plc-aviso-mal { color: var(--plc-mal); }
.plc-aviso-info { color: var(--plc-suave); }
.plc-pausa { text-align: center; }
.plc-pausa h3 { font-size: 1.6rem; margin-bottom: 4px; }
@media (max-width: 700px) { .plc-pregunta { padding: 16px; } .plc-pista { font-size: 1.08rem; } .plc-letra-grande { width: 52px; height: 52px; font-size: 1.6rem; } }

/* Final */
.plc-veredicto { position: relative; overflow: hidden; max-width: 560px; margin: 0 auto 8px; text-align: center; display: grid; justify-items: center; gap: 4px; }
.plc-veredicto .plc-cabra-caja { width: 150px; }
.plc-veredicto h2 { font-size: clamp(2rem, 5vw, 2.8rem); background: linear-gradient(180deg, #fffaf0, #ffd36b 60%, #ff9a1f); -webkit-background-clip: text; background-clip: text; color: transparent; }
.plc-confeti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.plc-confeti i { position: absolute; top: -12px; width: 8px; height: 14px; border-radius: 2px; animation: plc-cae 2.8s linear both; }
@keyframes plc-cae { to { transform: translateY(560px) rotate(540deg); opacity: 0; } }
.plc-final .plc-rueda { opacity: 0.85; }
.plc-final .plc-rueda.plc-activa { opacity: 1; }
.plc-repaso { display: grid; gap: 12px; max-width: 860px; margin: 0 auto; }
.plc-repaso summary { cursor: pointer; font-family: var(--plc-display); font-weight: 600; font-size: 1.1rem; }
.plc-repaso table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.92rem; }
.plc-repaso td { padding: 7px 8px; border-top: 1px solid var(--plc-borde); vertical-align: top; }
.plc-t-letra { font-family: var(--plc-display); font-weight: 700; width: 2rem; color: var(--plc-oro); }
.plc-fila-acierto td:nth-child(3) { color: var(--plc-bien); }
.plc-fila-fallo td:nth-child(3) { color: var(--plc-mal); }
.plc-repaso .plc-icono { width: 1em; height: 1em; vertical-align: -0.15em; }

@media (prefers-reduced-motion: reduce) {
  .plc-escenario *, .plc-escenario *::before, .plc-escenario *::after { animation: none !important; transition: none !important; }
}
`

export function Estilos() {
  return <style>{CSS}</style>
}

/** El fondo del escenario: estrellas, dos focos y el brillo del suelo. */
export function Fondo() {
  return (
    <>
      <div className="plc-estrellas" aria-hidden="true" />
      <div className="plc-foco plc-foco-i" aria-hidden="true" />
      <div className="plc-foco plc-foco-d" aria-hidden="true" />
      <div className="plc-suelo" aria-hidden="true" />
    </>
  )
}
