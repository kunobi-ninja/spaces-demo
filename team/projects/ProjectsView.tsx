import * as React from 'react'
import { useStore, useStoreStatus, edit } from 'kunobi'
import type { TeamTasksStore } from '../types/team-tasks.store'

/*
 * One shared list of tasks, three views. The tasks live in the `team-tasks` store:
 * one ordered list, where a task's `status` picks its column and its place in the
 * list picks its place in that column. Moving a card sets its status and moves it
 * in the list, so two people moving cards at once both keep their moves.
 * Kunobi keeps a readable copy in `data/tasks.json`; the page shows that copy,
 * read-only, wherever the store cannot open (a web link, a preview).
 * Seeded task text shows in the reader's language (`localize`, from the page);
 * project, status and priority values stay as stored and show through `team.labels`.
 */

export interface Person { id: string; role: string; color: string; ai: string }
export interface Project { id: string; color: string }
export interface Team {
  name: string
  goal: string
  opening: string
  today: string
  people: Person[]
  projects: Project[]
  statuses: string[]
  /** Display names for project, status and priority values, by value. */
  labels?: Record<string, string>
}
export interface Task {
  id: string
  title: string
  project: string
  owner: string
  status: string
  start: string
  due: string
  priority: string
  ai: string
  page: string
}
export type Words = Record<string, string>
type View = 'board' | 'table' | 'timeline'
type Row = Record<string, string | null>
type Draft = { tasks: Row[] }

const C = { midnight: '#06213f', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8', late: '#e5484d' }
const STATUS_COLOR: Record<string, string> = { Idea: '#9aa7b4', 'To do': C.horizon, Doing: C.sun, Waiting: '#e8794a', Done: C.tide }
const DAY = 86_400_000
const STORE = 'team-tasks'
const KEYS = ['id', 'title', 'project', 'owner', 'status', 'start', 'due', 'priority', 'ai', 'page'] as const

/** A store row with every field present: a field the store has not set reads as ''. */
const toTask = (row: Record<string, unknown>): Task =>
  Object.fromEntries(KEYS.map((k) => [k, String(row[k] ?? '')])) as unknown as Task
/** A project, status or priority value as the reader sees it. */
const say = (team: Team, value: string) => team.labels?.[value] ?? value

/** Put task `id` in column `status`: just before `before`, just after `after`, or else last in that column. */
function place(draft: Draft, id: string, status: string, before?: string | null, after?: string | null) {
  const list = draft.tasks
  const from = list.findIndex((t) => t.id === id)
  if (from < 0) return
  const [task] = list.splice(from, 1)
  task.status = status
  let at = -1
  if (before) at = list.findIndex((t) => t.id === before)
  else if (after) { const i = list.findIndex((t) => t.id === after); at = i < 0 ? -1 : i + 1 }
  if (at < 0) {
    let last = -1
    list.forEach((t, i) => { if (t.status === status) last = i })
    at = last < 0 ? list.length : last + 1
  }
  list.splice(at, 0, task)
}

const time = (date: string) => (date ? Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) : NaN)
/** The reader's language tag, for dates. */
const Locale = React.createContext('en')
const shortDate = (date: string, locale: string) =>
  date ? new Date(time(date)).toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : ''

function Avatar({ person, size = 24 }: { person?: Person; size?: number }) {
  return (
    <span className="pj-avatar" style={{ width: size, height: size, background: person?.color ?? '#9aa7b4', fontSize: size * 0.46 }} title={person?.id}>
      {person?.id.slice(0, 1) ?? '?'}
    </span>
  )
}

function Due({ task, today, w }: { task: Task; today: number; w: Words }) {
  const locale = React.useContext(Locale)
  if (!task.due) return null
  const left = Math.round((time(task.due) - today) / DAY)
  const done = task.status === 'Done'
  const tone = done ? 'done' : left < 0 ? 'late' : left <= 7 ? 'soon' : 'later'
  const when = done ? '' : left < 0 ? ` · ${-left}${w.dShort} ${w.late}` : left === 0 ? ` · ${w.today}` : ` · ${left}${w.dShort}`
  return <span className={`pj-due ${tone}`}>{shortDate(task.due, locale)}{when}</span>
}

/** What the board can do when the store is open and this page may change it. */
interface Actions {
  move: (id: string, status: string, before?: string | null, after?: string | null) => void
  setOwner: (id: string, owner: string) => void
  add: (task: Omit<Task, 'id'>) => void
}

interface CardProps {
  task: Task
  team: Team
  today: number
  w: Words
  act: Actions | null
  dragging: boolean
  onKey: (e: React.KeyboardEvent, task: Task) => void
  onDragStart: (task: Task) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent, task: Task) => void
}

