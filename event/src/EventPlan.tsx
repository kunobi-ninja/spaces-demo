import * as React from 'react'
import { useStore, useStoreStatus, edit } from 'kunobi'
import type { EventGuestsStore } from '../types/event-guests.store'

/*
 * The event page: a header, the seating plan with what needs attention, replies and dietary
 * needs, the evening hour by hour, and the budget. Replies, party sizes, diets and tables live
 * in the `event-guests` LiveStore; data/guests.json is its readable copy and the starting data
 * shown read-only where the store cannot open. The evening and budget come from data/event.json.
 */

const STORE = 'event-guests'
type Rsvp = 'yes' | 'maybe' | 'no' | 'none'
type Row = EventGuestsStore['guests'][string]
type Status = { status?: string; canEdit?: boolean; saved?: boolean; reason?: string; actor?: { kind: string; id: string } }

export interface Guest {
  id: string
  name: string
  household: string
  side: string
  rsvp: Rsvp
  /** Seats this reply takes: the guest plus anyone they bring. */
  party: number
  table?: string
  diet: string[]
  /** The diets as stored (the page's own words), for their colours. */
  dietKeys: string[]
  note?: string
  plusOneOf?: string
}

const diets = (diet?: string) => (diet ?? '').split(',').map((d) => d.trim()).filter(Boolean)

/** One guest as shown (`r`, maybe translated), with the diets as stored (`stored`) for their colours. */
const toGuest = (id: string, r: Row, stored: Row = r): Guest => ({
  id,
  name: r.name || '?',
  household: r.household || r.name || id,
  side: r.side || '',
  rsvp: (r.rsvp ?? 'none') as Rsvp,
  party: Math.max(1, r.party ?? 1),
  table: r.table || undefined,
  diet: diets(r.diet),
  dietKeys: diets(stored.diet),
  note: r.note || undefined,
  plusOneOf: r.plusOneOf || undefined,
})

const people = (list: Guest[]) => list.reduce((n, g) => n + g.party, 0)

interface Table { id: string; name: string; seats: number; shape: 'long' | 'round' }
interface Side { id: string; color: string }
interface Step { time: string; what: string; detail: string; who: string }
interface BudgetItem { item: string; planned: number; paid: number; note: string }

export interface EventData {
  title: string
  kind: string
  host: string
  date: string
  today: string
  venue: string
  address: string
  currency: string
  sides: Side[]
  tables: Table[]
  schedule: Step[]
  budget: { total: number; items: BudgetItem[] }
}

const C = { midnight: '#06213f', deep: '#0b2d52', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8', coral: '#e2603f' }
const DIET_COLORS: Record<string, string> = {
  Vegetarian: '#5fb36b',
  Vegan: '#2f8f5b',
  Pescatarian: C.ocean,
  'Gluten-free': C.sun,
  'Lactose-free': '#b07a4f',
  Halal: '#8a6cf0',
  'Nut allergy': C.coral,
}
/** Each shown diet's stored word, so a translated diet keeps its colour. */
const dietKeyMap = (guests: Guest[]) => new Map(guests.flatMap((g) => g.diet.map((d, i): [string, string] => [d, g.dietKeys[i] ?? d])))
const dietColor = (key: string) => DIET_COLORS[key] ?? C.horizon

const DARK_TEXT = new Set([C.sun, C.tide, C.ocean, '#5fb36b'])

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

/** One seat per person: the guest (k = 0), then anyone they bring. */
type Seat = { g: Guest; k: number }
const seatsOf = (list: Guest[]): Seat[] => list.flatMap((g) => Array.from({ length: g.party }, (_, k) => ({ g, k })))

/** Initials, or the first three letters of the first name where two guests share initials. */
function seatLabels(guests: Guest[]) {
  const counts = new Map<string, number>()
  for (const g of guests) counts.set(initials(g.name), (counts.get(initials(g.name)) ?? 0) + 1)
  return new Map(guests.map((g) => [g.id, (counts.get(initials(g.name)) ?? 0) > 1 ? g.name.split(' ')[0].slice(0, 3) : initials(g.name)]))
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

/* ---------- conflicts ---------- */

type Conflict =
  | { kind: 'over'; key: string; table: Table; count: number; ids: string[] }
  | { kind: 'unseated'; key: string; ids: string[] }
  | { kind: 'declined'; key: string; guest: Guest; table: Table; ids: string[] }
  | { kind: 'split'; key: string; household: string; tables: Table[]; ids: string[] }

function findConflicts(guests: Guest[], tables: Table[]): Conflict[] {
  const tableById = new Map(tables.map((t) => [t.id, t]))
  const out: Conflict[] = []
  for (const t of tables) {
    const at = guests.filter((g) => g.table === t.id)
    if (people(at) > t.seats) out.push({ kind: 'over', key: `over-${t.id}`, table: t, count: people(at), ids: at.map((g) => g.id) })
  }
  const unseated = guests.filter((g) => g.rsvp === 'yes' && !g.table)
  if (unseated.length) out.push({ kind: 'unseated', key: 'unseated', ids: unseated.map((g) => g.id) })
  for (const g of guests) {
    const t = g.table ? tableById.get(g.table) : undefined
    if (t && g.rsvp !== 'yes') out.push({ kind: 'declined', key: `declined-${g.id}`, guest: g, table: t, ids: [g.id] })
  }
  const households = new Map<string, Guest[]>()
  for (const g of guests) if (g.rsvp === 'yes' && g.table) households.set(g.household, [...(households.get(g.household) ?? []), g])
  for (const [household, members] of households) {
    const ids = [...new Set(members.map((m) => m.table as string))]
    if (ids.length > 1)
      out.push({ kind: 'split', key: `split-${household}`, household, tables: ids.map((id) => tableById.get(id) as Table), ids: members.map((m) => m.id) })
  }
  return out
}

/* ---------- floor plan geometry (viewBox units) ---------- */

const VIEW = { w: 1000, h: 700 }
const SEAT_R = 19
const LAYOUT: Record<string, { x: number; y: number }> = {
  Head: { x: 455, y: 104 },
  A: { x: 175, y: 292 },
  B: { x: 445, y: 292 },
  C: { x: 175, y: 556 },
  D: { x: 445, y: 556 },
}

function seatPositions(table: Table, count: number) {
  const n = Math.max(table.seats, count)
  const at = LAYOUT[table.id] ?? { x: 500, y: 330 }
  if (table.shape === 'long') {
    const gap = 56
    const start = at.x - ((n - 1) * gap) / 2
    return Array.from({ length: n }, (_, i) => ({ x: start + i * gap, y: at.y - 46 }))
  }
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / n
    return { x: at.x + Math.cos(a) * 90, y: at.y + Math.sin(a) * 90 }
  })
}

/* ---------- the page ---------- */

const EMPTY: EventGuestsStore = { guests: {} }

