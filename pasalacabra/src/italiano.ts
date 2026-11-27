// Corrector del italiano: mismo contrato que el español y el inglés, (respuesta, aceptadas) → acierto.

const ARTICOLI = /^(?:(?:il|lo|la|i|gli|le|un|uno|una) |(?:l|un)' *)(?=\p{L})/u

export function normalizzaItaliano(testo: string): string {
  return testo
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .trim()
    .replace(/\s+/g, ' ')
    .replace(ARTICOLI, '')
}

function senzaAccenti(testo: string): string {
  return testo.normalize('NFD').replace(/\p{M}/gu, '')
}

export function correggiItaliano(risposta: string, accettate: readonly string[]): boolean {
  const data = normalizzaItaliano(risposta)
  if (!data) return false
  return accettate.some((rispostaValida) => {
    const valida = normalizzaItaliano(rispostaValida)
    return data === valida || data === senzaAccenti(valida)
  })
}
