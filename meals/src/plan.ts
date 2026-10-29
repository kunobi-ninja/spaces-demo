// Turns the week and the recipes into day cards and a shopping list.

export interface Ingredient { name: string; qty: number; unit: string; aisle: string }
export interface Recipe { id: string; name: string; minutes: number; serves: number; icon: string; tags: string[]; ingredients: Ingredient[] }
export interface Night { day: string; recipe: Recipe; cook: string; servings: number }
export interface Line { key: string; name: string; unit: string; qty: number; aisle: string; days: string[] }

/** Parses CSV with a header row; quoted fields may hold commas and doubled quotes. */
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
  return body.map((cells) => Object.fromEntries(head.map((h, i) => [h.trim(), (cells[i] ?? '').trim()])))
}

export function nights(weekCsv: string, recipes: Recipe[]): Night[] {
  const byId = new Map(recipes.map((r) => [r.id, r]))
  return parseCsv(weekCsv).flatMap((row) => {
    const recipe = byId.get(row.recipe)
    if (!recipe) return []
    return [{ day: row.day, recipe, cook: row.cook, servings: Number(row.servings) || recipe.serves }]
  })
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
      const key = `${ing.name.toLowerCase()}|${unit}`
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
    return { key: `${ing.name.toLowerCase()}|${unit}`, name: ing.name, unit, qty: ing.qty * scale, aisle: ing.aisle, days: [night.day] }
  })
}

const PLURAL: Record<string, string> = { tin: 'tins', jar: 'jars', loaf: 'loaves', ball: 'balls', head: 'heads', bunch: 'bunches', clove: 'cloves' }

/** A quantity a person would write on a list: 1.2 kg, 750 g, 3 tins, ½ head. */
export function amount(qty: number, unit: string): string {
  if (unit === 'g' || unit === 'ml') {
    const big = unit === 'g' ? 'kg' : 'l'
    if (qty >= 1000) return `${trim(Math.round(qty / 100) / 10)} ${big}`
    return `${Math.round(qty / (qty >= 100 ? 10 : 5)) * (qty >= 100 ? 10 : 5)} ${unit}`
  }
  if (unit === 'tbsp' || unit === 'tsp') return `${trim(Math.ceil(qty * 2) / 2)} ${unit}`
  if (unit === 'pcs') return `${Math.ceil(qty)}`
  const n = unit === 'head' ? Math.ceil(qty * 2) / 2 : Math.ceil(qty)
  const shown = n === 0.5 ? '½' : trim(n)
  return `${shown} ${n > 1 ? PLURAL[unit] ?? unit : unit}`
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function hours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h} h ${m ? `${m} min` : ''}`.trim() : `${m} min`
}
