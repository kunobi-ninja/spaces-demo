import * as React from 'react'

/*
 * One data file, three views. The page passes in the raw `tasks.csv`, the team
 * description and its words; everything here only reads them. Pages cannot write
 * files, so changes happen in `data/tasks.csv`, by hand or by asking an AI.
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

const C = { midnight: '#06213f', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8', late: '#e5484d' }
const STATUS_COLOR: Record<string, string> = { Idea: '#9aa7b4', 'To do': C.horizon, Doing: C.sun, Waiting: '#e8794a', Done: C.tide }
const DAY = 86_400_000

/** Rows of a CSV file, quoted fields and escaped quotes included. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((cell) => cell !== '')) rows.push(row)
  const [head = [], ...body] = rows
  return body.map((cells) => Object.fromEntries(head.map((key, i) => [key.trim(), (cells[i] ?? '').trim()])))
}

const time = (date: string) => (date ? Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) : NaN)
const lang = () => (typeof navigator !== 'undefined' && navigator.language) || 'en'
const shortDate = (date: string) =>
  date ? new Date(time(date)).toLocaleDateString(lang(), { month: 'short', day: 'numeric', timeZone: 'UTC' }) : ''

function Avatar({ person, size = 24 }: { person?: Person; size?: number }) {
  return (
    <span className="pj-avatar" style={{ width: size, height: size, background: person?.color ?? '#9aa7b4', fontSize: size * 0.46 }} title={person?.id}>
      {person?.id.slice(0, 1) ?? '?'}
    </span>
  )
}

function Due({ task, today, w }: { task: Task; today: number; w: Words }) {
  if (!task.due) return null
  const left = Math.round((time(task.due) - today) / DAY)
  const done = task.status === 'Done'
  const tone = done ? 'done' : left < 0 ? 'late' : left <= 7 ? 'soon' : 'later'
  const when = done ? '' : left < 0 ? ` · ${-left}${w.dShort} ${w.late}` : left === 0 ? ` · ${w.today}` : ` · ${left}${w.dShort}`
  return <span className={`pj-due ${tone}`}>{shortDate(task.due)}{when}</span>
}

function Card({ task, team, today, w }: { task: Task; team: Team; today: number; w: Words }) {
  const person = team.people.find((p) => p.id === task.owner)
  const project = team.projects.find((p) => p.id === task.project)
  const body = (
    <>
      <span className="pj-card-top">
        <span className="pj-tag"><i style={{ background: project?.color }} />{task.project}</span>
        <span className="pj-id">
          {task.priority === 'High' && task.status !== 'Done' ? <span className="pj-high" title={w.high}>▲</span> : null}
          {task.id}
        </span>
      </span>
      <span className={`pj-card-title${task.status === 'Done' ? ' done' : ''}`}>{task.title}</span>
      <span className="pj-card-foot">
        <Avatar person={person} />
        <Due task={task} today={today} w={w} />
        {task.ai ? <span className="pj-ai" title={w.aiHelps}><i />{task.ai}</span> : null}
      </span>
    </>
  )
  return task.page ? <a className="pj-card" href={task.page}>{body}</a> : <div className="pj-card">{body}</div>
}

function Board({ tasks, team, today, w }: { tasks: Task[]; team: Team; today: number; w: Words }) {
  return (
    <div className="pj-board">
      {team.statuses.map((status) => {
        const column = tasks.filter((t) => t.status === status).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))
        return (
          <section className="pj-col" key={status}>
            <header><i style={{ background: STATUS_COLOR[status] }} />{status}<b>{column.length}</b></header>
            <div className="pj-cards">
              {column.map((task) => <Card key={task.id} task={task} team={team} today={today} w={w} />)}
              {column.length === 0 ? <div className="pj-empty">{w.empty}</div> : null}
            </div>
          </section>
        )
      })}
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
                <td><span className="pj-tag"><i style={{ background: project?.color }} />{t.project}</span></td>
                <td><span className="pj-owner"><Avatar person={person} size={22} />{t.owner}</span></td>
                <td><span className="pj-status" style={{ ['--s' as string]: STATUS_COLOR[t.status] }}>{t.status}</span></td>
                <td><Due task={t} today={today} w={w} /></td>
                <td className={t.priority === 'High' ? 'pj-strong' : 'pj-muted'}>{t.priority}</td>
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
          {weeks.map((at) => <span key={at} style={{ left: pct(at) }}>{shortDate(new Date(at).toISOString().slice(0, 10))}</span>)}
        </div>
        <div className="pj-tl-body">
          {weeks.map((at) => <span key={at} className="pj-tl-grid" style={{ left: pct(at) }} />)}
          <span className="pj-tl-today" style={{ left: pct(today) }}><b>{w.today}</b></span>
          <span className="pj-tl-open" style={{ left: pct(opening) }}><b>{w.opening}</b></span>
          {lanes.map(({ project, tasks: laneTasks }) => (
            <div className="pj-lane" key={project.id}>
              <div className="pj-lane-name"><i style={{ background: project.color }} />{project.id}</div>
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
                    title={`${t.id} · ${t.title} · ${t.owner} · ${shortDate(t.start)} – ${shortDate(t.due)}`}
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

/**
 * The text of an imported data file. Kunobi hands a `.csv?raw` import over as an asset
 * URL rather than its text, so a URL is read once; text is used as it is.
 */
export function useFileText(source: string): string | null {
  const isUrl = /^(blob:|data:|https?:|kunobi)/.test(source)
  const [text, setText] = React.useState<string | null>(isUrl ? null : source)
  React.useEffect(() => {
    if (!isUrl) { setText(source); return }
    let live = true
    fetch(source).then((r) => r.text()).then((t) => { if (live) setText(t) }, () => { if (live) setText('') })
    return () => { live = false }
  }, [source, isUrl])
  return text
}

export function Projects({ csv, team, w }: { csv: string; team: Team; w: Words }) {
  const text = useFileText(csv)
  const all = React.useMemo(() => (text ? (parseCsv(text) as unknown as Task[]) : []), [text])
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
                return n ? <i key={s} style={{ flex: n, background: STATUS_COLOR[s] }} title={`${s}: ${n}`} /> : null
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
                <i style={{ background: p.color }} />{p.id}<small>{n}</small>
              </button>
            ) : null
          })}
          {people.length || projects.length ? <button className="pj-clear" onClick={() => { setPeople([]); setProjects([]) }}>{w.clear}</button> : null}
        </div>
      </div>

      {view === 'board' ? <Board tasks={shown} team={team} today={today} w={w} /> : null}
      {view === 'table' ? <TableView tasks={shown} team={team} today={today} w={w} /> : null}
      {view === 'timeline' ? <Timeline tasks={shown} team={team} today={today} w={w} /> : null}

      <footer className="pj-how">
        <span className="pj-how-label">{w.howTitle}</span>
        <span>{w.howBody} <code>data/tasks.csv</code>.</span>
        <span className="pj-prompts">
          {[w.prompt1, w.prompt2].map((p) => <span key={p} className="pj-prompt">“{p}”</span>)}
        </span>
      </footer>
    </div>
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
a.pj-card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(6,33,63,.12); border-color: transparent; }
.pj-card-top { display: flex; justify-content: space-between; align-items: center; }
.pj-id { font: 600 11px Figtree, sans-serif; color: var(--soft); opacity: .7; }
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
`
