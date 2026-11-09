/**
 * Shared costs, worked out in whole cents so every split adds up exactly.
 *
 * The expenses and settle-up payments live in the `expenses-ledger` store (readable copy:
 * data/expenses.json). Amounts are cents in the group's currency.
 *
 * A `split` is `everyone`, or names separated by `;`. `Name*2` gives that person two shares:
 * rent is split by room size (Amara and Diego have the bigger rooms). Each expense is divided
 * by largest remainder: everyone gets the floor of their exact share, and the cents left over
 * go to the largest fractions (ties in the order the names are listed).
 */

import type { ExpensesLedgerStore } from '../types/expenses-ledger.store'

export interface Person { name: string; color: string }
export interface Category { name: string; color: string }
export interface Group {
  title: string
  from: string
  to: string
  currency: string
  people: Person[]
  categories: Category[]
}

export interface Expense {
  id: string
  date: string
  what: string
  category: string
  paidBy: string
  split: string
  /** The cost in cents. */
  cents: number
  /** Cents each person owes for this expense. */
  shares: Record<string, number>
  weights: Record<string, number>
}

export interface Payment { id: string; date: string; from: string; to: string; cents: number }
export interface Transfer { from: string; to: string; cents: number }

export interface Ledger {
  expenses: Expense[]
  payments: Payment[]
  paid: Record<string, number>
  owed: Record<string, number>
  /** Paid minus owed, after settle-up payments. Positive: the group owes them. */
  balance: Record<string, number>
  transfers: Transfer[]
  total: number
  errors: string[]
}

/** `everyone` or `A;B*2` as weights, or null when a name or weight is not valid. */
export function parseSplit(split: string, people: string[]): [string, number][] | null {
  const text = (split || 'everyone').trim()
  if (text.toLowerCase() === 'everyone') return people.map((p) => [p, 1])
  const weights = text.split(';').filter((s) => s.trim()).map((part): [string, number] => {
    const [name, w] = part.trim().split('*')
    return [name.trim(), w ? Number(w) : 1]
  })
  if (!weights.length || weights.some(([name, w]) => !people.includes(name) || !(Number.isInteger(w) && w > 0))) return null
  return weights
}

/** Weights back to the store's text: `everyone` when all are in with one share each. */
export function formatSplit(weights: [string, number][], people: string[]): string {
  if (weights.length === people.length && weights.every(([, w]) => w === 1)) return 'everyone'
  return weights.map(([n, w]) => (w > 1 ? `${n}*${w}` : n)).join(';')
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

const byDate = <T extends { date: string; id: string }>(a: T, b: T) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)

/** Balances and the payments that settle them, from the store's data. */
export function buildLedger(data: Partial<ExpensesLedgerStore> | undefined, group: Group): Ledger {
  const people = group.people.map((p) => p.name)
  const errors: string[] = []
  const paid = Object.fromEntries(people.map((p) => [p, 0]))
  const owed = Object.fromEntries(people.map((p) => [p, 0]))
  const expenses: Expense[] = []
  for (const [id, row] of Object.entries(data?.expenses ?? {})) {
    const cents = row.amount ?? 0
    const paidBy = row.paid_by ?? ''
    const split = row.split ?? 'everyone'
    if (!(cents > 0)) { errors.push(`${id}: amount`); continue }
    if (!people.includes(paidBy)) { errors.push(`${id}: who paid`); continue }
    const weights = parseSplit(split, people)
    if (!weights) { errors.push(`${id}: split "${split}"`); continue }
    const shares = allocate(cents, weights)
    paid[paidBy] += cents
    for (const [name, c] of Object.entries(shares)) owed[name] += c
    expenses.push({
      id,
      date: row.date ?? group.from,
      what: row.what ?? '',
      category: row.category ?? '',
      paidBy,
      split,
      cents,
      shares,
      weights: Object.fromEntries(weights),
    })
  }
  expenses.sort(byDate)
  const payments: Payment[] = []
  const sent = Object.fromEntries(people.map((p) => [p, 0]))
  for (const [id, row] of Object.entries(data?.payments ?? {})) {
    const cents = row.amount ?? 0
    if (!(cents > 0) || !row.from || !row.to || row.from === row.to) { errors.push(`${id}: payment`); continue }
    // Paying someone back moves both of them towards even.
    sent[row.from] += cents
    sent[row.to] -= cents
    payments.push({ id, date: row.date ?? group.to, from: row.from, to: row.to, cents })
  }
  payments.sort(byDate)
  const balance = Object.fromEntries(people.map((p) => [p, paid[p] - owed[p] + sent[p]]))
  const total = expenses.reduce((sum, e) => sum + e.cents, 0)
  return { expenses, payments, paid, owed, balance, transfers: settle(balance, people), total, errors }
}
