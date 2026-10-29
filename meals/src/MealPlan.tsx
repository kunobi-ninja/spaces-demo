import * as React from 'react'
import { amount, hours, nights, scaled, shopping, type Line, type Night, type Recipe } from './plan'

const C = { midnight: '#06213f', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8' }
const COOKS = [C.sun, C.horizon, C.tide, '#e8794a', '#8a6cf0']
const AISLE_COLOR: Record<string, string> = {
  Produce: '#3fa66b',
  'Meat and fish': '#e8794a',
  'Dairy and eggs': C.ocean,
  Bakery: C.sun,
  Pantry: '#b07d4f',
  Frozen: C.horizon,
}
const DISH_TINT: Record<string, string> = { pot: '#fde7c2', tray: '#fbd9c6', taco: '#fdf0b8', bowl: '#d8eefb', pizza: '#fcd6cf', pan: '#e9e1d2', roast: '#f6dcc0' }

export type Words = Record<string, string>

/**
 * The text of an imported data file. Kunobi hands a `.csv` import to the page as a
 * `blob:` URL (even with `?raw`), so read it once; plain text passes through.
 */
export function useText(source: string): string | null {
  const isUrl = /^(blob|data):/.test(source)
  const [text, setText] = React.useState<string | null>(isUrl ? null : source)
  React.useEffect(() => {
    if (!isUrl) { setText(source); return }
    let live = true
    fetch(source).then((r) => r.text()).then((t) => { if (live) setText(t) }, () => { if (live) setText('') })
    return () => { live = false }
  }, [source, isUrl])
  return text
}

/** Simple drawn dishes, so the week reads at a glance without photos. */
export function Dish({ kind, size = 64 }: { kind: string; size?: number }) {
  const ink = C.midnight
  const common = { width: size, height: size, viewBox: '0 0 64 64', fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (kind) {
    case 'pot':
      return (
        <svg {...common}>
          <path d="M24 12c-2 3 2 5 0 8M32 10c-2 3 2 5 0 8M40 12c-2 3 2 5 0 8" stroke="#e8794a" strokeWidth="2.4" />
          <rect x="12" y="28" width="40" height="24" rx="8" fill="#e8794a" />
          <rect x="8" y="24" width="48" height="7" rx="3.5" fill={ink} />
          <path d="M8 34h4M52 34h4" stroke={ink} strokeWidth="4" />
        </svg>
      )
    case 'tray':
      return (
        <svg {...common}>
          <rect x="6" y="22" width="52" height="28" rx="6" fill="#9aa7b4" />
          <rect x="10" y="26" width="44" height="20" rx="4" fill="#cfd6dd" />
          <ellipse cx="22" cy="36" rx="8" ry="6" fill="#d9822b" />
          <ellipse cx="40" cy="34" rx="8" ry="6" fill="#e39a3b" />
          <circle cx="31" cy="42" r="3.5" fill="#f3d36b" />
          <circle cx="47" cy="42" r="3" fill="#7cb342" />
        </svg>
      )
    case 'taco':
      return (
        <svg {...common}>
          <path d="M8 44a24 24 0 0 1 48 0z" fill="#f3c04a" />
          <path d="M14 42c3-6 7-9 10-9M24 40c2-6 7-10 12-10M36 40c3-5 7-7 12-6" stroke="#3fa66b" strokeWidth="4" />
          <circle cx="22" cy="36" r="3" fill="#c0392b" />
          <circle cx="38" cy="33" r="3" fill="#c0392b" />
          <path d="M8 44h48" stroke={ink} strokeWidth="3" />
        </svg>
      )
    case 'bowl':
      return (
        <svg {...common}>
          <path d="M44 6 30 30M52 10 34 31" stroke="#b07d4f" strokeWidth="2.6" />
          <path d="M8 32h48a24 20 0 0 1-48 0z" fill={C.horizon} />
          <path d="M12 32c2-6 10-9 20-9s18 3 20 9" fill="#fff" />
          <rect x="26" y="24" width="14" height="6" rx="3" fill="#f08a5d" />
          <circle cx="18" cy="29" r="2.5" fill="#3fa66b" />
        </svg>
      )
    case 'pizza':
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="24" fill="#e9b25a" />
          <circle cx="32" cy="32" r="19" fill="#d9472b" />
          <circle cx="32" cy="32" r="17" fill="#f6d77a" />
          <circle cx="25" cy="25" r="3.5" fill="#c0392b" />
          <circle cx="39" cy="28" r="3.5" fill="#c0392b" />
          <circle cx="30" cy="40" r="3.5" fill="#c0392b" />
          <path d="M40 38c2 1 4 1 5-1M22 34c1 2 3 3 5 2" stroke="#3fa66b" strokeWidth="2.6" />
          <path d="M32 8v48M8 32h48" stroke="#e9b25a" strokeWidth="1.6" />
        </svg>
      )
    case 'pan':
      return (
        <svg {...common}>
          <path d="M44 34h16" stroke={ink} strokeWidth="5" />
          <circle cx="26" cy="34" r="20" fill="#3d4b5c" />
          <circle cx="26" cy="34" r="16" fill="#f1e3c4" />
          <path d="M18 30a5 5 0 0 1 10 0z" fill="#9b6b43" />
          <path d="M26 38a5 5 0 0 1 10 0z" fill="#9b6b43" />
          <circle cx="20" cy="40" r="2" fill="#3fa66b" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <ellipse cx="32" cy="48" rx="26" ry="6" fill="#cfd6dd" />
          <path d="M14 42c0-12 8-22 18-22s18 10 18 22z" fill="#d9822b" />
          <path d="M20 40c0-8 5-14 12-14" stroke="#f3c04a" strokeWidth="3" />
          <path d="M46 26l6-6M50 30l7-3" stroke="#d9822b" strokeWidth="4" />
          <circle cx="12" cy="44" r="3" fill="#7cb342" />
          <circle cx="53" cy="44" r="3" fill="#e8794a" />
        </svg>
      )
  }
}

function Leaf() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15z" fill="#3fa66b" />
      <path d="M5 19 14 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function Clock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`tick${on ? ' on' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 12.5l4 4 8-9" />
      </svg>
    </span>
  )
}

