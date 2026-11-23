// Comparación de respuestas: ignora mayúsculas, tildes (salvo la Ñ),
// signos de puntuación, espacios de sobra y artículos iniciales.

const ARTICULOS = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo'])
const MARCA_ENE = '\u0000'

/** Deja el texto en una forma comparable: "  ¡El Ñandú! " → "ñandu". */
export function normalizar(texto: string): string {
  const sinTildes = texto
    .toLowerCase()
    .replace(/ñ/g, MARCA_ENE)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(new RegExp(MARCA_ENE, 'g'), 'ñ')
  const palabras = sinTildes
    .replace(/[^a-zñ0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  while (palabras.length > 1 && ARTICULOS.has(palabras[0])) palabras.shift()
  return palabras.join(' ')
}

/** ¿La respuesta escrita coincide con alguna de las aceptadas? */
export function esCorrecta(respuesta: string, aceptadas: readonly string[]): boolean {
  const dada = normalizar(respuesta)
  if (!dada) return false
  return aceptadas.some((a) => normalizar(a) === dada)
}
