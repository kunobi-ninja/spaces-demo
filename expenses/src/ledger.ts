/**
 * Shared costs, worked out in whole cents so every split adds up exactly.
 *
 * A `split` is `everyone`, or names separated by `;`. `Name*2` gives that person two shares.
 * Each expense is divided by largest remainder: everyone gets the floor of their exact share,
 * and the cents left over go to the largest fractions (ties in the order the names are listed).
 */

export interface Person { name: string; color: string }
export interface Category { name: string; color: string }
export interface Group {
  title: string
  from: string
  to: string
  currency: string
  rates: Record<string, number>
  people: Person[]
  categories: Category[]
}

export interface Expense {
  date: string
  what: string
  category: string
  paidBy: string
  amount: number
  currency: string
  /** The cost in the group's currency, in cents. */
  cents: number
  /** Cents each person owes for this expense. */
  shares: Record<string, number>
  weights: Record<string, number>
}

export interface Transfer { from: string; to: string; cents: number }

export interface Ledger {
  expenses: Expense[]
  paid: Record<string, number>
  owed: Record<string, number>
  /** Paid minus owed. Positive: the group owes them. */
  balance: Record<string, number>
  transfers: Transfer[]
  total: number
  errors: string[]
}

/**
 * Rows from a Markdown table (the first one in the text) or, failing that, CSV. A Markdown
 * table keeps the data readable as a page of its own.
 */
export function parseRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('|'))
  if (lines.length < 2) return parseCsv(text)
  const cells = (line: string) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  const keys = cells(lines[0])
  return lines
    .slice(1)
    .filter((l) => !/^\|?\s*:?-{3,}/.test(l))
    .map((l) => Object.fromEntries(keys.map((k, i) => [k, cells(l)[i] ?? ''])))
}

/** CSV with quoted fields and doubled quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  const [head = [], ...body] = rows
  const keys = head.map((k) => k.trim())
  return body.map((cells) => Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? '').trim()])))
}

/** Split `cents` by integer weights, exactly. */
export function allocate(cents: number, weights: [string, number][]): Record<string, number> {
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  const parts = weights.map(([name, w], order) => {
    const exact = (cents * w) / total
    const floor = Math.floor(exact)
    return { name, floor, rest: exact - floor, order }
  })
  let left = cents - parts.reduce((sum, p) => sum + p.floor, 0)
  const byRest = [...parts].sort((a, b) => b.rest - a.rest || a.order - b.order)
  for (const p of byRest) {
    if (left <= 0) break
    p.floor += 1
    left -= 1
  }
  return Object.fromEntries(parts.map((p) => [p.name, p.floor]))
}

/**
 * The fewest payments that settle every balance. People split into the most groups whose
 * balances sum to zero (each group of k people needs k - 1 payments), found exactly over
 * subsets; inside a group, the largest debtor pays the largest creditor.
 */
export function settle(balance: Record<string, number>, order: string[]): Transfer[] {
  const names = order.filter((n) => balance[n] !== 0)
  const n = names.length
  if (n === 0) return []
  const full = (1 << n) - 1
  const sum = new Array<number>(1 << n).fill(0)
  for (let m = 1; m <= full; m++) {
    const low = m & -m
    sum[m] = sum[m ^ low] + balance[names[31 - Math.clz32(low)]]
  }
  // best[m]: most zero-sum groups that m can be cut into (or -1 if m does not sum to zero).
  const best = new Array<number>(1 << n).fill(-1)
  const pick = new Array<number>(1 << n).fill(0)
  best[0] = 0
  for (let m = 1; m <= full; m++) {
    if (sum[m] !== 0) continue
    const low = m & -m
    // Every cut includes the lowest member, so each partition is counted once.
    for (let s = m; s; s = (s - 1) & m) {
      if (!(s & low) || sum[s] !== 0 || best[m ^ s] < 0) continue
      if (best[m ^ s] + 1 > best[m]) { best[m] = best[m ^ s] + 1; pick[m] = s }
    }
  }
  const transfers: Transfer[] = []
  for (let m = full; m; m ^= pick[m]) {
    const members = names.filter((_, i) => pick[m] & (1 << i))
    const debt = members.filter((p) => balance[p] < 0).map((p) => ({ p, v: -balance[p] }))
    const cred = members.filter((p) => balance[p] > 0).map((p) => ({ p, v: balance[p] }))
    while (debt.length && cred.length) {
      debt.sort((a, b) => b.v - a.v)
      cred.sort((a, b) => b.v - a.v)
      const d = debt[0]
      const c = cred[0]
      const v = Math.min(d.v, c.v)
      transfers.push({ from: d.p, to: c.p, cents: v })
      d.v -= v
      c.v -= v
      if (!d.v) debt.shift()
      if (!c.v) cred.shift()
    }
  }
  return transfers.sort((a, b) => b.cents - a.cents)
}

export function buildLedger(text: string, group: Group): Ledger {
  const people = group.people.map((p) => p.name)
  const errors: string[] = []
  const paid = Object.fromEntries(people.map((p) => [p, 0]))
  const owed = Object.fromEntries(people.map((p) => [p, 0]))
  const expenses: Expense[] = []
  parseRows(text).forEach((row, i) => {
    const line = i + 1
    const amount = Number(row.amount)
    const currency = (row.currency || group.currency).toUpperCase()
    const rate = currency === group.currency ? 1 : group.rates?.[currency]
    if (!Number.isFinite(amount) || amount <= 0) return errors.push(`Row ${line}: amount "${row.amount}"`)
    if (!rate) return errors.push(`Row ${line}: no rate for ${currency}`)
    if (!people.includes(row.paid_by)) return errors.push(`Row ${line}: unknown payer "${row.paid_by}"`)
    const split = (row.split || 'everyone').trim()
    const weights: [string, number][] =
      split.toLowerCase() === 'everyone'
        ? people.map((p) => [p, 1])
        : split.split(';').map((part) => {
            const [name, w] = part.trim().split('*')
            return [name.trim(), w ? Number(w) : 1]
          })
    const bad = weights.find(([name, w]) => !people.includes(name) || !(w > 0))
    if (bad) return errors.push(`Row ${line}: split "${split}"`)
    const cents = Math.round(amount * rate * 100)
    const shares = allocate(cents, weights)
    paid[row.paid_by] += cents
    for (const [name, c] of Object.entries(shares)) owed[name] += c
    expenses.push({
      date: row.date,
      what: row.what,
      category: row.category,
      paidBy: row.paid_by,
      amount,
      currency,
      cents,
      shares,
      weights: Object.fromEntries(weights),
    })
  })
  const balance = Object.fromEntries(people.map((p) => [p, paid[p] - owed[p]]))
  const total = expenses.reduce((sum, e) => sum + e.cents, 0)
  return { expenses, paid, owed, balance, transfers: settle(balance, people), total, errors }
}
