/* Two tiny synthesized sounds. The context starts on the first tap or key press. */

let ctx: AudioContext | null = null

export function unlock() {
  if (!ctx && typeof AudioContext !== 'undefined') ctx = new AudioContext()
  if (ctx?.state === 'suspended') void ctx.resume()
}

export function closeAudio() {
  void ctx?.close()
  ctx = null
}

/** A short meow: a filtered sawtooth that rises, then falls. `pitch` changes the cat. */
export function meow(pitch = 1, volume = 0.08) {
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
  const o = ctx.createOscillator()
  const f = ctx.createBiquadFilter()
  const g = ctx.createGain()
  o.type = 'sawtooth'
  f.type = 'lowpass'
  f.frequency.setValueAtTime(1400, t)
  f.frequency.linearRampToValueAtTime(2400, t + 0.15)
  f.frequency.linearRampToValueAtTime(900, t + 0.5)
  o.frequency.setValueAtTime(520 * pitch, t)
  o.frequency.linearRampToValueAtTime(840 * pitch, t + 0.16)
  o.frequency.linearRampToValueAtTime(470 * pitch, t + 0.48)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(volume, t + 0.05)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.52)
  o.connect(f).connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + 0.55)
}

/** A happy two-note chomp for a caught fish. */
export function chomp() {
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
  ;[660, 990].forEach((freq, i) => {
    const o = ctx!.createOscillator()
    const g = ctx!.createGain()
    o.type = 'square'
    o.frequency.value = freq
    g.gain.setValueAtTime(0.05, t + i * 0.08)
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.09)
    o.connect(g).connect(ctx!.destination)
    o.start(t + i * 0.08)
    o.stop(t + i * 0.08 + 0.1)
  })
}
