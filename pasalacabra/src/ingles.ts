// Corrector del inglés: mismo contrato que el español y el italiano: (respuesta, aceptadas) → acierto.

/** Artículos iniciales que se pueden omitir o añadir: «the Amazon» = «Amazon». */
const ARTICLES = /^(?:the|an|a) (?=\p{L})/u

/** Guiones de todo tipo, que valen como espacio: «ice-cream» = «ice cream». */
const DASHES = /[-‐‑‒–—]/g

export function normalizeEnglish(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘ʼ`]/g, "'")
    .replace(DASHES, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(ARTICLES, '')
}

function withoutAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
}

/**
 * Acierto si la respuesta coincide con una aceptada tras normalizar. Se puede omitir un
 * acento de la solución («cafe» por «café»), pero un acento distinto no vale («cafè»).
 */
export function checkEnglish(answer: string, accepted: readonly string[]): boolean {
  const given = normalizeEnglish(answer)
  if (!given) return false
  return accepted.some((valid) => {
    const target = normalizeEnglish(valid)
    return given === target || given === withoutAccents(target)
  })
}
