/*
 * Every sound in Dino Snack is synthesised with Web Audio, so the game ships no audio files.
 * A browser only starts sound after a tap or a key, so `unlock` is called from one; until then
 * the game is silent.
 */

export type Effect = 'start' | 'step' | 'chomp' | 'splat' | 'bonk' | 'thud' | 'win' | 'lose'
export type Tune = 'off' | 'title' | 'play' | 'end'

/*
 * A bouncy tune in C major for marimba and bass, one token per eighth note: a note, `_` to
 * hold, `.` to rest. The chords run C Am F G twice, the second time ending home.
 */
const LEAD = [
  'E5 G5 C6 _ B5 G5 A5 .',
  'C5 E5 A5 _ G5 E5 C5 .',
  'F5 A5 C6 _ A5 F5 D5 E5',
  'G5 _ B5 _ D6 _ . .',
  'E5 G5 C6 _ B5 G5 A5 .',
  'C5 E5 A5 _ G5 E5 C5 .',
  'F5 E5 D5 _ G5 F5 E5 D5',
  'C5 _ G4 _ C5 _ . .',
]
const BASS = ['C3', 'A2', 'F2', 'G2', 'C3', 'A2', 'F2', 'C3']
const TEMPO: Record<Exclude<Tune, 'off'>, number> = { title: 104, play: 126, end: 110 }

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const freq = (n: string) => 440 * 2 ** ((12 * (Number(n.slice(-1)) + 1) + NOTE[n[0]] - 69) / 12)

/** The lead as eighth-note steps: step → [frequency, eighths held]. */
const NOTES = new Map<number, [number, number]>()
LEAD.forEach((bar, b) => {
  const tokens = bar.split(' ')
  tokens.forEach((tok, i) => {
    if (tok === '_' || tok === '.') return
    let held = 1
    while (tokens[i + held] === '_') held++
    NOTES.set(b * 8 + i, [freq(tok), held])
  })
})
const LOOP = LEAD.length * 8

export function sound() {
  let ac: AudioContext | null = null
  let master: GainNode | null = null
  let band: GainNode | null = null
  let noise: AudioBuffer | null = null
  let muted = false
  let tune: Tune = 'off'
  let pos = 0
  let at = 0
  let clock: ReturnType<typeof setInterval> | null = null

  /** A plucked note: quick attack, a decay of `len` seconds, pitch sliding from f0 to f1. */
  const pluck = (to: AudioNode | null, t: number, f0: number, f1: number, len: number, wave: OscillatorType, level: number) => {
    if (!ac || !to) return
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = wave
    o.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + len)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(level, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    o.connect(g).connect(to)
    o.start(t)
    o.stop(t + len + 0.05)
  }

  /** A puff of filtered noise: crunches, thuds and the shaker. */
  const rush = (to: AudioNode | null, t: number, f0: number, f1: number, len: number, level: number, q = 1.5) => {
    if (!ac || !to || !noise) return
    const s = ac.createBufferSource()
    s.buffer = noise
    const f = ac.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = q
    f.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + len)
    const g = ac.createGain()
    g.gain.setValueAtTime(level, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    s.connect(f).connect(g).connect(to)
    s.start(t)
    s.stop(t + len + 0.05)
  }

  /** Plays one eighth note of the tune at audio time `t`. */
  const eighth = (n: number, t: number, len: number) => {
    const bar = Math.floor(n / 8)
    const beat = n % 8
    const quiet = tune === 'title' || tune === 'end'
    const lead = NOTES.get(n)
    // marimba: a sine with a faint octave on top, so it rings like wood
    if (lead) {
      pluck(band, t, lead[0], lead[0], Math.min(0.5, lead[1] * len * 1.4), 'sine', quiet ? 0.07 : 0.11)
      pluck(band, t, lead[0] * 4, lead[0] * 4, 0.05, 'sine', quiet ? 0.012 : 0.02)
    }
    // the bass on the beat, bouncing up an octave on the off-beat
    const root = freq(BASS[bar])
    if (beat % 2 === 0) pluck(band, t, root * (beat % 4 === 2 ? 2 : 1), root * (beat % 4 === 2 ? 2 : 1), len * 1.6, 'triangle', 0.16)
    if (quiet) return
    // a soft kick, a clap and a shaker
    if (beat === 0 || beat === 4) pluck(band, t, 120, 50, 0.16, 'sine', 0.28)
    if (beat === 2 || beat === 6) rush(band, t, 1400, 1100, 0.1, 0.1, 0.9)
    rush(band, t + len / 2, 7000, 7000, 0.03, 0.03, 2)
  }

  /** Keeps the tune scheduled a little ahead of the audio clock. */
  const tick = () => {
    if (!ac || tune === 'off') return
    const len = 60 / TEMPO[tune] / 2
    if (at < ac.currentTime) at = ac.currentTime + 0.05
    while (at < ac.currentTime + 0.2) {
      eighth(pos, at, len)
      pos = (pos + 1) % LOOP
      at += len
    }
  }

  return {
    /** Starts sound from inside a tap or a key press. */
    unlock() {
      try {
        if (!ac) {
          ac = new AudioContext()
          master = ac.createGain()
          master.gain.value = muted ? 0 : 0.55
          master.connect(ac.destination)
          band = ac.createGain()
          band.gain.value = 0.6
          band.connect(master)
          noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
          const data = noise.getChannelData(0)
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
          clock = setInterval(tick, 30)
        }
        if (ac.state === 'suspended') void ac.resume()
      } catch {
        ac = null
      }
    },
    play(e: Effect, pitch = 0) {
      if (!ac) return
      const t = ac.currentTime
      const out = master
      switch (e) {
        case 'start':
          ;[523, 659, 784, 1047].forEach((f, i) => pluck(out, t + i * 0.07, f, f, 0.18, 'triangle', 0.14))
          break
        case 'step':
          rush(out, t, 500, 300, 0.05, 0.05, 1)
          break
        case 'chomp': {
          // a crunch, then a note that climbs with every fruit
          rush(out, t, 2600, 900, 0.08, 0.25)
          rush(out, t + 0.09, 2200, 800, 0.07, 0.18)
          const f = 523 * 2 ** ([0, 2, 4, 7, 9, 12, 14, 16, 19, 21][pitch % 10] / 12)
          pluck(out, t + 0.05, f, f, 0.25, 'sine', 0.16)
          break
        }
        case 'splat':
          rush(out, t, 900, 300, 0.12, 0.12)
          break
        case 'bonk':
          pluck(out, t, 330, 110, 0.35, 'square', 0.08)
          pluck(out, t, 880, 840, 0.4, 'sine', 0.08)
          rush(out, t, 600, 200, 0.2, 0.2)
          break
        case 'thud':
          pluck(out, t, 110, 45, 0.25, 'sine', 0.3)
          rush(out, t, 400, 150, 0.2, 0.18)
          break
        case 'win':
          ;[523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => pluck(out, t + i * 0.11, f, f, 0.3, 'triangle', 0.13))
          break
        case 'lose':
          ;[392, 370, 349, 330].forEach((f, i) => pluck(out, t + i * 0.2, f, f * 0.98, 0.32, 'triangle', 0.13))
          break
      }
    },
    /** Chooses what the music plays; a new round starts it from the top. */
    music(next: Tune, restart = false) {
      if (restart || (tune === 'off' && next !== 'off')) pos = 0
      tune = next
    },
    toggle() {
      muted = !muted
      if (master) master.gain.value = muted ? 0 : 0.55
      return muted
    },
    close() {
      if (clock) clearInterval(clock)
      void ac?.close()
    },
  }
}
