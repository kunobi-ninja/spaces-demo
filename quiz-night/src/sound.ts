// Every sound is made live with Web Audio: no recorded files.
export const createSfx = () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let ctx: any = null
  let master: any = null
  let musicBus: any = null
  let muted = false
  let seq: any = null
  let step = 0
  let nextTime = 0
  let tempo = 112
  const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)
  const tone = (freq: number, at: number, dur: number, { type = 'sine', gain = 0.3, dest, glide }: any = {}) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, at)
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + dur)
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    o.connect(g).connect(dest || master)
    o.start(at)
    o.stop(at + dur + 0.05)
  }
  const noise = (at: number, dur: number, { gain = 0.2, freq = 1200, q = 1, sweep, dest }: any = {}) => {
    const len = Math.ceil(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    const s = ctx.createBufferSource()
    s.buffer = buf
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.setValueAtTime(freq, at)
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, at + dur)
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + dur * 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    s.connect(f).connect(g).connect(dest || master)
    s.start(at)
    s.stop(at + dur)
  }
  const PROG = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]]
  const ARP = [0, 1, 2, 3, 2, 1, 3, 2]
  const schedule = () => {
    const spb = 60 / tempo / 4
    while (nextTime < ctx.currentTime + 0.12) {
      const chord = PROG[Math.floor(step / 16) % 4]
      const s = step % 16
      if (s % 4 === 0) tone(midi(chord[0] - 24), nextTime, spb * 3.4, { type: 'triangle', gain: 0.55, dest: musicBus })
      if (s % 8 === 0) tone(120, nextTime, 0.18, { glide: 45, gain: 0.5, dest: musicBus })
      if (s % 8 === 4) noise(nextTime, 0.09, { gain: 0.16, freq: 2400, q: 0.6, dest: musicBus })
      if (s % 2 === 1) noise(nextTime, 0.03, { gain: 0.05, freq: 9000, q: 0.8, dest: musicBus })
      tone(midi(chord[ARP[s % 8]] + 12), nextTime, spb * 1.5, { type: 'square', gain: s % 2 ? 0.035 : 0.06, dest: musicBus })
      nextTime += spb
      step++
    }
  }
  return {
    unlock() {
      if (!ctx) {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext
        if (!AC) return false
        ctx = new AC()
        master = ctx.createGain()
        master.gain.value = muted ? 0 : 0.55
        master.connect(ctx.destination)
        musicBus = ctx.createGain()
        musicBus.gain.value = 0.2
        musicBus.connect(master)
      }
      if (ctx.state === 'suspended') ctx.resume()
      return true
    },
    get ready() {
      return !!ctx
    },
    setMuted(m: boolean) {
      muted = m
      if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05)
    },
    music(on: boolean, bpm?: number) {
      if (!ctx) return
      if (bpm) tempo = bpm
      if (on && !seq) {
        nextTime = ctx.currentTime + 0.05
        seq = setInterval(schedule, 25)
      } else if (!on && seq) {
        clearInterval(seq)
        seq = null
      }
    },
    play(name: string) {
      if (!ctx) return
      const t = ctx.currentTime + 0.01
      if (name === 'pop') tone(620, t, 0.14, { glide: 1240, gain: 0.14 })
      else if (name === 'select') {
        tone(520, t, 0.1, { type: 'triangle', gain: 0.25 })
        tone(780, t + 0.06, 0.16, { type: 'triangle', gain: 0.2 })
      } else if (name === 'tick') tone(1760, t, 0.05, { type: 'square', gain: 0.05 })
      else if (name === 'whoosh') noise(t, 0.75, { gain: 0.22, freq: 260, sweep: 5200, q: 0.9 })
      else if (name === 'go') {
        tone(523.25, t, 0.14, { type: 'triangle', gain: 0.3 })
        tone(783.99, t + 0.1, 0.3, { type: 'triangle', gain: 0.3 })
      } else if (name === 'correct') {
        tone(110, t, 0.45, { glide: 40, gain: 0.5 })
        ;[72, 76, 79, 84].forEach((n, i) => tone(midi(n), t + i * 0.07, 0.4, { type: 'triangle', gain: 0.26 }))
        tone(midi(96), t + 0.3, 0.7, { gain: 0.07 })
        noise(t + 0.25, 0.6, { gain: 0.08, freq: 9000, q: 0.5 })
      } else if (name === 'wrong') {
        tone(110, t, 0.4, { glide: 40, gain: 0.45 })
        tone(196, t, 0.55, { type: 'sawtooth', gain: 0.08, glide: 98 })
        tone(207.65, t, 0.55, { type: 'sawtooth', gain: 0.06, glide: 103 })
      } else if (name === 'fanfare') {
        ;[[60, 64, 67], [62, 65, 69], [64, 67, 72], [67, 72, 76, 79]].forEach((ch, i) =>
          ch.forEach((n: number) => tone(midi(n), t + i * 0.18, i === 3 ? 1.6 : 0.24, { type: 'triangle', gain: 0.12 })),
        )
        tone(110, t + 0.54, 0.6, { glide: 40, gain: 0.5 })
        noise(t + 0.54, 1.1, { gain: 0.14, freq: 8000, q: 0.5 })
      }
    },
    dispose() {
      if (seq) clearInterval(seq)
      if (ctx) ctx.close()
    },
  }
}

export type Sfx = ReturnType<typeof createSfx>
