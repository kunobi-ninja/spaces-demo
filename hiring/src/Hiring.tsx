import * as React from 'react'
import { edit, useStore, useStoreStatus } from 'kunobi'
import type { HiringPipelineStore } from '../types/hiring-pipeline.store'

/*
 * A small company's hiring pipeline: a board per role, the interviewers' scorecards side by side
 * with the places they disagree, the funnel, and what happens this week. Roles, candidates and
 * scorecards come from data/hiring.json. Where each candidate stands, and quick verdicts from
 * interviewers who have not written a scorecard yet, live in the hiring-pipeline store.
 */

export const STORE = 'hiring-pipeline'

type Stage = 'applied' | 'screen' | 'interview' | 'offer' | 'hired'
type Recommend = 'strong yes' | 'yes' | 'unsure' | 'no'

interface Interviewer { id: string; name: string; role: string; color: string }
interface Criterion { id: string; label: string }
interface Role { id: string; title: string; short: string; openings: number; owner: string; mustHaves: string[]; criteria: Criterion[] }
interface Scorecard { by: string; recommend: Recommend; scores: Record<string, number>; note: string }
interface Candidate {
  id: string
  name: string
  role: string
  stage: Stage | 'declined'
  reached?: Stage
  declinedBy?: 'candidate' | 'us'
  declinedReason?: string
  source: string
  applied: string
  since: string
  next?: { what: string; type: 'review' | 'screen' | 'interview' | 'meeting' | 'decision' | 'offer' | 'start'; date: string; with: string }
  scorecards: Scorecard[]
  /** Quick verdicts from interviewers without a scorecard yet. */
  quick: { by: string; recommend: Recommend }[]
}
type FileCandidate = Omit<Candidate, 'stage' | 'since' | 'reached' | 'quick'>
export interface HiringData {
  company: string
  today: string
  interviewers: Interviewer[]
  stages: Stage[]
  roles: Role[]
  candidates: FileCandidate[]
}

