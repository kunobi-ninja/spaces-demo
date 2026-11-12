// The pattern as the music-jam-pattern store keeps it, and what each step means.
// A track's steps are 16 characters: "." is a rest. Drums use "x" for a hit and "X" for a loud one.
// Bass, chords and lead use a digit, the note's place in the key's scale: 1 is the key note, 8 an octave up.

export const STORE = 'music-jam-pattern'
export const STEPS = 16

export type Instrument = 'kick' | 'snare' | 'clap' | 'hat' | 'bass' | 'chords' | 'lead'
export interface Track {
  id: string
  name: string | null
  instrument: Instrument | null
  owner: string | null
  steps: string | null
  volume: number | null
}
export interface Pattern {
  key: string | null
  tempo: number | null
  tracks: Track[]
}

export const KEYS = ['C major', 'D minor', 'E minor', 'F major', 'G major', 'A minor']

export const LOOK: Record<string, { color: string; ink: string; melodic: boolean }> = {
  kick: { color: '#ff5d73', ink: '#3a0712', melodic: false },
  snare: { color: '#ffb23e', ink: '#3d2300', melodic: false },
  clap: { color: '#ff8a3d', ink: '#3d1500', melodic: false },
  hat: { color: '#4fd8ff', ink: '#002b3a', melodic: false },
  bass: { color: '#9a7bff', ink: '#170b45', melodic: true },
  chords: { color: '#34e0a1', ink: '#00321f', melodic: true },
  lead: { color: '#ff7ae0', ink: '#3d0030', melodic: true },
}
export const lookOf = (t: Track) => LOOK[t.instrument ?? ''] ?? LOOK.kick

export const cells = (t: Track) => (t.steps ?? '').padEnd(STEPS, '.').slice(0, STEPS).split('')

const isOn = (c: string) => c !== '.' && c !== ' ' && c !== '-' && c !== '_'

/** What a track plays at a step: whether it is loud, its scale note, and how many steps it lasts. */
export const stepAt = (t: Track, s: number) => {
  const row = cells(t)
  const c = row[s]
  if (!c || !isOn(c)) return null
  let hold = 1
  while (hold < STEPS && !isOn(row[(s + hold) % STEPS])) hold++
  const n = Number.parseInt(c, 10)
  return { accent: c === 'X', note: Number.isFinite(n) ? n : null, hold }
}

const ROOTS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]

/** The MIDI note of a scale degree (1 is the key note) above the C at `base`. */
export const midiOf = (key: string | null, degree: number, base: number) => {
  const [root, mode] = (key ?? 'A minor').split(' ')
  const scale = mode === 'major' ? MAJOR : MINOR
  const d = Math.max(1, degree) - 1
  return base + (ROOTS[root] ?? 9) + scale[d % 7] + 12 * Math.floor(d / 7)
}

/** The note's name in the key, for the cell's label. */
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
export const noteName = (key: string | null, degree: number) => NAMES[midiOf(key, degree, 0) % 12]

/** The chord a chords step plays, as a name: "Am", "F", "G". */
export const chordName = (key: string | null, degree: number) => {
  const a = midiOf(key, degree, 0)
  const third = midiOf(key, degree + 2, 0) - a
  return NAMES[a % 12] + (third === 3 ? 'm' : '')
}

/** The step every screen is on now: it follows the clock, so everyone hears the same beat. */
export const clockStep = (tempo: number, now = Date.now()) => Math.floor(now / 1000 / (15 / tempo))

export const setCell = (t: Track, s: number, c: string) => {
  const row = cells(t)
  row[s] = c
  return row.join('')
}
