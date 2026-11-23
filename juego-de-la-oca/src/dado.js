const sides = 6
const byteRange = 256
const limit = byteRange - (byteRange % sides)

export function rollDie(source = globalThis.crypto) {
  const byte = new Uint8Array(1)
  // Solo usamos el tramo que reparte el mismo número de valores a cada cara.
  do {
    source.getRandomValues(byte)
  } while (byte[0] >= limit)
  return (byte[0] % sides) + 1
}
