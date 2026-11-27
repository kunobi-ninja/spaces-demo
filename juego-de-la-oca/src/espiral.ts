import { META } from './reglas.js'
import type { Celda } from './arte'

/** Las casillas 0…63 en una espiral de 8 × 8 que entra hacia el centro, con una flecha en cada giro. */
const LADO = 8

export const espiral: Celda[] = (() => {
  const celdas: Celda[] = []
  const direcciones = [[0, 1], [1, 0], [0, -1], [-1, 0]]
  const vistas = new Set<number>()
  let fila = 0
  let columna = 0
  let direccion = 0

  for (let position = 0; position <= META; position += 1) {
    celdas.push({ position, row: fila + 1, column: columna + 1 })
    vistas.add(fila * LADO + columna)
    const [dy, dx] = direcciones[direccion]
    const siguienteFila = fila + dy
    const siguienteColumna = columna + dx
    if (siguienteFila < 0 || siguienteFila >= LADO || siguienteColumna < 0 || siguienteColumna >= LADO ||
      vistas.has(siguienteFila * LADO + siguienteColumna)) {
      direccion = (direccion + 1) % direcciones.length
    }
    fila += direcciones[direccion][0]
    columna += direcciones[direccion][1]
  }

  const flechas: Record<string, string> = { '0,1': '→', '1,0': '↓', '0,-1': '←', '-1,0': '↑' }
  celdas.forEach((celda, index) => {
    const siguiente = celdas[index + 1]
    const anterior = celdas[index - 1]
    if (!siguiente) return
    const sale = [siguiente.row - celda.row, siguiente.column - celda.column].join(',')
    const entra = anterior && [celda.row - anterior.row, celda.column - anterior.column].join(',')
    if (sale !== entra) celda.arrow = flechas[sale]
  })
  return celdas
})()
