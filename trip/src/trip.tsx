import * as React from 'react'
import { TileMap } from 'kunobi'

export type Kind = 'stay' | 'food' | 'see' | 'coffee' | 'viewpoint'

export interface Place {
  id: string
  name: string
  kind: Kind
  day: number
  time: string
  lat: number
  lon: number
  price: number
  booked: '' | 'yes' | 'no'
  note: string
  addedBy: string
}

export interface Trip {
  city: string
  days: { day: number; label: string }[]
  friends: { name: string; color: string }[]
}

export const KIND_COLOR: Record<Kind, string> = {
  stay: '#0984c8',
  food: '#f3aa08',
  see: '#30ccd5',
  coffee: '#5bcbf9',
  viewpoint: '#8a6cf0',
}

/** Rows of a CSV file, with quoted fields that may hold commas. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  row.push(field)
  if (row.some((cell) => cell !== '')) rows.push(row)
  const [head, ...body] = rows
  return body.map((cells) => Object.fromEntries(head.map((key, i) => [key.trim(), (cells[i] ?? '').trim()])))
}

export function toPlaces(csv: string): Place[] {
  return parseCsv(csv).map((r) => ({
    id: r.id,
    name: r.name,
    kind: (r.kind || 'see') as Kind,
    day: Number(r.day) || 1,
    time: r.time,
    lat: Number(r.lat),
    lon: Number(r.lng),
    price: Number(r.price) || 0,
    booked: (r.booked || '') as Place['booked'],
    note: r.note,
    addedBy: r.added_by,
  }))
}

const TILE = 256
function pixel(lat: number, lon: number, z: number) {
  const size = TILE * 2 ** z
  const sin = Math.sin((lat * Math.PI) / 180)
  return { x: ((lon + 180) / 360) * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size }
}

/** The centre and the closest zoom that keeps every place inside a `width`×`height` map. */
function fit(points: Place[], width: number, height: number) {
  const lats = points.map((p) => p.lat)
  const lons = points.map((p) => p.lon)
  const center = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 }
  if (points.length < 2 || !width) return { center, zoom: 15 }
  for (let z = 16; z >= 11; z--) {
    const a = pixel(Math.max(...lats), Math.min(...lons), z)
    const b = pixel(Math.min(...lats), Math.max(...lons), z)
    if (b.x - a.x <= width - 96 && b.y - a.y <= height - 110) return { center, zoom: z }
  }
  return { center, zoom: 11 }
}

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = React.useState(0)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => setWidth(el.getBoundingClientRect().width)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])
  return width
}

const euro = (n: number) => `€${Math.round(n)}`

/**
 * The text of an imported data file. Kunobi hands a `.csv` import to the page as a `blob:`
 * URL, even with `?raw`, so read it; a bundler that inlines the text passes it straight on.
 */
export function useFileText(source: string): string | null {
  const isUrl = /^(blob|data|https?):/.test(source)
  const [text, setText] = React.useState<string | null>(isUrl ? null : source)
  React.useEffect(() => {
    if (!isUrl) return setText(source)
    let live = true
    fetch(source)
      .then((r) => r.text())
      .then((t) => live && setText(t), () => live && setText(''))
    return () => {
      live = false
    }
  }, [source, isUrl])
  return text
}

