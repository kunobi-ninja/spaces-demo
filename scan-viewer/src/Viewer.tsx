import * as React from 'react'
import * as THREE from 'three'
import { SparkRenderer, SplatMesh, SplatFileType, dyno } from '@sparkjsdev/spark'
import { observeGestures } from '@vixi/helpers/input'

type Vec3 = [number, number, number]
interface Preset { yaw: number; pitch: number; distance: number; target?: Vec3 }
export interface Scene {
  title: string
  subtitle: string
  orientation: [number, number, number, number]
  target: Vec3
  presets: Record<'front' | 'side' | 'close', Preset>
  limits: { minDistance: number; maxDistance: number; minPitch: number; maxPitch: number }
  autoRotate: number
  credit: { text: string; href: string }
}
export interface Words {
  loading: string
  hint: string
  front: string
  side: string
  close: string
  reveal: string
  points: string
  light: string
  failed: string
}

const C = { midnight: '#06213f', sun: '#f3aa08', ocean: '#5bcbf9', tide: '#30ccd5', horizon: '#0984c8' }
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

// One effect at a time, driven by two uniforms the page animates.
// kind 1: a scan line reveals the model bottom to top. kind 2: the splats scatter into a cloud.
function effect(kind: ReturnType<typeof dyno.dynoInt>, phase: ReturnType<typeof dyno.dynoFloat>, top: number) {
  return dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
    const step = new dyno.Dyno({
      inTypes: { gsplat: dyno.Gsplat, phase: 'float', kind: 'int', top: 'float' },
      outTypes: { gsplat: dyno.Gsplat },
      statements: ({ inputs, outputs }) =>
        dyno.unindentLines(`
          ${outputs.gsplat} = ${inputs.gsplat};
          float p = clamp(${inputs.phase}, 0.0, 1.0);
          vec3 c = ${inputs.gsplat}.center;
          if (${inputs.kind} == 1) {
            float level = clamp(-c.y / ${inputs.top}, 0.0, 1.0);
            float shown = smoothstep(level - 0.03, level + 0.03, p * 1.08);
            float edge = exp(-90.0 * abs(level - p * 1.08));
            ${outputs.gsplat}.rgba.a *= shown;
            ${outputs.gsplat}.rgba.rgb += edge * vec3(0.95, 0.66, 0.05) * 1.4;
          } else if (${inputs.kind} == 2) {
            vec3 noise = fract(sin(c * vec3(127.1, 311.7, 74.7)) * 43758.5453) - 0.5;
            vec3 away = normalize(c - vec3(0.0, -1.25, 0.0) + noise * 0.6);
            float e = p * p * (3.0 - 2.0 * p);
            ${outputs.gsplat}.center += away * e * (0.12 + 0.38 * pow(fract(noise.x * 7.13 + 0.5), 2.0)) + noise * e * 0.08;
            ${outputs.gsplat}.scales *= 1.0 - e * 0.45;
            ${outputs.gsplat}.rgba.rgb += e * vec3(0.06, 0.12, 0.2);
          }
        `),
    })
    return step.apply({ gsplat, phase, kind, top: dyno.dynoFloat(top) })
  })
}