function Card({ task, team, today, w, act, dragging, onKey, onDragStart, onDragEnd, onDragOver }: CardProps) {
  const person = team.people.find((p) => p.id === task.owner)
  const project = team.projects.find((p) => p.id === task.project)
  const col = team.statuses.indexOf(task.status)
  const prev = team.statuses[col - 1]
  const next = team.statuses[col + 1]
  const done = task.status === 'Done'
  return (
    <div
      className={`pj-card${dragging ? ' dragging' : ''}${act ? ' live' : ''}`}
      data-task={task.id}
      tabIndex={act ? 0 : undefined}
      draggable={act ? true : undefined}
      aria-label={act ? `${task.title} · ${say(team, task.status)}. ${w.keys}` : undefined}
      onKeyDown={act ? (e) => onKey(e, task) : undefined}
      onDragStart={act ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); onDragStart(task) } : undefined}
      onDragEnd={act ? onDragEnd : undefined}
      onDragOver={act ? (e) => onDragOver(e, task) : undefined}
    >
      <span className="pj-card-top">
        <span className="pj-tag"><i style={{ background: project?.color }} />{say(team, task.project)}</span>
        <span className="pj-id">
          {task.priority === 'High' && !done ? <span className="pj-high" title={w.high}>▲</span> : null}
          {task.id}
          {act ? (
            <span className="pj-move">
              <button type="button" disabled={!prev} aria-label={prev ? `${w.moveTo} ${say(team, prev)}` : undefined} title={prev ? `${w.moveTo} ${say(team, prev)}` : undefined}
                onClick={() => prev && act.move(task.id, prev)}>‹</button>
              <button type="button" disabled={!next} aria-label={next ? `${w.moveTo} ${say(team, next)}` : undefined} title={next ? `${w.moveTo} ${say(team, next)}` : undefined}
                onClick={() => next && act.move(task.id, next)}>›</button>
            </span>
          ) : null}
        </span>
      </span>
      <span className={`pj-card-title${done ? ' done' : ''}`}>{task.page ? <a href={task.page} draggable={false}>{task.title}</a> : task.title}</span>
      <span className="pj-card-foot">
        {act ? (
          <label className="pj-pick" title={w.owner}>
            <Avatar person={person} size={22} />
            <span aria-hidden="true">{task.owner}</span>
            <select aria-label={`${w.owner}: ${task.title}`} value={task.owner} onChange={(e) => act.setOwner(task.id, e.target.value)}>
              {team.people.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
            </select>
          </label>
        ) : <Avatar person={person} />}
        <Due task={task} today={today} w={w} />
        {task.ai ? <span className="pj-ai" title={w.aiHelps}><i />{task.ai}</span> : null}
      </span>
    </div>
  )
}

function AddTask({ status, team, w, act }: { status: string; team: Team; w: Words; act: Actions }) {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [owner, setOwner] = React.useState(team.people[0]?.id ?? '')
  const [project, setProject] = React.useState(team.projects[0]?.id ?? '')
  const [due, setDue] = React.useState('')
  if (!open) return <button type="button" className="pj-add" onClick={() => setOpen(true)}>+ {w.addTask}</button>
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    act.add({ title: title.trim(), project, owner, status, start: '', due, priority: 'Medium', ai: '', page: '' })
    setTitle(''); setDue(''); setOpen(false)
  }
  return (
    <form className="pj-form" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={w.newTask} aria-label={w.task} />
      <div className="pj-form-row">
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label={w.owner}>
          {team.people.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
        </select>
        <select value={project} onChange={(e) => setProject(e.target.value)} aria-label={w.project}>
          {team.projects.map((p) => <option key={p.id} value={p.id}>{say(team, p.id)}</option>)}
        </select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label={w.due} />
      </div>
      <div className="pj-form-row">
        <button type="submit" className="pj-btn" disabled={!title.trim()}>{w.add}</button>
        <button type="button" className="pj-btn ghost" onClick={() => setOpen(false)}>{w.cancel}</button>
      </div>
    </form>
  )
}