export function EventPlan({ event, localize, locale, w }: { event: EventData; localize: (data: EventGuestsStore) => EventGuestsStore; locale: string; w: any }) {
  const [selected, setSelected] = React.useState<string | null>(null)
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [active, setActive] = React.useState<string | null>(null)
  const [colourBy, setColourBy] = React.useState<'side' | 'diet'>('side')
  const [refused, setRefused] = React.useState(false)

  // The store when it is open (or paused, read-only); until it opens, no guests and a note saying why.
  const live = useStore(STORE) as EventGuestsStore | undefined
  const status = (useStoreStatus(STORE) ?? {}) as Status
  const open = status.status === 'open' && !!live?.guests
  const paused = status.status === 'paused' && !!live?.guests
  const raw = open || paused ? (live as EventGuestsStore) : EMPTY
  const pending = open || paused ? null : status.status === 'refused' || status.status === 'closed' ? w.unavailable : w.loading
  // Starting guests in the reader's language; display only, edits go to the store as typed.
  const rows = React.useMemo(() => localize(raw).guests, [raw, localize])
  const actor = open ? status.actor : undefined
  const isVisitor = actor?.kind === 'visitor'
  const host = open && !!status.canEdit && !isVisitor
  const answerOwn = open && !!status.canEdit && isVisitor && !!actor?.id
  const saving = open && status.saved === false

  const guests = React.useMemo(
    () => Object.entries(rows ?? {}).map(([id, r]) => toGuest(id, r, raw.guests?.[id])).sort((a, b) => a.id.localeCompare(b.id)),
    [rows, raw],
  )

  const send = (change: (d: EventGuestsStore) => void) => {
    Promise.resolve(edit(STORE, change as any))
      .then((r: any) => setRefused(!!r?.status && !['applied', 'unchanged', 'duplicate'].includes(r.status)))
      .catch(() => setRefused(true))
  }
  const update = (id: string, patch: Partial<Row>) => send((d) => void (d.guests[id] = { ...d.guests[id], ...patch }))
  const answerMine = (patch: Partial<Row>) => {
    if (!actor?.id) return
    const id = actor.id
    send((d) => void (d.guests[id] = { household: patch.name ?? '', side: '', table: '', diet: '', note: '', plusOneOf: '', ...d.guests[id], ...patch }))
  }

  const byId = React.useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests])
  const sideColor = React.useMemo(() => new Map(event.sides.map((s) => [s.id, s.color])), [event.sides])
  const conflicts = React.useMemo(() => findConflicts(guests, event.tables), [guests, event.tables])
  const labels = React.useMemo(() => seatLabels(guests), [guests])
  const seatedBy = (id: string) => guests.filter((g) => g.table === id)

  const yes = guests.filter((g) => g.rsvp === 'yes')
  const coming = people(yes)
  const seatTotal = event.tables.reduce((n, t) => n + t.seats, 0)
  const seatsLeft = Math.max(0, seatTotal - people(guests.filter((g) => g.table && event.tables.some((t) => t.id === g.table))))
  const toGo = days(event.today, event.date)
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: event.currency, maximumFractionDigits: 0 })
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(event.date))

  // Who is in focus: the hovered or selected guest's household, or the guests of the active conflict.
  const focusGuest = hovered ?? selected
  const focus = React.useMemo(() => {
    if (focusGuest) {
      const g = byId.get(focusGuest)
      return g ? new Set(guests.filter((x) => x.household === g.household).map((x) => x.id)) : null
    }
    const c = conflicts.find((x) => x.key === active)
    return c ? new Set(c.ids) : null
  }, [focusGuest, active, conflicts, guests, byId])
  const activeTables = React.useMemo(() => {
    const c = conflicts.find((x) => x.key === active)
    if (!c) return new Set<string>()
    if (c.kind === 'over' || c.kind === 'declined') return new Set([c.table.id])
    if (c.kind === 'split') return new Set(c.tables.map((t) => t.id))
    return new Set<string>()
  }, [active, conflicts])

  const colorOf = (g: Guest) => {
    if (colourBy === 'side') return sideColor.get(g.side) ?? C.horizon
    return g.dietKeys.length ? dietColor(g.dietKeys[0]) : 'hsl(var(--muted))'
  }
  const ink = (fill: string) => (DARK_TEXT.has(fill) ? C.midnight : fill.startsWith('hsl') ? 'hsl(var(--muted-foreground))' : '#fff')

  const select = (id: string) => {
    setActive(null)
    setSelected((s) => (s === id ? null : id))
  }
  const pick = (key: string) => {
    setSelected(null)
    setActive((a) => (a === key ? null : key))
  }

  const conflictText = (c: Conflict) => {
    if (c.kind === 'over') return w.over({ table: c.table.name, count: c.count, seats: c.table.seats })
    if (c.kind === 'unseated') return w.unseated({ count: c.ids.length })
    if (c.kind === 'declined') return w.declined({ name: c.guest.name, table: c.table.name })
    return w.split({ household: c.household, tables: c.tables.map((t) => t.name).join(' & ') })
  }

  const dietKeys = dietKeyMap(guests)
  const dietsUsed = [...new Set(yes.flatMap((g) => g.diet))].sort((a, b) => yes.filter((g) => g.diet.includes(b)).length - yes.filter((g) => g.diet.includes(a)).length)
  const hoveredGuest = hovered ? byId.get(hovered) : null
  const hoveredPos = React.useMemo(() => {
    if (!hoveredGuest?.table) return null
    const t = event.tables.find((x) => x.id === hoveredGuest.table)
    if (!t) return null
    const list = seatsOf(seatedBy(t.id))
    const i = list.findIndex((s) => s.g.id === hoveredGuest.id)
    return seatPositions(t, list.length)[i]
  }, [hoveredGuest, guests])

  const selectedGuest = selected ? byId.get(selected) : null
  const moving = host && selectedGuest ? selectedGuest : null
  const mine = answerOwn && actor ? raw.guests[actor.id] : undefined

  return (
    <div className="ev">
      <style>{STYLE}</style>
      <div className="ev-inner">
        <header className="ev-hero">
          <Confetti />
          <div className="ev-hero-text">
            <div className="ev-kind">{event.kind}</div>
            <h1>{event.title}</h1>
            <div className="ev-when">
              {dateLabel} · {event.venue} · {event.address}
            </div>
          </div>
          <div className="ev-stats">
            <div className="ev-stat">
              <b className="sun">{toGo}</b>
              <span>{w.daysToGo}</span>
            </div>
            <div className="ev-stat">
              <b>
                {coming}
                <small>/{people(guests)}</small>
              </b>
              <span>{w.coming}</span>
            </div>
            <div className="ev-stat">
              <b>
                {seatsLeft}
                <small>/{seatTotal}</small>
              </b>
              <span>{w.seatsLeft}</span>
            </div>
          </div>
        </header>

        <section className="ev-section">
          <div className="ev-head">
            <div>
              <h2>{w.seating}</h2>
              <p>{moving ? w.moveHint({ name: moving.name.split(' ')[0] }) : host ? w.seatingLineHost : w.seatingLine}</p>
            </div>
            <div className="ev-head-right">
              {pending && <span className="ev-saving">{pending}</span>}
              {saving && <span className="ev-saving">{w.saving}</span>}
              {refused && !saving && <span className="ev-saving err">{w.refused}</span>}
              <div className="ev-toggle" role="group" aria-label={w.colourBy}>
                <span>{w.colourBy}</span>
                {(['side', 'diet'] as const).map((k) => (
                  <button key={k} className={colourBy === k ? 'on' : ''} aria-pressed={colourBy === k} onClick={() => setColourBy(k)}>
                    {w[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ev-seating">
            <div className="ev-plan-wrap">
              <div className="ev-plan">
                <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label={w.seating} onClick={() => { setSelected(null); setActive(null) }}>
                  <defs>
                    <pattern id="ev-floor" width="22" height="22" patternUnits="userSpaceOnUse">
                      <path d="M0 22 L22 0" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.6" />
                    </pattern>
                  </defs>
                  <rect x="8" y="8" width={VIEW.w - 16} height={VIEW.h - 16} rx="30" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="2" />
                  {/* garden doors on the left wall */}
                  <line x1="8" y1="392" x2="8" y2="456" stroke={C.tide} strokeWidth="6" strokeLinecap="round" />
                  <text x="24" y="429" className="ev-room" textAnchor="start">{w.doorHint}</text>
                  {/* dance floor, bar and cake */}
                  <rect x="660" y="210" width="300" height="290" rx="22" fill="url(#ev-floor)" stroke="hsl(var(--border))" strokeDasharray="6 6" />
                  <text x="810" y="362" className="ev-room big" textAnchor="middle">{w.dance}</text>
                  <rect x="660" y="560" width="300" height="96" rx="18" fill="hsl(var(--muted))" />
                  <text x="810" y="614" className="ev-room big" textAnchor="middle">{w.bar}</text>
                  <circle cx="880" cy="104" r="34" fill="hsl(var(--muted))" />
                  <circle cx="880" cy="104" r="16" fill="none" stroke={C.sun} strokeWidth="3" />
                  <text x="880" y="160" className="ev-room" textAnchor="middle">{w.cake}</text>

                  {event.tables.map((t) => {
                    const list = seatsOf(seatedBy(t.id))
                    const pos = seatPositions(t, list.length)
                    const at = LAYOUT[t.id] ?? { x: 500, y: 330 }
                    const over = list.length > t.seats
                    const hot = activeTables.has(t.id)
                    const target = moving && moving.table !== t.id
                    return (
                      <g
                        key={t.id}
                        className={`ev-table${hot ? ' hot' : ''}${target ? ' target' : ''}`}
                        onClick={target ? (e) => { e.stopPropagation(); update(moving.id, { table: t.id }) } : undefined}
                      >
                        {t.shape === 'long' ? (
                          <rect x={at.x - ((pos.length - 1) * 56) / 2 - 34} y={at.y - 22} width={(pos.length - 1) * 56 + 68} height="44" rx="14" className={`ev-top${over ? ' over' : ''}`} />
                        ) : (
                          <circle cx={at.x} cy={at.y} r="56" className={`ev-top${over ? ' over' : ''}`} />
                        )}
                        <text x={at.x} y={t.shape === 'long' ? at.y + 6 : at.y - 2} textAnchor="middle" className="ev-tname">
                          {t.shape === 'long' ? t.name : t.id}
                        </text>
                        <text x={at.x} y={t.shape === 'long' ? at.y + 52 : at.y + 20} textAnchor="middle" className={`ev-tcount${over ? ' over' : ''}`}>
                          {list.length}/{t.seats}
                        </text>
                        {pos.map((p, i) => {
                          const seat = list[i]
                          const extra = i >= t.seats
                          if (!seat) return <circle key={i} cx={p.x} cy={p.y} r={SEAT_R - 3} className="ev-empty" />
                          const { g, k } = seat
                          const declined = g.rsvp !== 'yes'
                          const fill = declined ? 'hsl(var(--muted))' : colorOf(g)
                          const dim = focus && !focus.has(g.id)
                          const isSel = selected === g.id
                          return (
                            <g
                              key={`${g.id}-${k}`}
                              className={`ev-seat${dim ? ' dim' : ''}${isSel ? ' sel' : ''}${k ? ' with' : ''}`}
                              role="button"
                              tabIndex={k ? -1 : 0}
                              aria-label={k ? `${g.name} +${k}` : g.name}
                              onClick={(e) => { e.stopPropagation(); select(g.id) }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(g.id) } }}
                              onPointerEnter={() => setHovered(g.id)}
                              onPointerLeave={() => setHovered((h) => (h === g.id ? null : h))}
                            >
                              {focus && focus.has(g.id) && <circle cx={p.x} cy={p.y} r={SEAT_R + 6} className="ev-halo" />}
                              <circle cx={p.x} cy={p.y} r={SEAT_R} fill={fill} className={`ev-dot${declined ? ' declined' : ''}${extra ? ' extra' : ''}`} />
                              <text x={p.x} y={p.y + 4.5} textAnchor="middle" className="ev-ini" fill={declined ? 'hsl(var(--muted-foreground))' : ink(fill)}>
                                {k ? `+${k}` : labels.get(g.id)}
                              </text>
                              {declined && <line x1={p.x - 13} y1={p.y + 13} x2={p.x + 13} y2={p.y - 13} stroke={C.coral} strokeWidth="2.5" strokeLinecap="round" />}
                              {!k && colourBy === 'side' && g.diet.length > 0 && !declined && <circle cx={p.x + 14} cy={p.y - 14} r="5.5" fill={dietColor(g.dietKeys[0])} stroke="hsl(var(--card))" strokeWidth="2" />}
                            </g>
                          )
                        })}
                      </g>
                    )
                  })}
                </svg>
                {hoveredGuest && hoveredPos && (
                  <div className="ev-tip" style={{ left: `${(hoveredPos.x / VIEW.w) * 100}%`, top: `${(hoveredPos.y / VIEW.h) * 100}%` }}>
                    <b>
                      {hoveredGuest.name}
                      {hoveredGuest.party > 1 ? ` +${hoveredGuest.party - 1}` : ''}
                    </b>
                    <span>
                      {w.rsvp[hoveredGuest.rsvp]}
                      {hoveredGuest.diet.length ? ` · ${hoveredGuest.diet.join(', ')}` : ''}
                    </span>
                  </div>
                )}
              </div>
              <div className="ev-legend">
                {colourBy === 'side'
                  ? event.sides.map((s) => (
                      <span key={s.id}>
                        <i style={{ background: s.color }} />
                        {w.sides?.[s.id] ?? s.id}
                      </span>
                    ))
                  : [...dietsUsed.map((d) => (
                      <span key={d}>
                        <i style={{ background: dietColor(dietKeys.get(d) ?? d) }} />
                        {d}
                      </span>
                    )), (
                      <span key="none">
                        <i className="muted" />
                        {w.none}
                      </span>
                    )]}
              </div>
              {/* On a narrow screen the room becomes one card per table. */}
              <div className="ev-cards">
                {event.tables.map((t) => {
                  const list = seatedBy(t.id)
                  const used = people(list)
                  const over = used > t.seats
                  const target = moving && moving.table !== t.id
                  return (
                    <div key={t.id} className={`ev-tcard${over ? ' over' : ''}`}>
                      <div className="ev-tcard-head">
                        <b>{t.name}</b>
                        <span>{used}/{t.seats}</span>
                      </div>
                      <div className="ev-chips">
                        {list.map((g) => (
                          <button key={g.id} className={`ev-chip${g.rsvp !== 'yes' ? ' declined' : ''}${selected === g.id ? ' sel' : ''}`} onClick={() => select(g.id)}>
                            <i style={{ background: g.rsvp === 'yes' ? colorOf(g) : 'hsl(var(--muted))' }} />
                            {g.name}
                            {g.party > 1 ? ` +${g.party - 1}` : ''}
                          </button>
                        ))}
                        {target && (
                          <button className="ev-chip ev-seat-here" onClick={() => update(moving.id, { table: t.id })}>
                            {w.seatHere({ name: moving.name.split(' ')[0] })}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <aside className="ev-panel">
              {answerOwn && !selectedGuest && <MyReply key={actor?.id} row={mine} onSend={answerMine} w={w} />}
              {selectedGuest ? (
                <GuestCard
                  g={selectedGuest}
                  guests={guests}
                  tables={event.tables}
                  color={sideColor.get(selectedGuest.side) ?? C.horizon}
                  w={w}
                  host={host}
                  onChange={(patch) => update(selectedGuest.id, patch)}
                  onClose={() => setSelected(null)}
                  onPick={select}
                />
              ) : (
                <>
                  <div className="ev-card">
                    <h3>
                      {w.attention}
                      {conflicts.length > 0 && <em>{conflicts.length}</em>}
                    </h3>
                    {conflicts.length === 0 && <p className="ev-muted">{pending ?? w.allGood}</p>}
                    <ul className="ev-conflicts">
                      {conflicts.map((c) => (
                        <li key={c.key}>
                          <button className={active === c.key ? 'on' : ''} onClick={() => pick(c.key)} aria-pressed={active === c.key}>
                            <i className={c.kind} />
                            <span>{conflictText(c)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="ev-card">
                    <h3>{w.notSeated}</h3>
                    <div className="ev-chips">
                      {yes.filter((g) => !g.table).map((g) => (
                        <button key={g.id} className="ev-chip" onClick={() => select(g.id)}>
                          <i style={{ background: sideColor.get(g.side) ?? C.horizon }} />
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </aside>
          </div>
        </section>

        <section className="ev-grid2">
          <Replies guests={guests} w={w} host={host} pending={pending} onAnswer={(id, rsvp) => update(id, { rsvp })} onPick={select} />
          <Caterer guests={yes} w={w} />
        </section>

        <section className="ev-grid2">
          <div className="ev-card big">
            <h2>{w.evening}</h2>
            <ol className="ev-show">
              {event.schedule.map((s) => (
                <li key={s.time}>
                  <time>{s.time}</time>
                  <div>
                    <b>{s.what}</b>
                    <span>{s.detail}</span>
                    <small>{s.who}</small>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <Budget budget={event.budget} money={money} coming={coming} w={w} />
        </section>

        <footer className="ev-change">
          <b>{w.change}</b>
          <span>{w.changeLine}</span>
          <div className="ev-prompts">
            {w.prompts.map((p: string) => (
              <code key={p}>{p}</code>
            ))}
          </div>
          <span className="ev-muted small">{w.linkLine}</span>
        </footer>
      </div>
    </div>
  )
}

/* ---------- parts ---------- */

const ANSWERS: Rsvp[] = ['yes', 'maybe', 'no', 'none']

function Answer({ value, onPick, w, choices = ANSWERS, disabled }: { value: Rsvp; onPick: (r: Rsvp) => void; w: any; choices?: Rsvp[]; disabled?: boolean }) {
  return (
    <div className="ev-seg" role="group" aria-label={w.answer} style={{ gridTemplateColumns: `repeat(${choices.length === 3 ? 3 : 2}, 1fr)` }}>
      {choices.map((r) => (
        <button key={r} className={`${r}${value === r ? ' on' : ''}`} aria-pressed={value === r} disabled={disabled} onClick={() => value !== r && onPick(r)}>
          {w.rsvp[r]}
        </button>
      ))}
    </div>
  )
}

function Stepper({ value, onChange, w }: { value: number; onChange: (n: number) => void; w: any }) {
  return (
    <div className="ev-step" role="group" aria-label={w.party}>
      <button aria-label="−" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        −
      </button>
      <b>{value}</b>
      <button aria-label="+" disabled={value >= 8} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  )
}

/** A text field that saves when it loses focus or on Enter, not on every key. */
function DietField({ value, onSave, w }: { value: string; onSave: (v: string) => void; w: any }) {
  const [text, setText] = React.useState(value)
  React.useEffect(() => setText(value), [value])
  return (
    <input
      className="ev-input"
      value={text}
      placeholder={w.dietHint}
      aria-label={w.diet}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== value && onSave(text.trim())}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

function GuestCard({ g, guests, tables, color, w, host, onChange, onClose, onPick }: { g: Guest; guests: Guest[]; tables: Table[]; color: string; w: any; host: boolean; onChange: (patch: Partial<Row>) => void; onClose: () => void; onPick: (id: string) => void }) {
  const table = tables.find((t) => t.id === g.table)
  const family = guests.filter((x) => x.household === g.household && x.id !== g.id)
  const free = (t: Table) => t.seats - people(guests.filter((x) => x.table === t.id))
  return (
    <div className="ev-card ev-guest">
      <button className="ev-close" onClick={onClose} aria-label={w.close}>
        ×
      </button>
      <div className="ev-guest-head">
        <span className="ev-avatar" style={{ background: color, color: DARK_TEXT.has(color) ? C.midnight : '#fff' }}>
          {initials(g.name)}
        </span>
        <div>
          <b>{g.name}</b>
          <span className="ev-muted">{g.side ? (w.sides?.[g.side] ?? g.side) : w.fromLink}</span>
        </div>
      </div>
      {host ? (
        <div className="ev-form">
          <Answer value={g.rsvp} onPick={(rsvp) => onChange({ rsvp })} w={w} />
          <div className="ev-row">
            <span className="ev-label">{w.party}</span>
            <Stepper value={g.party} onChange={(party) => onChange({ party })} w={w} />
          </div>
          <div>
            <span className="ev-label">{w.table}</span>
            <div className="ev-tables">
              {tables.map((t) => (
                <button key={t.id} className={g.table === t.id ? 'on' : ''} aria-pressed={g.table === t.id} onClick={() => g.table !== t.id && onChange({ table: t.id })}>
                  {t.id}
                  <small>{Math.max(0, free(t))}</small>
                </button>
              ))}
              <button className={!g.table ? 'on' : ''} aria-pressed={!g.table} onClick={() => g.table && onChange({ table: '' })}>
                {w.noSeat}
              </button>
            </div>
          </div>
          <div>
            <span className="ev-label">{w.diet}</span>
            <DietField key={g.id} value={g.diet.join(', ')} onSave={(diet) => onChange({ diet })} w={w} />
          </div>
        </div>
      ) : (
        <div className="ev-pills">
          <span className={`ev-rsvp ${g.rsvp}`}>{w.rsvp[g.rsvp]}</span>
          <span className="ev-pill">{table ? table.name : w.noTable}</span>
          {g.party > 1 && <span className="ev-pill">{w.withMore({ count: g.party - 1 })}</span>}
          {g.diet.map((d, i) => (
            <span key={d} className="ev-pill dot">
              <i style={{ background: dietColor(g.dietKeys[i] ?? d) }} />
              {d}
            </span>
          ))}
        </div>
      )}
      {g.note && <p className="ev-note">{g.note}</p>}
      {g.plusOneOf && (
        <p className="ev-muted">
          {w.plusOneOf} {g.plusOneOf}
        </p>
      )}
      {family.length > 0 && (
        <div className="ev-family">
          <span className="ev-label">
            {w.household} · {g.household}
          </span>
          {family.map((m) => {
            const t = tables.find((x) => x.id === m.table)
            return (
              <button key={m.id} onClick={() => onPick(m.id)}>
                <span>{m.name}</span>
                <span className="ev-muted">{m.rsvp === 'yes' ? (t ? t.name : w.noTable) : w.rsvp[m.rsvp]}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** For a guest on a shared link: their own reply, the only row they may change. */
function MyReply({ row, onSend, w }: { row?: Row; onSend: (patch: Partial<Row>) => void; w: any }) {
  const [name, setName] = React.useState(row?.name ?? '')
  const ready = name.trim().length > 0
  const rsvp = (row?.rsvp ?? 'none') as Rsvp
  const party = row?.party ?? 1
  return (
    <div className="ev-card ev-mine">
      <h3>{w.yourReply}</h3>
      <div className="ev-form">
        <input
          className="ev-input"
          value={name}
          placeholder={w.yourName}
          aria-label={w.yourName}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => ready && row && name.trim() !== row.name && onSend({ name: name.trim() })}
        />
        <Answer value={rsvp} choices={['yes', 'maybe', 'no']} disabled={!ready} onPick={(r) => onSend({ name: name.trim(), rsvp: r, party })} w={w} />
        {row && (
          <>
            <div className="ev-row">
              <span className="ev-label">{w.party}</span>
              <Stepper value={party} onChange={(n) => onSend({ party: n })} w={w} />
            </div>
            <DietField value={row.diet ?? ''} onSave={(diet) => onSend({ diet })} w={w} />
          </>
        )}
        {!ready && <span className="ev-muted small">{w.nameFirst}</span>}
      </div>
    </div>
  )
}

function Replies({ guests, w, host, pending, onAnswer, onPick }: { guests: Guest[]; w: any; host: boolean; pending: string | null; onAnswer: (id: string, r: Rsvp) => void; onPick: (id: string) => void }) {
  const order = ['yes', 'maybe', 'no', 'none'] as const
  const colors = { yes: C.tide, maybe: C.sun, no: 'hsl(var(--muted-foreground))', none: 'hsl(var(--border))' }
  const count = (k: string) => people(guests.filter((g) => g.rsvp === k))
  const waiting = guests.filter((g) => g.rsvp === 'maybe' || g.rsvp === 'none')
  return (
    <div className="ev-card big">
      <div className="ev-card-title">
        <h2>{w.replies}</h2>
        <span className="ev-muted">{w.repliesLine({ count: people(guests) })}</span>
      </div>
      <div className="ev-replies">
        {order.map((k) => (
          <div key={k}>
            <b>{count(k)}</b>
            <span>
              <i style={{ background: colors[k] }} />
              {w.rsvp[k]}
            </span>
          </div>
        ))}
      </div>
      <div className="ev-bar">
        {order.map((k) => (
          <i key={k} style={{ flex: count(k), background: colors[k] }} />
        ))}
      </div>
      <h3 className="ev-sub">{w.waiting}</h3>
      {waiting.length === 0 ? (
        <p className="ev-muted">{pending ?? w.waitingNone}</p>
      ) : (
        <ul className={`ev-list${host ? ' host' : ''}`}>
          {waiting.map((g) => (
            <li key={g.id}>
              <span className={`ev-rsvp ${g.rsvp}`}>{w.rsvp[g.rsvp]}</span>
              <button className="ev-name" onClick={() => onPick(g.id)}>
                {g.name}
              </button>
              <span className="ev-muted">{g.note ?? (w.sides?.[g.side] ?? g.side)}</span>
              {host && (
                <span className="ev-quick">
                  <button className="yes" onClick={() => onAnswer(g.id, 'yes')}>
                    {w.rsvp.yes}
                  </button>
                  <button className="no" onClick={() => onAnswer(g.id, 'no')}>
                    {w.rsvp.no}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Caterer({ guests, w }: { guests: Guest[]; w: any }) {
  const byDiet = new Map<string, Guest[]>()
  for (const g of guests) for (const d of g.diet) byDiet.set(d, [...(byDiet.get(d) ?? []), g])
  const keys = dietKeyMap(guests)
  const rows = [...byDiet.entries()].sort((a, b) => b[1].length - a[1].length)
  const plates = people(guests)
  const standard = plates - guests.filter((g) => g.diet.length > 0).length
  return (
    <div className="ev-card big">
      <div className="ev-card-title">
        <h2>{w.caterer}</h2>
        <span className="ev-big">
          {plates} <small>{w.dinners}</small>
        </span>
      </div>
      <ul className="ev-diets">
        <li>
          <i className="muted" />
          <b>{w.standard}</b>
          <span className="ev-names" />
          <span className="ev-count">{standard}</span>
        </li>
        {rows.map(([d, list]) => (
          <li key={d} className={/allerg/i.test(keys.get(d) ?? d) ? 'alert' : ''}>
            <i style={{ background: dietColor(keys.get(d) ?? d) }} />
            <b>{d}</b>
            <span className="ev-names">{list.map((g) => g.name.split(' ')[0]).join(', ')}</span>
            <span className="ev-count">{list.length}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Budget({ budget, money, coming, w }: { budget: EventData['budget']; money: Intl.NumberFormat; coming: number; w: any }) {
  const planned = budget.items.reduce((n, i) => n + i.planned, 0)
  const paid = budget.items.reduce((n, i) => n + i.paid, 0)
  return (
    <div className="ev-card big">
      <div className="ev-card-title">
        <h2>{w.budget}</h2>
        <span className="ev-muted">
          {money.format(Math.round(planned / Math.max(1, coming)))} {w.perGuest}
        </span>
      </div>
      <div className="ev-money">
        <div>
          <span>{w.planned}</span>
          <b>{money.format(planned)}</b>
        </div>
        <div>
          <span>{w.paid}</span>
          <b className="tide">{money.format(paid)}</b>
        </div>
        <div>
          <span>{w.leftToPay}</span>
          <b>{money.format(planned - paid)}</b>
        </div>
      </div>
      <ul className="ev-items">
        {budget.items.map((i) => (
          <li key={i.item}>
            <div className="ev-item-top">
              <b>{i.item}</b>
              <span>
                {money.format(i.paid)} <span className="ev-muted">/ {money.format(i.planned)}</span>
              </span>
            </div>
            <div className="ev-track">
              <i style={{ width: `${(i.paid / i.planned) * 100}%` }} />
            </div>
            <span className="ev-muted small">{i.note}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A few still flecks of colour in the header, placed from a fixed seed so every render matches. */
function Confetti() {
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const colors = [C.sun, C.ocean, C.tide, '#ffffff', C.sun]
  const bits = Array.from({ length: 46 }, () => {
    const x = 380 + rnd() * 840
    return { x, y: rnd() * 300, s: 3 + rnd() * 5, c: colors[Math.floor(rnd() * colors.length)], rot: rnd() * 180, kind: rnd(), fade: Math.min(1, (x - 380) / 420) }
  })
  return (
    <svg className="ev-confetti" viewBox="0 0 1200 300" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      {bits.map((b, i) =>
        b.kind > 0.6 ? (
          <rect key={i} x={b.x} y={b.y} width={b.s * 2.2} height={b.s * 0.9} rx="1" fill={b.c} opacity={0.1 + 0.32 * b.fade} transform={`rotate(${b.rot} ${b.x} ${b.y})`} />
        ) : b.kind > 0.25 ? (
          <circle key={i} cx={b.x} cy={b.y} r={b.s * 0.55} fill={b.c} opacity={0.1 + 0.3 * b.fade} />
        ) : (
          <path key={i} d={`M${b.x} ${b.y} q ${b.s} ${-b.s} ${b.s * 2} 0 t ${b.s * 2} 0`} fill="none" stroke={b.c} strokeWidth="1.6" strokeLinecap="round" opacity={0.1 + 0.3 * b.fade} transform={`rotate(${b.rot} ${b.x} ${b.y})`} />
        )
      )}
    </svg>
  )
}

const STYLE = `
.ev { width: min(var(--kunobi-prose-width, 1200px), 100%); margin: 0 auto; box-sizing: border-box; padding: 16px 24px 48px; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
.ev-inner { container-type: inline-size; display: flex; flex-direction: column; gap: 22px; }
.ev h1, .ev h2, .ev h3, .ev-stat b, .ev-big, .ev-replies b, .ev-money b, .ev-tname { font-family: Parkinsans, Figtree, system-ui, sans-serif; letter-spacing: -0.02em; }
.ev h2 { font-size: 22px; font-weight: 800; margin: 0; }
.ev h3 { font-size: 16px; font-weight: 600; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
.ev h3 em { font-style: normal; font: 700 12px Figtree, sans-serif; background: ${C.coral}; color: #fff; border-radius: 99px; padding: 2px 8px; }
.ev p { margin: 4px 0 0; }
.ev-muted { color: hsl(var(--muted-foreground)); font-size: 14px; }
.ev-muted.small { font-size: 12.5px; }

.ev-hero { position: relative; overflow: hidden; border-radius: 28px; padding: clamp(22px, 4cqw, 40px) clamp(22px, 4cqw, 44px); background: radial-gradient(120% 160% at 10% 0%, ${C.deep} 0%, ${C.midnight} 55%, #031426 100%); color: #fff; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 20px; }
.ev-confetti { position: absolute; inset: 0; width: 100%; height: 100%; }
.ev-hero > *:not(.ev-confetti) { position: relative; }
.ev-kind { font: 600 13px Figtree, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: ${C.sun}; }
.ev-hero h1 { font-weight: 800; font-size: clamp(32px, 5.4cqw, 58px); line-height: 1; margin: 8px 0 10px; }
.ev-when { color: rgba(255,255,255,0.78); font-size: clamp(14px, 1.5cqw, 16px); }
.ev-stats { display: flex; gap: 10px; flex-wrap: wrap; }
.ev-stat { min-width: 104px; padding: 12px 16px; border-radius: 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 2px; }
.ev-stat b { font-size: 30px; font-weight: 800; line-height: 1; }
.ev-stat b small { font-size: 15px; opacity: 0.6; font-weight: 600; }
.ev-stat b.sun { color: ${C.sun}; }
.ev-stat span { font-size: 12.5px; color: rgba(255,255,255,0.7); }

.ev-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.ev-head p { color: hsl(var(--muted-foreground)); font-size: 15px; }
.ev-toggle { display: inline-flex; align-items: center; gap: 2px; padding: 3px 3px 3px 12px; border-radius: 99px; background: hsl(var(--muted)); font-size: 13px; color: hsl(var(--muted-foreground)); }
.ev-toggle span { margin-right: 6px; }
.ev-toggle button { all: unset; cursor: pointer; padding: 6px 14px; border-radius: 99px; font: 600 14px Figtree, sans-serif; color: hsl(var(--foreground)); }
.ev-toggle button.on { background: ${C.midnight}; color: #fff; }
.ev-toggle button:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }

.ev-seating { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
.ev-plan { position: relative; }
.ev-plan svg { display: block; width: 100%; height: auto; }
.ev-room { font: 600 14px Figtree, sans-serif; fill: hsl(var(--muted-foreground)); }
.ev-room.big { font-size: 17px; }
.ev-top { fill: hsl(var(--muted)); stroke: hsl(var(--border)); stroke-width: 2; transition: stroke .2s; }
.ev-top.over { stroke: ${C.coral}; stroke-width: 3; stroke-dasharray: 7 5; }
.ev-table.hot .ev-top { stroke: ${C.sun}; stroke-width: 4; stroke-dasharray: none; }
.ev-tname { font-size: 22px; font-weight: 800; fill: hsl(var(--foreground)); }
.ev-table text.ev-tname { font-size: 22px; }
.ev-tcount { font: 600 14px Figtree, sans-serif; fill: hsl(var(--muted-foreground)); }
.ev-tcount.over { fill: ${C.coral}; font-weight: 700; }
.ev-empty { fill: none; stroke: hsl(var(--border)); stroke-width: 2; stroke-dasharray: 4 4; }
.ev-seat { cursor: pointer; transition: opacity .2s; outline: none; }
.ev-seat.dim { opacity: 0.22; }
.ev-dot { stroke: hsl(var(--card)); stroke-width: 3; }
.ev-dot.declined { stroke: ${C.coral}; stroke-width: 2; stroke-dasharray: 4 3; }
.ev-dot.extra { stroke: ${C.coral}; stroke-width: 3.5; }
.ev-seat.sel .ev-dot, .ev-seat:focus-visible .ev-dot { stroke: ${C.midnight}; stroke-width: 4; }
.ev-halo { fill: none; stroke: ${C.sun}; stroke-width: 3; opacity: 0.9; }
.ev-ini { font: 700 13px Figtree, sans-serif; pointer-events: none; }
.ev-tip { position: absolute; transform: translate(-50%, calc(-100% - 26px)); pointer-events: none; background: ${C.midnight}; color: #fff; padding: 8px 12px; border-radius: 12px; font-size: 13px; white-space: nowrap; display: flex; flex-direction: column; gap: 1px; box-shadow: 0 10px 24px rgba(6,33,63,0.25); }
.ev-tip span { color: rgba(255,255,255,0.75); font-size: 12px; }
.ev-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 13px; color: hsl(var(--muted-foreground)); }
.ev-legend span { display: inline-flex; align-items: center; gap: 6px; }
.ev-legend i, .ev-diets i { width: 10px; height: 10px; border-radius: 99px; display: inline-block; flex: none; }
.ev-legend i.muted, .ev-diets i.muted { background: hsl(var(--muted)); box-shadow: inset 0 0 0 1px hsl(var(--border)); }
.ev-cards { display: none; }

.ev-panel { display: flex; flex-direction: column; gap: 12px; }
.ev-card { position: relative; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 22px; padding: 18px 18px; box-shadow: 0 8px 24px rgba(6, 33, 63, 0.05); }
.ev-card.big { padding: 22px 24px; }
.ev-card-title { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.ev-conflicts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ev-conflicts button { all: unset; cursor: pointer; box-sizing: border-box; width: 100%; display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 14px; background: hsl(var(--muted)); font-size: 14px; line-height: 1.35; }
.ev-conflicts button.on { background: ${C.midnight}; color: #fff; }
.ev-conflicts button:focus-visible { outline: 2px solid ${C.horizon}; }
.ev-conflicts i { flex: none; width: 10px; height: 10px; margin-top: 5px; border-radius: 3px; background: ${C.coral}; }
.ev-conflicts i.unseated { background: ${C.sun}; border-radius: 99px; }
.ev-conflicts i.split { background: ${C.horizon}; }
.ev-conflicts i.declined { background: hsl(var(--muted-foreground)); }
.ev-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ev-chip { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; padding: 6px 11px; border-radius: 99px; background: hsl(var(--muted)); font-size: 13.5px; font-weight: 600; }
.ev-chip i { width: 9px; height: 9px; border-radius: 99px; flex: none; }
.ev-chip.declined { text-decoration: line-through; color: hsl(var(--muted-foreground)); }
.ev-chip.sel { background: ${C.midnight}; color: #fff; }
.ev-chip:focus-visible { outline: 2px solid ${C.horizon}; }

.ev-guest { padding-top: 20px; }
.ev-close { all: unset; cursor: pointer; position: absolute; top: 10px; right: 12px; width: 30px; height: 30px; border-radius: 99px; display: grid; place-items: center; font-size: 20px; color: hsl(var(--muted-foreground)); }
.ev-close:hover { background: hsl(var(--muted)); }
.ev-guest-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.ev-guest-head b { display: block; font: 800 19px Parkinsans, Figtree, sans-serif; letter-spacing: -0.02em; }
.ev-avatar { width: 44px; height: 44px; border-radius: 99px; display: grid; place-items: center; font: 800 16px Parkinsans, sans-serif; flex: none; }
.ev-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.ev-pill { padding: 4px 10px; border-radius: 99px; background: hsl(var(--muted)); font-size: 13px; font-weight: 600; }
.ev-pill.dot { display: inline-flex; align-items: center; gap: 6px; }
.ev-pill.dot i { width: 8px; height: 8px; border-radius: 99px; }
.ev-rsvp { padding: 4px 10px; border-radius: 99px; font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.ev-rsvp.yes { background: rgba(48, 204, 213, 0.18); color: #127f86; }
.ev-rsvp.maybe { background: rgba(243, 170, 8, 0.2); color: #8a5d00; }
.ev-rsvp.no { background: rgba(226, 96, 63, 0.16); color: #a33a1f; }
.ev-rsvp.none { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
.ev-note { font-size: 14.5px; line-height: 1.45; padding: 10px 12px; border-radius: 12px; background: hsl(var(--muted)); }
.ev-family { margin-top: 14px; display: flex; flex-direction: column; gap: 4px; }
.ev-label { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: hsl(var(--muted-foreground)); margin-bottom: 4px; }
.ev-family button { all: unset; cursor: pointer; display: flex; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 12px; font-size: 14px; font-weight: 600; }
.ev-family button:hover { background: hsl(var(--muted)); }

.ev-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.ev-replies { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
.ev-replies div { display: flex; flex-direction: column; gap: 2px; }
.ev-replies b { font-size: 30px; font-weight: 800; line-height: 1; }
.ev-replies span { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: hsl(var(--muted-foreground)); }
.ev-replies i { width: 9px; height: 9px; border-radius: 99px; }
.ev-bar { display: flex; height: 10px; border-radius: 99px; overflow: hidden; gap: 2px; }
.ev-sub { margin-top: 20px !important; }
.ev-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.ev-list li { display: grid; grid-template-columns: 92px 140px 1fr; gap: 10px; align-items: center; padding: 9px 0; border-top: 1px solid hsl(var(--border)); font-size: 14px; }
.ev-list li .ev-rsvp { justify-self: start; }
.ev-big { font-size: 30px; font-weight: 800; }
.ev-big small { font: 600 14px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
.ev-diets { list-style: none; margin: 0; padding: 0; }
.ev-diets li { display: grid; grid-template-columns: 12px 130px 1fr auto; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid hsl(var(--border)); font-size: 14.5px; }
.ev-diets li:first-child { border-top: 0; }
.ev-diets li.alert b { color: ${C.coral}; }
.ev-names { color: hsl(var(--muted-foreground)); font-size: 13.5px; }
.ev-count { font: 800 18px Parkinsans, sans-serif; }

.ev-show { list-style: none; margin: 18px 0 0; padding: 0; position: relative; }
.ev-show::before { content: ''; position: absolute; left: 58px; top: 8px; bottom: 8px; width: 2px; background: hsl(var(--border)); }
.ev-show li { display: grid; grid-template-columns: 50px 1fr; gap: 26px; padding: 0 0 16px; position: relative; }
.ev-show li::after { content: ''; position: absolute; left: 53px; top: 5px; width: 12px; height: 12px; border-radius: 99px; background: hsl(var(--card)); border: 3px solid ${C.sun}; box-sizing: border-box; }
.ev-show time { font: 800 15px Parkinsans, sans-serif; padding-top: 1px; }
.ev-show b { display: block; font-size: 15.5px; }
.ev-show span { display: block; font-size: 14px; color: hsl(var(--muted-foreground)); margin-top: 1px; }
.ev-show small { display: inline-block; margin-top: 5px; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 99px; background: hsl(var(--muted)); }

.ev-money { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; }
.ev-money div { padding: 12px 14px; border-radius: 16px; background: hsl(var(--muted)); display: flex; flex-direction: column; gap: 4px; }
.ev-money span { font-size: 12.5px; color: hsl(var(--muted-foreground)); }
.ev-money b { font-size: 22px; font-weight: 800; }
.ev-money b.tide { color: #127f86; }
.ev-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.ev-item-top { display: flex; justify-content: space-between; gap: 10px; font-size: 14.5px; margin-bottom: 5px; }
.ev-track { height: 8px; border-radius: 99px; background: hsl(var(--muted)); overflow: hidden; margin-bottom: 4px; min-width: 24px; }
.ev-track i { display: block; height: 100%; background: ${C.tide}; border-radius: 99px; }

.ev-change { display: flex; flex-direction: column; gap: 8px; padding: 18px 22px; border-radius: 20px; border: 1px dashed hsl(var(--border)); font-size: 14.5px; }
.ev-change span { color: hsl(var(--muted-foreground)); }
.ev-prompts { display: flex; flex-wrap: wrap; gap: 8px; }
.ev-prompts code { font: 600 13.5px Figtree, sans-serif; padding: 7px 12px; border-radius: 12px; background: hsl(var(--muted)); }

.ev-head-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ev-saving { font-size: 13px; font-weight: 600; color: hsl(var(--muted-foreground)); padding: 5px 10px; border-radius: 99px; background: hsl(var(--muted)); }
.ev-saving.err { color: #a33a1f; background: rgba(226, 96, 63, 0.16); }
.ev-table.target { cursor: pointer; }
.ev-table.target .ev-top { stroke: ${C.horizon}; stroke-dasharray: 6 5; }
.ev-table.target:hover .ev-top { stroke: ${C.sun}; stroke-width: 4; stroke-dasharray: none; }
.ev-seat.with .ev-ini { font-size: 12px; }
.ev-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
.ev-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ev-row .ev-label { margin: 0; }
.ev-seg { display: grid; gap: 4px; padding: 3px; border-radius: 14px; background: hsl(var(--muted)); }
.ev-seg button { all: unset; cursor: pointer; text-align: center; padding: 7px 6px; border-radius: 11px; font: 600 13px Figtree, sans-serif; color: hsl(var(--foreground)); }
.ev-seg button:disabled { opacity: 0.45; cursor: default; }
.ev-seg button.on.yes { background: ${C.tide}; color: ${C.midnight}; }
.ev-seg button.on.maybe { background: ${C.sun}; color: ${C.midnight}; }
.ev-seg button.on.no { background: ${C.coral}; color: #fff; }
.ev-seg button.on.none { background: hsl(var(--card)); box-shadow: inset 0 0 0 1px hsl(var(--border)); }
.ev-seg button:focus-visible, .ev-step button:focus-visible, .ev-tables button:focus-visible, .ev-quick button:focus-visible, .ev-name:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
.ev-step { display: inline-flex; align-items: center; gap: 4px; padding: 3px; border-radius: 99px; background: hsl(var(--muted)); }
.ev-step button { all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 99px; display: grid; place-items: center; font: 700 17px Figtree, sans-serif; background: hsl(var(--card)); }
.ev-step button:disabled { opacity: 0.35; cursor: default; }
.ev-step b { min-width: 26px; text-align: center; font: 800 16px Parkinsans, sans-serif; }
.ev-tables { display: flex; flex-wrap: wrap; gap: 5px; }
.ev-tables button { all: unset; cursor: pointer; display: inline-flex; align-items: baseline; gap: 5px; padding: 6px 11px; border-radius: 11px; background: hsl(var(--muted)); font: 600 13.5px Figtree, sans-serif; }
.ev-tables button small { font-size: 11.5px; color: hsl(var(--muted-foreground)); }
.ev-tables button.on { background: ${C.midnight}; color: #fff; }
.ev-tables button.on small { color: rgba(255,255,255,0.7); }
.ev-input { box-sizing: border-box; width: 100%; padding: 9px 12px; border-radius: 12px; border: 1px solid hsl(var(--border)); background: hsl(var(--background, var(--card))); color: hsl(var(--foreground)); font: 400 14px Figtree, sans-serif; }
.ev-input:focus { outline: 2px solid ${C.horizon}; outline-offset: 0; }
.ev-mine { border-color: ${C.tide}; }
.ev-name { all: unset; cursor: pointer; font-weight: 600; }
.ev-list.host li { grid-template-columns: 92px 130px 1fr auto; }
.ev-quick { display: inline-flex; gap: 4px; }
.ev-quick button { all: unset; cursor: pointer; padding: 4px 9px; border-radius: 99px; font: 600 12.5px Figtree, sans-serif; background: hsl(var(--muted)); white-space: nowrap; }
.ev-quick button.yes:hover { background: rgba(48, 204, 213, 0.25); }
.ev-quick button.no:hover { background: rgba(226, 96, 63, 0.18); }
.ev-seat-here { background: transparent; box-shadow: inset 0 0 0 1.5px ${C.horizon}; color: ${C.horizon}; }

@container (max-width: 980px) {
  .ev-seating { grid-template-columns: 1fr; }
  .ev-panel { display: grid; grid-template-columns: 1fr 1fr; }
}
@container (max-width: 820px) {
  .ev-grid2 { grid-template-columns: 1fr; }
}
@container (max-width: 640px) {
  .ev-plan, .ev-legend { display: none; }
  .ev-cards { display: flex; flex-direction: column; gap: 10px; }
  .ev-tcard { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 18px; padding: 14px; }
  .ev-tcard.over { border-color: ${C.coral}; }
  .ev-tcard-head { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 15px; }
  .ev-tcard-head b { font-family: Parkinsans, sans-serif; }
  .ev-tcard.over .ev-tcard-head span { color: ${C.coral}; font-weight: 700; }
  .ev-panel { display: flex; }
  .ev-replies { grid-template-columns: repeat(2, 1fr); row-gap: 14px; }
  .ev-list li, .ev-list.host li { grid-template-columns: 1fr; gap: 3px; }
  .ev-list li .ev-quick { margin-top: 4px; }
  .ev-diets li { grid-template-columns: 12px 1fr auto; grid-template-areas: 'dot name count' '. names names'; row-gap: 2px; }
  .ev-diets li > i { grid-area: dot; }
  .ev-diets li > b { grid-area: name; }
  .ev-diets li > .ev-names { grid-area: names; }
  .ev-diets li > .ev-count { grid-area: count; }
  .ev-money { grid-template-columns: 1fr; }
  .ev-stats { width: 100%; }
  .ev-stat { flex: 1; min-width: 0; }
}
`