export function MealPlan({ weekCsv, recipes, aisles, words: w }: { weekCsv: string; recipes: Recipe[]; aisles: string[]; words: Words }) {
  const weekText = useText(weekCsv)
  const week = React.useMemo(() => nights(weekText ?? '', recipes), [weekText, recipes])
  const list = React.useMemo(() => shopping(week), [week])
  const [view, setView] = React.useState<'aisle' | 'recipe'>('aisle')
  const [day, setDay] = React.useState<string | null>(null)
  const [got, setGot] = React.useState<Record<string, boolean>>({})
  // Wait for the week before drawing, so the summary never flashes zeros.
  if (weekText === null) return <div style={{ minHeight: 480 }} aria-busy="true" />

  const cooks = [...new Set(week.map((n) => n.cook))]
  const cookColor = (name: string) => COOKS[cooks.indexOf(name) % COOKS.length]
  const veggie = week.filter((n) => n.recipe.tags.includes('veggie')).length
  const minutes = week.reduce((sum, n) => sum + n.recipe.minutes, 0)
  const perCook = cooks.map((c) => `${c} ${week.filter((n) => n.cook === c).length}`).join(' · ')
  const shown = day ? list.filter((l) => l.days.includes(day)) : list
  const done = shown.filter((l) => got[l.key]).length
  const toggle = (key: string) => setGot((g) => ({ ...g, [key]: !g[key] }))

  const row = (line: Line, showDays: boolean) => (
    <li key={line.key}>
      <button className={`item${got[line.key] ? ' got' : ''}`} onClick={() => toggle(line.key)} aria-pressed={!!got[line.key]}>
        <Tick on={!!got[line.key]} />
        <span className="name">{line.name}</span>
        {showDays && line.days.length > 1 && <span className="days">{line.days.join(' ')}</span>}
        <span className="qty">{amount(line.qty, line.unit)}</span>
      </button>
    </li>
  )

  const byAisle = aisles
    .map((aisle) => ({ aisle, lines: shown.filter((l) => l.aisle === aisle) }))
    .filter((g) => g.lines.length > 0)
  const byRecipe: { night: Night; lines: Line[] }[] = week
    .filter((n) => !day || n.day === day)
    .map((night) => ({ night, lines: scaled(night) }))

  return (
    <div className="meals">
      <style>{`
        .meals { width: min(var(--kunobi-prose-width, 1200px), 100%); margin: 0 auto; box-sizing: border-box; padding: 16px 24px 48px; container-type: inline-size; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
        .meals h1, .meals h2, .meals .dish-name { font-family: Parkinsans, Figtree, sans-serif; letter-spacing: -0.02em; }
        .top { position: relative; overflow: hidden; border-radius: 28px; padding: clamp(22px, 4cqw, 40px); background: linear-gradient(135deg, #fff4dc 0%, #ffe6c7 55%, #fde0d2 100%); color: ${C.midnight}; }
        .spread { position: absolute; right: clamp(16px, 4cqw, 48px); top: 50%; transform: translateY(-50%); display: flex; z-index: 1; }
        .spread > span { display: grid; place-items: center; width: 116px; height: 116px; border-radius: 50%; background: rgba(255,255,255,0.75); box-shadow: 0 10px 30px rgba(6,33,63,0.08); margin-left: -18px; }
        @container (max-width: 820px) { .spread { display: none; } }
        .top::after { content: ''; position: absolute; right: -60px; top: -60px; width: 240px; height: 240px; border-radius: 50%; background: radial-gradient(circle, rgba(243,170,8,0.35), rgba(243,170,8,0)); }
        .eyebrow { display: inline-flex; gap: 8px; align-items: center; font: 600 13px Figtree, sans-serif; padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,0.7); }
        .eyebrow i { width: 8px; height: 8px; border-radius: 99px; background: ${C.sun}; }
        .top h1 { font-weight: 800; font-size: clamp(32px, 5cqw, 56px); line-height: 1; margin: 14px 0 6px; }
        .top p { margin: 0; font-size: 17px; color: rgba(6,33,63,0.72); }
        .facts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; position: relative; z-index: 1; }
        .fact { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 999px; background: #fff; font: 600 14px Figtree, sans-serif; box-shadow: 0 4px 14px rgba(6,33,63,0.06); }
        .week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 12px; margin: 20px 0 8px; }
        .day { all: unset; cursor: pointer; display: flex; flex-direction: column; border-radius: 22px; overflow: hidden; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); box-shadow: 0 8px 24px rgba(6,33,63,0.06); transition: transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s, outline-color .2s; outline: 3px solid transparent; outline-offset: 2px; }
        .day:hover { transform: translateY(-3px); box-shadow: 0 16px 34px rgba(6,33,63,0.12); }
        .day.on { outline-color: ${C.sun}; }
        .day:focus-visible { outline-color: ${C.horizon}; }
        .plate { display: grid; place-items: center; height: 92px; position: relative; }
        .plate b { position: absolute; top: 10px; left: 12px; font: 800 13px Parkinsans, sans-serif; color: ${C.midnight}; opacity: 0.75; }
        .plate .veg { position: absolute; top: 9px; right: 10px; width: 22px; height: 22px; border-radius: 99px; background: #fff; display: grid; place-items: center; }
        .body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
        .dish-name { font-weight: 800; font-size: 16px; line-height: 1.2; }
        .meta { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 13px; color: hsl(var(--muted-foreground)); }
        .who { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: hsl(var(--foreground)); }
        .who i { width: 20px; height: 20px; border-radius: 99px; display: grid; place-items: center; font: 800 11px Parkinsans, sans-serif; color: ${C.midnight}; font-style: normal; }
        .mins { display: inline-flex; align-items: center; gap: 4px; }
        .list-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin: 30px 0 14px; }
        .list-head h2 { font-size: clamp(24px, 3cqw, 32px); font-weight: 800; margin: 0; }
        .sub { color: hsl(var(--muted-foreground)); font-size: 14px; margin-top: 4px; }
        .seg { display: inline-flex; padding: 4px; border-radius: 999px; background: hsl(var(--muted)); }
        .seg button { all: unset; cursor: pointer; padding: 8px 16px; border-radius: 999px; font: 600 14px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
        .seg button.on { background: ${C.midnight}; color: #fff; }
        .seg button:focus-visible { outline: 2px solid ${C.horizon}; }
        .progress { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; font: 600 14px Figtree, sans-serif; }
        .bar { flex: 1; height: 8px; border-radius: 99px; background: hsl(var(--muted)); overflow: hidden; }
        .bar span { display: block; height: 100%; background: linear-gradient(90deg, ${C.sun}, #e8794a); border-radius: 99px; transition: width .3s; }
        .filter { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; background: ${C.sun}; color: ${C.midnight}; font: 600 13px Figtree, sans-serif; }
        .groups { columns: 300px; column-gap: 14px; }
        .group { break-inside: avoid; margin: 0 0 14px; padding: 14px 14px 8px; border-radius: 20px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); }
        .group h3 { display: flex; align-items: center; gap: 10px; margin: 2px 4px 8px; font: 800 16px Parkinsans, sans-serif; letter-spacing: -0.01em; }
        .group h3 .dot { width: 12px; height: 12px; border-radius: 99px; }
        .group h3 small { margin-left: auto; font: 600 12px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
        .group h3 .mini { flex: none; }
        .group ul { list-style: none; margin: 0; padding: 0; }
        .item { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-radius: 12px; font-size: 15px; }
        .item:hover { background: hsl(var(--muted)); }
        .item:focus-visible { outline: 2px solid ${C.horizon}; }
        .tick { flex: none; width: 20px; height: 20px; border-radius: 99px; border: 2px solid hsl(var(--border)); display: grid; place-items: center; transition: background .2s, border-color .2s; }
        .tick svg { opacity: 0; transition: opacity .2s; }
        .tick.on { background: #3fa66b; border-color: #3fa66b; }
        .tick.on svg { opacity: 1; }
        .item .name { flex: 1; }
        .item.got .name { text-decoration: line-through; color: hsl(var(--muted-foreground)); }
        .days { font: 600 11px Figtree, sans-serif; color: hsl(var(--muted-foreground)); background: hsl(var(--muted)); padding: 3px 7px; border-radius: 99px; }
        .qty { font-variant-numeric: tabular-nums; font-weight: 600; color: hsl(var(--muted-foreground)); white-space: nowrap; }
        .note { font-size: 13px; color: hsl(var(--muted-foreground)); margin: -6px 0 14px; }
        .how { margin-top: 26px; padding: 18px 20px; border-radius: 20px; background: hsl(var(--muted)); display: grid; gap: 10px; font-size: 15px; }
        .how b { font-family: Parkinsans, sans-serif; }
        .how code { font: 600 13px ui-monospace, Menlo, monospace; background: hsl(var(--card)); padding: 2px 7px; border-radius: 8px; }
        .prompts { display: flex; flex-wrap: wrap; gap: 8px; }
        .prompts span { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); padding: 7px 12px; border-radius: 999px; font-size: 14px; }
        @container (max-width: 980px) {
          .week { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 6px; }
          .day { flex: 0 0 170px; scroll-snap-align: start; }
        }
        @media (prefers-reduced-motion: reduce) { .day, .bar span, .tick, .tick svg { transition: none; } }
      `}</style>

      <header className="top">
        <span className="eyebrow"><i />{w.eyebrow}</span>
        <span className="spread" aria-hidden="true">
          <span style={{ transform: 'rotate(-8deg) translate(0, 10px)' }}><Dish kind="pizza" size={92} /></span>
          <span style={{ transform: 'rotate(6deg) translate(-8px, -14px)' }}><Dish kind="pot" size={84} /></span>
          <span style={{ transform: 'rotate(-4deg) translate(-16px, 16px)' }}><Dish kind="taco" size={88} /></span>
        </span>
        <h1>{w.title}</h1>
        <p>{w.lede}</p>
        <div className="facts">
          <span className="fact"><Leaf />{veggie} {w.veggie}</span>
          <span className="fact"><Clock />{hours(minutes)} {w.cooking}</span>
          <span className="fact">{w.cooks}: {perCook}</span>
        </div>
      </header>

      <div className="week">
        {week.map((n) => (
          <button key={n.day} className={`day${day === n.day ? ' on' : ''}`} onClick={() => setDay(day === n.day ? null : n.day)} aria-pressed={day === n.day} title={w.pick}>
            <span className="plate" style={{ background: DISH_TINT[n.recipe.icon] ?? '#f3ece0' }}>
              <b>{w[n.day] ?? n.day}</b>
              {n.recipe.tags.includes('veggie') && <span className="veg"><Leaf /></span>}
              <Dish kind={n.recipe.icon} />
            </span>
            <span className="body">
              <span className="dish-name">{n.recipe.name}</span>
              <span className="meta">
                <span className="who"><i style={{ background: cookColor(n.cook) }}>{n.cook[0]}</i>{n.cook}</span>
                <span className="mins"><Clock />{n.recipe.minutes}′</span>
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="list-head">
        <div>
          <h2>{w.list}</h2>
          <div className="sub">{day ? `${w.only} ${w[day] ?? day}` : `${shown.length} ${w.things}`}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {day && <button className="filter" onClick={() => setDay(null)}>{w.all} ✕</button>}
          <div className="seg" role="group">
            <button className={view === 'aisle' ? 'on' : ''} onClick={() => setView('aisle')} aria-pressed={view === 'aisle'}>{w.byAisle}</button>
            <button className={view === 'recipe' ? 'on' : ''} onClick={() => setView('recipe')} aria-pressed={view === 'recipe'}>{w.byRecipe}</button>
          </div>
        </div>
      </div>
      <div className="progress">
        <span>{done} / {shown.length} {w.basket}</span>
        <span className="bar"><span style={{ width: `${shown.length ? (done / shown.length) * 100 : 0}%` }} /></span>
      </div>
      <div className="note">{w.ticks}</div>

      <div className="groups">
        {view === 'aisle'
          ? byAisle.map((g) => (
              <section className="group" key={g.aisle}>
                <h3><span className="dot" style={{ background: AISLE_COLOR[g.aisle] ?? C.horizon }} />{w[g.aisle] ?? g.aisle}<small>{g.lines.length}</small></h3>
                <ul>{g.lines.map((l) => row(l, true))}</ul>
              </section>
            ))
          : byRecipe.map(({ night, lines }) => (
              <section className="group" key={night.day}>
                <h3><span className="mini"><Dish kind={night.recipe.icon} size={26} /></span>{w[night.day] ?? night.day} · {night.recipe.name}<small>{night.servings} {w.people}</small></h3>
                <ul>{lines.map((l) => row(l, false))}</ul>
              </section>
            ))}
      </div>

      <div className="how">
        <div><b>{w.howTitle}</b> {w.howBody} <code>data/week.csv</code> · <code>data/recipes.json</code></div>
        <div className="prompts">
          <span>“{w.prompt1}”</span>
          <span>“{w.prompt2}”</span>
        </div>
      </div>
    </div>
  )
}
