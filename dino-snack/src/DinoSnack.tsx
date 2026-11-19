import * as React from 'react'
import * as THREE from 'three'
import '@fontsource/fredoka/500.css'
import '@fontsource/fredoka/700.css'
import { makeRenderer, sunlight } from './light'
import { sound, type Effect } from './sound'
import { meadow, shot } from './view'
import { autopilot, LANE, newWorld, step, type GameEvent, type Input, type World } from './world'

/*
 * The playable game. The dinosaur follows a finger or the mouse along the path; the arrow keys
 * (or A and D) move it too. Space starts a round and M turns the sound off and on. Behind the
 * title the dinosaur plays on its own, so the meadow is never still.
 */

type Phase = 'title' | 'play' | 'win' | 'lose'

const STEP = 1 / 60
const POPS = 6
const LEFT = new Set(['ArrowLeft', 'KeyA'])
const RIGHT = new Set(['ArrowRight', 'KeyD'])

const C = { midnight: '#06213f', sun: '#f3aa08', tide: '#30ccd5', ocean: '#5bcbf9', cloud: '#ffffff', heart: '#ff5a6e' }
const FONT = '"Fredoka", ui-rounded, "SF Pro Rounded", system-ui, sans-serif'
const outline = (px: number) =>
  `0 ${px}px 0 ${C.midnight}, ${px}px 0 0 ${C.midnight}, -${px}px 0 0 ${C.midnight}, 0 -${px}px 0 ${C.midnight}, ${px}px ${px}px 0 ${C.midnight}, -${px}px ${px}px 0 ${C.midnight}`
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`

const SOUND: Record<GameEvent['type'], Effect> = { catch: 'chomp', bonk: 'bonk', splat: 'splat', thud: 'thud' }

/** The game's words in the reader's language; the page passes them in. */
export interface Words {
  game: string
  title: string
  snacks: string
  lives: (n: number) => string
  soundOn: string
  soundOff: string
  win: (kid: string) => string
  lose: string
  intro: (kid: string, goal: number) => string
  won: (goal: number) => string
  lost: (score: number, kid: string) => string
  play: string
  again: string
  how: string
  yum: string
  ouch: string
}

export function DinoSnack({ kid = 'Mateo', goal = 10, lives = 3, w }: { kid?: string; goal?: number; lives?: number; w: Words }) {
  const box = React.useRef<HTMLDivElement>(null)
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const popRefs = React.useRef<(HTMLDivElement | null)[]>([])
  const words = React.useRef(w)
  words.current = w
  const [phase, setPhase] = React.useState<Phase>('title')
  const [hud, setHud] = React.useState({ score: 0, lives })
  const [muted, setMuted] = React.useState(false)
  const [narrow, setNarrow] = React.useState(false)
  const control = React.useRef({
    phase: 'title' as Phase,
    start: () => {},
    mute: () => {},
    aim: (_x: number, _y: number) => {},
  })

  React.useEffect(() => {
    const el = box.current!
    const gl = makeRenderer(canvas.current!)
    const scene = new THREE.Scene()
    const light = sunlight(scene)
    const view = meadow(scene)
    const audio = sound()
    let aspect = 16 / 10

    const fit = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width < 2 || height < 2) return
      aspect = width / height
      gl.setSize(width, height, false)
      setNarrow(width < 560)
    }
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    fit()

    let world: World = newWorld(7, goal, lives, true)
    let point: number | null = null
    let nudge = 0
    const held = new Set<string>()
    const heard = new Set<string>()
    let lastStride = 0
    let endedAt = 0

    const c = control.current
    const go = (p: Phase) => {
      c.phase = p
      setPhase(p)
    }
    c.start = () => {
      audio.unlock()
      world = newWorld((Date.now() % 100000) + 1, goal, lives)
      point = null
      held.clear()
      heard.clear()
      setHud({ score: 0, lives })
      go('play')
      audio.play('start')
      audio.music('play', true)
      el.focus()
    }
    c.mute = () => setMuted(audio.toggle())

    // a finger or the mouse points at a spot on the path; the dinosaur heads there
    const ray = new THREE.Raycaster()
    const lane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const hit = new THREE.Vector3()
    c.aim = (cx, cy) => {
      const r = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), light.camera)
      if (ray.ray.intersectPlane(lane, hit)) point = Math.max(-LANE, Math.min(LANE, hit.x))
    }

    const down = (e: KeyboardEvent) => {
      const arrow = LEFT.has(e.code) || RIGHT.has(e.code)
      if (arrow || e.code === 'Space') e.preventDefault()
      audio.unlock()
      if (e.code === 'KeyM') return c.mute()
      if ((e.code === 'Space' || e.code === 'Enter') && c.phase !== 'play') return c.start()
      if (!arrow) return
      held.add(e.code)
      point = null
      if (!e.repeat) nudge = LEFT.has(e.code) ? -1 : 1
    }
    const up = (e: KeyboardEvent) => held.delete(e.code)
    const blur = () => held.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)

    const input = (): Input => {
      let dir = 0
      for (const k of held) dir += LEFT.has(k) ? -1 : 1
      if (!dir && nudge) dir = nudge
      nudge = 0
      return { point, dir: Math.sign(dir) }
    }

    let last = performance.now()
    let carry = 0
    let raf = requestAnimationFrame(function frame(now) {
      carry += Math.min(0.1, (now - last) / 1000)
      last = now
      const playing = c.phase === 'play'
      while (carry >= STEP) {
        carry -= STEP
        step(world, STEP, playing && !world.over ? input() : c.phase === 'title' ? autopilot(world) : { point: null, dir: 0 })
        // the title screen's dinosaur keeps going, round after round
        if (c.phase === 'title' && world.score > 14) world = newWorld(world.seed, goal, lives, true)
      }

      if (playing) {
        setHud((h) => (h.score === world.score && h.lives === world.lives ? h : { score: world.score, lives: world.lives }))
        for (const e of world.events) {
          const key = `${e.type}:${e.at}`
          if (heard.has(key)) continue
          heard.add(key)
          audio.play(SOUND[e.type], e.type === 'catch' ? e.score - 1 : 0)
        }
        if (heard.size > 120) heard.clear()
        const stride = Math.floor(world.dino.stride / 9)
        if (stride !== lastStride && world.dino.vx !== 0) audio.play('step')
        lastStride = stride
        if (world.over && !endedAt) {
          endedAt = now
          audio.play(world.over)
          audio.music('end', true)
        }
        // let the dance (or the sigh) play for a moment before the card comes up
        if (world.over && now - endedAt > 900) {
          endedAt = 0
          go(world.over)
        }
      } else audio.music(c.phase === 'title' ? 'title' : 'end')

      light.frame(shot(aspect, world.dino.x), aspect)
      const pops = view.draw(world, now / 1000)
      gl.render(scene, light.camera)

      popRefs.current.forEach((div, i) => {
        if (!div) return
        const p = pops[i]
        div.hidden = !p || p.age > 1.1
        if (!p || div.hidden) return
        const [u, v] = light.onScreen(p.x, p.y, p.z)
        div.textContent = words.current[p.word]
        div.style.left = `${u * 100}%`
        div.style.top = `calc(${v * 100}% - ${Math.min(1, p.age / 0.6) * 36}px)`
        div.style.opacity = String(p.age < 0.8 ? 1 : Math.max(0, 1 - (p.age - 0.8) / 0.3))
        div.style.color = hex(p.color)
        div.style.fontSize = p.big ? 'clamp(28px, 5cqw, 52px)' : 'clamp(22px, 3.6cqw, 38px)'
      })
      raf = requestAnimationFrame(frame)
    })

    return () => {
      cancelAnimationFrame(raf)
      watch.disconnect()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      audio.close()
      scene.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose())
      gl.dispose()
      gl.forceContextLoss()
    }
  }, [goal, lives])

  const pill: React.CSSProperties = {
    background: 'rgba(6, 33, 63, 0.78)',
    color: C.cloud,
    borderRadius: 999,
    padding: 'clamp(6px, 1.2cqw, 12px) clamp(12px, 2.2cqw, 22px)',
    display: 'flex',
    alignItems: 'center',
    gap: 'clamp(6px, 1.2cqw, 12px)',
    fontSize: 'clamp(15px, 2.4cqw, 24px)',
    fontWeight: 700,
    boxShadow: '0 6px 18px rgba(6, 33, 63, 0.18)',
  }
  const ended = phase === 'win' || phase === 'lose'

  return (
    <div
      ref={box}
      tabIndex={0}
      aria-label={w.game}
      onPointerMove={(e) => {
        if (control.current.phase === 'play' && (e.pointerType === 'mouse' || e.buttons)) control.current.aim(e.clientX, e.clientY)
      }}
      onPointerDown={(e) => {
        box.current?.focus()
        if (control.current.phase !== 'play') return
        e.currentTarget.setPointerCapture?.(e.pointerId)
        control.current.aim(e.clientX, e.clientY)
      }}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: narrow ? '3 / 4' : '16 / 10',
        maxHeight: '86vh',
        overflow: 'hidden',
        borderRadius: 24,
        outline: 'none',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        containerType: 'inline-size',
        fontFamily: FONT,
        background: '#9fdcf5',
        boxShadow: '0 18px 48px rgba(6, 33, 63, 0.18)',
      }}
    >
      <canvas ref={canvas} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />

      {Array.from({ length: POPS }, (_, i) => (
        <div
          key={i}
          ref={(d) => {
            popRefs.current[i] = d
          }}
          hidden
          style={{
            position: 'absolute',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            fontWeight: 700,
            textShadow: outline(3),
          }}
        />
      ))}

      {phase === 'play' && (
        <div style={{ position: 'absolute', insetInline: 0, top: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: 'clamp(10px, 2cqw, 20px)', pointerEvents: 'none' }}>
          <div style={pill}>
            <span>{w.snacks}</span>
            <span style={{ display: 'flex', gap: 'clamp(3px, 0.6cqw, 6px)', flexWrap: 'wrap', maxWidth: narrow ? 120 : 'none' }}>
              {Array.from({ length: goal }, (_, i) => (
                <span
                  key={i}
                  style={{
                    width: 'clamp(9px, 1.5cqw, 16px)',
                    height: 'clamp(9px, 1.5cqw, 16px)',
                    borderRadius: 999,
                    background: i < hud.score ? C.sun : 'rgba(255, 255, 255, 0.25)',
                    transform: i === hud.score - 1 ? 'scale(1.25)' : 'none',
                    transition: 'transform 200ms ease-out, background 200ms',
                  }}
                />
              ))}
            </span>
          </div>
          <div style={{ ...pill, color: C.heart, letterSpacing: 2 }} aria-label={w.lives({ count: hud.lives })}>
            {Array.from({ length: lives }, (_, i) => (
              <span key={i} style={{ opacity: i < hud.lives ? 1 : 0.25, transition: 'opacity 300ms' }}>
                ♥
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => control.current.mute()}
        style={{
          ...pill,
          position: 'absolute',
          right: 'clamp(10px, 2cqw, 20px)',
          bottom: 'clamp(10px, 2cqw, 20px)',
          fontSize: 'clamp(12px, 1.6cqw, 16px)',
          fontWeight: 500,
          border: 'none',
          cursor: 'pointer',
          fontFamily: FONT,
        }}
      >
        {muted ? w.soundOff : w.soundOn}
      </button>

      {phase !== 'play' && (
        <button
          type="button"
          onClick={() => control.current.start()}
          style={{
            position: 'absolute',
            inset: 0,
            border: 'none',
            cursor: 'pointer',
            background: ended
              ? 'linear-gradient(180deg, rgba(6, 33, 63, 0.55) 0%, rgba(6, 33, 63, 0.2) 55%, rgba(6, 33, 63, 0) 75%)'
              : 'linear-gradient(180deg, rgba(6, 33, 63, 0.45) 0%, rgba(6, 33, 63, 0.12) 55%, rgba(6, 33, 63, 0) 75%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 'clamp(8px, 1.6cqw, 16px)',
            paddingTop: narrow ? '12%' : '6%',
            paddingInline: 16,
            color: C.cloud,
            fontFamily: FONT,
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: phase === 'title' ? 'clamp(40px, 9cqw, 96px)' : 'clamp(32px, 7cqw, 76px)', fontWeight: 700, lineHeight: 1, color: phase === 'lose' ? C.ocean : C.sun, textShadow: outline(4) }}>
            {phase === 'title' ? w.title : phase === 'win' ? w.win({ kid }) : w.lose}
          </span>
          <span style={{ fontSize: 'clamp(17px, 3cqw, 30px)', fontWeight: 700, textShadow: outline(2), maxWidth: 640 }}>
            {phase === 'title' ? w.intro({ kid, goal }) : phase === 'win' ? w.won({ goal }) : w.lost({ count: hud.score, kid })}
          </span>
          <span
            style={{
              marginTop: 'clamp(4px, 1cqw, 10px)',
              background: C.sun,
              color: C.midnight,
              borderRadius: 999,
              padding: 'clamp(10px, 1.8cqw, 18px) clamp(28px, 5cqw, 52px)',
              fontSize: 'clamp(20px, 3.4cqw, 34px)',
              fontWeight: 700,
              boxShadow: `0 5px 0 ${C.midnight}`,
            }}
          >
            {phase === 'title' ? w.play : w.again}
          </span>
          {phase === 'title' && (
            <span style={{ fontSize: 'clamp(13px, 1.9cqw, 19px)', fontWeight: 500, textShadow: outline(2), maxWidth: 560, lineHeight: 1.35 }}>
              {w.how}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
