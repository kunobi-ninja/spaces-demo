import * as React from 'react'
import * as THREE from 'three'

// A slow, flowing field behind the game, drawn by one GLSL shader. The tint follows the round's
// colour, and the field speeds up while a question is open.

const VERT = `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`

const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform vec3 uTint; uniform float uPulse; uniform float uEnergy;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.03; a *= 0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.07;
  vec2 m = p - uMouse;
  p += m * exp(-dot(m, m) * 4.0) * 0.18;
  vec2 q = vec2(fbm(p * 1.5 + vec2(0.0, t)), fbm(p * 1.5 + vec2(5.2, -t)));
  vec2 r = vec2(fbm(p * 1.8 + q * 2.2 + vec2(1.7, 9.2) + t * 0.8), fbm(p * 1.8 + q * 2.2 + vec2(8.3, 2.8) - t * 0.6));
  float f = fbm(p * 1.3 + r * 2.4);
  float bands = abs(fract(f * 7.0) - 0.5);
  float lines = smoothstep(0.06, 0.0, bands) * smoothstep(0.35, 0.75, f);
  vec3 col = mix(vec3(0.016, 0.067, 0.133), vec3(0.035, 0.125, 0.235), uv.y);
  col += uTint * pow(f, 3.0) * 0.2;
  col += uTint * lines * (0.09 + uEnergy * 0.18);
  col += uTint * exp(-dot(m, m) * 6.0) * 0.06;
  float ring = length(p);
  col += uTint * uPulse * (0.2 * exp(-ring * 2.2) + 0.28 * smoothstep(0.08, 0.0, abs(ring - (1.0 - uPulse) * 1.5)));
  col *= 1.0 - 0.55 * dot(uv - 0.5, uv - 0.5);
  gl_FragColor = vec4(col, 1.0);
}`

export interface Mood {
  tint: string
  energy: number
  pulse: number
}

export function Backdrop({ moodRef, pointerRef }: { moodRef: React.MutableRefObject<Mood>; pointerRef: React.MutableRefObject<{ x: number; y: number }> }) {
  const host = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uTint: { value: new THREE.Color(moodRef.current.tint) },
      uPulse: { value: 0 },
      uEnergy: { value: 0 },
    }
    const geo = new THREE.PlaneGeometry(2, 2)
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG })
    scene.add(new THREE.Mesh(geo, mat))
    const resize = () => {
      renderer.setSize(el.clientWidth || 1, el.clientHeight || 1, false)
      renderer.getDrawingBufferSize(uniforms.uRes.value)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    const tint = new THREE.Color()
    const mouse = new THREE.Vector2()
    let raf = 0
    let last = performance.now()
    let time = 0
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const m = moodRef.current
      time += dt * (1 + m.energy * 2.5)
      uniforms.uTime.value = time
      uniforms.uTint.value.lerp(tint.set(m.tint), 1 - Math.exp(-dt * 3))
      uniforms.uEnergy.value += (m.energy - uniforms.uEnergy.value) * (1 - Math.exp(-dt * 3))
      uniforms.uPulse.value = m.pulse
      m.pulse *= Math.exp(-dt * 1.6)
      uniforms.uMouse.value.lerp(mouse.set(pointerRef.current.x, pointerRef.current.y), 1 - Math.exp(-dt * 6))
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      geo.dispose()
      mat.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [moodRef, pointerRef])
  return <div className="qn-bg" ref={host} />
}

// Confetti for the podium, drawn on a 2D canvas.
export function Confetti({ burst, colors }: { burst: number; colors: string[] }) {
  const ref = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    if (!burst) return
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = c.clientWidth
    const h = c.clientHeight
    c.width = w * dpr
    c.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    let parts = Array.from({ length: 220 }, (_, i) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4
      const v = 9 + Math.random() * 10
      return { x: w * (0.15 + Math.random() * 0.7), y: h + 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, r: 5 + Math.random() * 7, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length], life: 1, shape: i % 3 }
    })
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const k = Math.min(3, (now - last) / 16.7)
      last = now
      ctx.clearRect(0, 0, w, h)
      parts = parts.filter((p) => p.life > 0 && p.y < h + 60)
      for (const p of parts) {
        p.vy += 0.28 * k
        p.vx *= Math.pow(0.985, k)
        p.vy *= Math.pow(0.985, k)
        p.x += p.vx * k
        p.y += p.vy * k
        p.rot += p.vr * k
        p.life -= 0.005 * k
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.globalAlpha = Math.min(1, p.life * 2)
        ctx.fillStyle = p.c
        if (p.shape === 0) ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2)
        else {
          ctx.beginPath()
          if (p.shape === 1) ctx.arc(0, 0, p.r / 2.4, 0, Math.PI * 2)
          else {
            ctx.moveTo(0, -p.r / 2)
            ctx.lineTo(p.r / 2, p.r / 2)
            ctx.lineTo(-p.r / 2, p.r / 2)
          }
          ctx.fill()
        }
        ctx.restore()
      }
      if (parts.length) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [burst, colors])
  return <canvas ref={ref} className="qn-confetti" aria-hidden="true" />
}
