/*
 * Fondo con el estilo de la mascota de Kunobi: azul noche con formas
 * geométricas sueltas (círculos, aros, triángulos, cuadrados y cruces) en
 * turquesas y azules. Se dibuja en píxeles, con la misma escala que el resto,
 * y las formas laten y flotan despacio. Dibujo propio.
 */

import { ruido } from './terreno'

const TONOS = ['#5fd0e0', '#3fb6c8', '#2f8fbf', '#7fd3ea', '#4a7fd0', '#36a8a0']

type Forma = 'circulo' | 'aro' | 'triangulo' | 'cuadrado' | 'marco' | 'mas' | 'por'
const FORMAS: Forma[] = ['circulo', 'aro', 'triangulo', 'cuadrado', 'marco', 'mas', 'por']

/** ¿El píxel (dx, dy), relativo al centro, pertenece a la forma de radio r? */
function dentro(f: Forma, dx: number, dy: number, r: number): boolean {
  const d2 = dx * dx + dy * dy
  switch (f) {
    case 'circulo': return d2 <= r * r
    case 'aro': return d2 <= r * r && d2 >= (r - 1.6) * (r - 1.6)
    case 'cuadrado': return Math.abs(dx) <= r * 0.8 && Math.abs(dy) <= r * 0.8
    case 'marco': {
      const a = Math.max(Math.abs(dx), Math.abs(dy))
      return a <= r * 0.85 && a >= r * 0.85 - 1.2
    }
    case 'triangulo': {
      // Triángulo hacia arriba, solo el borde.
      const y = dy + r * 0.3
      if (y < -r * 0.8 || y > r * 0.6) return false
      const media = ((y + r * 0.8) / (r * 1.4)) * r
      const ax = Math.abs(dx)
      return ax <= media && (ax >= media - 1.4 || y >= r * 0.6 - 1)
    }
    case 'mas': return (Math.abs(dx) <= 0.6 && Math.abs(dy) <= r * 0.8) || (Math.abs(dy) <= 0.6 && Math.abs(dx) <= r * 0.8)
    case 'por': return Math.abs(Math.abs(dx) - Math.abs(dy)) <= 0.7 && Math.abs(dx) <= r * 0.7
  }
}

/**
 * Pinta el fondo de `ancho` × `alto` píxeles del mundo a `escala` píxeles de
 * pantalla por píxel. `t` (segundos) hace latir y flotar las formas;
 * `densidad` es la separación media entre formas, en píxeles del mundo.
 */
export function fondoKunobi(
  ctx: CanvasRenderingContext2D, ancho: number, alto: number, escala: number, t = 0,
  { densidad = 22, semilla = 1, cielo = ['#0b1230', '#16244f'], tonos = TONOS, fuerza = 1 }: {
    densidad?: number; semilla?: number
    /** Degradado del cielo, de arriba abajo (los escenarios de la ampliación ninja cambian los colores). */
    cielo?: string[]; tonos?: string[]; fuerza?: number
  } = {},
) {
  const g = ctx.createLinearGradient(0, 0, 0, alto * escala)
  cielo.forEach((c, i) => g.addColorStop(i / Math.max(1, cielo.length - 1), c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, ancho * escala, alto * escala)

  // Una forma por celda de una rejilla, desplazada al azar (estable) dentro de ella.
  const celdas = Math.ceil(ancho / densidad) + 1, filas = Math.ceil(alto / densidad) + 1
  for (let j = 0; j < filas; j++) {
    for (let i = 0; i < celdas; i++) {
      if (ruido(i, j, semilla + 40) < 0.18) continue // algún hueco
      const forma = FORMAS[Math.floor(ruido(i, j, semilla + 41) * FORMAS.length)]
      const r = 2.5 + ruido(i, j, semilla + 42) * 3.5
      const fase = ruido(i, j, semilla + 43) * Math.PI * 2
      const cx = Math.round(i * densidad + ruido(i, j, semilla + 44) * (densidad - 8) + Math.sin(t * 0.5 + fase) * 1.2)
      const cy = Math.round(j * densidad + ruido(i, j, semilla + 45) * (densidad - 8) + Math.cos(t * 0.4 + fase) * 1.2)
      const tono = tonos[Math.floor(ruido(i, j, semilla + 46) * tonos.length)]
      ctx.globalAlpha = (0.3 + 0.22 * (0.5 + 0.5 * Math.sin(t * 1.1 + fase))) * fuerza
      ctx.fillStyle = tono
      const R = Math.ceil(r)
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (dentro(forma, dx, dy, r)) ctx.fillRect((cx + dx) * escala, (cy + dy) * escala, escala, escala)
        }
      }
    }
  }
  ctx.globalAlpha = 1
}
