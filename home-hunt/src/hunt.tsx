import * as React from 'react'
import { TileMap, edit, useStore, useStoreStatus } from 'kunobi'
import type { HomeHuntTakesStore } from '../types/home-hunt-takes.store'
import { localizeSeed } from './seed'

/** Each person's take on a home (keen, maybe, no, and a note), saved for both of them. */
export const STORE = 'home-hunt-takes'
type Take = HomeHuntTakesStore['takes'][string]
const VERDICTS = ['keen', 'maybe', 'no'] as const

export type Criterion = { id: string; must: boolean; max?: number; label: string }
export type Person = { id: string; name: string; color: string; role: string; ai: string; criteria: Criterion[] }
export type Setup = { city: string; currency: string; places: { id: string; name: string; lat: number; lon: number; person: string }[]; people: Person[] }
export type Home = {
  id: string
  address: string
  area: string
  lat: number
  lon: number
  rent: number
  garage?: number
  beds: number
  cycle: number
  motorway: number
  facts: Record<string, string>
  note: string
  addedBy: string
  status: 'considering' | 'viewing' | 'rejected'
  when?: string
  reason?: string
  rejectedBy?: string
  [flag: string]: unknown
}

/** Monthly cost: the rent plus anything rented with it, such as a garage. */
export const cost = (h: Home) => h.rent + (h.garage ?? 0)

/** Whether `home` meets one criterion. Numeric criteria compare against their `max`. */
export function meets(h: Home, c: Criterion): boolean {
  if (c.id === 'cycle') return h.cycle <= (c.max ?? Infinity)
  if (c.id === 'motorway') return h.motorway <= (c.max ?? Infinity)
  if (c.id === 'cost') return cost(h) <= (c.max ?? Infinity)
  return h[c.id] === true
}

/** How well a home fits one person: musts weigh 3, nice-to-haves 1. */
export function fitFor(h: Home, p: Person) {
  const checks = p.criteria.map((c) => ({ c, ok: meets(h, c) }))
  const total = checks.reduce((s, x) => s + (x.c.must ? 3 : 1), 0)
  const got = checks.reduce((s, x) => s + (x.ok ? (x.c.must ? 3 : 1) : 0), 0)
  const failed = checks.filter((x) => x.c.must && !x.ok).map((x) => x.c)
  return { score: Math.round((got / total) * 100), fits: failed.length === 0, failed, checks }
}

type Fit = ReturnType<typeof fitFor>

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))

/** One plain sentence with the trade-off, derived from the data so it cannot drift from it. */
export function tradeOff(h: Home, people: Person[], fits: Fit[], w: any, money: (n: number) => string): string {
  const vars = (p: Person, c: Criterion) => ({
    name: p.name,
    fact: (h.facts[c.id] ?? '').toLowerCase(),
    Fact: h.facts[c.id] ?? '',
    n: c.id === 'cycle' ? h.cycle : c.id === 'motorway' ? h.motorway : 0,
    over: money(cost(h) - (c.max ?? 0)),
    under: money((c.max ?? 0) - cost(h)),
  })
  const positive = (p: Person, f: Fit) => {
    const c = f.checks.find((x) => x.c.must && x.ok && w.pos[x.c.id])?.c
    return c ? fill(w.pos[c.id], vars(p, c)) : ''
  }
  const negative = (p: Person, f: Fit) => fill(w.neg[f.failed[0].id], vars(p, f.failed[0]))
  const [a, b] = [0, 1]
  if (fits[a].fits && fits[b].fits) {
    const lacks = fits.flatMap((f) => f.checks.filter((x) => !x.c.must && !x.ok).map((x) => w.lack[x.c.id]))
    if (!lacks.length) return w.perfect
    const list = lacks.length === 1 ? lacks[0] : `${lacks.slice(0, -1).join(', ')} ${w.and} ${lacks[lacks.length - 1]}`
    return fill(w.both, { lacks: list })
  }
  if (!fits[a].fits && !fits[b].fits) return cap(fill(w.neither, { a: negative(people[a], fits[a]), b: negative(people[b], fits[b]) }))
  const ok = fits[a].fits ? a : b
  const no = ok === a ? b : a
  return cap(fill(w.but, { good: positive(people[ok], fits[ok]), bad: negative(people[no], fits[no]) }))
}

