import { FRUITS, type Fruit } from './models'

/*
 * The rules of Dino Snack, with no drawing in them. The dinosaur runs left and right along the
 * meadow. Fruit and rocks fall from the sky: catch the fruit in its mouth, keep away from the
 * rocks. Everything moves by `step`, a fixed slice of time, so a round plays the same at any
 * frame rate.
 */

/** How far the dinosaur may run either side of the middle. */
export const LANE = 52
/** Where things start falling, and the height the dinosaur's mouth catches them at. */
export const SKY = 78
const MOUTH_TOP = 24
const MOUTH_BOTTOM = 8
const REACH = 8.5
const TOP_SPEED = 75
/** Seconds a rock leaves the dinosaur dizzy, and safe from the next one. */
export const DIZZY = 1
const SAFE = 1.9

export type Kind = Fruit | 'rock'

export interface Item {
  id: number
  kind: Kind
  x: number
  y: number
  vy: number
  spin: number
  /** When it reached the ground, or -1 while it is still falling. */
  landed: number
}

export type GameEvent =
  | { type: 'catch'; at: number; x: number; y: number; kind: Fruit; score: number }
  | { type: 'bonk'; at: number; x: number; y: number }
  | { type: 'splat'; at: number; x: number; kind: Fruit }
  | { type: 'thud'; at: number; x: number }

export interface World {
  t: number
  seed: number
  /** True on the title screen, where nobody loses lives. */
  demo: boolean
  goal: number
  dino: { x: number; vx: number; target: number; stride: number; dizzyUntil: number; safeUntil: number; ate: number }
  items: Item[]
  events: GameEvent[]
  score: number
  lives: number
  next: number
  nextId: number
  over: null | 'win' | 'lose'
  overAt: number
}

export interface Input {
  /** Where a finger or the mouse points along the meadow, if anywhere. */
  point: number | null
  /** -1, 0 or 1 from the arrow keys. */
  dir: number
}

/** A small, repeatable random number generator (mulberry32). */
function random(w: World) {
  w.seed = (w.seed + 0x6d2b79f5) | 0
  let r = Math.imul(w.seed ^ (w.seed >>> 15), 1 | w.seed)
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296
}

export function newWorld(seed: number, goal = 10, lives = 3, demo = false): World {
  return {
    t: 0,
    seed,
    demo,
    goal,
    dino: { x: 0, vx: 0, target: 0, stride: 0, dizzyUntil: -1, safeUntil: -1, ate: -9 },
    items: [],
    events: [],
    score: 0,
    lives,
    next: 0.6,
    nextId: 1,
    over: null,
    overAt: 0,
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Seconds between drops, and how fast they fall, as the dinosaur gets fuller. */
const gap = (w: World) => Math.max(0.6, 1.25 - w.score * 0.055)
const speed = (w: World) => 34 + w.score * 2.2

function drop(w: World) {
  const rocky = w.score >= 1 && random(w) < Math.min(0.36, 0.2 + w.score * 0.015)
  let x = (random(w) * 2 - 1) * LANE
  // keep a rock away from a fruit that is falling at about the same time
  if (rocky)
    for (const it of w.items)
      if (it.kind !== 'rock' && it.landed < 0 && it.y > SKY - 30 && Math.abs(it.x - x) < 14) x = clamp(it.x + (x < it.x ? -18 : 18), -LANE, LANE)
  const kind: Kind = rocky ? 'rock' : FRUITS[Math.floor(random(w) * FRUITS.length)]
  w.items.push({ id: w.nextId++, kind, x, y: SKY, vy: speed(w), spin: random(w) * 6, landed: -1 })
}

/** Moves the world on by `dt` seconds. */
export function step(w: World, dt: number, input: Input) {
  w.t += dt
  const d = w.dino
  const dizzy = w.t < d.dizzyUntil

  if (!w.over) {
    if (input.dir) d.target = clamp(d.x + input.dir * 24, -LANE, LANE)
    else if (input.point !== null) d.target = clamp(input.point, -LANE, LANE)
  }
  d.vx = dizzy || w.over ? 0 : clamp((d.target - d.x) * 9, -TOP_SPEED, TOP_SPEED)
  if (Math.abs(d.vx) < 2) d.vx = 0
  d.x = clamp(d.x + d.vx * dt, -LANE, LANE)
  d.stride += Math.abs(d.vx) * dt

  if (!w.over && w.t >= w.next && w.items.filter((i) => i.landed < 0).length < 5) {
    drop(w)
    w.next = w.t + gap(w)
  }

  for (const it of w.items) {
    if (it.landed >= 0) continue
    it.vy += 9 * dt
    it.y -= it.vy * dt
    // caught: in front of the mouth, at mouth height
    const near = Math.abs(it.x - d.x) < REACH && it.y < MOUTH_TOP && it.y > MOUTH_BOTTOM
    if (near && !w.over) {
      if (it.kind === 'rock') {
        if (w.t < d.safeUntil) continue
        w.events.push({ type: 'bonk', at: w.t, x: it.x, y: it.y })
        d.dizzyUntil = w.t + DIZZY
        d.safeUntil = w.t + SAFE
        if (!w.demo) w.lives -= 1
        it.y = -99
      } else {
        w.score += 1
        d.ate = w.t
        w.events.push({ type: 'catch', at: w.t, x: it.x, y: it.y, kind: it.kind, score: w.score })
        it.y = -99
      }
      continue
    }
    if (it.y <= 0) {
      it.y = 0
      it.landed = w.t
      if (it.kind === 'rock') w.events.push({ type: 'thud', at: w.t, x: it.x })
      else w.events.push({ type: 'splat', at: w.t, x: it.x, kind: it.kind })
    }
  }
  // fruit that landed goes at once (its splash stays); a rock rests a moment first
  w.items = w.items.filter((it) => it.y > -50 && (it.landed < 0 || (it.kind === 'rock' && w.t - it.landed < 0.9)))
  w.events = w.events.filter((e) => w.t - e.at < 2)

  if (!w.over && !w.demo) {
    if (w.score >= w.goal) w.over = 'win'
    else if (w.lives <= 0) w.over = 'lose'
    if (w.over) {
      w.overAt = w.t
      w.items = w.items.filter((it) => it.kind !== 'rock')
    }
  }
}

/** Plays on the title screen: runs under the lowest fruit and away from rocks about to land. */
export function autopilot(w: World): Input {
  const d = w.dino
  const falling = w.items.filter((i) => i.landed < 0)
  const danger = falling.find((i) => i.kind === 'rock' && i.y < 45 && Math.abs(i.x - d.x) < 14)
  if (danger) return { point: d.x + (d.x > danger.x ? 22 : -22), dir: 0 }
  const food = falling.filter((i) => i.kind !== 'rock').sort((a, b) => a.y - b.y)[0]
  return { point: food ? food.x : Math.sin(w.t * 0.6) * 20, dir: 0 }
}

/** Seconds since the last bite, as 0..1 through the bite, or 0 when not biting. */
export const chomp = (w: World) => {
  const q = (w.t - w.dino.ate) / 0.35
  return q > 0 && q < 1 ? q : 0
}