export function TripPlanner({ csv: source, trip, words: w }: { csv: string; trip: Trip; words: Record<string, any> }) {
  const csv = useFileText(source)
  const places = React.useMemo(() => (csv ? toPlaces(csv) : []), [csv])
  const [day, setDay] = React.useState<number>(1)
  const [selected, setSelected] = React.useState<string | null>(null)
  const mapBox = React.useRef<HTMLDivElement>(null)
  const width = useWidth(mapBox)
  const height = Math.round(Math.min(560, Math.max(320, width * 0.82)))

  const shown = places.filter((p) => day === 0 || p.day === day).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time))
  const { center, zoom } = fit(shown, width, height)
  const order = new Map(shown.map((p, i) => [p.id, i + 1]))
  const active = places.find((p) => p.id === selected) ?? null
  const toBook = places.filter((p) => p.booked === 'no')
  const perPerson = places.reduce((sum, p) => sum + p.price, 0)
  const byKind = (Object.keys(KIND_COLOR) as Kind[])
    .map((k) => ({ kind: k, total: places.filter((p) => p.kind === k).reduce((s, p) => s + p.price, 0) }))
    .filter((k) => k.total > 0)
    .sort((a, b) => b.total - a.total)

  const pick = (id: string) => setSelected((cur) => (cur === id ? null : id))
  const loading = csv === null

  const markers = shown.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    title: p.name,
    active: p.id === selected,
    onSelect: () => pick(p.id),
    label: (
      <span className="pin" style={{ background: KIND_COLOR[p.kind] }}>
        {day === 0 ? p.day : order.get(p.id)}
      </span>
    ),
  }))

  return (
    <div className="trip">
      <style>{`
        .trip { width: min(var(--kunobi-prose-width, 1200px), 100%); margin: 0 auto; box-sizing: border-box; padding: 16px 24px 48px; container-type: inline-size; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
        .trip h1, .trip h2, .trip .t-name { font-family: Parkinsans, Figtree, sans-serif; letter-spacing: -0.02em; }
        .head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 18px 24px; padding: 28px 30px; border-radius: 26px; background: linear-gradient(135deg, #06213f 0%, #0b3a63 100%); color: #fff; }
        .eyebrow { font: 600 13px Figtree, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.66); }
        .head h1 { margin: 6px 0 4px; font-size: clamp(34px, 5cqw, 54px); font-weight: 800; line-height: 1; }
        .head h1 span { color: #f3aa08; }
        .dates { color: rgba(255,255,255,0.8); font-size: 16px; }
        .friends { display: flex; align-items: center; gap: 10px; margin-top: 14px; font-size: 15px; color: rgba(255,255,255,0.85); }
        .faces { display: flex; }
        .face { width: 30px; height: 30px; border-radius: 99px; display: grid; place-items: center; font: 800 13px Parkinsans, sans-serif; color: #06213f; border: 2px solid #06213f; }
        .face + .face { margin-left: -8px; }
        .stats { display: flex; flex-wrap: wrap; gap: 8px; }
        .stat { padding: 10px 14px; border-radius: 16px; background: rgba(255,255,255,0.08); min-width: 92px; }
        .stat b { display: block; font: 800 22px Parkinsans, sans-serif; }
        .stat small { color: rgba(255,255,255,0.7); font-size: 13px; }
        .days { display: flex; flex-wrap: wrap; gap: 8px; margin: 22px 0 16px; }
        .day { all: unset; cursor: pointer; padding: 9px 16px; border-radius: 999px; background: hsl(var(--muted)); font: 600 15px Figtree, sans-serif; color: hsl(var(--foreground)); }
        .day small { opacity: 0.6; margin-left: 6px; font-size: 12px; }
        .day.on { background: #06213f; color: #fff; }
        .day:focus-visible { outline: 2px solid #0984c8; outline-offset: 2px; }
        .main { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 18px; align-items: start; }
        .map { position: sticky; top: 12px; border-radius: 24px; overflow: hidden; border: 1px solid hsl(var(--border)); box-shadow: 0 10px 30px rgba(6,33,63,0.10); --primary: 212 83% 13%; --primary-foreground: 0 0% 100%; }
        .pin { width: 22px; height: 22px; border-radius: 99px; display: grid; place-items: center; color: #06213f; font: 800 11px Figtree, sans-serif; margin: 0 -3px; }
        .card { position: absolute; left: 12px; right: 12px; bottom: 28px; z-index: 4; display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border-radius: 18px; background: hsl(var(--card)); color: hsl(var(--foreground)); box-shadow: 0 12px 30px rgba(6,33,63,0.22); }
        .card .dot { flex: none; width: 12px; height: 12px; border-radius: 99px; margin-top: 6px; }
        .card .t-name { font-weight: 800; font-size: 18px; }
        .card p { margin: 4px 0 0; color: hsl(var(--muted-foreground)); font-size: 14px; line-height: 1.4; }
        .card .meta { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
        .chip { font: 600 12px Figtree, sans-serif; padding: 4px 9px; border-radius: 99px; background: hsl(var(--muted)); color: hsl(var(--foreground)); }
        .chip.warn { background: #f3aa08; color: #06213f; }
        .chip.ok { background: #30ccd5; color: #06213f; }
        .close { all: unset; cursor: pointer; margin-left: auto; padding: 2px 8px; border-radius: 99px; color: hsl(var(--muted-foreground)); font-size: 18px; line-height: 1; }
        .list { display: flex; flex-direction: column; gap: 4px; }
        .daytitle { font: 800 15px Parkinsans, sans-serif; color: hsl(var(--muted-foreground)); margin: 14px 4px 4px; text-transform: uppercase; letter-spacing: 0.04em; }
        .daytitle:first-child { margin-top: 0; }
        .stop { all: unset; cursor: pointer; display: grid; grid-template-columns: 52px 30px 1fr auto; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 16px; transition: background .15s; }
        .stop:hover { background: hsl(var(--muted)); }
        .stop.on { background: hsl(var(--card)); box-shadow: 0 6px 18px rgba(6,33,63,0.10); outline: 1px solid hsl(var(--border)); }
        .stop:focus-visible { outline: 2px solid #0984c8; }
        .time { font: 600 14px Figtree, sans-serif; color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; }
        .num { width: 26px; height: 26px; border-radius: 99px; display: grid; place-items: center; font: 800 12px Figtree, sans-serif; color: #06213f; }
        .stop .t-name { font-weight: 700; font-size: 16px; }
        .stop .sub { color: hsl(var(--muted-foreground)); font-size: 13px; margin-top: 2px; }
        .price { font: 600 14px Figtree, sans-serif; color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; }
        .below { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 22px; }
        .panel { padding: 20px 22px; border-radius: 22px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); }
        .panel h2 { margin: 0 0 12px; font-size: 20px; font-weight: 800; }
        .row { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid hsl(var(--border)); font-size: 15px; }
        .row:first-of-type { border-top: 0; }
        .row span:last-child { color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .bar { display: flex; height: 12px; border-radius: 99px; overflow: hidden; margin: 6px 0 12px; }
        .total { display: flex; align-items: baseline; gap: 8px; }
        .total b { font: 800 30px Parkinsans, sans-serif; }
        .total small { color: hsl(var(--muted-foreground)); }
        .legend { display: inline-flex; align-items: center; gap: 8px; }
        .legend i { width: 10px; height: 10px; border-radius: 99px; display: inline-block; }
        .how { margin-top: 22px; padding: 16px 20px; border-radius: 18px; background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); font-size: 14px; line-height: 1.5; }
        .how code { font: 600 13px ui-monospace, Menlo, monospace; color: hsl(var(--foreground)); }
        .how q { color: hsl(var(--foreground)); font-weight: 600; quotes: '“' '”'; }
        @container (max-width: 860px) {
          .main, .below { grid-template-columns: 1fr; }
          .map { position: relative; top: 0; }
        }
        @container (max-width: 520px) {
          .trip { padding: 12px 12px 32px; }
          .head { padding: 22px 20px; }
          .stop { grid-template-columns: 44px 26px 1fr; }
          .stop .price { display: none; }
        }
      `}</style>

      <header className="head">
        <div>
          <div className="eyebrow">{w.eyebrow}</div>
          <h1>
            {trip.city}
            <span>.</span>
          </h1>
          <div className="dates">{w.dates}</div>
          <div className="friends">
            <span className="faces">
              {trip.friends.map((f) => (
                <span key={f.name} className="face" style={{ background: f.color }}>
                  {f.name[0]}
                </span>
              ))}
            </span>
            {trip.friends.map((f) => f.name).join(' & ')}
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <b>{places.length}</b>
            <small>{w.places}</small>
          </div>
          <div className="stat">
            <b>{euro(perPerson)}</b>
            <small>{w.each}</small>
          </div>
          <div className="stat">
            <b>{toBook.length}</b>
            <small>{w.toBook}</small>
          </div>
        </div>
      </header>

      <nav className="days" aria-label={w.days}>
        {[{ day: 0, label: w.all }, ...trip.days].map((d) => (
          <button
            key={d.day}
            className={`day${day === d.day ? ' on' : ''}`}
            aria-pressed={day === d.day}
            onClick={() => {
              setDay(d.day)
              setSelected(null)
            }}
          >
            {d.label}
            <small>{d.day === 0 ? places.length : places.filter((p) => p.day === d.day).length}</small>
          </button>
        ))}
      </nav>

      <div className="main">
        <div className="map" ref={mapBox} style={{ position: 'relative' }}>
          {shown.length > 0 && (
            <TileMap
              center={center}
              zoom={zoom}
              markers={markers}
              route={day === 0 ? undefined : shown}
              style={{ height, aspectRatio: 'auto' }}
              aria-label={w.map}
            />
          )}
          {active && (
            <div className="card">
              <span className="dot" style={{ background: KIND_COLOR[active.kind] }} />
              <div>
                <div className="t-name">{active.name}</div>
                <p>{active.note}</p>
                <div className="meta">
                  <span className="chip">
                    {trip.days.find((d) => d.day === active.day)?.label} · {active.time}
                  </span>
                  <span className="chip">{w.kinds[active.kind]}</span>
                  {active.price > 0 && <span className="chip">{euro(active.price)} {w.pp}</span>}
                  {active.booked === 'yes' && <span className="chip ok">{w.booked}</span>}
                  {active.booked === 'no' && <span className="chip warn">{w.notBooked}</span>}
                  <span className="chip">
                    {w.addedBy} {active.addedBy}
                  </span>
                </div>
              </div>
              <button className="close" aria-label={w.close} onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
          )}
        </div>

        <div className="list">
          {trip.days
            .filter((d) => day === 0 || d.day === day)
            .map((d) => (
              <React.Fragment key={d.day}>
                <div className="daytitle">{d.label}</div>
                {shown
                  .filter((p) => p.day === d.day)
                  .map((p) => (
                    <button key={p.id} className={`stop${p.id === selected ? ' on' : ''}`} onClick={() => pick(p.id)}>
                      <span className="time">{p.time}</span>
                      <span className="num" style={{ background: KIND_COLOR[p.kind] }}>
                        {day === 0 ? p.day : order.get(p.id)}
                      </span>
                      <span>
                        <div className="t-name">{p.name}</div>
                        <div className="sub">
                          {w.kinds[p.kind]}
                          {p.booked === 'no' ? ` · ${w.notBooked}` : ''}
                        </div>
                      </span>
                      <span className="price">{p.price > 0 ? euro(p.price) : w.free}</span>
                    </button>
                  ))}
              </React.Fragment>
            ))}
        </div>
      </div>

      {!loading && <div className="below">
        <section className="panel">
          <h2>{w.stillToBook}</h2>
          {toBook.length === 0 && <div className="row">{w.allBooked}</div>}
          {toBook.map((p) => (
            <div className="row" key={p.id}>
              <span>
                <span className="legend">
                  <i style={{ background: KIND_COLOR[p.kind] }} />
                  {p.name}
                </span>
              </span>
              <span>
                {trip.days.find((d) => d.day === p.day)?.label} {p.time} · {euro(p.price)}
              </span>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>{w.budget}</h2>
          <div className="total">
            <b>{euro(perPerson)}</b>
            <small>{w.each}</small>
          </div>
          <div className="bar">
            {byKind.map((k) => (
              <span key={k.kind} style={{ width: `${(k.total / perPerson) * 100}%`, background: KIND_COLOR[k.kind] }} />
            ))}
          </div>
          {byKind.map((k) => (
            <div className="row" key={k.kind}>
              <span className="legend">
                <i style={{ background: KIND_COLOR[k.kind] }} />
                {w.kinds[k.kind]}
              </span>
              <span>{euro(k.total)}</span>
            </div>
          ))}
        </section>
      </div>}

      <div className="how">
        {w.how[0]} <code>trip/data/places.csv</code>. {w.how[1]} <q>{w.prompts[0]}</q> · <q>{w.prompts[1]}</q>
      </div>
    </div>
  )
}