const TILE = 256
function pixel(lat: number, lon: number, z: number) {
  const size = TILE * 2 ** z
  const sin = Math.sin((lat * Math.PI) / 180)
  return { x: ((lon + 180) / 360) * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size }
}

function fit(points: { lat: number; lon: number }[], width: number, height: number) {
  const lats = points.map((p) => p.lat)
  const lons = points.map((p) => p.lon)
  const center = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 }
  if (!width) return { center, zoom: 13 }
  for (let z = 16; z >= 10; z--) {
    const a = pixel(Math.max(...lats), Math.min(...lons), z)
    const b = pixel(Math.min(...lats), Math.max(...lons), z)
    if (b.x - a.x <= width - 60 && b.y - a.y <= height - 56) return { center, zoom: z }
  }
  return { center, zoom: 10 }
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

const C = { midnight: '#06213f', deep: '#0b2d52', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8', cut: '#d9654b' }
const BOTH = '#2fb37a'

function Face({ p, size = 34 }: { p: Person; size?: number }) {
  return (
    <span className="face" style={{ background: p.color, width: size, height: size, fontSize: size * 0.42 }}>
      {p.name[0]}
    </span>
  )
}

function Takes({ id, people, takeOf, w }: { id: string; people: Person[]; takeOf: (home: string, person: string) => Take | undefined; w: any }) {
  const given = people.map((p) => ({ p, t: takeOf(id, p.id) })).filter((x) => x.t?.verdict)
  if (!given.length) return null
  return (
    <div className="takes">
      {given.map(({ p, t }) => (
        <span key={p.id} className={`take ${t!.verdict}`}>
          <Face p={p} size={18} />
          {w.verdict[t!.verdict!]}
        </span>
      ))}
    </div>
  )
}

/** A note field that saves when the person leaves it or presses Enter. */
function NoteField({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (note: string) => void }) {
  const save = (el: HTMLInputElement) => el.value.trim() !== value && onSave(el.value.trim())
  return (
    <input
      className="take-input"
      defaultValue={value}
      placeholder={placeholder}
      maxLength={140}
      onBlur={(e) => save(e.currentTarget)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

function Meter({ p, f, w }: { p: Person; f: Fit; w: any }) {
  return (
    <div className={`meter${f.fits ? '' : ' miss'}`} title={`${w.fitsFor} ${p.name}: ${f.score}%`}>
      <span className="m-name">
        <i style={{ background: p.color }} />
        {p.name}
      </span>
      <span className="m-bar">
        <span style={{ width: `${f.score}%`, background: f.fits ? p.color : 'hsl(var(--muted-foreground) / 0.45)' }} />
      </span>
      <span className="m-num">{f.fits ? `${f.score}%` : '✕'}</span>
    </div>
  )
}

export function HomeHunt({ homes, setup, takes: start, seed, translated, words: w }: { homes: Home[]; setup: Setup; takes: HomeHuntTakesStore; seed: HomeHuntTakesStore; translated?: unknown; words: any }) {
  const people = setup.people
  const live = useStore(STORE) as HomeHuntTakesStore | undefined
  const status = useStoreStatus(STORE)
  // Without the store (other builds, previews), show the last saved takes, read-only.
  const open = (status?.status === 'open' || status?.status === 'paused') && live !== undefined
  const canEdit = open && status?.status === 'open' && Boolean(status?.canEdit)
  // Starting notes in the reader's language; display only, edits go to the store as typed.
  const takes = React.useMemo(() => localizeSeed(open ? live : start, seed, translated)?.takes ?? {}, [open, live, start, seed, translated])
  const takeOf = (home: string, person: string) => takes[`${home}-${person}`]
  const setTake = (home: string, person: string, change: Partial<Take>) =>
    edit(STORE, (d: HomeHuntTakesStore) => {
      const id = `${home}-${person}`
      if (d.takes[id]) Object.assign(d.takes[id], change)
      else d.takes[id] = { home, person: person as Take['person'], verdict: null, note: '', ...change }
    })
  const money = (n: number) => `${setup.currency}${n.toLocaleString('en-GB')}`
  const rows = React.useMemo(
    () =>
      homes.map((h) => {
        const fits = people.map((p) => fitFor(h, p))
        const both = fits.every((f) => f.fits)
        const sum = fits.reduce((s, f) => s + f.score, 0)
        return { h, fits, both, sum, sentence: tradeOff(h, people, fits, w.say, money) }
      }),
    [homes, people, w]
  )
  const running = rows.filter((r) => r.h.status !== 'rejected')
  const shortlist = running.filter((r) => r.both).sort((a, b) => b.sum - a.sum).slice(0, 3)
  const rank = new Map(shortlist.map((r, i) => [r.h.id, i + 1]))
  const rejected = rows.filter((r) => r.h.status === 'rejected')
  const viewings = rows.filter((r) => r.h.status === 'viewing').length

  const [filter, setFilter] = React.useState<'all' | 'both' | string>('all')
  const [selected, setSelected] = React.useState<string | null>(null)
  const pick = (id: string) => setSelected((cur) => (cur === id ? null : id))
  const active = rows.find((r) => r.h.id === selected) ?? null

  const mapBox = React.useRef<HTMLDivElement>(null)
  const width = useWidth(mapBox)
  const height = Math.round(Math.min(640, Math.max(360, width * 0.86)))
  const { center, zoom } = fit([...homes, ...setup.places], width, height)

  const tone = (r: (typeof rows)[number]) =>
    r.h.status === 'rejected' ? 'out' : r.both ? 'both' : r.fits.some((f) => f.fits) ? 'one' : 'none'

  const markers = [
    ...rows.map((r) => ({
      lat: r.h.lat,
      lon: r.h.lon,
      title: `${r.h.address}, ${r.h.area}`,
      active: r.h.id === selected,
      onSelect: () => pick(r.h.id),
      label: (
        <span className={`pin ${tone(r)}${r.h.id === selected ? ' on' : ''}`}>
          {rank.has(r.h.id) ? <b>{rank.get(r.h.id)}</b> : null}
          {people.map((p, i) => (
            <i key={p.id} style={r.fits[i].fits ? { background: p.color, borderColor: p.color } : undefined} />
          ))}
        </span>
      ),
    })),
    ...setup.places.map((pl) => {
      const owner = people.find((p) => p.id === pl.person)!
      return {
        lat: pl.lat,
        lon: pl.lon,
        title: pl.name,
        label: (
          <span className="place" style={{ borderColor: owner.color }}>
            <i style={{ background: owner.color }} />
            {pl.name}
          </span>
        ),
      }
    }),
  ]

  const listed = rows.filter((r) => {
    if (r.h.status === 'rejected') return false
    if (filter === 'all') return true
    if (filter === 'both') return r.both
    const i = people.findIndex((p) => p.id === filter)
    return r.fits[i].fits
  })
  const counts: Record<string, number> = {
    all: running.length,
    both: running.filter((r) => r.both).length,
    ...Object.fromEntries(people.map((p, i) => [p.id, running.filter((r) => r.fits[i].fits).length])),
  }

  return (
    <div className="hunt">
      <style>{`
        .hunt { width: min(var(--kunobi-prose-width, 1200px), 100%); margin: 0 auto; box-sizing: border-box; padding: 16px 24px 48px; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
        .hunt-inner { container-type: inline-size; }
        .hunt h1, .hunt h2, .hunt h3 { font-family: Parkinsans, Figtree, sans-serif; letter-spacing: -0.02em; margin: 0; }
        .head { border-radius: 28px; background: radial-gradient(120% 140% at 10% 0%, ${C.deep} 0%, ${C.midnight} 60%, #031426 100%); color: #fff; padding: clamp(22px, 3.6cqw, 40px); display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: end; }
        .eyebrow { font: 600 13px Figtree, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.65); }
        .head h1 { font-weight: 800; font-size: clamp(30px, 4.6cqw, 52px); line-height: 1.02; margin-top: 8px; }
        .head h1 em { font-style: normal; color: ${C.sun}; }
        .stats { display: flex; gap: 10px; }
        .stat { background: rgba(255,255,255,0.08); border-radius: 18px; padding: 12px 16px; min-width: 92px; }
        .stat b { display: block; font: 800 26px Parkinsans, sans-serif; }
        .stat span { font-size: 13px; color: rgba(255,255,255,0.7); }
        .people { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
        .person { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 22px; padding: 16px 18px; box-shadow: 0 8px 24px rgba(6,33,63,0.06); }
        .p-top { display: flex; align-items: center; gap: 12px; }
        .face { flex: none; border-radius: 999px; display: grid; place-items: center; font: 800 15px Parkinsans, sans-serif; color: ${C.midnight}; }
        .p-name { font: 800 20px Parkinsans, sans-serif; }
        .p-role { font-size: 14px; color: hsl(var(--muted-foreground)); }
        .musts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
        .must { font-size: 13px; padding: 5px 10px; border-radius: 999px; background: hsl(var(--muted)); }
        .must.nice { background: transparent; border: 1px dashed hsl(var(--border)); color: hsl(var(--muted-foreground)); }
        .main { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 16px; margin-top: 16px; align-items: start; }
        .map { position: relative; border-radius: 24px; overflow: hidden; border: 1px solid hsl(var(--border)); background: hsl(var(--muted)); }
        .legend { position: absolute; top: 12px; left: 12px; display: flex; flex-wrap: wrap; gap: 6px; z-index: 2; }
        .legend span { display: inline-flex; align-items: center; gap: 6px; font: 600 12px Figtree, sans-serif; padding: 5px 10px; border-radius: 999px; background: rgba(255,255,255,0.92); color: ${C.midnight}; box-shadow: 0 2px 8px rgba(6,33,63,0.12); }
        .legend i { width: 10px; height: 10px; border-radius: 99px; }
        .pin { display: inline-flex; align-items: center; gap: 3px; padding: 4px 6px; border-radius: 999px; background: #fff; box-shadow: 0 2px 8px rgba(6,33,63,0.28); border: 2px solid #fff; }
        .pin i { width: 9px; height: 9px; border-radius: 99px; border: 2px solid #9aa7b4; background: #fff; box-sizing: border-box; }
        .pin b { font: 800 11px Figtree, sans-serif; color: #fff; background: ${BOTH}; border-radius: 99px; width: 18px; height: 18px; display: grid; place-items: center; margin-right: 1px; }
        .pin.both { border-color: ${BOTH}; }
        .pin.out { opacity: 0.55; }
        .pin.on { transform: scale(1.25); box-shadow: 0 0 0 4px rgba(243,170,8,0.45), 0 4px 12px rgba(6,33,63,0.3); }
        .place { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border-radius: 999px; background: ${C.midnight}; color: #fff; font: 600 11px Figtree, sans-serif; border: 2px solid; white-space: nowrap; }
        .place i { width: 8px; height: 8px; border-radius: 2px; transform: rotate(45deg); }
        .card { position: absolute; left: 12px; bottom: 12px; width: min(440px, calc(100% - 24px)); box-sizing: border-box; z-index: 3; background: hsl(var(--card)); color: hsl(var(--foreground)); border-radius: 20px; padding: 16px 18px; box-shadow: 0 12px 32px rgba(6,33,63,0.28); border: 1px solid hsl(var(--border)); }
        .c-top { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
        .c-addr { font: 800 18px Parkinsans, sans-serif; }
        .c-sub { font-size: 14px; color: hsl(var(--muted-foreground)); margin-top: 2px; }
        .close { all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 99px; display: grid; place-items: center; background: hsl(var(--muted)); font-size: 16px; }
        .c-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
        .c-col h4 { margin: 0 0 6px; font: 600 13px Figtree, sans-serif; display: flex; align-items: center; gap: 6px; }
        .c-col h4 i { width: 9px; height: 9px; border-radius: 99px; }
        .chk { font-size: 12.5px; line-height: 1.3; display: flex; gap: 6px; padding: 2px 0; color: hsl(var(--muted-foreground)); }
        .chk.ok { color: hsl(var(--foreground)); }
        .chk span { width: 14px; flex: none; font-weight: 700; }
        .chk.ok span { color: ${BOTH}; }
        .chk.no.is-must span { color: ${C.cut}; }
        .c-note { margin: 12px 0 0; font-size: 14px; line-height: 1.45; }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .chip { font: 600 12px Figtree, sans-serif; padding: 4px 10px; border-radius: 999px; background: hsl(var(--muted)); }
        .chip.view { background: ${C.sun}; color: ${C.midnight}; }
        .chip.no { background: rgba(217,101,75,0.15); color: ${C.cut}; }
        .side h2 { font-size: 22px; font-weight: 800; }
        .side .sub { font-size: 14px; color: hsl(var(--muted-foreground)); margin: 4px 0 12px; }
        .pick { all: unset; box-sizing: border-box; cursor: pointer; display: block; width: 100%; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 20px; padding: 14px 16px; margin-bottom: 10px; transition: border-color .15s, transform .15s, box-shadow .15s; }
        .pick:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(6,33,63,0.1); }
        .pick.on { border-color: ${C.sun}; box-shadow: 0 0 0 3px rgba(243,170,8,0.25); }
        .pick:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
        .pk-top { display: flex; align-items: center; gap: 10px; }
        .rank { flex: none; width: 28px; height: 28px; border-radius: 99px; background: ${BOTH}; color: #fff; display: grid; place-items: center; font: 800 14px Parkinsans, sans-serif; }
        .pk-addr { font: 800 16px Parkinsans, sans-serif; }
        .pk-sub { font-size: 13px; color: hsl(var(--muted-foreground)); }
        .pk-price { margin-left: auto; font: 800 16px Parkinsans, sans-serif; white-space: nowrap; }
        .pk-price small { font: 400 12px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
        .meters { display: grid; gap: 5px; margin-top: 10px; }
        .meter { display: grid; grid-template-columns: 70px 1fr 40px; align-items: center; gap: 8px; font-size: 13px; }
        .m-name { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
        .m-name i { width: 8px; height: 8px; border-radius: 99px; }
        .m-bar { height: 7px; border-radius: 99px; background: hsl(var(--muted)); overflow: hidden; }
        .m-bar span { display: block; height: 100%; border-radius: 99px; }
        .m-num { text-align: right; font-weight: 700; }
        .meter.miss .m-num { color: ${C.cut}; }
        .why { font-size: 14px; line-height: 1.4; margin-top: 10px; }
        .section { margin-top: 28px; }
        .sec-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
        .sec-head h2 { font-size: 22px; font-weight: 800; }
        .filters { display: flex; flex-wrap: wrap; gap: 6px; }
        .f { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; padding: 7px 13px; border-radius: 999px; background: hsl(var(--muted)); font: 600 14px Figtree, sans-serif; }
        .f small { opacity: 0.6; font-size: 12px; }
        .f i { width: 8px; height: 8px; border-radius: 99px; }
        .f.on { background: ${C.midnight}; color: #fff; }
        .f:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
        .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
        .list .pick { margin: 0; }
        .no-list { display: grid; gap: 8px; }
        .no-row { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.6fr) auto; gap: 14px; align-items: center; padding: 12px 16px; border-radius: 16px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); }
        .no-row.on { border-color: ${C.sun}; }
        .no-row .pk-addr { font-size: 15px; }
        .no-reason { font-size: 14px; }
        .by { font-size: 13px; color: hsl(var(--muted-foreground)); white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
        .how { margin-top: 28px; padding: 16px 18px; border-radius: 20px; background: hsl(var(--muted)); font-size: 14px; line-height: 1.5; }
        .how code { font-size: 13px; background: hsl(var(--card)); padding: 1px 6px; border-radius: 6px; }
        .how q { display: block; margin-top: 6px; font-style: italic; quotes: none; }
        .how q::before, .how q::after { content: none; }
        .takes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .take { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 3px; border-radius: 999px; font: 600 12px Figtree, sans-serif; background: hsl(var(--muted)); color: hsl(var(--foreground)); }
        .take-edit .take { padding: 3px 10px; }
        .take.keen { background: rgba(47,179,122,0.16); }
        .take.no { background: rgba(217,101,75,0.15); color: ${C.cut}; }
        .take .face { font-size: 9px !important; }
        .take-edit { display: grid; gap: 6px; margin: 2px 0 8px; justify-items: start; }
        .tvs { display: flex; flex-wrap: wrap; gap: 4px; }
        .tv { all: unset; cursor: pointer; padding: 4px 9px; border-radius: 999px; font: 600 12px Figtree, sans-serif; background: hsl(var(--muted)); color: hsl(var(--foreground)); }
        .tv.on.keen { background: ${BOTH}; color: #fff; }
        .tv.on.maybe { background: ${C.sun}; color: ${C.midnight}; }
        .tv.on.no { background: ${C.cut}; color: #fff; }
        .tv:focus-visible, .take-input:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
        .take-input { width: 100%; box-sizing: border-box; font: 400 13px Figtree, sans-serif; padding: 6px 10px; border-radius: 10px; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--foreground)); }
        .take-note { font-size: 13px; line-height: 1.35; color: hsl(var(--muted-foreground)); }
        .saving { margin-left: auto; align-self: center; font: 600 12px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
        @container (max-width: 860px) {
          .main { grid-template-columns: 1fr; }
          .head { grid-template-columns: 1fr; }
        }
        @container (max-width: 560px) {
          .people { grid-template-columns: 1fr; }
          .stats { flex-wrap: wrap; }
          .stat { min-width: 0; flex: 1; }
          .c-cols { grid-template-columns: 1fr; }
          .card { position: relative; left: auto; right: auto; bottom: auto; width: auto; margin: 10px; }
          .no-row { grid-template-columns: 1fr; gap: 4px; }
        }
      `}</style>
      <div className="hunt-inner">
        <header className="head">
          <div>
            <div className="eyebrow">{fill(w.eyebrow, { city: setup.city })}</div>
            <h1>
              {people[0].name} &amp; {people[1].name}
              <em> {w.title}</em>
            </h1>
          </div>
          <div className="stats">
            <div className="stat"><b>{running.length + rejected.length}</b><span>{w.seen}</span></div>
            <div className="stat"><b>{counts.both}</b><span>{w.fitBoth}</span></div>
            <div className="stat"><b>{viewings}</b><span>{w.viewings}</span></div>
          </div>
        </header>

        <div className="people">
          {people.map((p) => (
            <div className="person" key={p.id}>
              <div className="p-top">
                <Face p={p} size={40} />
                <div>
                  <div className="p-name">{p.name}</div>
                  <div className="p-role">{p.role} · {fill(w.withAi, { ai: p.ai })}</div>
                </div>
              </div>
              <div className="musts">
                {p.criteria.map((c) => (
                  <span key={c.id} className={`must${c.must ? '' : ' nice'}`}>{c.label}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="main">
          <div className="map" ref={mapBox}>
            <div className="legend" aria-hidden="true">
              <span><i style={{ background: BOTH }} />{w.legendBoth}</span>
              {people.map((p) => (
                <span key={p.id}><i style={{ background: p.color }} />{fill(w.legendOne, { name: p.name })}</span>
              ))}
            </div>
            {width > 0 && (
              <TileMap center={center} zoom={zoom} markers={markers} style={{ height, aspectRatio: 'auto' }} aria-label={w.mapLabel} />
            )}
            {active && (
              <div className="card">
                <div className="c-top">
                  <div>
                    <div className="c-addr">{active.h.address}</div>
                    <div className="c-sub">
                      {active.h.area} · {money(cost(active.h))} {w.month} · {fill(w.beds, { n: active.h.beds })}
                    </div>
                  </div>
                  {open && !status?.saved && <span className="saving">{w.saving}</span>}
                  <button className="close" onClick={() => setSelected(null)} aria-label={w.close}>×</button>
                </div>
                <div className="c-cols">
                  {people.map((p, i) => (
                    <div className="c-col" key={p.id}>
                      <h4><i style={{ background: p.color }} />{fill(w.forName, { name: p.name })} · {active.fits[i].score}%</h4>
                      {(() => {
                        const t = takeOf(active.h.id, p.id)
                        if (canEdit && active.h.status !== 'rejected')
                          return (
                            <div className="take-edit">
                              <div className="tvs" role="group" aria-label={fill(w.takeOf, { name: p.name })}>
                                {VERDICTS.map((v) => (
                                  <button
                                    key={v}
                                    className={`tv ${v}${t?.verdict === v ? ' on' : ''}`}
                                    aria-pressed={t?.verdict === v}
                                    onClick={() => setTake(active.h.id, p.id, { verdict: v })}
                                  >
                                    {w.verdict[v]}
                                  </button>
                                ))}
                              </div>
                              <NoteField
                                key={`${active.h.id}-${p.id}-${t?.note ?? ''}`}
                                value={t?.note ?? ''}
                                placeholder={fill(w.notePh, { name: p.name })}
                                onSave={(note) => setTake(active.h.id, p.id, { note })}
                              />
                            </div>
                          )
                        if (!t?.verdict && !t?.note) return null
                        return (
                          <div className="take-edit">
                            {t.verdict && <span className={`take ${t.verdict}`}>{w.verdict[t.verdict]}</span>}
                            {t.note && <div className="take-note">“{t.note}”</div>}
                          </div>
                        )
                      })()}
                      {active.fits[i].checks.map(({ c, ok }) => (
                        <div key={c.id} className={`chk ${ok ? 'ok' : 'no'}${c.must ? ' is-must' : ''}`}>
                          <span>{ok ? '✓' : c.must ? '✕' : '–'}</span>
                          {c.label}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <p className="c-note">{active.h.note}</p>
                <div className="chips">
                  {active.h.status === 'viewing' && <span className="chip view">{w.viewing} · {active.h.when}</span>}
                  {active.h.status === 'rejected' && <span className="chip no">{w.saidNo}: {active.h.reason}</span>}
                  <span className="chip">{w.addedBy} {active.h.addedBy}</span>
                </div>
              </div>
            )}
          </div>

          <aside className="side">
            <h2>{w.shortlist}</h2>
            <p className="sub">{w.shortlistSub}</p>
            {shortlist.map((r, i) => (
              <button key={r.h.id} className={`pick${selected === r.h.id ? ' on' : ''}`} onClick={() => pick(r.h.id)}>
                <div className="pk-top">
                  <span className="rank">{i + 1}</span>
                  <div>
                    <div className="pk-addr">{r.h.address}</div>
                    <div className="pk-sub">{r.h.area}{r.h.status === 'viewing' ? ` · ${w.viewing} ${r.h.when}` : ''}</div>
                  </div>
                  <div className="pk-price">{money(cost(r.h))}<small> {w.month}</small></div>
                </div>
                <div className="meters">
                  {people.map((p, j) => <Meter key={p.id} p={p} f={r.fits[j]} w={w} />)}
                </div>
                <div className="why">{r.sentence}</div>
                <Takes id={r.h.id} people={people} takeOf={takeOf} w={w} />
              </button>
            ))}
          </aside>
        </div>

        <section className="section">
          <div className="sec-head">
            <h2>{w.allHomes}</h2>
            <nav className="filters" aria-label={w.allHomes}>
              {(['all', 'both', ...people.map((p) => p.id)] as const).map((k) => {
                const person = people.find((p) => p.id === k)
                return (
                  <button key={k} className={`f${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)} aria-pressed={filter === k}>
                    {person && <i style={{ background: person.color }} />}
                    {k === 'all' ? w.all : k === 'both' ? w.legendBoth : fill(w.legendOne, { name: person!.name })}
                    <small>{counts[k]}</small>
                  </button>
                )
              })}
            </nav>
          </div>
          <div className="list">
            {listed.map((r) => (
              <button key={r.h.id} className={`pick${selected === r.h.id ? ' on' : ''}`} onClick={() => pick(r.h.id)}>
                <div className="pk-top">
                  {rank.has(r.h.id) && <span className="rank">{rank.get(r.h.id)}</span>}
                  <div>
                    <div className="pk-addr">{r.h.address}</div>
                    <div className="pk-sub">{r.h.area} · {fill(w.beds, { n: r.h.beds })}</div>
                  </div>
                  <div className="pk-price">{money(cost(r.h))}</div>
                </div>
                <div className="meters">
                  {people.map((p, j) => <Meter key={p.id} p={p} f={r.fits[j]} w={w} />)}
                </div>
                <div className="why">{r.sentence}</div>
                <Takes id={r.h.id} people={people} takeOf={takeOf} w={w} />
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="sec-head">
            <h2>{w.whyNo}</h2>
          </div>
          <div className="no-list">
            {rejected.map((r) => {
              const by = people.find((p) => p.name === r.h.rejectedBy)
              return (
                <button key={r.h.id} className={`no-row${selected === r.h.id ? ' on' : ''}`} onClick={() => pick(r.h.id)}>
                  <div>
                    <div className="pk-addr">{r.h.address}</div>
                    <div className="pk-sub">{r.h.area} · {money(cost(r.h))} {w.month}</div>
                  </div>
                  <div className="no-reason">{r.h.reason}</div>
                  <span className="by">
                    {by ? <Face p={by} size={22} /> : people.map((p) => <Face key={p.id} p={p} size={22} />)}
                    {fill(w.saidBy, { name: by ? by.name : w.bothOfUs })}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <div className="how">
          {w.how[0]} <code>{w.files.homes}</code> {w.how[1]} <code>{w.files.people}</code>. {w.how[3]}{' '}
          <code>home-hunt/data/takes.json</code>.{canEdit ? ` ${w.how[4]}` : ''} {w.how[2]}
          {w.prompts.map((p: string) => <q key={p}>“{p}”</q>)}
        </div>
      </div>
    </div>
  )
}