function Board({ tasks, team, today, w, act }: { tasks: Task[]; team: Team; today: number; w: Words; act: Actions | null }) {
  const [drag, setDrag] = React.useState<string | null>(null)
  const [drop, setDrop] = React.useState<{ status: string; before: string | null } | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)
  // After a keyboard move the card is drawn anew in its new place; keep it focused there.
  const follow = React.useRef<{ id: string; until: number } | null>(null)
  React.useEffect(() => {
    const f = follow.current
    if (!f) return
    if (Date.now() > f.until) { follow.current = null; return }
    const el = ref.current?.querySelector<HTMLElement>(`[data-task="${f.id}"]`)
    if (el && document.activeElement !== el) el.focus()
  })
  const columns = team.statuses.map((status) => ({ status, cards: tasks.filter((t) => t.status === status) }))

  const onKey = (e: React.KeyboardEvent, task: Task) => {
    if (!act || e.target !== e.currentTarget) return
    const col = team.statuses.indexOf(task.status)
    const cards = columns[col].cards
    const i = cards.findIndex((t) => t.id === task.id)
    let done = true
    if (e.key === 'ArrowLeft' && col > 0) act.move(task.id, team.statuses[col - 1])
    else if (e.key === 'ArrowRight' && col < team.statuses.length - 1) act.move(task.id, team.statuses[col + 1])
    else if (e.key === 'ArrowUp' && i > 0) act.move(task.id, task.status, cards[i - 1].id)
    else if (e.key === 'ArrowDown' && i < cards.length - 1) act.move(task.id, task.status, null, cards[i + 1].id)
    else done = false
    if (done) { e.preventDefault(); follow.current = { id: task.id, until: Date.now() + 1500 } }
  }
  const overCard = (e: React.DragEvent, task: Task) => {
    if (!drag) return
    e.preventDefault()
    e.stopPropagation()
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const cards = columns[team.statuses.indexOf(task.status)].cards
    const i = cards.findIndex((t) => t.id === task.id)
    const before = e.clientY < box.top + box.height / 2 ? task.id : cards[i + 1]?.id ?? null
    if (drop?.status !== task.status || drop.before !== before) setDrop({ status: task.status, before })
  }
  const overColumn = (e: React.DragEvent, status: string) => {
    if (!drag) return
    e.preventDefault()
    if (drop?.status !== status || drop.before !== null) setDrop({ status, before: null })
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (act && drag && drop && drop.before !== drag) act.move(drag, drop.status, drop.before)
    setDrag(null); setDrop(null)
  }
  const line = <span className="pj-drop" aria-hidden="true" />

  return (
    <div className="pj-board" ref={ref}>
      {columns.map(({ status, cards }) => (
        <section
          className={`pj-col${drop?.status === status ? ' over' : ''}`}
          key={status}
          onDragOver={act ? (e) => overColumn(e, status) : undefined}
          onDrop={act ? onDrop : undefined}
        >
          <header><i style={{ background: STATUS_COLOR[status] }} />{say(team, status)}<b>{cards.length}</b></header>
          <div className="pj-cards">
            {cards.map((task) => (
              <React.Fragment key={task.id}>
                {drop?.status === status && drop.before === task.id && drag !== task.id ? line : null}
                <Card task={task} team={team} today={today} w={w} act={act} dragging={drag === task.id}
                  onKey={onKey} onDragStart={(t) => setDrag(t.id)} onDragEnd={() => { setDrag(null); setDrop(null) }} onDragOver={overCard} />
              </React.Fragment>
            ))}
            {drop?.status === status && drop.before === null ? line : null}
            {cards.length === 0 && !(drop?.status === status) ? <div className="pj-empty">{w.empty}</div> : null}
            {act ? <AddTask status={status} team={team} w={w} act={act} /> : null}
          </div>
        </section>
      ))}
    </div>
  )
}

const COLUMNS: { key: keyof Task; label: string }[] = [
  { key: 'id', label: 'id' }, { key: 'title', label: 'task' }, { key: 'project', label: 'project' }, { key: 'owner', label: 'owner' },
  { key: 'status', label: 'status' }, { key: 'due', label: 'due' }, { key: 'priority', label: 'priority' }, { key: 'ai', label: 'ai' },
]

