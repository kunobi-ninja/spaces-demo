import * as React from 'react'
import { edit, useStore, useStoreStatus } from 'kunobi'
import type { ContentCalendarPostsStore } from '../types/content-calendar-posts.store'

/** The posts live in this store; `data/posts.json` is its saved, readable copy. */
export const STORE = 'content-calendar-posts'

/** One planned post, as the page draws it. */
export interface Post {
  id: string
  date: string
  channel: string
  title: string
  owner: string
  status: string
  campaign: string
  link: string
}

interface Swatch { id: string; color: string; label?: string; role?: string }

export interface Settings {
  team: string
  month: string
  today: string
  people: Swatch[]
  channels: Swatch[]
  statuses: Swatch[]
}

export type Words = Record<string, string> & { status: Record<string, string> }

type View = 'month' | 'weeks' | 'board'

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))
const weekNumber = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - start.getTime()) / 86400000 + 1) / 7)
}

/** The store's posts as a list, oldest first. */
export const toPosts = (data: ContentCalendarPostsStore | undefined): Post[] =>
  Object.entries(data?.posts ?? {}).map(([id, p]) => ({
    id,
    date: p.date ?? '',
    channel: p.channel ?? '',
    title: p.title ?? '',
    owner: p.owner ?? '',
    status: p.status ?? 'idea',
    campaign: p.campaign ?? '',
    link: p.link ?? '',
  }))

const EMPTY: ContentCalendarPostsStore = { posts: {} }

