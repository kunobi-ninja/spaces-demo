// Every instrument is synthesised live with Web Audio: no recorded samples.
// The beat follows the wall clock, so every screen that plays the pattern lands on the same step.

import { STEPS, midiOf, stepAt, type Track } from './pattern'

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Groove {
  tempo: number
  key: string | null
  tracks: Track[]
}

export const createSynth = (read: () => Groove) => {
  let ctx: any = null
  let master: any = null
  let timer: any = null
  let lastStep = -1
  let lastTempo = 0
  let noiseBuf: any = null
  const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

  const env = (at: number, peak: number, attack: number, decay: number, dest: any) => {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(peak, at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
    g.connect(dest)
    return g
  }
  const osc = (type: string, freq: number, at: number, len: number, out: any, glide?: number) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, at)
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + len * 0.6)
    o.connect(out)
    o.start(at)
    o.stop(at + len + 0.05)
    return o
  }
  const noise = (at: number, len: number, out: any) => {
    const s = ctx.createBufferSource()
    s.buffer = noiseBuf
    s.connect(out)
    s.start(at, Math.random() * 0.5)
    s.stop(at + len + 0.05)
  }

  const voices: Record<string, (at: number, gain: number, degree: number, hold: number) => void> = {
    kick(at, gain) {
      osc('sine', 155, at, 0.42, env(at, gain, 0.003, 0.4, master), 42)
      osc('triangle', 900, at, 0.02, env(at, gain * 0.25, 0.001, 0.02, master), 200)
    },
    snare(at, gain) {
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 2200
      f.Q.value = 0.7
      f.connect(env(at, gain * 0.7, 0.002, 0.2, master))
      noise(at, 0.22, f)
      osc('triangle', 210, at, 0.12, env(at, gain * 0.45, 0.002, 0.11, master), 150)
    },
    clap(at, gain) {
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 1500
      f.Q.value = 1.1
      f.connect(master)
      ;[0, 0.012, 0.024].forEach((d, i) => noise(at + d, i === 2 ? 0.18 : 0.02, env(at + d, gain * 0.7, 0.001, i === 2 ? 0.16 : 0.015, f)))
    },
    hat(at, gain) {
      const f = ctx.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = 7600
      f.connect(env(at, gain * 0.45, 0.001, 0.05, master))
      noise(at, 0.07, f)
    },
    bass(at, gain, degree, hold) {
      const note = midiOf(read().key, degree, 36)
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.Q.value = 7
      f.frequency.setValueAtTime(1400, at)
      f.frequency.exponentialRampToValueAtTime(180, at + 0.22)
      const len = Math.min(hold, 0.5)
      f.connect(env(at, gain * 0.5, 0.005, len, master))
      osc('sawtooth', hz(note), at, len + 0.05, f)
      osc('sine', hz(note - 12), at, len + 0.05, env(at, gain * 0.35, 0.005, len, master))
    },
    chords(at, gain, degree, hold) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 1900
      const len = Math.min(hold, 2.4)
      const out = env(at, gain * 0.13, 0.04, len, master)
      f.connect(out)
      ;[0, 1, 2].forEach((i) => {
        const n = midiOf(read().key, degree + i * 2, 48)
        osc('sawtooth', hz(n) * 1.003, at, len, f)
        osc('triangle', hz(n), at, len, f)
      })
    },
    lead(at, gain, degree, hold) {
      const note = midiOf(read().key, degree, 60)
      const len = Math.min(hold, 0.4)
      osc('square', hz(note), at, len, env(at, gain * 0.12, 0.005, len, master))
      osc('triangle', hz(note + 12), at, len, env(at, gain * 0.08, 0.005, len * 0.6, master))
    },
  }

  const tick = () => {
    if (!ctx) return
    const g = read()
    const tempo = g.tempo
    const now = Date.now() / 1000
    const per = 15 / tempo
    if (tempo !== lastTempo) {
      lastTempo = tempo
      lastStep = Math.floor(now / per)
    }
    const until = now + 0.14
    for (let n = lastStep + 1; n * per < until; n++) {
      lastStep = n
      const at = ctx.currentTime + Math.max(0, n * per - now) + 0.02
      const s = ((n % STEPS) + STEPS) % STEPS
      for (const t of g.tracks) {
        const hit = stepAt(t, s)
        if (!hit || !t.volume) continue
        const voice = voices[t.instrument ?? '']
        if (!voice) continue
        const vol = (t.volume / 100) * (hit.accent ? 1 : 0.78)
        voice(at, vol, hit.note ?? 1, hit.hold * per)
      }
    }
  }

  return {
    get on() {
      return !!timer
    },
    start() {
      if (!ctx) {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext
        if (!AC) return false
        ctx = new AC()
        master = ctx.createGain()
        master.gain.value = 0.6
        const comp = ctx.createDynamicsCompressor()
        master.connect(comp).connect(ctx.destination)
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
        const d = noiseBuf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      }
      if (ctx.state === 'suspended') ctx.resume()
      if (!timer) {
        lastTempo = 0
        timer = setInterval(tick, 25)
      }
      return true
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
    /** A short preview when someone taps a cell on, so the change is heard at once. */
    preview(track: Track, step: number) {
      if (!ctx || !timer) return
      const hit = stepAt(track, step)
      const voice = voices[track.instrument ?? '']
      if (!hit || !voice) return
      voice(ctx.currentTime + 0.01, ((track.volume ?? 70) / 100) * 0.6, hit.note ?? 1, 0.3)
    },
    dispose() {
      if (timer) clearInterval(timer)
      timer = null
      if (ctx) ctx.close()
      ctx = null
    },
  }
}

export type Synth = ReturnType<typeof createSynth>