function TableView({ tasks, team, today, w }: { tasks: Task[]; team: Team; today: number; w: Words }) {
  const [sort, setSort] = React.useState<{ key: keyof Task; dir: 1 | -1 }>({ key: 'due', dir: 1 })
  const order = (task: Task, key: keyof Task) =>
    key === 'status' ? String(team.statuses.indexOf(task.status)) : key === 'priority' ? String(['High', 'Medium', 'Low'].indexOf(task.priority)) : key === 'id' ? task.id.slice(1).padStart(4, '0') : task[key] || '~'
  const rows = [...tasks].sort((a, b) => order(a, sort.key).localeCompare(order(b, sort.key)) * sort.dir)
  return (
    <div className="pj-table-wrap">
      <table className="pj-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                <button onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (-s.dir as 1 | -1) : 1 }))}>
                  {w[c.label]}<span>{sort.key === c.key ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const person = team.people.find((p) => p.id === t.owner)
            const project = team.projects.find((p) => p.id === t.project)
            return (
              <tr key={t.id}>
                <td className="pj-muted">{t.id}</td>
                <td className="pj-title-cell">{t.page ? <a href={t.page}>{t.title}</a> : t.title}</td>
                <td><span className="pj-tag"><i style={{ background: project?.color }} />{say(team, t.project)}</span></td>
                <td><span className="pj-owner"><Avatar person={person} size={22} />{t.owner}</span></td>
                <td><span className="pj-status" style={{ ['--s' as string]: STATUS_COLOR[t.status] }}>{say(team, t.status)}</span></td>
                <td><Due task={t} today={today} w={w} /></td>
                <td className={t.priority === 'High' ? 'pj-strong' : 'pj-muted'}>{say(team, t.priority)}</td>
                <td className="pj-muted">{t.ai}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Timeline({ tasks, team, today, w }: { tasks: Task[]; team: Team; today: number; w: Words }) {
  const locale = React.useContext(Locale)
  const opening = time(team.opening)
  const dated = tasks.filter((t) => t.due)
  const first = Math.min(today - 7 * DAY, ...dated.map((t) => time(t.start || t.due)))
  const from = first - (new Date(first).getUTCDay() + 6) % 7 * DAY // the Monday of that week
  const to = Math.max(opening + 7 * DAY, ...dated.map((t) => time(t.due) + DAY))
  const pct = (at: number) => `${((at - from) / (to - from)) * 100}%`
  const weeks: number[] = []
  for (let at = from; at <= to; at += 7 * DAY) weeks.push(at)
  const lanes = team.projects
    .map((p) => ({ project: p, tasks: dated.filter((t) => t.project === p.id).sort((a, b) => (a.start || a.due).localeCompare(b.start || b.due)) }))
    .filter((lane) => lane.tasks.length > 0)
  return (
    <div className="pj-tl-wrap">
      <div className="pj-tl">
        <div className="pj-tl-axis">
          {weeks.map((at) => <span key={at} style={{ left: pct(at) }}>{shortDate(new Date(at).toISOString().slice(0, 10), locale)}</span>)}
        </div>
        <div className="pj-tl-body">
          {weeks.map((at) => <span key={at} className="pj-tl-grid" style={{ left: pct(at) }} />)}
          <span className="pj-tl-today" style={{ left: pct(today) }}><b>{w.today}</b></span>
          <span className="pj-tl-open" style={{ left: pct(opening) }}><b>{w.opening}</b></span>
          {lanes.map(({ project, tasks: laneTasks }) => (
            <div className="pj-lane" key={project.id}>
              <div className="pj-lane-name"><i style={{ background: project.color }} />{say(team, project.id)}</div>
              {laneTasks.map((t) => {
                const start = t.start ? time(t.start) : time(t.due)
                const end = time(t.due) + DAY
                const point = !t.start || end - start <= DAY
                const share = (end - start) / (to - from)
                // A title that would not fit inside its bar sits beside it, on the side with room.
                const inside = !point && share * 860 > t.title.length * 6.6 + 34
                const before = !inside && (end - from) / (to - from) > 0.72
                const person = team.people.find((p) => p.id === t.owner)
                const bar = (
                  <span
                    className={`pj-bar${t.status === 'Done' ? ' done' : ''}${point ? ' point' : ''}`}
                    style={{ left: pct(start), width: point ? undefined : `calc(${pct(end)} - ${pct(start)})`, ['--c' as string]: project.color }}
                    title={`${t.id} · ${t.title} · ${t.owner} · ${shortDate(t.start, locale)} – ${shortDate(t.due, locale)}`}
                  >
                    {point ? null : <Avatar person={person} size={16} />}
                    {inside ? <em>{t.title}</em> : null}
                  </span>
                )
                const label = inside ? null : (
                  <span
                    className={`pj-out-label${t.status === 'Done' ? ' done' : ''}`}
                    style={before ? { right: `calc(100% - ${pct(start)} + ${point ? 12 : 6}px)` } : { left: `calc(${pct(point ? start : end)} + ${point ? 14 : 6}px)` }}
                  >
                    {t.title}
                  </span>
                )
                return (
                  <div className="pj-row" key={t.id}>
                    {t.page ? <a href={t.page}>{bar}{label}</a> : <>{bar}{label}</>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const ICON: Record<View, React.ReactElement> = {
  board: <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="2" y="3" width="4.5" height="14" rx="1.5" /><rect x="7.75" y="3" width="4.5" height="9" rx="1.5" /><rect x="13.5" y="3" width="4.5" height="11.5" rx="1.5" /></svg>,
  table: <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="2" y="3" width="16" height="3" rx="1.2" /><rect x="2" y="8.5" width="16" height="3" rx="1.2" /><rect x="2" y="14" width="16" height="3" rx="1.2" /></svg>,
  timeline: <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="2" y="3" width="9" height="3" rx="1.5" /><rect x="6" y="8.5" width="10" height="3" rx="1.5" /><rect x="10" y="14" width="8" height="3" rx="1.5" /></svg>,
}

/** Send one change to the tasks store; say so on the page when the store refuses it. */
function useSend(setProblem: (reason: string | null) => void) {
  return React.useCallback((change: (draft: Draft) => void) => {
    setProblem(null)
    Promise.resolve(edit(STORE, (draft: Draft) => { change(draft) }))
      .then((answer: unknown) => {
        const a = answer as { status?: string; reason?: string } | string | undefined
        const status = typeof a === 'string' ? a : a?.status
        if (status && status !== 'applied' && status !== 'unchanged') setProblem((typeof a === 'object' && a?.reason) || status)
      })
      .catch((err: unknown) => setProblem(String((err as Error)?.message ?? err)))
  }, [setProblem])
}

export function Projects({ seed, localize, team, w, locale }: {
  seed: { tasks: Record<string, unknown>[] }
  /** The tasks with their starting text in the reader's language (display only). */
  localize: (data: { tasks: Record<string, unknown>[] }) => { tasks: Record<string, unknown>[] }
  team: Team
  w: Words
  /** The reader's language tag, for dates. */
  locale: string
}) {
  const status = useStoreStatus(STORE)
  const data = useStore(STORE) as TeamTasksStore | undefined
  const open = Boolean(status?.status === 'open' && data?.tasks)
  const source = open ? (data as unknown as { tasks: Record<string, unknown>[] }) : seed
  const all = React.useMemo(() => localize(source).tasks.map(toTask), [source, localize])
  const [problem, setProblem] = React.useState<string | null>(null)
  const send = useSend(setProblem)
  const act: Actions | null = open && status?.canEdit ? {
    move: (id, to, before, after) => send((d) => place(d, id, to, before, after)),
    setOwner: (id, owner) => send((d) => { const t = d.tasks.find((r) => r.id === id); if (t) t.owner = owner }),
    add: (task) => send((d) => {
      const n = Math.max(0, ...d.tasks.map((r) => parseInt(String(r.id).replace(/\D/g, ''), 10) || 0)) + 1
      d.tasks.push({ id: `T${n}`, ...task })
      place(d, `T${n}`, task.status)
    }),
  } : null

  const today = time(team.today)
  const [view, setView] = React.useState<View>('board')
  const [people, setPeople] = React.useState<string[]>([])
  const [projects, setProjects] = React.useState<string[]>([])
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const byPerson = (t: Task) => people.length === 0 || people.includes(t.owner)
  const byProject = (t: Task) => projects.length === 0 || projects.includes(t.project)
  const shown = all.filter((t) => byPerson(t) && byProject(t))
  const done = all.filter((t) => t.status === 'Done').length
  const daysLeft = Math.round((time(team.opening) - today) / DAY)

  return (
    <Locale.Provider value={locale}>
    <div className="pj">
      <style>{CSS}</style>
      <header className="pj-head">
        <div>
          <div className="pj-eyebrow">{team.name} · {w.projects}</div>
          <h1>{team.goal}</h1>
        </div>
        <div className="pj-stats">
          <div className="pj-stat"><b>{daysLeft}</b><span>{w.daysToOpening}</span></div>
          <div className="pj-stat pj-progress">
            <span className="pj-progress-text"><b>{done}</b>/{all.length} {w.done}</span>
            <span className="pj-progress-bar">
              {team.statuses.map((s) => {
                const n = all.filter((t) => t.status === s).length
                return n ? <i key={s} style={{ flex: n, background: STATUS_COLOR[s] }} title={`${say(team, s)}: ${n}`} /> : null
              })}
            </span>
          </div>
        </div>
      </header>

      <div className="pj-toolbar">
        <div className="pj-views" role="tablist">
          {(['board', 'table', 'timeline'] as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
              {ICON[v]}{w[v]}
            </button>
          ))}
        </div>
        <div className="pj-filters">
          {team.people.map((p) => {
            const n = all.filter((t) => t.owner === p.id && byProject(t)).length
            return (
              <button key={p.id} className={`pj-chip${people.includes(p.id) ? ' on' : ''}`} onClick={() => toggle(people, setPeople, p.id)} aria-pressed={people.includes(p.id)}>
                <Avatar person={p} size={18} />{p.id}<small>{n}</small>
              </button>
            )
          })}
          <span className="pj-sep" />
          {team.projects.map((p) => {
            const n = all.filter((t) => t.project === p.id && byPerson(t)).length
            return n || projects.includes(p.id) ? (
              <button key={p.id} className={`pj-chip${projects.includes(p.id) ? ' on' : ''}`} onClick={() => toggle(projects, setProjects, p.id)} aria-pressed={projects.includes(p.id)}>
                <i style={{ background: p.color }} />{say(team, p.id)}<small>{n}</small>
              </button>
            ) : null
          })}
          {people.length || projects.length ? <button className="pj-clear" onClick={() => { setPeople([]); setProjects([]) }}>{w.clear}</button> : null}
        </div>
        {act && status && !status.saved ? <span className="pj-saving" role="status">{w.saving}</span> : null}
        {problem ? <span className="pj-problem" role="alert">{w.notSaved}: {problem}</span> : null}
      </div>

      {view === 'board' ? <Board tasks={shown} team={team} today={today} w={w} act={act} /> : null}
      {view === 'board' && act ? <p className="pj-hint">{w.hint}</p> : null}
      {view === 'table' ? <TableView tasks={shown} team={team} today={today} w={w} /> : null}
      {view === 'timeline' ? <Timeline tasks={shown} team={team} today={today} w={w} /> : null}

      <footer className="pj-how">
        <span className="pj-how-label">{w.howTitle}</span>
        <span>{w.howBody} <code>data/tasks.json</code>.</span>
        <span className="pj-prompts">
          {[w.prompt1, w.prompt2, w.prompt3].map((p) => <span key={p} className="pj-prompt">“{p}”</span>)}
        </span>
      </footer>
    </div>
    </Locale.Provider>
  )
}

const CSS = `
.pj { --ink: hsl(var(--foreground)); --soft: hsl(var(--muted-foreground)); --line: hsl(var(--border)); --panel: hsl(var(--card)); --wash: hsl(var(--muted));
  width: min(var(--kunobi-prose-width, 1200px), 100%); box-sizing: border-box; margin: 0 auto; padding: 16px 24px 48px;
  font-family: Figtree, system-ui, sans-serif; color: var(--ink); container-type: inline-size; }
.pj *, .pj *::before, .pj *::after { box-sizing: border-box; }
.pj a { color: inherit; text-decoration: none; }
.pj button { font: inherit; color: inherit; }
.pj-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding: 26px 30px; border-radius: 26px;
  background: radial-gradient(130% 160% at 10% 0%, #0b2d52 0%, ${C.midnight} 60%, #031426 100%); color: #fff; }
.pj-eyebrow { font: 600 14px Figtree, sans-serif; color: rgba(255,255,255,.7); letter-spacing: .02em; }
.pj-head h1 { margin: 6px 0 0; font: 800 clamp(26px, 3.6cqw, 40px)/1.05 Parkinsans, Figtree, sans-serif; letter-spacing: -.03em; }
.pj-stats { display: flex; gap: 12px; flex-wrap: wrap; }
.pj-stat { display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 12px 16px; border-radius: 18px; background: rgba(255,255,255,.08); min-width: 120px; }
.pj-stat b { font: 800 28px/1 Parkinsans, sans-serif; color: ${C.sun}; }
.pj-stat span { font-size: 13px; color: rgba(255,255,255,.72); }
.pj-progress { min-width: 220px; gap: 10px; }
.pj-progress-text { font-size: 14px !important; color: rgba(255,255,255,.85) !important; }
.pj-progress-text b { font-size: 20px; color: #fff; margin-right: 1px; }
.pj-progress-bar { display: flex; gap: 3px; height: 8px; }
.pj-progress-bar i { border-radius: 99px; }
.pj-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin: 18px 0 16px; }
.pj-views { display: inline-flex; padding: 4px; border-radius: 999px; background: var(--wash); }
.pj-views button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 999px; font: 600 14px Figtree, sans-serif; color: var(--soft); }
.pj-views button svg { fill: currentColor; }
.pj-views button.on { background: var(--panel); color: var(--ink); box-shadow: 0 2px 8px rgba(6,33,63,.12); }
.pj-views button:focus-visible, .pj-chip:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
.pj-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pj-chip { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px 5px 6px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); font: 600 13px Figtree, sans-serif; }
.pj-chip i { width: 9px; height: 9px; border-radius: 99px; margin-left: 4px; }
.pj-chip small { color: var(--soft); font-weight: 600; }
.pj-chip.on { background: ${C.midnight}; border-color: ${C.midnight}; color: #fff; }
.pj-chip.on small { color: rgba(255,255,255,.7); }
.pj-sep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
.pj-clear { all: unset; cursor: pointer; font: 600 13px Figtree, sans-serif; color: ${C.horizon}; padding: 4px 8px; }
.pj-avatar { flex: none; display: inline-grid; place-items: center; border-radius: 99px; color: ${C.midnight}; font-family: Parkinsans, sans-serif; font-weight: 800; line-height: 1; }
.pj-tag { display: inline-flex; align-items: center; gap: 6px; font: 600 12px Figtree, sans-serif; color: var(--soft); }
.pj-tag i { width: 8px; height: 8px; border-radius: 3px; }
.pj-due { font: 600 12px Figtree, sans-serif; padding: 3px 8px; border-radius: 99px; background: var(--wash); color: var(--soft); white-space: nowrap; }
.pj-due.soon { background: rgba(243,170,8,.18); color: #9a6a00; }
.pj-due.late { background: rgba(229,72,77,.14); color: ${C.late}; }
.pj-due.done { opacity: .7; }
.pj-high { color: #e8794a; font-size: 9px; margin-right: 5px; }
.pj-ai { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; min-width: 0; font: 600 11px Figtree, sans-serif; color: var(--soft); white-space: nowrap; }
.pj-ai i { width: 7px; height: 7px; border-radius: 99px; background: linear-gradient(135deg, ${C.sun}, ${C.ocean}); }
.pj-board { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; align-items: start; }
.pj-col { border-radius: 20px; background: var(--wash); padding: 10px; }
.pj-col header { display: flex; align-items: center; gap: 8px; padding: 4px 6px 10px; font: 700 14px Figtree, sans-serif; }
.pj-col header i { width: 9px; height: 9px; border-radius: 99px; }
.pj-col header b { margin-left: auto; font-size: 12px; color: var(--soft); background: var(--panel); padding: 2px 8px; border-radius: 99px; }
.pj-cards { display: flex; flex-direction: column; gap: 8px; }
.pj-card { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 16px; background: var(--panel); border: 1px solid var(--line); box-shadow: 0 1px 2px rgba(6,33,63,.05); transition: transform .2s, box-shadow .2s, border-color .2s; }
.pj-card-top { display: flex; justify-content: space-between; align-items: center; }
.pj-id { display: inline-flex; align-items: center; font: 600 11px Figtree, sans-serif; color: var(--soft); }
.pj-card-title { font: 600 14.5px/1.3 Figtree, sans-serif; }
.pj-card-title.done { color: var(--soft); text-decoration: line-through; text-decoration-color: rgba(127,127,127,.5); }
.pj-card-foot { display: flex; align-items: center; gap: 7px; min-height: 24px; flex-wrap: wrap; row-gap: 6px; }
.pj-empty { font-size: 13px; color: var(--soft); text-align: center; padding: 14px 0; border: 1px dashed var(--line); border-radius: 14px; }
.pj-table-wrap { overflow-x: auto; border-radius: 20px; border: 1px solid var(--line); background: var(--panel); }
.pj-table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 760px; }
.pj-table th { position: sticky; top: 0; background: var(--panel); text-align: left; border-bottom: 1px solid var(--line); padding: 0; }
.pj-table th button { all: unset; cursor: pointer; display: flex; gap: 4px; padding: 12px 14px; font: 700 12px Figtree, sans-serif; letter-spacing: .04em; text-transform: uppercase; color: var(--soft); }
.pj-table th button span { color: ${C.horizon}; }
.pj-table td { padding: 10px 14px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.pj-table tbody tr:last-child td { border-bottom: 0; }
.pj-table tbody tr:hover td { background: var(--wash); }
.pj-title-cell { font-weight: 600; }
.pj-title-cell a { border-bottom: 1px solid rgba(9,132,200,.35); }
.pj-title-cell a:hover { color: ${C.horizon}; }
.pj-owner { display: inline-flex; align-items: center; gap: 8px; }
.pj-status { display: inline-flex; align-items: center; gap: 6px; font: 600 12px Figtree, sans-serif; padding: 3px 10px 3px 8px; border-radius: 99px; background: var(--wash); }
.pj-status::before { content: ''; width: 7px; height: 7px; border-radius: 99px; background: var(--s); }
.pj-muted { color: var(--soft); }
.pj-strong { font-weight: 700; }
.pj-tl-wrap { overflow-x: auto; border-radius: 20px; border: 1px solid var(--line); background: var(--panel); padding: 8px 16px 16px; }
.pj-tl { position: relative; min-width: 860px; padding-left: 96px; }
.pj-tl-axis { position: relative; height: 46px; }
.pj-tl-axis span { position: absolute; top: 26px; transform: translateX(-50%); font: 600 11px Figtree, sans-serif; color: var(--soft); white-space: nowrap; }
.pj-tl-body { position: relative; padding-bottom: 4px; }
.pj-tl-grid { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--line); }
.pj-tl-today, .pj-tl-open { position: absolute; top: -22px; bottom: 0; width: 2px; z-index: 2; pointer-events: none; }
.pj-tl-today { background: ${C.horizon}; }
.pj-tl-open { background: ${C.sun}; }
.pj-tl-today b, .pj-tl-open b { position: absolute; bottom: 100%; left: 50%; transform: translate(-50%, -4px); font: 700 10.5px Figtree, sans-serif; padding: 2px 7px; border-radius: 99px; white-space: nowrap; color: #fff; }
.pj-tl-today b { background: ${C.horizon}; }
.pj-tl-open b { background: ${C.sun}; color: ${C.midnight}; }
.pj-lane { position: relative; padding: 8px 0; border-top: 1px solid var(--line); }
.pj-lane:first-of-type { border-top: 0; }
.pj-lane-name { position: absolute; left: -96px; top: 10px; width: 88px; display: flex; align-items: center; gap: 7px; font: 700 13px Figtree, sans-serif; }
.pj-lane-name i { width: 9px; height: 9px; border-radius: 3px; }
.pj-row { position: relative; height: 28px; }
.pj-bar { position: absolute; top: 3px; height: 22px; border-radius: 99px; display: flex; align-items: center; gap: 6px; padding: 0 8px 0 3px; overflow: hidden; min-width: 24px;
  background: color-mix(in srgb, var(--c) 26%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 55%, transparent); }
.pj-bar em { font: 600 12px Figtree, sans-serif; font-style: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pj-bar.done { opacity: .5; }
.pj-bar.point { width: 14px; height: 14px; min-width: 0; top: 7px; padding: 0; border-radius: 3px; transform: translateX(-7px) rotate(45deg); background: var(--c); }
.pj-out-label { position: absolute; top: 5px; font: 600 12px Figtree, sans-serif; color: var(--ink); white-space: nowrap; }
.pj-out-label.done { color: var(--soft); }
a .pj-bar:hover { box-shadow: inset 0 0 0 2px var(--c); }
.pj-how { margin-top: 18px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 14px 18px; border-radius: 18px; border: 1px dashed var(--line); font-size: 14px; color: var(--soft); }
.pj-how-label { font: 700 13px Figtree, sans-serif; color: var(--ink); }
.pj-how code { font: 600 12.5px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 2px 7px; border-radius: 7px; background: var(--wash); color: var(--ink); }
.pj-prompts { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.pj-prompt { padding: 4px 10px; border-radius: 99px; background: rgba(243,170,8,.14); color: var(--ink); font-size: 13px; }
.pj-card.live { cursor: grab; }
.pj-card.live:hover { border-color: color-mix(in srgb, ${C.horizon} 35%, var(--line)); }
.pj-card:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
.pj-card.dragging { opacity: .4; }
.pj-card-title a:hover { color: ${C.horizon}; }
.pj-move { display: inline-flex; gap: 2px; margin-left: 6px; }
.pj-move button { all: unset; cursor: pointer; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; font: 700 15px/1 Figtree, sans-serif; color: var(--soft); background: var(--wash); }
.pj-move button:hover:not(:disabled) { background: ${C.midnight}; color: #fff; }
.pj-move button:disabled { opacity: .3; cursor: default; }
.pj-move button:focus-visible, .pj-add:focus-visible, .pj-btn:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
.pj-pick { position: relative; display: inline-flex; align-items: center; gap: 5px; padding: 1px 6px 1px 1px; border-radius: 99px; border: 1px solid transparent; cursor: pointer; }
.pj-pick:hover, .pj-pick:focus-within { border-color: var(--line); background: var(--wash); }
.pj-pick > span:not(.pj-avatar) { font: 600 12px Figtree, sans-serif; color: var(--ink); padding-right: 12px;
  background: linear-gradient(45deg, transparent 50%, currentColor 50%) right 4px top 55% / 4px 4px no-repeat, linear-gradient(135deg, currentColor 50%, transparent 50%) right 0 top 55% / 4px 4px no-repeat; }
.pj-pick select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font: 600 13px Figtree, sans-serif; }
.pj-pick select option { color: #06213f; }
.pj-pick:has(select:focus-visible) { outline: 2px solid ${C.horizon}; outline-offset: 1px; }
.pj-drop { display: block; height: 3px; border-radius: 99px; background: ${C.sun}; margin: -2px 4px; }
.pj-col.over { box-shadow: inset 0 0 0 2px color-mix(in srgb, ${C.sun} 60%, transparent); }
.pj-add { all: unset; cursor: pointer; padding: 8px 10px; border-radius: 12px; font: 600 13px Figtree, sans-serif; color: var(--soft); }
.pj-add:hover { background: var(--panel); color: var(--ink); }
.pj-form { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 16px; background: var(--panel); border: 1px solid ${C.horizon}; }
.pj-form input, .pj-form select { font: 600 13px Figtree, sans-serif; color: var(--ink); background: var(--wash); border: 1px solid var(--line); border-radius: 9px; padding: 6px 8px; min-width: 0; }
.pj-form > input { font-size: 14px; }
.pj-form-row { display: flex; flex-wrap: wrap; gap: 6px; }
.pj-form-row select, .pj-form-row input { flex: 1 1 70px; }
.pj-btn { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 99px; font: 700 13px Figtree, sans-serif; background: ${C.midnight}; color: #fff; }
.pj-btn:disabled { opacity: .4; cursor: default; }
.pj-btn.ghost { background: transparent; color: var(--soft); }
.pj-saving, .pj-problem { margin-left: auto; font: 600 13px Figtree, sans-serif; padding: 4px 10px; border-radius: 99px; }
.pj-saving { color: #9a6a00; background: rgba(243,170,8,.16); }
.pj-problem { color: ${C.late}; background: rgba(229,72,77,.12); }
.pj-hint { margin: 10px 2px 0; font-size: 13px; color: var(--soft); }
@container (max-width: 980px) {
  .pj-board { grid-template-columns: repeat(5, 248px); overflow-x: auto; padding-bottom: 8px; scroll-snap-type: x mandatory; }
  .pj-col { scroll-snap-align: start; }
}
@container (max-width: 560px) {
  .pj { padding-inline: 14px; }
  .pj-head { padding: 20px; border-radius: 22px; }
  .pj-stats { width: 100%; }
  .pj-stat { flex: 1; min-width: 0; }
  .pj-progress { min-width: 0; }
  .pj-board { grid-template-columns: repeat(5, 82cqw); }
  .pj-sep { display: none; }
}
@media (prefers-reduced-motion: reduce) { .pj-card { transition: none; } }
@media (hover: none) { .pj-card.live { cursor: default; } }
`