export function ContentCalendar({ localize, settings, words, locale, initial }: {
  /** The posts with their starting text in the reader's language (display only). */
  localize: (data: ContentCalendarPostsStore) => ContentCalendarPostsStore
  settings: Settings
  words: Words
  /** The reader's language tag, for dates. */
  locale: string
  initial?: string
}) {
  const stored = useStore(STORE) as ContentCalendarPostsStore | undefined
  const store = useStoreStatus(STORE)
  const live = (store?.status === 'open' || store?.status === 'paused') && stored !== undefined
  const canEdit = live && store?.status === 'open' && Boolean(store?.canEdit)
  // Until the store opens there are no posts yet: say so instead of "nothing planned".
  const waiting = live ? null : store?.status === 'refused' || store?.status === 'closed' ? words.unavailable : words.loading
  const posts = React.useMemo(() => toPosts(localize(live ? stored : EMPTY)), [live, stored, localize])
  const change = (id: string, values: Partial<Pick<Post, 'date' | 'status'>>) =>
    edit(STORE, (d: ContentCalendarPostsStore) => {
      Object.assign(d.posts[id], values)
    })
  const [start, startPost] = (initial ?? '').split(':')
  const [view, setView] = React.useState<View>((['month', 'weeks', 'board'] as string[]).includes(start) ? (start as View) : 'month')
  const [channels, setChannels] = React.useState<Set<string>>(new Set())
  const [owners, setOwners] = React.useState<Set<string>>(new Set())
  const [openId, setOpenId] = React.useState<string | null>(startPost || null)
  const open = posts.find((p) => p.id === openId) ?? null
  const setOpen = (post: Post | null) => setOpenId(post?.id ?? null)
  const [picked, setPicked] = React.useState<string>(settings.today)

  const channel = Object.fromEntries(settings.channels.map((c) => [c.id, c]))
  const person = Object.fromEntries(settings.people.map((p) => [p.id, p]))
  const status = Object.fromEntries(settings.statuses.map((s) => [s.id, s]))
  const today = day(settings.today)
  const monthStart = day(`${settings.month}-01`)
  const monthEnd = iso(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0))
  const fmt = (opts: Intl.DateTimeFormatOptions, d: Date) => new Intl.DateTimeFormat(locale, opts).format(d)

  const shown = posts
    .filter((p) => (channels.size === 0 || channels.has(p.channel)) && (owners.size === 0 || owners.has(p.owner)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel))
  const byDay = new Map<string, Post[]>()
  for (const p of shown) byDay.set(p.date, [...(byDay.get(p.date) ?? []), p])

  const toggle = (set: Set<string>, update: (s: Set<string>) => void, id: string) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    update(next)
  }

  React.useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // Monday-first grid covering the month, without a trailing empty week.
  const gridStart = mondayOf(monthStart)
  const cells: Date[] = []
  for (let d = gridStart; cells.length < 42; d = addDays(d, 1)) cells.push(d)
  while (cells.length > 28 && cells[cells.length - 7].getMonth() !== monthStart.getMonth()) cells.splice(-7)

  const weeks = new Map<string, Post[]>()
  for (const p of shown) {
    const key = iso(mondayOf(day(p.date)))
    weeks.set(key, [...(weeks.get(key) ?? []), p])
  }

  const Avatar = ({ id, size = 22 }: { id: string; size?: number }) => (
    <span className="cc-avatar" style={{ width: size, height: size, background: person[id]?.color ?? '#94a3b8', fontSize: size * 0.48 }} title={id}>
      {id.slice(0, 1)}
    </span>
  )
  const StatusPill = ({ id }: { id: string }) => (
    <span className="cc-status"><i style={{ background: status[id]?.color }} />{words.status[id] ?? id}</span>
  )
  const Chip = ({ post, compact = false }: { post: Post; compact?: boolean }) => (
    <button
      className={`cc-chip${post.status === 'published' ? ' done' : ''}${compact ? ' compact' : ''}`}
      style={{ '--ch': channel[post.channel]?.color } as React.CSSProperties}
      onClick={(e) => { e.stopPropagation(); setOpen(post) }}
      title={post.title}
    >
      <i />
      <span>{post.title}</span>
    </button>
  )

  const counts = settings.statuses.map((s) => ({ ...s, n: shown.filter((p) => p.status === s.id).length }))
  const pickedPosts = byDay.get(picked) ?? []

  return (
    <div className="cc">
      <style>{CSS}</style>
      <div className="cc-body">

      <header className="cc-head">
        <div>
          <div className="cc-eyebrow">{words.eyebrow}</div>
          <h1>{settings.team} <span>· {fmt({ month: 'long', year: 'numeric' }, monthStart)}</span></h1>
        </div>
        <div className="cc-counts">
          {counts.map((s) => (
            <div className="cc-count" key={s.id}>
              <b>{s.n}</b>
              <span><i style={{ background: s.color }} />{words.status[s.id]}</span>
            </div>
          ))}
        </div>
      </header>

      <div className="cc-bar">
        <div className="cc-views" role="tablist">
          {(['month', 'weeks', 'board'] as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{words[v]}</button>
          ))}
        </div>
        <div className="cc-filters">
          {settings.channels.map((c) => (
            <button key={c.id} className={`cc-filter${channels.has(c.id) ? ' on' : ''}`} style={{ '--ch': c.color } as React.CSSProperties} onClick={() => toggle(channels, setChannels, c.id)} aria-pressed={channels.has(c.id)}>
              <i />{c.label}
            </button>
          ))}
          <span className="cc-sep" />
          {settings.people.map((p) => (
            <button key={p.id} className={`cc-person${owners.has(p.id) ? ' on' : ''}`} onClick={() => toggle(owners, setOwners, p.id)} aria-pressed={owners.has(p.id)} title={p.id}>
              <Avatar id={p.id} size={24} /><span>{p.id}</span>
            </button>
          ))}
          {(channels.size > 0 || owners.size > 0) && (
            <button className="cc-clear" onClick={() => { setChannels(new Set()); setOwners(new Set()) }}>{words.clear}</button>
          )}
        </div>
      </div>

      {view === 'month' && (
        <section className="cc-month">
          <div className="cc-dow">
            {cells.slice(0, 7).map((d) => <span key={iso(d)}>{fmt({ weekday: 'short' }, d)}</span>)}
          </div>
          <div className="cc-grid">
            {cells.map((d) => {
              const key = iso(d)
              const inMonth = d.getMonth() === monthStart.getMonth()
              const list = inMonth ? byDay.get(key) ?? [] : []
              const isToday = key === settings.today
              return (
                <div
                  key={key}
                  className={`cc-day${d.getDay() % 6 === 0 ? ' weekend' : ''}${inMonth ? '' : ' out'}${isToday ? ' today' : ''}${picked === key ? ' picked' : ''}${d < today ? ' past' : ''}`}
                  onClick={() => inMonth && setPicked(key)}
                >
                  <span className="cc-num">{d.getDate()}{isToday && <em>{words.today}</em>}</span>
                  <div className="cc-chips">
                    {list.slice(0, 3).map((p) => <Chip key={p.id} post={p} />)}
                    {list.length > 3 && <span className="cc-more">+{list.length - 3}</span>}
                  </div>
                  <div className="cc-dots">
                    {list.map((p) => <i key={p.id} style={{ background: channel[p.channel]?.color }} />)}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="cc-picked">
            <div className="cc-picked-title">{fmt({ weekday: 'long', day: 'numeric', month: 'long' }, day(picked))}</div>
            {pickedPosts.length === 0 ? <div className="cc-empty">{waiting ?? words.nothing}</div> : pickedPosts.map((p) => (
              <button key={p.id} className="cc-row" onClick={() => setOpen(p)}>
                <span className="cc-tag" style={{ background: channel[p.channel]?.color }}>{channel[p.channel]?.label}</span>
                <span className="cc-row-title">{p.title}</span>
                <Avatar id={p.owner} />
              </button>
            ))}
          </div>
        </section>
      )}

      {view === 'weeks' && (
        <section className="cc-weeks">
          {[...weeks.entries()].map(([start, list]) => {
            const s = day(start)
            const e = addDays(s, 6)
            return (
              <div className="cc-week" key={start}>
                <div className="cc-week-head">
                  <b>{words.week} {weekNumber(s)}</b>
                  <span>{fmt({ day: 'numeric', month: 'short' }, s)} – {fmt({ day: 'numeric', month: 'short' }, e)}</span>
                  <span className="cc-week-n">{list.length}</span>
                </div>
                {list.map((p) => (
                  <button key={p.id} className={`cc-row${p.date === settings.today ? ' is-today' : ''}`} onClick={() => setOpen(p)}>
                    <span className="cc-date">{fmt({ weekday: 'short', day: 'numeric' }, day(p.date))}</span>
                    <span className="cc-tag" style={{ background: channel[p.channel]?.color }}>{channel[p.channel]?.label}</span>
                    <span className="cc-row-title">{p.title}</span>
                    {p.campaign && <span className="cc-campaign">{p.campaign}</span>}
                    <StatusPill id={p.status} />
                    <Avatar id={p.owner} />
                  </button>
                ))}
              </div>
            )
          })}
          {weeks.size === 0 && <div className="cc-empty">{waiting ?? words.nothing}</div>}
        </section>
      )}

      {view === 'board' && (
        <section className="cc-board">
          {settings.statuses.map((s) => {
            const list = shown.filter((p) => p.status === s.id)
            return (
              <div className="cc-col" key={s.id}>
                <div className="cc-col-head"><i style={{ background: s.color }} />{words.status[s.id]}<span>{list.length}</span></div>
                {list.map((p) => (
                  <button key={p.id} className="cc-card" onClick={() => setOpen(p)}>
                    <span className="cc-card-top">
                      <span className="cc-tag" style={{ background: channel[p.channel]?.color }}>{channel[p.channel]?.label}</span>
                      <span className="cc-date">{fmt({ day: 'numeric', month: 'short' }, day(p.date))}</span>
                    </span>
                    <span className="cc-card-title">{p.title}</span>
                    <span className="cc-card-foot">
                      {p.campaign ? <span className="cc-campaign">{p.campaign}</span> : <span />}
                      <Avatar id={p.owner} />
                    </span>
                  </button>
                ))}
              </div>
            )
          })}
        </section>
      )}
      </div>

      {open && (
        <div className="cc-scrim" onClick={() => setOpen(null)}>
          <aside className="cc-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={open.title}>
            <button className="cc-close" onClick={() => setOpen(null)} aria-label={words.close}>×</button>
            <span className="cc-tag big" style={{ background: channel[open.channel]?.color }}>{channel[open.channel]?.label}</span>
            <h2>{open.title}</h2>
            <dl>
              <dt>{words.date}</dt>
              <dd>
                {canEdit ? (
                  <input
                    type="date"
                    className="cc-date-input"
                    value={open.date}
                    min={`${settings.month}-01`}
                    max={monthEnd}
                    aria-label={words.date}
                    onChange={(e) => e.currentTarget.value && change(open.id, { date: e.currentTarget.value })}
                  />
                ) : (
                  fmt({ weekday: 'long', day: 'numeric', month: 'long' }, day(open.date))
                )}
              </dd>
              <dt>{words.owner}</dt><dd className="cc-owner"><Avatar id={open.owner} /> {open.owner} <small>{person[open.owner]?.role}</small></dd>
              <dt>{words.state}</dt>
              <dd>
                {canEdit ? (
                  <span className="cc-states" role="group" aria-label={words.state}>
                    {settings.statuses.map((s) => (
                      <button
                        key={s.id}
                        className={`cc-state${open.status === s.id ? ' on' : ''}`}
                        style={{ '--st': s.color } as React.CSSProperties}
                        aria-pressed={open.status === s.id}
                        onClick={() => change(open.id, { status: s.id })}
                      >
                        <i />{words.status[s.id]}
                      </button>
                    ))}
                  </span>
                ) : (
                  <StatusPill id={open.status} />
                )}
              </dd>
              {open.campaign && <><dt>{words.campaign}</dt><dd>{open.campaign}</dd></>}
              <dt>{words.id}</dt><dd className="cc-mono">{open.id}</dd>
            </dl>
            {live && !store?.saved && <p className="cc-hint">{words.saving}</p>}
            {open.link
              ? <a className="cc-open" href={open.link}>{words.openDraft} →</a>
              : <p className="cc-hint">{words.noDraft}</p>}
          </aside>
        </div>
      )}
    </div>
  )
}

const CSS = `
.cc { width: min(var(--kunobi-prose-width, 1200px), 100%); margin: 0 auto; box-sizing: border-box; padding: 16px 24px 40px; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
.cc-body { container-type: inline-size; }
.cc button { font: inherit; color: inherit; }
.cc-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 18px; padding: 26px 28px; border-radius: 24px; background: radial-gradient(120% 160% at 10% 0%, #0b2d52 0%, #06213f 60%, #031426 100%); color: #fff; }
.cc-eyebrow { font: 600 13px Figtree, sans-serif; letter-spacing: 0.04em; color: rgba(255,255,255,0.7); margin-bottom: 6px; }
.cc-head h1 { margin: 0; font: 800 clamp(26px, 3.6cqw, 40px)/1.05 Parkinsans, sans-serif; letter-spacing: -0.03em; }
.cc-head h1 span { color: #f3aa08; font-weight: 600; }
.cc-counts { display: flex; gap: 8px; flex-wrap: wrap; }
.cc-count { min-width: 76px; padding: 10px 12px; border-radius: 16px; background: rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 2px; }
.cc-count b { font: 800 22px Parkinsans, sans-serif; }
.cc-count span { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(255,255,255,0.75); }
.cc-count i, .cc-status i, .cc-col-head i { flex: none; width: 8px; height: 8px; border-radius: 99px; display: inline-block; }
.cc-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin: 18px 0 14px; }
.cc-views { display: inline-flex; padding: 4px; border-radius: 999px; background: hsl(var(--muted)); }
.cc-views button { all: unset; cursor: pointer; padding: 8px 16px; border-radius: 999px; font: 600 14px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
.cc-views button.on { background: #06213f; color: #fff; }
.cc-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cc-filter, .cc-person, .cc-clear { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 999px; font: 600 13px Figtree, sans-serif; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); }
.cc-filter i { width: 8px; height: 8px; border-radius: 99px; background: var(--ch); }
.cc-filter.on { background: var(--ch); border-color: var(--ch); color: #06213f; }
.cc-filter.on i { background: #06213f; }
.cc-person { padding: 3px 12px 3px 3px; }
.cc-person.on { background: #06213f; color: #fff; border-color: #06213f; }
.cc-clear { border-style: dashed; color: hsl(var(--muted-foreground)); }
.cc-sep { width: 1px; height: 22px; background: hsl(var(--border)); margin: 0 4px; }
.cc-avatar { flex: none; border-radius: 99px; display: inline-grid; place-items: center; font: 800 11px Parkinsans, sans-serif; color: #06213f; }
.cc-month { border-radius: 22px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); overflow: hidden; box-shadow: 0 8px 24px rgba(6,33,63,0.06); }
.cc-dow, .cc-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.cc-dow span { padding: 10px 12px; font: 600 12px Figtree, sans-serif; text-transform: uppercase; letter-spacing: 0.06em; color: hsl(var(--muted-foreground)); border-bottom: 1px solid hsl(var(--border)); }
.cc-day { min-height: 108px; padding: 8px; border-right: 1px solid hsl(var(--border)); border-bottom: 1px solid hsl(var(--border)); display: flex; flex-direction: column; gap: 4px; cursor: pointer; min-width: 0; }
.cc-day:nth-child(7n) { border-right: 0; }
.cc-day.weekend { background: hsl(var(--muted) / 0.35); }
.cc-day.out { background: hsl(var(--muted) / 0.4); cursor: default; }
.cc-day.out .cc-num { opacity: 0.4; }
.cc-day.past .cc-num { color: hsl(var(--muted-foreground)); }
.cc-day.today { box-shadow: inset 0 0 0 2px #f3aa08; }
.cc-num { font: 700 13px Figtree, sans-serif; display: flex; align-items: center; gap: 6px; }
.cc-num em { font-style: normal; font-size: 11px; padding: 1px 7px; border-radius: 99px; background: #f3aa08; color: #06213f; }
.cc-chips { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cc-chip { all: unset; cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 4px 7px; border-radius: 8px; font: 600 12px/1.25 Figtree, sans-serif; background: color-mix(in srgb, var(--ch) 16%, transparent); min-width: 0; }
.cc-chip i { flex: none; width: 6px; height: 6px; border-radius: 99px; background: var(--ch); }
.cc-chip { align-items: flex-start; }
.cc-chip i { margin-top: 5px; }
.cc-chip span { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.cc-chip.done { opacity: 0.62; }
.cc-chip:hover, .cc-chip:focus-visible { background: color-mix(in srgb, var(--ch) 30%, transparent); }
.cc-more { font: 600 11px Figtree, sans-serif; color: hsl(var(--muted-foreground)); padding-left: 4px; }
.cc-dots { display: none; gap: 3px; flex-wrap: wrap; }
.cc-dots i { width: 6px; height: 6px; border-radius: 99px; }
.cc-picked { display: none; }
.cc-weeks { display: flex; flex-direction: column; gap: 14px; }
.cc-week { border-radius: 22px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); padding: 8px; box-shadow: 0 8px 24px rgba(6,33,63,0.05); }
.cc-week-head { display: flex; align-items: baseline; gap: 10px; padding: 8px 12px 10px; }
.cc-week-head b { font: 800 16px Parkinsans, sans-serif; }
.cc-week-head span { color: hsl(var(--muted-foreground)); font-size: 14px; }
.cc-week-n { margin-left: auto; font: 700 12px Figtree, sans-serif; padding: 2px 9px; border-radius: 99px; background: hsl(var(--muted)); }
.cc-row { all: unset; cursor: pointer; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px; }
.cc-row:hover, .cc-row:focus-visible { background: hsl(var(--muted)); }
.cc-row.is-today { box-shadow: inset 3px 0 0 #f3aa08; }
.cc-date { flex: none; width: 58px; font: 600 13px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
.cc-tag { flex: none; font: 700 11px Figtree, sans-serif; padding: 3px 9px; border-radius: 99px; color: #06213f; }
.cc-tag.big { font-size: 12px; padding: 4px 11px; }
.cc-row-title { flex: 1; min-width: 0; font: 600 15px Figtree, sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-campaign { flex: none; font: 600 12px Figtree, sans-serif; color: hsl(var(--muted-foreground)); padding: 3px 9px; border-radius: 99px; border: 1px dashed hsl(var(--border)); }
.cc-status { flex: none; display: inline-flex; align-items: center; gap: 6px; font: 600 12px Figtree, sans-serif; padding: 3px 10px; border-radius: 99px; background: hsl(var(--muted)); }
.cc-board { display: grid; grid-template-columns: repeat(5, minmax(200px, 1fr)); gap: 12px; overflow-x: auto; padding-bottom: 6px; }
.cc-col { border-radius: 20px; background: hsl(var(--muted) / 0.6); padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 200px; }
.cc-col-head { display: flex; align-items: center; gap: 8px; font: 700 14px Figtree, sans-serif; padding: 4px 6px 6px; }
.cc-col-head span { margin-left: auto; font-size: 12px; color: hsl(var(--muted-foreground)); }
.cc-card { all: unset; cursor: pointer; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 16px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); box-shadow: 0 4px 12px rgba(6,33,63,0.05); transition: transform .2s, box-shadow .2s; }
.cc-card:hover, .cc-card:focus-visible { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(6,33,63,0.12); }
.cc-card-top, .cc-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cc-card-top .cc-date { width: auto; font-size: 12px; }
.cc-card-title { font: 600 14px/1.35 Figtree, sans-serif; }
.cc-empty { padding: 24px; text-align: center; color: hsl(var(--muted-foreground)); }
.cc-scrim { position: fixed; inset: 0; background: rgba(3,20,38,0.35); display: flex; justify-content: flex-end; z-index: 10; }
.cc-panel { position: relative; width: min(400px, 100%); height: 100%; box-sizing: border-box; overflow-y: auto; background: hsl(var(--card)); color: hsl(var(--foreground)); padding: 28px 26px; box-shadow: -20px 0 50px rgba(3,20,38,0.25); animation: cc-in .25s cubic-bezier(.2,.8,.2,1); }
.cc-panel h2 { font: 800 24px/1.15 Parkinsans, sans-serif; letter-spacing: -0.02em; margin: 14px 0 18px; }
.cc-panel dl { display: grid; grid-template-columns: auto 1fr; gap: 12px 16px; margin: 0 0 22px; font-size: 14px; }
.cc-panel dt { color: hsl(var(--muted-foreground)); font-weight: 600; }
.cc-panel dd { margin: 0; display: flex; align-items: center; gap: 8px; }
.cc-owner small { color: hsl(var(--muted-foreground)); }
.cc-mono { font-family: ui-monospace, monospace; font-size: 13px; }
.cc-states { display: flex; flex-wrap: wrap; gap: 6px; }
.cc-state { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font: 600 12px Figtree, sans-serif; padding: 4px 10px; border-radius: 99px; border: 1px solid hsl(var(--border)); }
.cc-state i { width: 8px; height: 8px; border-radius: 99px; background: var(--st); }
.cc-state.on { background: color-mix(in srgb, var(--st) 22%, transparent); border-color: var(--st); }
.cc-state:focus-visible, .cc-date-input:focus-visible { outline: 2px solid #0984c8; outline-offset: 2px; }
.cc-date-input { box-sizing: border-box; font: 600 14px Figtree, sans-serif; padding: 5px 10px; border-radius: 10px; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--foreground)); }
.cc-close { all: unset; cursor: pointer; position: absolute; top: 14px; right: 16px; width: 34px; height: 34px; border-radius: 99px; display: grid; place-items: center; font-size: 22px; background: hsl(var(--muted)); }
.cc-open { display: inline-flex; padding: 10px 18px; border-radius: 999px; background: #f3aa08; color: #06213f; font: 700 14px Figtree, sans-serif; text-decoration: none; }
.cc-hint { color: hsl(var(--muted-foreground)); font-size: 14px; margin: 0; }
@keyframes cc-in { from { transform: translateX(24px); } }
@container (max-width: 760px) {
  .cc-day { min-height: 64px; padding: 6px; }
  .cc-chips { display: none; }
  .cc-dots { display: flex; }
  .cc-day.picked { background: hsl(var(--muted)); }
  .cc-picked { display: block; padding: 12px; border-top: 1px solid hsl(var(--border)); }
  .cc-picked-title { font: 700 15px Figtree, sans-serif; padding: 4px 4px 8px; }
  .cc-dow span { padding: 8px 6px; font-size: 11px; text-align: center; }
  .cc-campaign, .cc-week .cc-status { display: none; }
  .cc-board { grid-template-columns: repeat(5, 78cqw); scroll-snap-type: x mandatory; }
  .cc-col { scroll-snap-align: start; }
  .cc-head { padding: 22px 20px; }
  .cc-count { min-width: 0; flex: 1; padding: 8px 10px; }
  .cc-counts { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); }
  .cc-count span { font-size: 12px; white-space: nowrap; }
  .cc-person > span:not(.cc-avatar) { display: none; }
  .cc-person { padding: 3px; }
}
@container (max-width: 520px) {
  .cc-body { margin: -4px -10px 0; }
  .cc-num em { display: none; }
  .cc-date { width: 44px; }
}
@media (max-width: 560px) {
  .cc-panel { height: auto; max-height: 82%; margin-top: auto; width: 100%; border-radius: 22px 22px 0 0; }
  .cc-scrim { align-items: flex-end; }
}
@media (prefers-reduced-motion: reduce) { .cc-scrim, .cc-panel, .cc-card { animation: none; transition: none; } }
`
