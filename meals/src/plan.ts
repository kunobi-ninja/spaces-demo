// Turns the week and the recipes into day cards and a shopping list.
// The week and the list's ticks live in the `meals-week` and `meals-shopping` stores.

/** `key`: the name the list line's id is made from, when `name` is a translation; defaults to `name`. */
export interface Ingredient { name: string; qty: number; unit: string; aisle: string; key?: string }
export interface Recipe { id: string; name: string; minutes: number; serves: number; icon: string; tags: string[]; ingredients: Ingredient[] }
export interface Night { day: string; recipe: Recipe; cook: string; servings: number }
export type Slot = Night | { day: string; recipe: null; cook: string; servings: number }
export interface Line { key: string; name: string; unit: string; qty: number; aisle: string; days: string[] }

/** The week as the `meals-week` store holds it: one row per day. */
export interface WeekData { nights: Record<string, { recipe: string | null; cook: string | null; servings: number | null }> }

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Translated recipes that keep the list ids of `original` (matched by recipe id and ingredient order), so ticks hold in every language. */
export function keepKeys(recipes: Recipe[], original: Recipe[]): Recipe[] {
  const byId = new Map(original.map((r) => [r.id, r]))
  return recipes.map((r) => ({ ...r, ingredients: r.ingredients.map((ing, i) => ({ ...ing, key: byId.get(r.id)?.ingredients[i]?.name })) }))
}

/** The planned nights in day order; a day without a known recipe has none. */
export function nights(week: WeekData | undefined, recipes: Recipe[]): Slot[] {
  const byId = new Map(recipes.map((r) => [r.id, r]))
  return DAYS.map((day) => {
    const row = week?.nights?.[day]
    const recipe = (row?.recipe && byId.get(row.recipe)) || null
    const cook = row?.cook ?? ''
    if (!recipe) return { day, recipe: null, cook, servings: 0 }
    return { day, recipe, cook, servings: row?.servings || recipe.serves }
  })
}

/** A stable id for a list line, usable as a store row id: "olive-oil-tbsp". */
export function slug(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Units counted in whole things, by their singular name.
const COUNTED: Record<string, string> = { pcs: 'pcs', tins: 'tin', tin: 'tin', jars: 'jar', jar: 'jar', loaf: 'loaf', loaves: 'loaf', balls: 'ball', ball: 'ball', head: 'head', heads: 'head', bunch: 'bunch', bunches: 'bunch', cloves: 'clove', clove: 'clove' }

function unitKey(unit: string): string {
  return COUNTED[unit] ?? unit
}

/** Every ingredient of the week, scaled to each night's servings and summed by name and unit. */
export function shopping(week: Night[]): Line[] {
  const lines = new Map<string, Line>()
  for (const night of week) {
    const scale = night.servings / night.recipe.serves
    for (const ing of night.recipe.ingredients) {
      const unit = unitKey(ing.unit)
      const key = slug(`${ing.key ?? ing.name} ${unit}`)
      const line = lines.get(key) ?? { key, name: ing.name, unit, qty: 0, aisle: ing.aisle, days: [] }
      line.qty += ing.qty * scale
      if (!line.days.includes(night.day)) line.days.push(night.day)
      lines.set(key, line)
    }
  }
  return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Scales one recipe's ingredients to a night's servings. */
export function scaled(night: Night): Line[] {
  const scale = night.servings / night.recipe.serves
  return night.recipe.ingredients.map((ing) => {
    const unit = unitKey(ing.unit)
    return { key: slug(`${ing.key ?? ing.name} ${unit}`), name: ing.name, unit, qty: ing.qty * scale, aisle: ing.aisle, days: [night.day] }
  })
}

const PLURAL: Record<string, string> = { tin: 'tins', jar: 'jars', loaf: 'loaves', ball: 'balls', head: 'heads', bunch: 'bunches', clove: 'cloves' }

/** A quantity a person would write on a list: 1.2 kg, 750 g, 3 tins, ½ head. `word` names a unit in the reader's language. */
export function amount(qty: number, unit: string, word: (unit: string) => string = (u) => u): string {
  if (unit === 'g' || unit === 'ml') {
    const big = unit === 'g' ? 'kg' : 'l'
    if (qty >= 1000) return `${trim(Math.round(qty / 100) / 10)} ${big}`
    return `${Math.round(qty / (qty >= 100 ? 10 : 5)) * (qty >= 100 ? 10 : 5)} ${unit}`
  }
  if (unit === 'tbsp' || unit === 'tsp') return `${trim(Math.ceil(qty * 2) / 2)} ${word(unit)}`
  if (unit === 'pcs') return `${Math.ceil(qty)}`
  const n = unit === 'head' ? Math.ceil(qty * 2) / 2 : Math.ceil(qty)
  const shown = n === 0.5 ? '½' : trim(n)
  return `${shown} ${word(n > 1 ? PLURAL[unit] ?? unit : unit)}`
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function hours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h} h ${m ? `${m} min` : ''}`.trim() : `${m} min`
}
