// Cifrado ligero para que las preguntas no se lean a simple vista en la copia que se comparte.
// No es seguridad de verdad: quien sepa programar puede descifrarlas. Solo evita destripes.

const CLAVE = 'pasalacabra·sin-mirar'

function mezclar(bytes: Uint8Array): Uint8Array {
  const clave = new TextEncoder().encode(CLAVE)
  const salida = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) salida[i] = bytes[i] ^ clave[i % clave.length] ^ (i * 31) % 256
  return salida
}

export function cifrar(datos: unknown): string {
  const bytes = mezclar(new TextEncoder().encode(JSON.stringify(datos)))
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario)
}

export function descifrar<T>(texto: string): T {
  const binario = atob(texto)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return JSON.parse(new TextDecoder().decode(mezclar(bytes))) as T
}
