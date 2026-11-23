/*
 * La identidad de Castillos, compartida por todas las pantallas: pergamino y
 * luz de última hora de la tarde, tinta parda, granate y oro. Fraunces para los
 * títulos y Figtree para el texto. El juego pinta su propio fondo, así que se
 * ve igual con el tema claro o el oscuro de Kunobi.
 */

/** Grano de papel, dibujado por la página (sin archivos). */
const GRANO =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.22 0 0 0 0 0.08 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")"

export const ESTILO_BASE = `
  .cas-raiz {
    --papel: #f6ead0; --papel-2: #ecd9b0; --papel-3: #dcc08a;
    --tinta: #3a2614; --tinta-2: #6b4d2e; --tinta-3: #9a7a52;
    --granate: #a3321f; --granate-2: #c4492d; --granate-osc: #6f2113;
    --oro: #d39a2c; --oro-2: #f3cd76;
    --bosque: #3f5b2b;
    --linea: rgba(58, 38, 20, 0.16);
    --sombra-suave: 0 1px 0 rgba(255,255,255,0.6) inset, 0 10px 30px -12px rgba(60, 32, 10, 0.45), 0 2px 6px rgba(60, 32, 10, 0.12);
    position: relative; min-height: 100vh; box-sizing: border-box; color: var(--tinta);
    font-family: 'Figtree', system-ui, sans-serif; font-size: 15px; line-height: 1.45;
    background-color: #ecd6a8;
    background-image: ${GRANO}, radial-gradient(ellipse 90% 70% at 22% 8%, #fff3d6 0%, rgba(255, 240, 205, 0) 60%), radial-gradient(ellipse at 50% 40%, #f0dcb2 0%, #e2c38c 70%, #cfa767 100%);
    -webkit-font-smoothing: antialiased;
  }
  .cas-raiz *, .cas-raiz *::before, .cas-raiz *::after { box-sizing: border-box; }
  :where(.cas-raiz) button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .cas-raiz h1, .cas-raiz h2, .cas-raiz h3, .cas-display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; color: var(--tinta); }

  .cas-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 14px; padding: 12px 22px; font-weight: 700; font-size: 1.02em;
    border: 1px solid rgba(58, 38, 20, 0.22); color: var(--tinta);
    background: linear-gradient(180deg, #fff8e8 0%, #f1e0bb 100%);
    box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 -2px 0 rgba(120, 80, 30, 0.12) inset, 0 6px 16px -6px rgba(60, 32, 10, 0.35);
    transition: transform 160ms cubic-bezier(.3,1.6,.5,1), box-shadow 160ms ease, filter 160ms ease; }
  .cas-btn:hover { transform: translateY(-2px); box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 -2px 0 rgba(120, 80, 30, 0.12) inset, 0 12px 22px -8px rgba(60, 32, 10, 0.45); }
  .cas-btn:active { transform: translateY(1px) scale(0.97); }
  .cas-btn:disabled { opacity: 0.45; cursor: default; transform: none; }
  .cas-btn:focus-visible, .cas-icono-btn:focus-visible { outline: 3px solid var(--oro); outline-offset: 2px; }
  .cas-btn-fuerte { color: #fff7e6; border-color: #7d2615; text-shadow: 0 1px 0 rgba(60, 10, 0, 0.35);
    background: linear-gradient(180deg, #cf5434 0%, #a3321f 55%, #8a2716 100%);
    box-shadow: 0 1px 0 rgba(255, 210, 170, 0.6) inset, 0 -3px 0 rgba(70, 10, 0, 0.25) inset, 0 10px 22px -8px rgba(122, 36, 22, 0.65); }
  .cas-btn-fuerte:hover { filter: brightness(1.06); box-shadow: 0 1px 0 rgba(255, 210, 170, 0.6) inset, 0 -3px 0 rgba(70, 10, 0, 0.25) inset, 0 16px 28px -10px rgba(122, 36, 22, 0.7); }
  .cas-btn-grande { padding: 15px 30px; font-size: 1.12em; border-radius: 16px; }
  .cas-btn-plano { background: none; border-color: transparent; box-shadow: none; padding: 8px 10px; color: var(--tinta-2); font-weight: 600; }
  .cas-btn-plano:hover { box-shadow: none; color: var(--tinta); background: rgba(58, 38, 20, 0.06); }
  .cas-icono-btn { width: 40px; height: 40px; display: inline-grid; place-items: center; border-radius: 12px; color: var(--tinta-2); padding: 0;
    border: 1px solid var(--linea); background: linear-gradient(180deg, #fffaf0, #f2e3c3); box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 3px 8px -4px rgba(60, 32, 10, 0.35);
    transition: transform 140ms cubic-bezier(.3,1.6,.5,1), color 140ms ease; }
  .cas-icono-btn:hover { color: var(--granate); transform: translateY(-1px); }
  .cas-icono-btn:active { transform: scale(0.94); }
  .cas-icono-btn[aria-pressed='true'] { color: var(--granate); background: linear-gradient(180deg, #f6e2bd, #ead2a1); }

  .cas-marca { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; padding: 4px 6px 4px 0; color: var(--tinta);
    font-family: 'Fraunces', Georgia, serif; font-weight: 900; font-size: 1.7em; letter-spacing: -0.02em; }
  .cas-marca svg { color: var(--tinta-3); transition: transform 160ms ease; }
  .cas-marca:hover svg { transform: translateX(-3px); color: var(--granate); }
  .cas-papel { position: relative; border-radius: 18px; border: 1px solid rgba(120, 84, 40, 0.22);
    background: ${GRANO}, linear-gradient(180deg, #fffaf0 0%, #f7ead0 100%);
    box-shadow: var(--sombra-suave); }

  .cas-velo-modal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px;
    background: radial-gradient(ellipse at center, rgba(40, 22, 6, 0.35), rgba(40, 22, 6, 0.6));
    animation: cas-fundir 220ms ease-out; }
  .cas-hoja { width: min(560px, 100%); max-height: calc(100vh - 32px); overflow: auto; padding: 26px 26px 22px; animation: cas-subir 420ms cubic-bezier(.2,1.4,.4,1); }
  .cas-hoja h2 { margin: 0 0 6px; font-size: 1.9em; font-weight: 800; letter-spacing: -0.01em; }
  .cas-hoja-cerrar { position: absolute; top: 14px; right: 14px; }
  .cas-tecla { display: inline-block; min-width: 1.4em; padding: 0 6px; border: 1px solid rgba(58, 38, 20, 0.3); border-bottom-width: 2px; border-radius: 5px; font-size: 0.85em; text-align: center; background: #fffaf0; }

  @keyframes cas-fundir { from { opacity: 0; } to { opacity: 1; } }
  @keyframes cas-subir { from { opacity: 0; transform: translateY(18px) scale(0.97); } to { opacity: 1; transform: none; } }
  @keyframes cas-entrar { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    .cas-raiz *, .cas-raiz *::before, .cas-raiz *::after { animation: none !important; transition: none !important; }
  }
`
