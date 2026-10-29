// Every number on the page comes from here, computed from data/report.json.

export type Channel = 'search' | 'social' | 'email' | 'direct' | 'referral'
export interface Product { name: string; units: number; revenue: number }
export interface Month {
  month: string
  revenue: number
  orders: number
  newCustomers: number
  returningCustomers: number
  refunds: number
  sessions: number
  traffic: Record<Channel, number>
  products: Product[]
  repeatWithin: number[]
  note?: string
}
export interface Report { shop: string; what: string; currency: string; channels: Channel[]; months: Month[] }

export interface Kpis {
  revenue: number
  orders: number
  aov: number
  returningShare: number
  conversion: number
  refundRate: number
}

export function kpis(m: Month): Kpis {
  return {
    revenue: m.revenue,
    orders: m.orders,
    aov: m.orders ? m.revenue / m.orders : 0,
    returningShare: m.orders ? m.returningCustomers / m.orders : 0,
    conversion: m.sessions ? m.orders / m.sessions : 0,
    refundRate: m.revenue ? m.refunds / m.revenue : 0,
  }
}

/** Relative change, or null when there is nothing to compare with. */
export function change(now: number, before: number | undefined): number | null {
  if (before === undefined || before === 0) return null
  return now / before - 1
}

export interface Delta { mom: number | null; yoy: number | null }

/** Month-over-month and year-over-year change of one KPI. Rates compare in points, amounts in percent. */
export function deltas(months: Month[], i: number, key: keyof Kpis): Delta {
  const now = kpis(months[i])[key]
  const prev = i > 0 ? kpis(months[i - 1])[key] : undefined
  const year = i >= 12 ? kpis(months[i - 12])[key] : undefined
  if (isRate(key)) {
    return { mom: prev === undefined ? null : now - prev, yoy: year === undefined ? null : now - year }
  }
  return { mom: change(now, prev), yoy: change(now, year) }
}

export function isRate(key: keyof Kpis): boolean {
  return key === 'returningShare' || key === 'conversion' || key === 'refundRate'
}

/** The channel whose sessions moved most against the previous month. */
export function biggestChannelMove(months: Month[], i: number, channels: Channel[]) {
  if (i === 0) return null
  let best: { channel: Channel; diff: number; pct: number | null } | null = null
  for (const c of channels) {
    const diff = months[i].traffic[c] - months[i - 1].traffic[c]
    if (!best || Math.abs(diff) > Math.abs(best.diff)) best = { channel: c, diff, pct: change(months[i].traffic[c], months[i - 1].traffic[c]) }
  }
  return best
}

export interface ProductRow extends Product { share: number; mom: number | null; history: number[] }

export function productRows(months: Month[], i: number): ProductRow[] {
  const m = months[i]
  return m.products
    .filter((p) => p.units > 0)
    .map((p) => {
      const before = i > 0 ? months[i - 1].products.find((q) => q.name === p.name) : undefined
      const history = months.slice(Math.max(0, i - 5), i + 1).map((mm) => mm.products.find((q) => q.name === p.name)?.units ?? 0)
      return { ...p, share: m.revenue ? p.revenue / m.revenue : 0, mom: before && before.revenue ? p.revenue / before.revenue - 1 : null, history }
    })
    .sort((a, b) => b.revenue - a.revenue)
}

/** Cohorts ending at month i: each month's new customers, and how many ordered again within n months, as known at month i. */
export function cohorts(months: Month[], i: number, rows = 6) {
  const out = []
  for (let c = Math.max(0, i - rows + 1); c <= i; c++) {
    const known = i - c
    out.push({ month: months[c].month, size: months[c].newCustomers, repeat: months[c].repeatWithin.slice(0, Math.min(known, 6)) })
  }
  return out.reverse()
}