const C = { midnight: '#06213f', deep: '#0b2d52', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8', coral: '#e2603f' }
const SCORE_COLOR = ['', C.coral, C.sun, C.ocean, C.tide]
const DARK_TEXT = new Set([C.sun, C.ocean, C.tide])
const POSITIVE: Recommend[] = ['strong yes', 'yes']

const day = (s: string) => Date.parse(s + 'T12:00:00Z')
const daysBetween = (from: string, to: string) => Math.round((day(to) - day(from)) / 86_400_000)
const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('')

/** The criteria where interviewers are two or more points apart, and whether their verdicts split. */
export function disagreements(c: Candidate, role: Role) {
  const rows = role.criteria.map((cr) => {
    const scores = c.scorecards.map((s) => s.scores[cr.id]).filter((v) => typeof v === 'number')
    const spread = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0
    return { criterion: cr, scores, spread, low: Math.min(...scores), high: Math.max(...scores), flagged: spread >= 2 }
  })
  const verdicts = [...c.scorecards.map((s) => s.recommend), ...c.quick.map((q) => q.recommend)]
  const split = verdicts.some((v) => POSITIVE.includes(v)) && verdicts.some((v) => v === 'no')
  return { rows, split, count: rows.filter((r) => r.flagged).length + (split ? 1 : 0) }
}

const reachedIndex = (c: Candidate, stages: Stage[]) => stages.indexOf(c.stage === 'declined' ? (c.reached ?? 'applied') : c.stage)

function Avatar({ name, color, size = 28 }: { name: string; color?: string; size?: number }) {
  const bg = color ?? 'hsl(var(--muted))'
  const fg = color ? (DARK_TEXT.has(color) ? C.midnight : '#fff') : 'hsl(var(--foreground))'
  return (
    <span className="hr-avatar" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

function ScoreCell({ value }: { value?: number }) {
  if (typeof value !== 'number') return <span className="hr-score none">–</span>
  const color = SCORE_COLOR[value]
  return (
    <span className="hr-score" style={{ background: color, color: DARK_TEXT.has(color) ? C.midnight : '#fff' }}>
      {value}
      <span className="hr-pips" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => <i key={i} className={i <= value ? 'on' : ''} />)}
      </span>
    </span>
  )
}

const EMPTY: HiringPipelineStore = { candidates: {}, verdicts: {} }

export function Hiring({ data, w }: { data: HiringData; w: any }) {
  const { today, stages, roles, interviewers } = data
  const stored = useStore(STORE) as HiringPipelineStore | undefined
  const status = useStoreStatus(STORE)
  // Until the store opens, the board stays empty and its hint says why.
  const open = (status?.status === 'open' || status?.status === 'paused') && stored !== undefined
  const canEdit = open && status?.status === 'open' && Boolean(status?.canEdit)
  const waiting = open ? null : status?.status === 'refused' || status?.status === 'closed' ? w.unavailable : w.loading
  const pipe = (open && stored) || EMPTY
  const candidates: Candidate[] = React.useMemo(() => {
    const quick = Object.values(pipe.verdicts ?? {})
    return data.candidates.map((c) => {
      const at = pipe.candidates?.[c.id]
      return {
        ...c,
        stage: at?.stage ?? 'applied',
        since: at?.since ?? c.applied,
        reached: at?.reached ?? undefined,
        quick: quick.filter((q) => q.candidate === c.id && q.by && q.recommend).map((q) => ({ by: q.by!, recommend: q.recommend! })),
      }
    })
  }, [data, pipe])
  /** Move a candidate on (or out). The date is the board's own "today". */
  const move = (c: Candidate, to: Candidate['stage']) =>
    edit(STORE, (d: HiringPipelineStore) => {
      const values = { stage: to, since: today, reached: to === 'declined' ? (c.stage as Stage) : null }
      if (d.candidates[c.id]) Object.assign(d.candidates[c.id], values)
      else d.candidates[c.id] = values
    })
  const setQuick = (c: Candidate, by: string, recommend: Recommend | '') =>
    edit(STORE, (d: HiringPipelineStore) => {
      const id = `${c.id}-${by}`
      if (!recommend) delete d.verdicts[id]
      else if (d.verdicts[id]) d.verdicts[id].recommend = recommend
      else d.verdicts[id] = { candidate: c.id, by: by as HiringPipelineStore['verdicts'][string]['by'], recommend }
    })
  const [picked, setPicked] = React.useState<string | null>(null)
  const byInterviewer = new Map(interviewers.map((i) => [i.id, i]))
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const [roleFilter, setRoleFilter] = React.useState<string>('all')

  const scored = candidates
    .filter((c) => c.scorecards.length > 0)
    .map((c) => ({ c, d: disagreements(c, roleById.get(c.role)!) }))
    .sort((a, b) => b.d.count - a.d.count || b.c.scorecards.length - a.c.scorecards.length)
  const [selected, setSelected] = React.useState<string>(scored[0]?.c.id ?? '')

  const inRole = (c: Candidate) => roleFilter === 'all' || c.role === roleFilter
  const shown = candidates.filter(inRole)
  const active = shown.filter((c) => c.stage !== 'hired' && c.stage !== 'declined')
  const weekEnd = new Date(day(today) + 6 * 86_400_000).toISOString().slice(0, 10)
  const thisWeek = shown
    .filter((c) => c.next && c.next.date >= today && c.next.date <= weekEnd && c.stage !== 'declined')
    .sort((a, b) => a.next!.date.localeCompare(b.next!.date))
  const talks = thisWeek.filter((c) => ['screen', 'interview', 'meeting'].includes(c.next!.type))
  const weekList = thisWeek.filter((c) => c.next!.type !== 'review')
  const reviews = thisWeek.filter((c) => c.next!.type === 'review')
  const panelRef = React.useRef<HTMLDivElement>(null)
  const toDiscuss = scored.filter(({ c, d }) => inRole(c) && d.count > 0 && c.stage !== 'declined' && c.stage !== 'hired')
  const fmt = (s: string, opts: Intl.DateTimeFormatOptions) => new Date(day(s)).toLocaleDateString(w.locale, { timeZone: 'UTC', ...opts })

  const current = candidates.find((c) => c.id === selected)
  const currentRole = current ? roleById.get(current.role)! : roles[0]
  const currentD = current ? disagreements(current, currentRole) : null
  const select = (id: string, scroll = false) => {
    setSelected(id)
    if (scroll) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // The funnel: how many candidates reached each stage, and the share that moved on.
  const reached = stages.map((_, i) => shown.filter((c) => reachedIndex(c, stages) >= i).length)

  return (
    <div className="hr-root">
      <style>{`
        .hr-root { width: min(var(--kunobi-prose-width, 1200px), 100%); margin: 0 auto; box-sizing: border-box; padding: 16px 20px 40px; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
        .hr-in { container-type: inline-size; }
        .hr-root h2, .hr-root h3 { font-family: Parkinsans, Figtree, sans-serif; letter-spacing: -0.02em; margin: 0; }
        .hr-head { border-radius: 26px; padding: clamp(22px, 3.4cqw, 34px); color: #fff; background: radial-gradient(120% 160% at 10% 0%, ${C.deep} 0%, ${C.midnight} 60%, #031426 100%); display: grid; grid-template-columns: 1fr auto; gap: 20px; align-items: end; }
        .hr-eyebrow { font-size: 13px; font-weight: 600; letter-spacing: .04em; color: rgba(255,255,255,.7); text-transform: uppercase; }
        .hr-title { font: 800 clamp(28px, 4cqw, 44px)/1.02 Parkinsans, sans-serif; letter-spacing: -0.03em; margin: 6px 0 10px; }
        .hr-roles { display: flex; flex-wrap: wrap; gap: 8px; }
        .hr-rolechip { display: inline-flex; gap: 8px; align-items: center; padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.1); font-size: 14px; }
        .hr-rolechip b { color: ${C.sun}; font-weight: 700; }
        .hr-kpis { display: grid; grid-template-columns: repeat(4, minmax(84px, 1fr)); gap: 8px; }
        .hr-kpi { background: rgba(255,255,255,.08); border-radius: 16px; padding: 10px 14px; min-width: 84px; }
        .hr-kpi b { display: block; font: 800 28px/1 Parkinsans, sans-serif; }
        .hr-kpi span { font-size: 12.5px; color: rgba(255,255,255,.72); }
        .hr-kpi.warn b { color: ${C.sun}; }
        .hr-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin: 22px 0 12px; }
        .hr-tabs { display: inline-flex; padding: 3px; border-radius: 999px; background: hsl(var(--muted)); gap: 2px; }
        .hr-tab { all: unset; cursor: pointer; padding: 8px 14px; border-radius: 999px; font: 600 14px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
        .hr-tab.on { background: ${C.midnight}; color: #fff; }
        .hr-tab:focus-visible, .hr-card:focus-visible, .hr-who:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
        .hr-hint { font-size: 13.5px; color: hsl(var(--muted-foreground)); }
        .hr-board { display: grid; grid-template-columns: repeat(5, minmax(150px, 1fr)) minmax(120px, .8fr); gap: 10px; overflow-x: auto; padding-bottom: 6px; }
        .hr-col { background: hsl(var(--muted) / 0.55); border-radius: 18px; padding: 10px; min-height: 120px; }
        .hr-col.out { background: transparent; border: 1px dashed hsl(var(--border)); }
        .hr-colhead { display: flex; justify-content: space-between; align-items: center; font: 600 13.5px Figtree, sans-serif; padding: 2px 4px 8px; }
        .hr-colhead small { font-size: 12px; color: hsl(var(--muted-foreground)); background: hsl(var(--card)); border-radius: 99px; padding: 1px 8px; }
        .hr-card { all: unset; box-sizing: border-box; cursor: pointer; display: block; width: 100%; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 14px; padding: 10px 11px; margin-bottom: 8px; box-shadow: 0 2px 8px rgba(6,33,63,.05); transition: transform .15s, box-shadow .15s; }
        .hr-card:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(6,33,63,.1); }
        .hr-card.sel { border-color: ${C.horizon}; box-shadow: 0 0 0 2px ${C.horizon}33; }
        .hr-card.muted { opacity: .62; }
        .hr-cardtop { display: flex; gap: 8px; align-items: center; }
        .hr-name { font-weight: 600; font-size: 14.5px; line-height: 1.2; }
        .hr-role { font-size: 12px; color: hsl(var(--muted-foreground)); }
        .hr-meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
        .hr-pill { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 99px; background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
        .hr-pill.slow { background: ${C.sun}2b; color: hsl(var(--foreground)); }
        .hr-pill.flag { background: ${C.coral}22; color: ${C.coral}; }
        .hr-avatar { display: inline-grid; place-items: center; border-radius: 99px; font-weight: 700; flex: none; }
        .hr-section { margin-top: 30px; }
        .hr-first { margin-top: 8px; scroll-margin-top: 12px; }
        .hr-filter { margin-bottom: 4px; }
        .hr-pipe { margin-top: 30px; }
        .hr-h2 { font: 800 clamp(22px, 2.4cqw, 28px) Parkinsans, sans-serif; letter-spacing: -0.02em; margin: 0 12px 0 0; }
        .hr-pipe .hr-h2 { margin-right: auto; }
        .hr-sechead { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 16px; margin-bottom: 12px; }
        .hr-sechead h2 { font-size: clamp(22px, 2.4cqw, 28px); font-weight: 800; }
        .hr-compare { display: grid; grid-template-columns: 250px 1fr; gap: 14px; align-items: start; }
        .hr-list { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 20px; padding: 8px; }
        .hr-who { all: unset; box-sizing: border-box; cursor: pointer; display: flex; gap: 10px; align-items: center; width: 100%; padding: 8px 10px; border-radius: 12px; }
        .hr-who:hover { background: hsl(var(--muted) / .6); }
        .hr-who.sel { background: hsl(var(--muted)); }
        .hr-who .hr-name { font-size: 14px; }
        .hr-who .end { margin-left: auto; }
        .hr-panel { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 22px; padding: clamp(16px, 2.4cqw, 24px); box-shadow: 0 10px 28px rgba(6,33,63,.06); }
        .hr-ptop { display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: center; justify-content: space-between; }
        .hr-ptop h3 { font-size: 24px; font-weight: 800; }
        .hr-verdict { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border-radius: 999px; font-weight: 600; font-size: 14px; }
        .hr-verdict.split { background: ${C.coral}1f; color: ${C.coral}; }
        .hr-verdict.agree { background: ${C.tide}26; color: hsl(var(--foreground)); }
        .hr-matrix { width: 100%; border-collapse: separate; border-spacing: 0 6px; margin-top: 14px; }
        .hr-matrix th { font: 600 12.5px Figtree, sans-serif; color: hsl(var(--muted-foreground)); text-align: center; padding: 0 6px 2px; }
        .hr-matrix th:first-child { text-align: left; }
        .hr-matrix td { padding: 8px 6px; text-align: center; background: hsl(var(--muted) / .45); }
        .hr-matrix td:first-child { text-align: left; border-radius: 12px 0 0 12px; font-weight: 600; font-size: 14.5px; padding-left: 14px; }
        .hr-matrix td:last-child { border-radius: 0 12px 12px 0; padding-right: 14px; text-align: right; }
        .hr-matrix tr.flag td { background: ${C.sun}24; }
        .hr-th-who { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
        .hr-score { display: inline-flex; align-items: center; gap: 7px; padding: 4px 10px 4px 11px; border-radius: 999px; font: 800 15px Parkinsans, sans-serif; }
        .hr-score.none { background: transparent; color: hsl(var(--muted-foreground)); font-weight: 600; }
        .hr-pips { display: inline-flex; gap: 2px; }
        .hr-pips i { width: 5px; height: 5px; border-radius: 99px; background: currentColor; opacity: .3; }
        .hr-pips i.on { opacity: .95; }
        .hr-talk { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: hsl(var(--foreground)); white-space: nowrap; }
        .hr-talk i { width: 8px; height: 8px; border-radius: 99px; background: ${C.sun}; }
        .hr-ok { font-size: 12.5px; color: hsl(var(--muted-foreground)); }
        .hr-rec td { background: transparent !important; padding-top: 4px; }
        .hr-rec .hr-pill { font-size: 12px; white-space: nowrap; }
        .hr-rec .yes { background: ${C.tide}2e; color: hsl(var(--foreground)); }
        .hr-rec .no { background: ${C.coral}22; color: ${C.coral}; }
        .hr-notes { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-top: 14px; }
        .hr-note { border-radius: 16px; padding: 12px 14px; background: hsl(var(--muted) / .45); border-left: 4px solid var(--who); font-size: 14px; line-height: 1.45; }
        .hr-note b { display: block; font-size: 12.5px; margin-bottom: 4px; }
        .hr-pending { margin-top: 12px; font-size: 13.5px; color: hsl(var(--muted-foreground)); }
        .hr-two { display: grid; grid-template-columns: 1.1fr 1fr; gap: 14px; align-items: start; }
        .hr-box { background: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: 20px; padding: 18px 20px; }
        .hr-box h3 { font-size: 19px; font-weight: 800; margin-bottom: 12px; }
        .hr-funnel { display: grid; gap: 4px; }
        .hr-frow { display: grid; grid-template-columns: 82px 1fr 44px; align-items: center; gap: 10px; font-size: 14px; }
        .hr-fbar { height: 26px; border-radius: 8px; background: linear-gradient(90deg, ${C.horizon}, ${C.ocean}); min-width: 6px; }
        .hr-fn { font-weight: 700; text-align: right; }
        .hr-conv { grid-column: 2 / 4; font-size: 12px; color: hsl(var(--muted-foreground)); padding-left: 4px; }
        .hr-week { list-style: none; margin: 0; padding: 0; }
        .hr-week li { display: grid; grid-template-columns: 54px 1fr auto; gap: 12px; align-items: center; padding: 9px 0; border-top: 1px solid hsl(var(--border)); }
        .hr-week li:first-child { border-top: 0; }
        .hr-date { text-align: center; line-height: 1.05; }
        .hr-date b { display: block; font: 800 20px Parkinsans, sans-serif; }
        .hr-date span { font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: hsl(var(--muted-foreground)); }
        .hr-what { font-size: 14px; font-weight: 600; }
        .hr-what span { display: block; font-weight: 400; font-size: 13px; color: hsl(var(--muted-foreground)); }
        .hr-change { margin-top: 26px; padding: 16px 18px; border-radius: 18px; background: hsl(var(--muted) / .55); font-size: 14.5px; line-height: 1.5; }
        .hr-change b { font-family: Parkinsans, sans-serif; }
        .hr-change code { font-size: 13px; background: hsl(var(--card)); padding: 1px 6px; border-radius: 6px; }
        .hr-change q { display: block; margin-top: 4px; quotes: none; font-style: italic; }
        .hr-change q::before, .hr-change q::after { content: none; }
        .hr-cardwrap { margin-bottom: 8px; }
        .hr-cardwrap .hr-card { margin-bottom: 0; }
        .hr-moves { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
        .hr-move { all: unset; cursor: pointer; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 99px; background: ${C.midnight}; color: #fff; }
        .hr-move.no { background: transparent; color: hsl(var(--muted-foreground)); box-shadow: inset 0 0 0 1px hsl(var(--border)); }
        .hr-move:focus-visible, .hr-quick:focus-visible { outline: 2px solid ${C.horizon}; outline-offset: 2px; }
        .hr-quick { font: 600 12px Figtree, sans-serif; padding: 3px 6px; border-radius: 99px; border: 1px dashed hsl(var(--border)); background: hsl(var(--card)); color: hsl(var(--foreground)); max-width: 100%; }
        .hr-sample { margin-top: 10px; font-size: 12.5px; color: hsl(var(--muted-foreground)); }
        @container (max-width: 860px) {
          .hr-head { grid-template-columns: 1fr; }
          .hr-compare, .hr-two { grid-template-columns: 1fr; }
          .hr-list { display: flex; overflow-x: auto; gap: 4px; }
          .hr-who { width: auto; flex: none; }
          .hr-board { grid-template-columns: repeat(6, 200px); }
        }
        @container (max-width: 520px) {
          .hr-kpis { grid-template-columns: repeat(2, 1fr); }
          .hr-matrix th .hr-th-who span:last-child { display: none; }
          .hr-matrix td:first-child { font-size: 13px; padding-left: 10px; }
          .hr-score { padding: 3px 8px; font-size: 14px; }
          .hr-pips { display: none; }
          .hr-talk span { display: none; }
          .hr-rec .hr-pill { font-size: 10.5px; padding: 2px 6px; }
        }
      `}</style>
      <div className="hr-in">
        <header className="hr-head">
          <div>
            <div className="hr-eyebrow">{data.company} · {w.hiring}</div>
            <div className="hr-title">{w.title}</div>
            <div className="hr-roles">
              {roles.map((r) => (
                <span className="hr-rolechip" key={r.id}>{r.title} <b>{w.openings({ count: r.openings })}</b></span>
              ))}
            </div>
          </div>
          <div className="hr-kpis">
            <div className="hr-kpi"><b>{active.length}</b><span>{w.inProcess}</span></div>
            <div className="hr-kpi"><b>{talks.length}</b><span>{w.thisWeekShort}</span></div>
            <div className="hr-kpi"><b>{shown.filter((c) => c.stage === 'offer').length}</b><span>{w.offersOut}</span></div>
            <div className={`hr-kpi${toDiscuss.length ? ' warn' : ''}`}><b>{toDiscuss.length}</b><span>{w.toDiscuss}</span></div>
          </div>
        </header>

        <div className="hr-bar hr-filter">
          <div className="hr-tabs" role="group" aria-label={w.role}>
            {[{ id: 'all', short: w.allRoles, title: w.allRoles }, ...roles].map((r) => (
              <button key={r.id} className={`hr-tab${roleFilter === r.id ? ' on' : ''}`} aria-pressed={roleFilter === r.id} onClick={() => setRoleFilter(r.id)} title={r.title}>
                {r.short}
              </button>
            ))}
          </div>
          <span className="hr-hint">{w.sample}</span>
        </div>

        <section className="hr-section hr-first" ref={panelRef}>
          <div className="hr-sechead">
            <h2>{w.compareTitle}</h2>
            <span className="hr-hint">{w.compareHint}</span>
          </div>
          <div className="hr-compare">
            <nav className="hr-list" aria-label={w.compareTitle}>
              {scored.filter(({ c }) => inRole(c)).map(({ c, d }) => (
                <button key={c.id} className={`hr-who${selected === c.id ? ' sel' : ''}`} onClick={() => select(c.id)} aria-pressed={selected === c.id}>
                  <Avatar name={c.name} size={30} />
                  <div>
                    <div className="hr-name">{c.name}</div>
                    <div className="hr-role">{w.stage[c.stage]}</div>
                  </div>
                  <span className="end">{d.count > 0 ? <span className="hr-pill flag">{d.count}</span> : <span className="hr-pill">✓</span>}</span>
                </button>
              ))}
            </nav>
            {current && currentD && (
              <article className="hr-panel">
                <div className="hr-ptop">
                  <div>
                    <h3>{current.name}</h3>
                    <div className="hr-role">{currentRole.title} · {w.stage[current.stage]} · {current.source} · {w.applied} {fmt(current.applied, { day: 'numeric', month: 'short' })}{open && !status?.saved ? ` · ${w.saving}` : ''}</div>
                  </div>
                  {currentD.split ? (
                    <span className="hr-verdict split">● {w.splitVerdict}</span>
                  ) : (
                    <span className="hr-verdict agree">● {currentD.count ? w.verdictAgreeButScores : w.agree}</span>
                  )}
                </div>
                <table className="hr-matrix">
                  <thead>
                    <tr>
                      <th>{w.criterion}</th>
                      {interviewers.map((iv) => (
                        <th key={iv.id}>
                          <span className="hr-th-who"><Avatar name={iv.name} color={iv.color} size={26} /><span>{iv.name.split(' ')[0]}</span></span>
                        </th>
                      ))}
                      <th style={{ textAlign: 'right' }}>{w.gap}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentD.rows.map((row) => (
                      <tr key={row.criterion.id} className={row.flagged ? 'flag' : ''}>
                        <td>{row.criterion.label}</td>
                        {interviewers.map((iv) => {
                          const sc = current.scorecards.find((s) => s.by === iv.id)
                          return <td key={iv.id}><ScoreCell value={sc?.scores[row.criterion.id]} /></td>
                        })}
                        <td>
                          {row.flagged ? (
                            <span className="hr-talk"><i /><span>{w.talk} </span>{row.low} {w.vs} {row.high}</span>
                          ) : row.scores.length > 1 ? (
                            <span className="hr-ok">{w.close}</span>
                          ) : (
                            <span className="hr-ok">–</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="hr-rec">
                      <td style={{ fontWeight: 600, fontSize: 13.5 }}>{w.recommends}</td>
                      {interviewers.map((iv) => {
                        const sc = current.scorecards.find((s) => s.by === iv.id)
                        const q = current.quick.find((x) => x.by === iv.id)
                        const tone = (r: Recommend) => (POSITIVE.includes(r) ? 'yes' : r === 'no' ? 'no' : '')
                        const stillOpen = current.stage !== 'declined' && current.stage !== 'hired'
                        return (
                          <td key={iv.id}>
                            {sc ? (
                              <span className={`hr-pill ${tone(sc.recommend)}`}>{w.rec[sc.recommend]}</span>
                            ) : canEdit && stillOpen ? (
                              <select
                                className={`hr-quick ${q ? tone(q.recommend) : ''}`}
                                value={q?.recommend ?? ''}
                                aria-label={w.quickFor({ name: iv.name.split(' ')[0] })}
                                onChange={(e) => setQuick(current, iv.id, e.currentTarget.value as Recommend | '')}
                              >
                                <option value="">{w.notYet}</option>
                                {(['strong yes', 'yes', 'unsure', 'no'] as Recommend[]).map((r) => <option key={r} value={r}>{w.rec[r]}</option>)}
                              </select>
                            ) : q ? (
                              <span className={`hr-pill ${tone(q.recommend)}`} title={w.quickTitle}>{w.rec[q.recommend]}*</span>
                            ) : (
                              <span className="hr-ok">{w.notYet}</span>
                            )}
                          </td>
                        )
                      })}
                      <td />
                    </tr>
                  </tbody>
                </table>
                <div className="hr-notes">
                  {current.scorecards.map((s) => {
                    const iv = byInterviewer.get(s.by)!
                    return (
                      <div key={s.by} className="hr-note" style={{ ['--who' as any]: iv.color }}>
                        <b>{iv.name} · {iv.role}</b>
                        {s.note}
                      </div>
                    )
                  })}
                </div>
                {interviewers.some((iv) => !current.scorecards.find((s) => s.by === iv.id)) && current.stage !== 'declined' && current.stage !== 'hired' && (
                  <div className="hr-pending">
                    {w.pending({ names: new Intl.ListFormat(w.locale, { type: 'conjunction' }).format(interviewers.filter((iv) => !current.scorecards.find((s) => s.by === iv.id)).map((iv) => iv.name.split(' ')[0])) })}
                  </div>
                )}
                {current.stage === 'declined' && current.declinedReason && <div className="hr-pending">{current.declinedReason}</div>}
              </article>
            )}
          </div>
        </section>

        <div className="hr-bar hr-pipe">
          <h2 className="hr-h2">{w.pipeline}</h2>
          <span className="hr-hint">{waiting ?? (open && !status?.saved ? w.saving : canEdit ? w.boardHintEdit : w.boardHint)}</span>
        </div>

        <div className="hr-board">
          {[...stages, 'declined' as const].map((st) => {
            // No stages to place anyone in until the store opens.
            const list = waiting ? [] : shown.filter((c) => c.stage === st)
            return (
              <section key={st} className={`hr-col${st === 'declined' ? ' out' : ''}`} aria-label={w.stage[st]}>
                <div className="hr-colhead">{w.stage[st]} <small>{list.length}</small></div>
                {list.map((c) => {
                  const d = c.scorecards.length ? disagreements(c, roleById.get(c.role)!) : null
                  const inStage = daysBetween(c.since, today)
                  const live = st !== 'declined' && st !== 'hired'
                  return (
                    <div key={c.id} className="hr-cardwrap">
                    <button className={`hr-card${selected === c.id || (canEdit && picked === c.id) ? ' sel' : ''}${st === 'declined' ? ' muted' : ''}`} onClick={() => { setPicked(c.id); if (c.scorecards.length) select(c.id, !canEdit) }} aria-pressed={selected === c.id || (canEdit && picked === c.id)}>
                      <div className="hr-cardtop">
                        <Avatar name={c.name} size={26} />
                        <div>
                          <div className="hr-name">{c.name}</div>
                          {roleFilter === 'all' && <div className="hr-role">{roleById.get(c.role)!.short}</div>}
                        </div>
                      </div>
                      <div className="hr-meta">
                        {live && <span className={`hr-pill${inStage > 7 ? ' slow' : ''}`}>{inStage === 0 ? w.today : w.daysIn({ count: inStage })}</span>}
                        {st === 'declined' && <span className="hr-pill">{c.declinedBy === 'candidate' ? w.theyDeclined : w.weDeclined}</span>}
                        {c.scorecards.length > 0 && <span className="hr-pill">{w.cards({ count: c.scorecards.length })}</span>}
                        {d && d.count > 0 && live && <span className="hr-pill flag">{w.discuss({ count: d.count })}</span>}
                      </div>
                    </button>
                    {canEdit && live && picked === c.id && (
                      <div className="hr-moves">
                        <button className="hr-move" onClick={() => move(c, stages[stages.indexOf(c.stage as Stage) + 1])}>
                          → {w.stage[stages[stages.indexOf(c.stage as Stage) + 1]]}
                        </button>
                        <button className="hr-move no" onClick={() => move(c, 'declined')}>{w.decline}</button>
                      </div>
                    )}
                    </div>
                  )
                })}
              </section>
            )
          })}
        </div>

        <section className="hr-section hr-two">
          <div className="hr-box">
            <h3>{w.funnel}</h3>
            <div className="hr-funnel">
              {stages.map((st, i) => (
                <React.Fragment key={st}>
                  {i > 0 && (
                    <div className="hr-frow">
                      <span />
                      <span className="hr-conv">↓ {reached[i - 1] ? Math.round((reached[i] / reached[i - 1]) * 100) : 0}% {w.movedOn}</span>
                    </div>
                  )}
                  <div className="hr-frow">
                    <span>{w.stage[st]}</span>
                    <div className="hr-fbar" style={{ width: `${reached[0] ? (reached[i] / reached[0]) * 100 : 0}%`, opacity: 1 - i * 0.12 }} />
                    <span className="hr-fn">{reached[i]}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="hr-box">
            <h3>{w.thisWeek}</h3>
            {thisWeek.length === 0 ? (
              <div className="hr-ok">{w.nothingThisWeek}</div>
            ) : (
              <ul className="hr-week">
                {weekList.map((c) => {
                  const iv = byInterviewer.get(c.next!.with)
                  return (
                    <li key={c.id}>
                      <div className="hr-date">
                        <span>{fmt(c.next!.date, { weekday: 'short' })}</span>
                        <b>{fmt(c.next!.date, { day: 'numeric' })}</b>
                      </div>
                      <div className="hr-what">
                        {c.next!.what}
                        <span>{c.name} · {roleById.get(c.role)!.title}</span>
                      </div>
                      {iv && <Avatar name={iv.name} color={iv.color} size={28} />}
                    </li>
                  )
                })}
                {reviews.length > 0 && (
                  <li>
                    <div className="hr-date"><span>{w.by}</span><b>{fmt(reviews[reviews.length - 1].next!.date, { day: 'numeric' })}</b></div>
                    <div className="hr-what">{w.reviews({ count: reviews.length })}<span>{reviews.map((c) => c.name).join(', ')}</span></div>
                    <span />
                  </li>
                )}
              </ul>
            )}
          </div>
        </section>

        <div className="hr-change">
          <b>{w.change}</b> {canEdit ? w.changeLineEdit : w.changeLine}
          {w.prompts.map((p: string) => <q key={p}>{p}</q>)}
          <div className="hr-sample">{w.sample}</div>
        </div>
      </div>
    </div>
  )
}
