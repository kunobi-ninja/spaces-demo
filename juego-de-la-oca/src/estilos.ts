// La identidad del juego: madera oscura, papel crema y oro, con Fraunces para los títulos y
// Figtree para el texto. El juego pinta su propio fondo, así que se ve igual con el tema claro u
// oscuro de Kunobi. Los colores de cada ficha están en data/fichas.json.
export const ESTILOS = `
  .oca {
    --madera: #1c110a; --madera-2: #2c1a0f; --madera-3: #3d2616;
    --crema: #f8ecd3; --crema-2: #e7d3aa; --suave: rgba(248, 236, 211, .7);
    --oro: #f4bd52; --oro-2: #df8f22; --oro-claro: #ffe3a1;
    --tinta: #3b2414; --terracota: #c45a3c; --verde: #2f5a45;
    --titulo: 'Fraunces', Georgia, 'Times New Roman', serif;
    --texto: 'Figtree', system-ui, -apple-system, sans-serif;
    --muelle: cubic-bezier(.2, .9, .25, 1.15);
    position: relative; height: 100vh; height: 100dvh; min-height: 560px; overflow: hidden;
    background: var(--madera); color: var(--crema); font: 16px/1.45 var(--texto);
    isolation: isolate; -webkit-font-smoothing: antialiased;
  }
  .oca *, .oca *::before, .oca *::after { box-sizing: border-box; }
  .oca h1, .oca h2, .oca h3, .oca p, .oca ol, .oca ul { margin: 0; }
  .oca button { font-family: inherit; }
  .oca-lienzo { position: absolute; inset: 0; z-index: 0; }
  .oca-lienzo canvas { display: block; width: 100%; height: 100%; }
  .oca-luz {
    position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background:
      radial-gradient(120% 90% at 62% 45%, transparent 45%, rgba(10, 5, 2, .55) 100%),
      linear-gradient(180deg, rgba(255, 196, 120, .07), transparent 30%);
    transition: background .6s ease;
  }
  .oca[data-pantalla="portada"] .oca-luz, .oca[data-pantalla="ajustes"] .oca-luz {
    background:
      linear-gradient(90deg, rgba(18, 9, 4, .92) 0%, rgba(18, 9, 4, .7) 30%, rgba(18, 9, 4, 0) 58%),
      radial-gradient(120% 90% at 62% 45%, transparent 45%, rgba(10, 5, 2, .6) 100%);
  }

  /* —— bocadillo que sigue a la ficha —— */
  .oca-burbuja {
    position: absolute; left: 0; top: 0; z-index: 2; pointer-events: none;
    max-width: 260px; padding: 9px 14px; margin: 0;
    background: var(--crema); color: var(--tinta); border-radius: 16px;
    font: 700 15px/1.25 var(--titulo); text-align: center; white-space: normal;
    box-shadow: 0 10px 30px rgba(0, 0, 0, .35), inset 0 -2px 0 rgba(59, 36, 20, .12);
    translate: -50% calc(-100% - 12px);
    opacity: 0; scale: .7; transition: opacity .18s ease, scale .35s var(--muelle);
  }
  .oca-burbuja::after {
    content: ''; position: absolute; left: 50%; bottom: -7px; width: 14px; height: 14px;
    background: var(--crema); transform: translateX(-50%) rotate(45deg); border-radius: 3px;
  }
  .oca-burbuja[data-visible="true"] { opacity: 1; scale: 1; }

  /* —— botones —— */
  .oca-boton {
    display: inline-flex; align-items: center; justify-content: center; gap: 10px;
    min-height: 46px; padding: 10px 20px; border-radius: 999px; border: 0; cursor: pointer;
    font: 700 16px/1 var(--texto); letter-spacing: .01em;
    transition: transform .25s var(--muelle), box-shadow .25s ease, background .2s ease, opacity .2s;
  }
  .oca-boton:hover:not(:disabled) { transform: translateY(-2px); }
  .oca-boton:active:not(:disabled) { transform: translateY(1px) scale(.97); transition-duration: .08s; }
  .oca-boton:disabled { cursor: default; opacity: .5; }
  .oca-boton:focus-visible, .oca-icono:focus-visible, .oca-enlace:focus-visible, .oca summary:focus-visible,
  .oca input:focus-visible + span {
    outline: 3px solid var(--oro-claro); outline-offset: 3px;
  }
  .oca-primario {
    color: #3a1f08 !important;
    background: linear-gradient(180deg, var(--oro-claro) 0%, var(--oro) 38%, var(--oro-2) 100%);
    box-shadow: 0 1px 0 rgba(255, 255, 255, .6) inset, 0 -3px 0 rgba(120, 60, 0, .35) inset,
      0 10px 24px rgba(223, 143, 34, .35), 0 2px 0 #8a4f12;
  }
  .oca-primario:hover:not(:disabled) {
    box-shadow: 0 1px 0 rgba(255, 255, 255, .6) inset, 0 -3px 0 rgba(120, 60, 0, .35) inset,
      0 16px 34px rgba(223, 143, 34, .5), 0 2px 0 #8a4f12;
  }
  .oca-secundario {
    background: rgba(248, 236, 211, .1); color: var(--crema);
    box-shadow: inset 0 0 0 1.5px rgba(248, 236, 211, .45);
    backdrop-filter: blur(8px);
  }
  .oca-secundario:hover:not(:disabled) { background: rgba(248, 236, 211, .18); }
  .oca-fantasma { background: transparent; color: var(--suave); box-shadow: inset 0 0 0 1px rgba(248, 236, 211, .18); min-height: 40px; padding: 8px 16px; font-size: 14px; }
  .oca-fantasma:hover:not(:disabled) { color: var(--crema); background: rgba(248, 236, 211, .08); }
  .oca-latido { position: relative; }
  .oca-latido::after {
    content: ''; position: absolute; inset: -4px; border-radius: inherit; pointer-events: none;
    box-shadow: 0 0 0 3px var(--oro-claro); opacity: 0; animation: oca-latido 1.8s ease-out infinite;
  }
  @keyframes oca-latido { 0% { opacity: .8; transform: scale(.98); } 70%, 100% { opacity: 0; transform: scale(1.08); } }
  .oca-throw .oca-boton:disabled { opacity: .38; filter: saturate(.4); }
  .oca-grande { min-height: 60px; padding: 14px 30px; font-size: 19px; }
  .oca-ancho { width: 100%; }
  .oca-enlace {
    display: inline-flex; align-items: center; gap: 9px; border: 0; background: none; cursor: pointer;
    color: var(--suave); font: 600 15px var(--texto); padding: 8px 2px; border-radius: 8px;
  }
  .oca-enlace:hover { color: var(--crema); }
  .oca-enlace > span {
    display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%;
    border: 1.5px solid currentColor; font: 800 13px var(--titulo);
  }
  .oca-icono {
    display: grid; place-items: center; width: 38px; height: 38px; flex: none; border-radius: 50%;
    border: 0; cursor: pointer; background: rgba(248, 236, 211, .08); color: var(--crema);
    font: 700 18px/1 var(--titulo); transition: background .2s, transform .25s var(--muelle);
  }
  .oca-icono:hover { background: rgba(248, 236, 211, .18); transform: scale(1.06); }
  .oca-dado-icono { width: 22px; height: 22px; }
  .oca-dado-icono rect { fill: #fff8e8; stroke: #3a1f08; stroke-width: 1.6; }
  .oca-dado-icono circle { fill: #3a1f08; }

  /* —— entradas —— */
  @keyframes oca-entra { from { opacity: 0; transform: translateY(18px) scale(.98); } }
  .oca-entra { animation: oca-entra .8s var(--muelle) both; }
  .oca-portada-texto > :nth-child(2) { animation-delay: .08s; }
  .oca-portada-texto > :nth-child(3) { animation-delay: .18s; }
  .oca-portada-botones { animation-delay: .28s; }

  /* —— portada —— */
  .oca-portada {
    position: absolute; inset: 0; z-index: 3; pointer-events: none;
    display: flex; flex-direction: column; justify-content: center; gap: 34px;
    padding: 6vh clamp(24px, 6vw, 96px);
  }
  .oca-portada > * { pointer-events: auto; }
  .oca-portada-texto { max-width: 760px; }
  .oca-portada h1 span { white-space: nowrap; }
  .oca-kicker {
    color: var(--oro); font: 700 13px/1 var(--texto); letter-spacing: .22em; text-transform: uppercase;
    margin-bottom: 18px !important;
  }
  .oca-portada h1 {
    font-family: var(--titulo); font-weight: 800; color: var(--crema);
    font-size: clamp(54px, 7.6vw, 118px); line-height: .9; letter-spacing: -.035em;
    text-shadow: 0 4px 30px rgba(0, 0, 0, .45);
    font-variation-settings: 'SOFT' 100, 'WONK' 1;
  }
  .oca-portada h1 span { display: block; }
  .oca-portada h1 em {
    display: block; font-style: italic; font-weight: 800; font-size: 1.32em; line-height: .95;
    background: linear-gradient(180deg, var(--oro-claro) 10%, var(--oro) 55%, var(--oro-2));
    -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 4px 18px rgba(223, 143, 34, .35));
    padding-right: .1em;
  }
  .oca-gancho { margin-top: 22px !important; max-width: 430px; color: var(--suave); font-size: clamp(17px, 1.5vw, 20px); line-height: 1.45; }
  .oca-portada-botones { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; max-width: 560px; }
  .oca-portada-botones .oca-enlace { flex-basis: 100%; }

  /* —— ajustes —— */
  .oca-ajustes {
    width: min(420px, 100%); padding: 26px; display: grid; gap: 18px;
    background: linear-gradient(180deg, rgba(61, 38, 22, .94), rgba(36, 21, 12, .96));
    border: 1px solid rgba(244, 189, 82, .2); border-radius: 28px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 255, 255, .06);
  }
  .oca-ajustes h2, .oca-ventana h2, .oca-sala h2 { font: 800 30px/1.05 var(--titulo); letter-spacing: -.02em; }
  .oca-cuantos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .oca-cuanto input, .oca-quien input { position: absolute; opacity: 0; pointer-events: none; }
  .oca-cuanto span {
    display: grid; place-items: center; height: 54px; border-radius: 16px; cursor: pointer;
    font: 800 24px var(--titulo); color: var(--suave);
    background: rgba(248, 236, 211, .06); box-shadow: inset 0 0 0 1.5px rgba(248, 236, 211, .14);
    transition: all .25s var(--muelle);
  }
  .oca-cuanto input:checked + span {
    color: #3a1f08; background: linear-gradient(180deg, var(--oro-claro), var(--oro));
    box-shadow: 0 6px 18px rgba(223, 143, 34, .35); transform: translateY(-2px);
  }
  .oca-asientos { list-style: none; padding: 0; display: grid; gap: 8px; }
  .oca-asientos li {
    display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px;
    padding: 8px 8px 8px 10px; border-radius: 16px; background: rgba(248, 236, 211, .05);
    animation: oca-entra .5s var(--muelle) both;
  }
  .oca-asientos li[data-libre] { opacity: .45; }
  .oca-quien { display: flex; padding: 3px; border-radius: 999px; background: rgba(0, 0, 0, .25); }
  .oca-quien span {
    display: block; padding: 7px 13px; border-radius: 999px; cursor: pointer; font-weight: 700; font-size: 14px;
    color: var(--suave); transition: all .2s var(--muelle);
  }
  .oca-quien input:checked + span { background: var(--crema); color: var(--tinta); }
  .oca-ajustes .oca-enlace { justify-self: center; }

  /* —— fichas en la interfaz —— */
  .oca-token {
    display: inline-grid; place-items: center; width: 28px; height: 28px; flex: none; border-radius: 50%;
    background: radial-gradient(circle at 34% 28%, rgba(255, 255, 255, .7), rgba(255, 255, 255, 0) 42%), var(--piece);
    color: var(--piece-ink, #fff); font: 800 11px/1 var(--texto);
    box-shadow: inset 0 -3px 5px rgba(0, 0, 0, .3), 0 3px 8px rgba(0, 0, 0, .35);
  }
  .oca-token-grande { width: 46px; height: 46px; font-size: 17px; }

  /* —— panel de la partida —— */
  .oca-panel {
    position: absolute; z-index: 3; top: 20px; right: 20px; max-height: calc(100% - 40px); width: min(400px, 40vw);
    display: flex; flex-direction: column; gap: 14px; padding: 16px 18px 18px; overflow-y: auto;
    background: linear-gradient(180deg, rgba(61, 38, 22, .9), rgba(32, 19, 11, .94));
    border: 1px solid rgba(244, 189, 82, .18); border-radius: 26px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 255, 255, .06);
    backdrop-filter: blur(12px); scrollbar-width: thin;
  }
  .oca-panel-cabeza { display: flex; align-items: center; gap: 10px; }
  .oca-panel-cabeza strong { flex: 1; font: 800 19px/1 var(--titulo); letter-spacing: -.01em; }
  .oca-marca { width: 40px; height: 40px; border-radius: 12px; background: var(--crema); display: grid; place-items: center; overflow: hidden; }
  .oca-marca img { width: 36px; height: 36px; }
  .oca-turno { display: grid; gap: 14px; padding: 16px; border-radius: 20px; background: rgba(0, 0, 0, .2); }
  .oca-turno-cabeza { display: flex; align-items: center; gap: 12px; }
  .oca-turno h2 { font: 800 25px/1.1 var(--titulo); letter-spacing: -.015em; }
  .oca-throw { display: grid; grid-template-columns: 60px 1fr; gap: 12px; align-items: center; }
  .oca-throw .oca-boton { min-height: 60px; font-size: 19px; }
  .oca-die {
    width: 60px; height: 60px; padding: 10px; display: grid; place-items: center;
    grid-template: repeat(3, 1fr) / repeat(3, 1fr); border-radius: 15px;
    background: radial-gradient(circle at 35% 30%, #fffdf6, #eadfc6);
    box-shadow: inset 0 -4px 0 rgba(59, 36, 20, .18), 0 6px 16px rgba(0, 0, 0, .35);
    color: var(--tinta); font: 800 22px var(--titulo);
  }
  .oca-die span { width: 9px; height: 9px; border-radius: 50%; background: #2d1c10; }
  .oca-die b { grid-area: 2 / 2; }
  .oca-rolling { animation: oca-agita .5s ease-in-out infinite; }
  @keyframes oca-agita { 30% { transform: rotate(-12deg) scale(1.04); } 70% { transform: rotate(10deg); } }
  .oca-message { color: var(--suave); min-height: 2.9em; font-size: 15px; overflow-wrap: anywhere; }
  .oca-aviso { color: var(--oro-claro); font-size: 14px; overflow-wrap: anywhere; }
  .oca-error { color: #ffb4a0; font-size: 14px; }
  .oca-roster { list-style: none; padding: 0; display: grid; gap: 4px; }
  .oca-roster li {
    display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
    min-height: 40px; padding: 5px 10px 5px 6px; border-radius: 14px; transition: background .3s;
  }
  .oca-roster [aria-current="true"] { background: rgba(244, 189, 82, .14); box-shadow: inset 0 0 0 1px rgba(244, 189, 82, .3); }
  .oca-name { min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
  .oca-location { color: var(--suave); font-size: 13px; text-align: right; font-variant-numeric: tabular-nums; }
  .oca-botones { display: flex; flex-wrap: wrap; gap: 8px; }
  .oca-confirmar { display: grid; gap: 10px; width: 100%; }
  .oca-confirmar p { font-weight: 600; }
  .oca-sala { display: grid; gap: 14px; padding: 18px; border-radius: 20px; background: rgba(0, 0, 0, .2); }
  .oca-sala .oca-kicker { margin-bottom: 0 !important; }

  .oca-history { border-radius: 18px; background: rgba(0, 0, 0, .14); }
  .oca-history summary {
    display: flex; justify-content: space-between; gap: 10px; padding: 13px 16px; cursor: pointer;
    font: 700 16px var(--titulo); list-style: none; border-radius: 18px;
  }
  .oca-history summary::-webkit-details-marker { display: none; }
  .oca-history summary::after { content: '▾'; color: var(--suave); transition: transform .25s; }
  .oca-history[open] summary::after { transform: rotate(180deg); }
  .oca-history-count { margin-left: auto; color: var(--suave); font: 500 13px var(--texto); align-self: center; }
  .oca-history-empty { color: var(--suave); padding: 0 16px 14px; }
  .oca-history-list { max-height: 15rem; overflow-y: auto; margin: 0; padding: 0 12px 10px 40px; font-size: 13px; }
  .oca-history-list li { border-top: 1px solid rgba(248, 236, 211, .1); padding: 8px 0; }
  .oca-history-list li::marker { color: var(--suave); font-weight: 700; }
  .oca-history-entry { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; }
  .oca-history-player { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; }
  .oca-history-player .oca-token { width: 18px; height: 18px; font-size: 8px; }
  .oca-history-rule { color: var(--suave); margin-top: 3px !important; }

  /* —— ventanas —— */
  .oca-velo {
    position: absolute; inset: 0; z-index: 10; display: grid; place-items: center; padding: 20px;
    background: rgba(12, 6, 2, .55); backdrop-filter: blur(4px); animation: oca-funde .3s ease both;
  }
  @keyframes oca-funde { from { opacity: 0; } }
  .oca-ventana {
    position: relative; width: min(560px, 100%); max-height: calc(100% - 20px); overflow-y: auto;
    padding: 30px; display: grid; gap: 16px;
    background: linear-gradient(180deg, #fbf1dc, #f1e1bf); color: var(--tinta);
    border-radius: 28px; box-shadow: 0 40px 100px rgba(0, 0, 0, .6), inset 0 0 0 1px rgba(255, 255, 255, .6);
    animation: oca-entra .5s var(--muelle) both;
  }
  .oca-ventana .oca-icono { background: rgba(59, 36, 20, .08); color: var(--tinta); }
  .oca-ventana .oca-icono:hover { background: rgba(59, 36, 20, .16); }
  .oca-ventana .oca-secundario { color: var(--tinta); box-shadow: inset 0 0 0 1.5px rgba(59, 36, 20, .35); background: transparent; }
  .oca-cerrar { position: absolute; top: 14px; right: 14px; font-size: 24px !important; }
  .oca-pasos { list-style: none; padding: 0; display: grid; gap: 10px; }
  .oca-pasos li { display: flex; gap: 12px; align-items: flex-start; }
  .oca-pasos li > span {
    flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%;
    background: var(--tinta); color: var(--crema); font: 800 15px var(--titulo);
  }
  .oca-pasos p { padding-top: 4px; }
  .oca-ayuda h3 { font: 800 19px var(--titulo); margin-top: 6px; }
  .oca-casillas { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
  .oca-casillas li {
    display: grid; grid-template-columns: 64px 1fr; gap: 12px; align-items: center;
    padding: 10px; border-radius: 18px; background: rgba(255, 255, 255, .55); box-shadow: inset 0 0 0 1px rgba(59, 36, 20, .08);
  }
  .oca-casillas img { width: 64px; height: 64px; }
  .oca-casillas strong { font: 800 17px var(--titulo); }
  .oca-casillas p { font-size: 14px; line-height: 1.35; color: #5a4030; }
  .oca-nota { font-size: 14px; color: #5a4030; }
  .oca-amigo { width: min(440px, 100%); text-align: center; justify-items: center; }
  .oca-amigo p { font-size: 17px; line-height: 1.5; color: #4b3222; }
  .oca-amigo strong { color: var(--tinta); white-space: nowrap; }
  .oca-amigo-arte { display: flex; margin-bottom: -6px; }
  .oca-amigo-arte img { width: 92px; height: 92px; }
  .oca-amigo-arte img:last-child { transform: scaleX(-1); margin-left: -14px; }

  .oca-velo-victoria { background: radial-gradient(circle at 50% 45%, rgba(244, 189, 82, .25), rgba(12, 6, 2, .65) 70%); overflow: hidden; }
  .oca-victoria { width: min(420px, 100%); text-align: center; justify-items: center; padding-top: 34px; }
  .oca-victoria .oca-token-grande { width: 84px; height: 84px; font-size: 30px; animation: oca-bota 1s var(--muelle) infinite alternate; }
  .oca-victoria h2 { font-size: 40px !important; }
  .oca-victoria .oca-botones { justify-content: center; }
  @keyframes oca-bota { to { transform: translateY(-10px) scale(1.05); } }
  .oca-confeti { position: absolute; inset: 0; pointer-events: none; }
  .oca-confeti i {
    position: absolute; top: -20px; width: 10px; height: 16px; border-radius: 3px;
    animation: oca-cae linear infinite both;
  }
  @keyframes oca-cae { to { transform: translateY(110vh) rotate(var(--giro)); } }

  .oca-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }

  /* —— móvil —— */
  @media (max-width: 719px) {
    .oca-portada { justify-content: space-between; padding: 26px 22px 24px; }
    .oca[data-pantalla="portada"] .oca-luz, .oca[data-pantalla="ajustes"] .oca-luz {
      background: linear-gradient(180deg, rgba(18, 9, 4, .95) 0%, rgba(18, 9, 4, .75) 30%, rgba(18, 9, 4, 0) 48%, rgba(18, 9, 4, 0) 62%, rgba(18, 9, 4, .9) 84%);
    }
    .oca-portada h1 { font-size: clamp(46px, 14vw, 64px); }
    .oca-gancho { margin-top: 14px !important; font-size: 16px; }
    .oca-kicker { margin-bottom: 12px !important; }
    .oca-portada-botones { flex-direction: column; align-items: stretch; gap: 10px; }
    .oca-portada-botones .oca-enlace { justify-content: center; flex-basis: auto; }
    .oca[data-pantalla="ajustes"] .oca-portada { justify-content: flex-end; }
    .oca-ajustes { padding: 20px; border-radius: 24px; }
    .oca-panel { top: auto; left: 10px; right: 10px; bottom: 10px; width: auto; max-height: 50%; padding: 12px 14px 14px; border-radius: 22px; }
    .oca-turno { padding: 12px; gap: 10px; }
    .oca-turno h2 { font-size: 21px; }
    .oca-velo { align-items: end; padding: 10px; }
    .oca-ventana { padding: 24px 20px; border-radius: 24px; }
    .oca-burbuja { max-width: 200px; font-size: 13px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .oca *, .oca *::before, .oca *::after { animation: none !important; transition: none !important; }
    .oca-confeti { display: none; }
  }
`
