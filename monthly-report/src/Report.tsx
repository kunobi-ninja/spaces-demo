import * as React from 'react'
import { biggestChannelMove, cohorts, deltas, isRate, kpis, productRows, type Channel, type Kpis, type Report as Data } from './metrics'

const C = { midnight: '#06213f', deep: '#0b2d52', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8', up: '#1f9d6b', down: '#d4573b' }
const CHANNEL_COLOR: Record<Channel, string> = { search: C.horizon, social: C.ocean, email: C.sun, direct: C.tide, referral: '#8a6cf0' }

export type Words = Record<string, any>

interface Props { data: Data; w: Words; locale: string; initial?: string }

export const Report = ({ data, w, locale, initial }: Props) => {
  const months = data.months
  const last = months.length - 1
  const start = initial ? Math.max(0, months.findIndex((m) => m.month === initial)) : last
  const [i, setI] = React.useState(start)
  const m = months[i]
  const k = kpis(m)

  const money = React.useMemo(() => new Intl.NumberFormat(locale, { style: 'currency', currency: data.currency, maximumFractionDigits: 0 }), [locale, data.currency])
  const money2 = React.useMemo(() => new Intl.NumberFormat(locale, { style: 'currency', currency: data.currency, maximumFractionDigits: 2, minimumFractionDigits: 2 }), [locale, data.currency])
  const num = React.useMemo(() => new Intl.NumberFormat(locale), [locale])
  const monthName = (s: string, style: 'long' | 'short' = 'long') =>
    new Intl.DateTimeFormat(locale, { month: style, year: 'numeric', timeZone: 'UTC' }).format(new Date(`${s}-01T00:00:00Z`))
  const monthShort = (s: string) => new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${s}-01T00:00:00Z`))
  const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`

  const step = (d: number) => setI((x) => Math.min(last, Math.max(0, x + d)))

  // The summary is written from the numbers, so it cannot drift from the data.
  const rev = deltas(months, i, 'revenue')
  const ord = deltas(months, i, 'orders')
  const aov = deltas(months, i, 'aov')
  const ret = deltas(months, i, 'returningShare')
  const move = biggestChannelMove(months, i, data.channels)
  const products = productRows(months, i)
  const summary: string[] = [
    w.sumRevenue({ month: monthName(m.month), value: money.format(m.revenue), mom: rev.mom, yoy: rev.yoy, prev: i > 0 ? monthName(months[i - 1].month) : null, year: i >= 12 ? monthName(months[i - 12].month) : null }),
  ]
  if (ord.mom !== null && aov.mom !== null) summary.push(w.sumDrivers({ orders: ord.mom, aov: aov.mom, move, channel: move ? w.channels[move.channel] : '' }))
  if (products[0]) summary.push(w.sumCustomers({ share: k.returningShare, change: ret.mom, top: products[0].name, topValue: money.format(products[0].revenue) }))

  const kpiTiles: { key: keyof Kpis; value: string }[] = [
    { key: 'revenue', value: money.format(k.revenue) },
    { key: 'orders', value: num.format(k.orders) },
    { key: 'aov', value: money2.format(k.aov) },
    { key: 'returningShare', value: pct(k.returningShare) },
    { key: 'conversion', value: pct(k.conversion, 2) },
    { key: 'refundRate', value: pct(k.refundRate, 1) },
  ]

  return (
    <div className="mr">
      <style>{STYLE}</style>
      <div className="mr-in">
        <header className="mr-head">
          <div>
            <div className="mr-eyebrow"><span className="mr-dot" />{w.eyebrow}</div>
            <h1>{data.shop} <span>· {monthName(m.month)}</span></h1>
            <p className="mr-what">{data.what}</p>
          </div>
          <div className="mr-step" role="group" aria-label={w.pickMonth}>
            <button onClick={() => step(-1)} disabled={i === 0} aria-label={w.prev}>‹</button>
            <span className="mr-step-label">{monthName(m.month, 'short')}</span>
            <button onClick={() => step(1)} disabled={i === last} aria-label={w.next}>›</button>
          </div>
        </header>

        <section className="mr-summary">
          <h2>{w.summary}</h2>
          <ul>{summary.map((s, n) => <li key={n}>{s}</li>)}</ul>
          {m.note && <p className="mr-note"><b>{w.teamNote}</b> {m.note}</p>}
        </section>

        <section className="mr-kpis">
          {kpiTiles.map(({ key, value }) => {
            const d = deltas(months, i, key)
            const series = months.map((mm) => kpis(mm)[key])
            return (
              <div className="mr-kpi" key={key}>
                <div className="mr-kpi-label">{w.kpi[key]}</div>
                <div className="mr-kpi-value">{value}</div>
                <div className="mr-kpi-deltas">
                  <DeltaChip v={d.mom} rate={isRate(key)} good={key === 'refundRate' ? 'down' : 'up'} label={w.mom} />
                  <DeltaChip v={d.yoy} rate={isRate(key)} good={key === 'refundRate' ? 'down' : 'up'} label={w.yoy} />
                </div>
                <Spark values={series} at={i} />
              </div>
            )
          })}
        </section>

        <section className="mr-card mr-revenue">
          <div className="mr-card-head">
            <h2>{w.revenueTitle}</h2>
            <span className="mr-muted">{w.revenueHint}</span>
          </div>
          <RevenueChart months={months} at={i} onPick={setI} label={monthShort} money={money} title={w.revenueTitle} />
          <ol className="mr-notes">
            {months.map((mm, n) => ({ mm, n })).filter(({ mm }) => mm.note).map((x, k) => ({ ...x, k: k + 1 })).filter(({ n }) => n <= i).slice(-4).reverse().map(({ mm, n, k }) => (
              <li key={mm.month} className={n === i ? 'on' : ''}>
                <button onClick={() => setI(n)}>
                  <span className="mr-note-k">{k}</span>
                  <span className="mr-note-month">{monthShort(mm.month)} {mm.month.slice(2, 4)}</span>
                  <span>{mm.note}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <div className="mr-two">
          <section className="mr-card">
            <div className="mr-card-head">
              <h2>{w.channelsTitle}</h2>
              <span className="mr-muted">{num.format(m.sessions)} {w.sessions}</span>
            </div>
            <div className="mr-stack" role="img" aria-label={w.channelsTitle}>
              {data.channels.map((c) => <span key={c} style={{ flex: m.traffic[c], background: CHANNEL_COLOR[c] }} />)}
            </div>
            <table className="mr-table mr-channels">
              <tbody>
                {data.channels.slice().sort((a, b) => m.traffic[b] - m.traffic[a]).map((c) => {
                  const before = i > 0 ? months[i - 1].traffic[c] : undefined
                  const d = before ? m.traffic[c] / before - 1 : null
                  return (
                    <tr key={c}>
                      <td><i style={{ background: CHANNEL_COLOR[c] }} />{w.channels[c]}</td>
                      <td className="r">{num.format(m.traffic[c])}</td>
                      <td className="r mr-muted">{pct(m.traffic[c] / m.sessions)}</td>
                      <td className="r"><DeltaChip v={d} rate={false} good="up" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className="mr-card">
            <div className="mr-card-head">
              <h2>{w.cohortTitle}</h2>
              <span className="mr-muted">{w.cohortHint}</span>
            </div>
            <div className="mr-cohort">
              <div className="mr-cohort-row mr-cohort-head">
                <span>{w.firstOrder}</span>
                <span className="r">{w.customers}</span>
                {[1, 2, 3, 4, 5, 6].map((n) => <span key={n} className="c">+{n}</span>)}
              </div>
              {cohorts(months, i).map((row) => (
                <div className="mr-cohort-row" key={row.month}>
                  <span>{monthShort(row.month)} {row.month.slice(2, 4)}</span>
                  <span className="r mr-muted">{num.format(row.size)}</span>
                  {[0, 1, 2, 3, 4, 5].map((n) => {
                    const v = row.repeat[n]
                    return v === undefined
                      ? <span key={n} className="c mr-cell empty" />
                      : <span key={n} className="c mr-cell" style={{ background: `color-mix(in srgb, ${C.tide} ${Math.round(18 + v * 170)}%, transparent)` }}>{pct(v)}</span>
                  })}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mr-card">
          <div className="mr-card-head">
            <h2>{w.productsTitle}</h2>
            <span className="mr-muted">{w.productsHint}</span>
          </div>
          <div className="mr-scroll">
            <table className="mr-table mr-products">
              <thead>
                <tr><th>{w.product}</th><th className="r">{w.units}</th><th className="r">{w.revenue}</th><th className="r">{w.share}</th><th className="r">{w.mom}</th><th className="r">{w.lastSix}</th></tr>
              </thead>
              <tbody>
                {products.map((p, n) => (
                  <tr key={p.name}>
                    <td><span className="mr-rank">{n + 1}</span>{p.name}</td>
                    <td className="r">{num.format(p.units)}</td>
                    <td className="r"><b>{money.format(p.revenue)}</b></td>
                    <td className="r"><span className="mr-share"><span style={{ width: `${Math.round(p.share * 100)}%` }} /></span>{pct(p.share)}</td>
                    <td className="r"><DeltaChip v={p.mom} rate={false} good="up" /></td>
                    <td className="r"><Spark values={p.history} at={p.history.length - 1} small /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mr-foot">
          <p><b>{w.howTitle}</b> {w.howBody} <code>{w.file}</code>. {w.howAsk}</p>
          <ul>
            <li>“{w.prompt1}”</li>
            <li>“{w.prompt2}”</li>
          </ul>
          <p className="mr-muted">{w.example}</p>
        </footer>
      </div>
    </div>
  )
}

const DeltaChip = ({ v, rate, good, label }: { v: number | null; rate: boolean; good: 'up' | 'down'; label?: string }) => {
  if (v === null) return <span className="mr-delta none">{label ? `${label} ` : ''}—</span>
  const flat = Math.abs(v) < (rate ? 0.0005 : 0.005)
  const tone = flat ? 'flat' : (v > 0) === (good === 'up') ? 'good' : 'bad'
  const text = rate ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)} pt` : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(0)}%`
  return <span className={`mr-delta ${tone}`}>{label ? <em>{label}</em> : null}{flat ? '±0' : text}</span>
}

const Spark = ({ values, at, small }: { values: number[]; at: number; small?: boolean }) => {
  const W = small ? 72 : 120
  const H = small ? 22 : 28
  const max = Math.max(...values)
  const min = Math.min(...values)
  const x = (n: number) => (values.length < 2 ? W / 2 : (n / (values.length - 1)) * (W - 4) + 2)
  const y = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6)
  const path = values.map((v, n) => `${n ? 'L' : 'M'}${x(n).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="mr-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={path} fill="none" stroke={C.horizon} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.75" />
      <circle cx={x(at)} cy={y(values[at])} r="3" fill={C.sun} />
    </svg>
  )
}

const RevenueChart = ({ months, at, onPick, label, money, title }: { months: Data['months']; at: number; onPick: (n: number) => void; label: (s: string) => string; money: Intl.NumberFormat; title: string }) => {
  const box = React.useRef<HTMLDivElement>(null)
  const [W, setW] = React.useState(900)
  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const watch = new ResizeObserver(() => setW(Math.max(280, Math.round(el.getBoundingClientRect().width))))
    watch.observe(el)
    setW(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    return () => watch.disconnect()
  }, [])
  const H = W < 560 ? 200 : 250
  const pad = { l: 46, r: 2, t: 34, b: 28 }
  const max = Math.max(...months.map((m) => m.revenue)) * 1.08
  const bw = (W - pad.l - pad.r) / months.length
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const ticks = [0.25, 0.5, 0.75, 1].map((t) => Math.round((max * t) / 1000) * 1000)
  const compact = new Intl.NumberFormat(money.resolvedOptions().locale, { style: 'currency', currency: money.resolvedOptions().currency, notation: 'compact', maximumFractionDigits: 0 })
  let noteN = 0
  return (
    <div className="mr-chart" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="mr-grid" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="mr-tick">{compact.format(t)}</text>
          </g>
        ))}
        {months.map((m, n) => {
          const x = pad.l + n * bw + bw * 0.16
          const w = bw * 0.68
          const lastYear = n === at - 12
          const fill = n === at ? C.sun : n > at ? 'hsl(var(--muted))' : lastYear ? C.ocean : C.horizon
          const hasNote = !!m.note
          if (hasNote) noteN++
          return (
            <g key={m.month} className="mr-bar" onClick={() => onPick(n)}>
              <rect x={pad.l + n * bw} y={pad.t - 30} width={bw} height={H - pad.t + 30} fill="transparent" />
              <rect x={x} y={y(m.revenue)} width={w} height={H - pad.b - y(m.revenue)} rx="5" fill={fill} opacity={n === at ? 1 : n > at ? 1 : 0.82} />
              {hasNote && (
                <g>
                  <circle cx={x + w / 2} cy={y(m.revenue) - 13} r="9" fill={n <= at ? C.midnight : 'hsl(var(--muted))'} />
                  <text x={x + w / 2} y={y(m.revenue) - 9.2} textAnchor="middle" className="mr-note-n" fill={n <= at ? '#fff' : 'hsl(var(--muted-foreground))'}>{noteN}</text>
                </g>
              )}
              {(W >= 560 || n % 3 === at % 3) && <text x={x + w / 2} y={H - 9} textAnchor="middle" className={`mr-axis${n === at ? ' on' : ''}`}>{label(m.month).slice(0, 3)}</text>}
            </g>
          )
        })}
      </svg>
      <div className="mr-chart-legend">
        <span><i style={{ background: C.sun }} />{label(months[at].month)} {months[at].month.slice(0, 4)} · <b>{money.format(months[at].revenue)}</b></span>
        {at >= 12 && <span><i style={{ background: C.ocean }} />{label(months[at - 12].month)} {months[at - 12].month.slice(0, 4)} · <b>{money.format(months[at - 12].revenue)}</b></span>}
      </div>
    </div>
  )
}

const STYLE = `
.mr { width: min(var(--kunobi-prose-width, 1200px), 100%); margin: 0 auto; box-sizing: border-box; padding: 16px 24px 48px; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
.mr-in { container-type: inline-size; display: flex; flex-direction: column; gap: 16px; }
.mr h1, .mr h2 { font-family: Parkinsans, Figtree, sans-serif; letter-spacing: -0.02em; margin: 0; }
.mr-muted { color: hsl(var(--muted-foreground)); }
.mr-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; padding: 26px 28px; border-radius: 26px; background: radial-gradient(120% 160% at 10% 0%, ${C.deep} 0%, ${C.midnight} 60%, #031426 100%); color: #fff; }
.mr-eyebrow { display: inline-flex; align-items: center; gap: 8px; font: 600 13px Figtree, sans-serif; color: rgba(255,255,255,.72); letter-spacing: .03em; }
.mr-dot { width: 8px; height: 8px; border-radius: 99px; background: ${C.sun}; }
.mr-head h1 { font-weight: 800; font-size: clamp(26px, 4cqw, 40px); line-height: 1.05; margin-top: 8px; }
.mr-head h1 span { color: ${C.sun}; }
.mr-what { margin: 6px 0 0; color: rgba(255,255,255,.72); font-size: 15px; }
.mr-step { display: inline-flex; align-items: center; gap: 4px; padding: 4px; border-radius: 999px; background: rgba(255,255,255,.1); }
.mr-step button { all: unset; cursor: pointer; width: 34px; height: 34px; border-radius: 99px; display: grid; place-items: center; font-size: 22px; color: #fff; }
.mr-step button:hover:not(:disabled) { background: rgba(255,255,255,.14); }
.mr-step button:disabled { opacity: .3; cursor: default; }
.mr-step button:focus-visible { outline: 2px solid ${C.sun}; }
.mr-step-label { min-width: 96px; text-align: center; font: 600 15px Figtree, sans-serif; }
.mr-summary { padding: 20px 24px; border-radius: 22px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); box-shadow: 0 8px 24px rgba(6,33,63,.06); }
.mr-summary h2 { font-size: 15px; font-weight: 600; color: hsl(var(--muted-foreground)); }
.mr-summary ul { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.mr-summary li { position: relative; padding-left: 18px; font-size: 17px; line-height: 1.45; }
.mr-summary li::before { content: ''; position: absolute; left: 0; top: .6em; width: 7px; height: 7px; border-radius: 99px; background: ${C.sun}; }
.mr-note { margin: 12px 0 0; padding: 10px 14px; border-radius: 14px; background: hsl(var(--muted)); font-size: 14px; line-height: 1.45; }
.mr-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.mr-kpi { padding: 16px 18px 12px; border-radius: 20px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); display: grid; gap: 4px; }
.mr-kpi-label { font: 600 13px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
.mr-kpi-value { font: 800 clamp(24px, 3cqw, 30px)/1.1 Parkinsans, sans-serif; letter-spacing: -0.02em; }
.mr-kpi-deltas { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.mr-spark { margin-top: 6px; }
.mr-delta { display: inline-flex; align-items: center; gap: 5px; font: 600 12px Figtree, sans-serif; padding: 3px 8px; border-radius: 99px; background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); white-space: nowrap; }
.mr-delta em { font-style: normal; font-weight: 600; opacity: .7; }
.mr-delta.good { background: color-mix(in srgb, ${C.up} 16%, transparent); color: ${C.up}; }
.mr-delta.bad { background: color-mix(in srgb, ${C.down} 16%, transparent); color: ${C.down}; }
.mr-card { padding: 20px 22px; border-radius: 22px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); box-shadow: 0 8px 24px rgba(6,33,63,.05); min-width: 0; }
.mr-card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.mr-card-head h2 { font-size: 20px; font-weight: 800; }
.mr-card-head .mr-muted { font-size: 13px; }
.mr-chart { width: 100%; }
.mr-chart svg { display: block; overflow: visible; }
.mr-grid { stroke: hsl(var(--border)); stroke-width: 1; }
.mr-bar { cursor: pointer; }
.mr-bar:hover rect + rect { opacity: 1; }
.mr-axis { font: 600 12px Figtree, sans-serif; fill: hsl(var(--muted-foreground)); }
.mr-axis.on { fill: hsl(var(--foreground)); font-weight: 800; }
.mr-note-n { font: 800 11px Figtree, sans-serif; }
.mr-tick { font: 600 11px Figtree, sans-serif; fill: hsl(var(--muted-foreground)); opacity: .8; }
.mr-chart-legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; margin-top: 6px; }
.mr-chart-legend i, .mr-channels i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.mr-notes { list-style: none; margin: 14px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.mr-notes button { all: unset; cursor: pointer; display: flex; gap: 10px; align-items: baseline; width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 14px; background: hsl(var(--muted)); font-size: 14px; line-height: 1.4; }
.mr-notes li.on button { background: color-mix(in srgb, ${C.sun} 18%, hsl(var(--card))); }
.mr-notes button:focus-visible { outline: 2px solid ${C.horizon}; }
.mr-note-k { flex: none; width: 20px; height: 20px; border-radius: 99px; display: grid; place-items: center; background: ${C.midnight}; color: #fff; font: 800 11px Figtree, sans-serif; align-self: center; }
.mr-note-month { flex: none; font: 800 12px Parkinsans, sans-serif; color: hsl(var(--muted-foreground)); text-transform: uppercase; min-width: 48px; }
.mr-two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.mr-stack { display: flex; height: 14px; border-radius: 99px; overflow: hidden; gap: 2px; margin-bottom: 10px; }
.mr-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.mr-table td, .mr-table th { padding: 9px 6px; border-bottom: 1px solid hsl(var(--border)); white-space: nowrap; }
.mr-table tr:last-child td { border-bottom: 0; }
.mr-table th { font: 600 12px Figtree, sans-serif; color: hsl(var(--muted-foreground)); text-align: left; }
.mr-table .r { text-align: right; }
.mr-scroll { overflow-x: auto; }
.mr-rank { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 99px; background: hsl(var(--muted)); font: 800 11px Figtree, sans-serif; margin-right: 10px; }
.mr-share { display: inline-block; width: 54px; height: 6px; border-radius: 99px; background: hsl(var(--muted)); margin-right: 8px; vertical-align: 2px; overflow: hidden; }
.mr-share span { display: block; height: 100%; background: ${C.horizon}; border-radius: 99px; }
.mr-cohort { display: grid; gap: 4px; font-size: 13px; }
.mr-cohort-row { display: grid; grid-template-columns: 1.2fr .8fr repeat(6, 1fr); gap: 4px; align-items: center; }
.mr-cohort-head { font: 600 12px Figtree, sans-serif; color: hsl(var(--muted-foreground)); }
.mr-cohort .r { text-align: right; padding-right: 6px; }
.mr-cohort .c { text-align: center; }
.mr-cell { height: 30px; border-radius: 8px; display: grid; place-items: center; font-weight: 600; font-size: 12px; color: hsl(var(--foreground)); }
.mr-cell.empty { background: repeating-linear-gradient(135deg, hsl(var(--muted)) 0 4px, transparent 4px 8px); opacity: .6; }
.mr-foot { padding: 18px 22px; border-radius: 22px; background: hsl(var(--muted)); font-size: 15px; line-height: 1.5; }
.mr-foot p { margin: 0; }
.mr-foot ul { margin: 8px 0 10px; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
.mr-foot li { padding: 6px 12px; border-radius: 99px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); font-size: 14px; }
.mr-foot code { font-size: 13px; padding: 1px 6px; border-radius: 6px; background: hsl(var(--card)); }
.mr-foot .mr-muted { font-size: 13px; }
@container (max-width: 860px) {
  .mr-two { grid-template-columns: 1fr; }
  .mr-kpis { grid-template-columns: repeat(2, 1fr); }
}
@container (max-width: 520px) {
  .mr-head { padding: 20px; }
  .mr-notes { grid-template-columns: 1fr; }
  .mr-kpi-value { font-size: 22px; }
  .mr-summary li { font-size: 15px; }
  .mr-cohort-row { grid-template-columns: 1fr .8fr repeat(6, 1fr); font-size: 11px; }
  .mr-cell { height: 26px; font-size: 10px; }
  .mr-spark { width: 100%; }
}
`
