/*
 * La identidad de Kunobitos, la misma en todas las pantallas: noche azul
 * marino, oro de la cinta y turquesa de Kunobi; títulos en píxeles
 * (Press Start 2P) y texto redondo (Fredoka). El juego pinta su propio fondo,
 * así que se ve igual con el tema claro y el oscuro.
 */

export const ESTILO_BASE = `
  .kb {
    --kb-noche: #0b1230; --kb-noche2: #16244f; --kb-noche3: #22336b;
    --kb-tinta: #f4f1e6; --kb-suave: #aab6d6; --kb-tenue: #6f7ca3;
    --kb-oro: #ffd75e; --kb-oro2: #f2b33c; --kb-oro3: #b9791c;
    --kb-turq: #3fb6c8; --kb-turq2: #7fd3ea; --kb-rojo: #ff7a6a;
    --kb-panel: rgba(14, 22, 54, 0.78); --kb-borde: rgba(127, 211, 234, 0.22);
    --kb-pixel: 'Press Start 2P', ui-monospace, monospace;
    --kb-texto: 'Fredoka', ui-rounded, system-ui, sans-serif;
    position: relative; isolation: isolate; min-height: 100vh; box-sizing: border-box;
    font-family: var(--kb-texto); color: var(--kb-tinta);
    background:
      radial-gradient(120% 80% at 50% -10%, #22336b 0%, rgba(34, 51, 107, 0) 60%),
      radial-gradient(80% 60% at 100% 100%, rgba(63, 182, 200, 0.12), rgba(63, 182, 200, 0) 70%),
      linear-gradient(180deg, #0f1940 0%, #0b1230 55%, #080d24 100%);
    -webkit-font-smoothing: antialiased;
  }
  .kb *, .kb *::before, .kb *::after { box-sizing: border-box; }
  .kb button { font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .kb button:disabled { cursor: default; }
  .kb :focus-visible { outline: 3px solid var(--kb-turq2); outline-offset: 2px; }

  .kb-pixel { font-family: var(--kb-pixel); letter-spacing: 0.02em; line-height: 1.25; }

  /* Botones: piezas gruesas con canto, que se hunden al pulsar. */
  .kb .kb-btn {
    position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 10px;
    border: 0; border-radius: 14px; padding: 14px 26px; font-weight: 600; font-size: 1.1rem; line-height: 1.1;
    color: #2a1606; background: linear-gradient(180deg, #ffe58f 0%, var(--kb-oro) 45%, var(--kb-oro2) 100%);
    box-shadow: 0 5px 0 var(--kb-oro3), 0 12px 26px rgba(0, 0, 0, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.55);
    transition: transform 0.12s cubic-bezier(.3,1.6,.5,1), box-shadow 0.12s, filter 0.15s;
  }
  .kb .kb-btn:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.05); box-shadow: 0 7px 0 var(--kb-oro3), 0 16px 30px rgba(0, 0, 0, 0.45), inset 0 2px 0 rgba(255, 255, 255, 0.55); }
  .kb .kb-btn:active:not(:disabled) { transform: translateY(4px); box-shadow: 0 1px 0 var(--kb-oro3), 0 4px 10px rgba(0, 0, 0, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.4); }
  .kb .kb-btn small { display: block; font-size: 0.72rem; font-weight: 500; opacity: 0.75; margin-top: 3px; }
  .kb .kb-btn-2 {
    color: var(--kb-tinta); background: linear-gradient(180deg, rgba(41, 60, 120, 0.92), rgba(22, 36, 79, 0.92));
    box-shadow: 0 5px 0 #0a1029, 0 12px 26px rgba(0, 0, 0, 0.35), inset 0 0 0 2px rgba(127, 211, 234, 0.35), inset 0 2px 0 rgba(255, 255, 255, 0.12);
  }
  .kb .kb-btn-2:hover:not(:disabled) { box-shadow: 0 7px 0 #0a1029, 0 16px 30px rgba(0, 0, 0, 0.4), inset 0 0 0 2px rgba(127, 211, 234, 0.6), inset 0 2px 0 rgba(255, 255, 255, 0.12); }
  .kb .kb-btn-2:active:not(:disabled) { box-shadow: 0 1px 0 #0a1029, inset 0 0 0 2px rgba(127, 211, 234, 0.6); }
  .kb .kb-btn-chico { padding: 9px 14px; font-size: 0.95rem; border-radius: 11px; }
  .kb .kb-enlace { background: none; border: 0; padding: 6px 8px; color: var(--kb-turq2); font-weight: 500; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; text-decoration-color: rgba(127, 211, 234, 0.35); }
  .kb .kb-enlace:hover { color: var(--kb-tinta); text-decoration-color: var(--kb-oro); }

  .kb-estrellas { display: inline-flex; gap: 2px; vertical-align: middle; }
  .kb-estrellas svg, .kb-estrella { display: block; }

  /* Tarjetas y hojas sobre la escena. */
  .kb-hoja-fondo { position: absolute; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(5, 9, 26, 0.72); animation: kb-aparece 0.2s ease-out; }
  .kb-hoja {
    position: relative; width: min(560px, 100%); max-height: calc(100% - 8px); overflow: auto; border-radius: 22px; padding: 26px 24px 22px;
    background: linear-gradient(180deg, #1c2b5e 0%, #121d47 100%); color: var(--kb-tinta);
    box-shadow: 0 0 0 2px rgba(127, 211, 234, 0.25), 0 8px 0 #070c22, 0 30px 70px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.12);
    animation: kb-sube 0.35s cubic-bezier(.2,1.4,.4,1);
  }
  .kb-hoja h2 { font-family: var(--kb-pixel); font-size: 1.05rem; line-height: 1.5; margin: 0 0 14px; color: var(--kb-oro); text-shadow: 0 3px 0 #3a2108; }
  .kb-hoja p { margin: 8px 0; line-height: 1.45; color: var(--kb-suave); }
  .kb-cerrar { position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; border-radius: 10px; border: 0; background: rgba(255, 255, 255, 0.08); color: var(--kb-tinta); font-size: 1.2rem; line-height: 1; }
  .kb-cerrar:hover { background: rgba(255, 255, 255, 0.16); }
  @keyframes kb-aparece { from { opacity: 0 } to { opacity: 1 } }
  @keyframes kb-sube { from { opacity: 0; transform: translateY(18px) scale(0.96) } to { opacity: 1; transform: none } }
  @media (prefers-reduced-motion: reduce) { .kb *, .kb *::before, .kb *::after { animation: none !important; transition: none !important; } }
`