export function Viewer({ scene, models, words }: { scene: Scene; models: string[]; words: Words }) {
  const stageRef = React.useRef<HTMLDivElement>(null)
  const touchRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const api = React.useRef<{ preset(name: keyof Scene['presets']): void; reveal(): void; points(on: boolean): void } | null>(null)
  const [loaded, setLoaded] = React.useState(0)
  const [failed, setFailed] = React.useState(false)
  const [touched, setTouched] = React.useState(false)
  const [view, setView] = React.useState<keyof Scene['presets'] | null>(null)
  const [pointsOn, setPointsOn] = React.useState(false)
  const [light, setLight] = React.useState(false)

  React.useEffect(() => {
    const stage = stageRef.current!
    const canvas = canvasRef.current!
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true })
    renderer.setClearColor(0x000000, 0)
    const world = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100)
    const spark = new SparkRenderer({ renderer })
    world.add(spark)
    const group = new THREE.Group()
    group.quaternion.set(...scene.orientation)
    world.add(group)

    const kind = dyno.dynoInt(0)
    const phase = dyno.dynoFloat(0)
    const modifier = effect(kind, phase, 2.5)
    const meshes: SplatMesh[] = []
    let disposed = false

    // Spark resolves model URLs through window.location; reading the bytes ourselves works everywhere.
    ;(async () => {
      try {
        for (const url of models) {
          const bytes = await (await fetch(url)).arrayBuffer()
          if (disposed) return
          const mesh = new SplatMesh({ fileBytes: bytes, fileType: SplatFileType.SPZ })
          mesh.objectModifier = modifier
          mesh.opacity = 0
          group.add(mesh)
          meshes.push(mesh)
          await mesh.initialized
          if (disposed) return
          setLoaded((n) => n + 1)
        }
      } catch (error) {
        console.error('scan-viewer: could not load the scan', error)
        setFailed(true)
      }
    })()

    // Orbit state: goal values follow gestures, current values ease toward them.
    const limits = scene.limits
    const start = scene.presets.front
    const goal = { yaw: start.yaw, pitch: start.pitch, distance: start.distance, target: new THREE.Vector3(...(start.target ?? scene.target)) }
    const now = { yaw: goal.yaw - 0.9, pitch: goal.pitch + 0.15, distance: goal.distance * 1.35, target: goal.target.clone() }
    let spinning = true
    let effectStart = -1
    let effectKind = 0
    let effectFrom = 0
    let effectTo = 0

    const stopGestures = observeGestures(touchRef.current!, ({ pan, zoom }) => {
      spinning = false
      setTouched(true)
      setView(null)
      goal.yaw -= pan.x * 0.0065
      goal.pitch = clamp(goal.pitch + pan.y * 0.005, limits.minPitch, limits.maxPitch)
      goal.distance = clamp(goal.distance / zoom, limits.minDistance, limits.maxDistance)
    })

    api.current = {
      preset(name) {
        const p = scene.presets[name]
        spinning = false
        // Turn the short way round.
        const turn = ((p.yaw - goal.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
        goal.yaw += turn
        goal.pitch = p.pitch
        goal.distance = p.distance
        goal.target.set(...(p.target ?? scene.target))
      },
      reveal() {
        effectKind = 1
        effectFrom = 0
        effectTo = 1
        effectStart = performance.now()
      },
      points(on) {
        effectKind = 2
        effectFrom = on ? 0 : 1
        effectTo = on ? 1 : 0
        effectStart = performance.now()
      },
    }

    const size = () => {
      const w = stage.clientWidth
      const h = stage.clientHeight
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.75))
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    size()
    const watch = new ResizeObserver(size)
    watch.observe(stage)

    let visible = true
    const seen = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting))
    seen.observe(stage)

    let last = performance.now()
    let raf = requestAnimationFrame(function frame(t) {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      if (!visible) return
      if (spinning) goal.yaw += scene.autoRotate * dt
      const k = 1 - Math.exp(-dt * 7)
      now.yaw += (goal.yaw - now.yaw) * k
      now.pitch += (goal.pitch - now.pitch) * k
      now.distance += (goal.distance - now.distance) * k
      now.target.lerp(goal.target, k)
      const cp = Math.cos(now.pitch)
      camera.position.set(
        now.target.x + now.distance * Math.sin(now.yaw) * cp,
        now.target.y + now.distance * Math.sin(now.pitch),
        now.target.z + now.distance * Math.cos(now.yaw) * cp,
      )
      camera.lookAt(now.target)

      for (const mesh of meshes) mesh.opacity = Math.min(1, mesh.opacity + dt * 1.6)
      if (effectStart >= 0) {
        const length = effectKind === 1 ? 2.4 : 1.3
        const p = Math.min(1, (t - effectStart) / 1000 / length)
        const eased = p * p * (3 - 2 * p)
        kind.value = effectKind
        phase.value = effectFrom + (effectTo - effectFrom) * eased
        if (p >= 1) {
          effectStart = -1
          // A finished reveal returns to the plain model; points stay until switched off.
          if (effectKind === 1 || effectTo === 0) kind.value = 0
        }
        for (const mesh of meshes) mesh.updateVersion()
      }
      renderer.render(world, camera)
    })

    return () => {
      disposed = true
      api.current = null
      cancelAnimationFrame(raf)
      stopGestures()
      watch.disconnect()
      seen.disconnect()
      for (const mesh of meshes) mesh.dispose()
      spark.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    }
  }, [scene, models])

  const ready = loaded > 0
  const done = loaded === models.length
  const pick = (name: keyof Scene['presets']) => {
    setView(name)
    setTouched(true)
    api.current?.preset(name)
  }

  return (
    <div className="scan">
      <style>{`
        .scan { width: min(var(--kunobi-prose-width, 1200px), 100%); margin: 0 auto; box-sizing: border-box; padding: 16px 24px 40px; font-family: Figtree, system-ui, sans-serif; color: hsl(var(--foreground)); }
        .scan-in { container-type: inline-size; }
        .scan-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 16px; margin: 4px 2px 14px; }
        .scan-head h1 { font: 800 clamp(30px, 4.2cqw, 46px)/1 Parkinsans, Figtree, sans-serif; letter-spacing: -0.03em; margin: 0; }
        .scan-head p { margin: 0; color: hsl(var(--muted-foreground)); font-size: clamp(15px, 1.5cqw, 18px); }
        .stage { position: relative; aspect-ratio: 16 / 10; border-radius: 28px; overflow: hidden; user-select: none;
          background: radial-gradient(90% 90% at 50% 38%, #12345c 0%, ${C.midnight} 52%, #020b16 100%); transition: background .6s; box-shadow: 0 24px 60px rgba(6,33,63,.25); }
        .stage.light { background: radial-gradient(90% 90% at 50% 38%, #ffffff 0%, #eef3f8 55%, #cfdae6 100%); }
        .touch { position: absolute; inset: 0; touch-action: none; cursor: grab; }
        .touch:active { cursor: grabbing; }
        .stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 100% at 50% 45%, transparent 55%, rgba(2,11,22,.55) 100%); }
        .stage.light .vignette { background: radial-gradient(120% 100% at 50% 45%, transparent 60%, rgba(6,33,63,.12) 100%); }
        .bar { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; gap: 6px; padding: 6px; border-radius: 999px;
          background: rgba(3,20,38,.62); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); box-shadow: 0 8px 30px rgba(0,0,0,.25); max-width: calc(100% - 24px); overflow-x: auto; }
        .stage.light .bar { background: rgba(255,255,255,.78); }
        .bar i { width: 1px; margin: 6px 3px; background: rgba(255,255,255,.18); flex: none; }
        .stage.light .bar i { background: rgba(6,33,63,.14); }
        .pill { all: unset; cursor: pointer; flex: none; padding: 8px 14px; border-radius: 999px; font: 600 14px Figtree, sans-serif; color: rgba(255,255,255,.86); transition: background .2s, color .2s; white-space: nowrap; }
        .stage.light .pill { color: ${C.midnight}; }
        .pill:hover { background: rgba(255,255,255,.1); }
        .stage.light .pill:hover { background: rgba(6,33,63,.06); }
        .pill.on { background: ${C.sun}; color: ${C.midnight}; }
        .pill:focus-visible { outline: 2px solid ${C.ocean}; outline-offset: 1px; }
        .hint { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); padding: 8px 14px; border-radius: 999px; font: 600 13px Figtree, sans-serif;
          color: rgba(255,255,255,.85); background: rgba(3,20,38,.5); backdrop-filter: blur(10px); transition: opacity .5s; pointer-events: none; }
        .stage.light .hint { color: ${C.midnight}; background: rgba(255,255,255,.7); }
        .hint.gone { opacity: 0; }
        .loading { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; transition: opacity .6s; }
        .loading.gone { opacity: 0; }
        .loading div { width: min(240px, 50%); text-align: center; font: 600 14px Figtree, sans-serif; color: rgba(255,255,255,.8); }
        .stage.light .loading div { color: ${C.midnight}; }
        .meter { height: 4px; border-radius: 99px; margin-top: 10px; background: rgba(255,255,255,.14); overflow: hidden; }
        .meter b { display: block; height: 100%; background: ${C.sun}; border-radius: 99px; transition: width .4s; }
        .foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 20px; margin: 14px 4px 0; font-size: 13px; color: hsl(var(--muted-foreground)); }
        .foot a { color: inherit; }
        @container (max-width: 640px) {
          .stage { aspect-ratio: 4 / 5; border-radius: 22px; }
          .bar { bottom: 12px; flex-wrap: wrap; justify-content: center; border-radius: 22px; width: max-content; max-width: calc(100% - 24px); box-sizing: border-box; }
          .bar i { display: none; }
          .pill { padding: 7px 11px; font-size: 13px; }
        }
      `}</style>
      <div className="scan-in">
        <div className="scan-head">
          <h1>{scene.title}</h1>
          <p>{scene.subtitle}</p>
        </div>
        <div ref={stageRef} className={`stage${light ? ' light' : ''}`}>
          <div ref={touchRef} className="touch">
            <canvas ref={canvasRef} />
            <div className="vignette" />
          </div>
          <div className={`loading${ready ? ' gone' : ''}`}>
            <div>
              {failed ? words.failed : words.loading}
              <div className="meter"><b style={{ width: `${Math.round((loaded / models.length) * 100)}%` }} /></div>
            </div>
          </div>
          <div className={`hint${touched || !ready ? ' gone' : ''}`}>{words.hint}</div>
          <div className="bar">
            {(['front', 'side', 'close'] as const).map((name) => (
              <button key={name} className={`pill${view === name ? ' on' : ''}`} onClick={() => pick(name)}>{words[name]}</button>
            ))}
            <i />
            <button className="pill" disabled={!done} onClick={() => { setPointsOn(false); api.current?.reveal() }}>{words.reveal}</button>
            <button className={`pill${pointsOn ? ' on' : ''}`} disabled={!done} onClick={() => { const on = !pointsOn; setPointsOn(on); api.current?.points(on) }}>{words.points}</button>
            <button className={`pill${light ? ' on' : ''}`} onClick={() => setLight(!light)}>{words.light}</button>
          </div>
        </div>
        <div className="foot">
          <span>{scene.credit.text} <a href={scene.credit.href}>superspl.at</a></span>
        </div>
      </div>
    </div>
  )
}
