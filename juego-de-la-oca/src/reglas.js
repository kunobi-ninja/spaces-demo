// Reglas de la Oca. Las casillas especiales vienen de data/tablero.json y los textos de las
// palabras de la página (`w.turno`), así que aquí solo está la mecánica.

export const META = 63

/** Cada casilla especial por número: { id, name, icon, kind, destination, again, skip, chant }. */
export function especialesPorCasilla(tablero) {
  const specials = {}
  for (const especial of tablero.especiales) {
    especial.casillas.forEach((casilla, index) => {
      const destination = especial.destino === 'siguiente'
        ? especial.casillas[index + 1]
        : Array.isArray(especial.destino) ? especial.destino[index] : especial.destino
      specials[casilla] = {
        id: especial.id,
        name: especial.nombre,
        icon: especial.icono,
        kind: especial.tipo,
        ...(destination !== undefined ? { destination } : {}),
        ...(especial.otraVez ? { again: true } : {}),
        ...(especial.pierde ? { skip: especial.pierde } : {}),
        ...(especial.cantinela && destination !== undefined ? { chant: especial.cantinela } : {}),
      }
    })
  }
  return specials
}

/** Las reglas para un tablero, con los mensajes en las palabras `w` de la página. */
export function crearReglas(tablero, w) {
  const specials = especialesPorCasilla(tablero)
  const t = w.turno
  const player = index => w.player({ n: index + 1 })

  function newGame(count, { trackThrows = false } = {}) {
    return {
      pieces: Array.from({ length: count }, () => ({ position: 0, skip: 0, well: false })),
      current: 0,
      winner: null,
      roll: null,
      message: t.allAtStart,
      ...(trackThrows ? { throws: [] } : {}),
    }
  }

  // Reglas clásicas del pozo: la ficha que cae en el pozo se queda allí sin tirar
  // hasta que otra ficha cae también en el pozo. Entonces sale la que estaba
  // dentro y se queda la recién llegada.
  function playTurn(game, roll) {
    if (game.winner !== null || !Number.isInteger(roll) || roll < 1 || roll > 6) return game

    const pieces = game.pieces.map(piece => ({ skip: 0, well: false, ...piece }))
    const piece = pieces[game.current]
    const raw = piece.position + roll
    const bounced = raw > META
    const landing = bounced ? 2 * META - raw : raw
    const special = specials[landing]
    piece.position = special?.destination ?? landing
    piece.skip = special?.skip ?? 0
    piece.well = special?.kind === 'pozo'
    const name = player(game.current)
    const messages = [(bounced ? t.bounced : t.rolled)({ player: name, roll, square: landing })]

    function completeTurn(current, winner) {
      const next = { ...game, pieces, current, roll, winner, message: messages.join(' ') }
      if (game.throws) {
        const rules = winner === null ? messages.slice(1) : [t.goalRule]
        if (special?.again && special.destination === undefined) rules.unshift(special.name + '.')
        if (bounced) rules.unshift(t.bounceRule)
        next.throws = [...game.throws, { player: game.current, roll, position: piece.position, rules }]
      }
      return next
    }

    if (landing === META) {
      messages.push(t.wins({ player: name }))
      return completeTurn(game.current, game.current)
    }

    if (special?.destination !== undefined) {
      messages.push(t.jump({ name: special.name, to: piece.position || t.toStart }))
    }

    if (piece.skip) {
      messages.push(t.losesTurns({ name: special.name, count: piece.skip }))
    }

    if (piece.well) {
      const rescued = pieces.findIndex((other, index) => index !== game.current && other.well)
      if (rescued >= 0) {
        pieces[rescued].well = false
        messages.push(t.wellRescue({ name: special.name, rescued: player(rescued), player: name }))
      } else {
        messages.push(t.wellWait({ name: special.name }))
      }
    }

    let current = game.current
    if (special?.again) {
      messages.push(special.chant ?? t.rollAgain)
    } else {
      // Siempre hay al menos una ficha fuera del pozo y las penalizaciones son
      // finitas, así que el bucle termina.
      const notes = new Set()
      do {
        current = (current + 1) % pieces.length
        const next = pieces[current]
        if (next.well) {
          if (current !== game.current) notes.add(t.stillInWell({ player: player(current) }))
          continue
        }
        if (!next.skip) break
        next.skip -= 1
        messages.push(t.losesThisTurn({ player: player(current) }))
      } while (true)
      messages.push(...notes)
    }

    return completeTurn(current, null)
  }

  return { specials, newGame, playTurn }
}
