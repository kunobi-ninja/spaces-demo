import { Container, Graphics } from "pixi.js";
import { rng } from "@vixi/core";
import type { VisualContext } from "@vixi/vx";

// The paper-cut world every scene shares: a cream sky, a sun, three layered
// hills with soft drop shadows, bunting across the top and confetti. Each part
// is drawn once and posed from the scene's clock, so any frame can be drawn in
// any order.

export interface Colors {
  sky: string;
  paper: string;
  warm: string;
  sun: string;
  cool: string;
  deep: string;
  ink: string;
}
export type Pal = Record<keyof Colors, number>;

export const hex = (s: string) => parseInt(s.replace("#", ""), 16);
export const palette = (c: Colors): Pal => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, hex(v)])) as Pal;

/** Mixes a colour toward black (k < 1) or white (k > 1). */
export function shade(c: number, k: number) {
  const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => (k <= 1 ? v * k : v + (255 - v) * (k - 1)));
  return (Math.round(ch[0]) << 16) | (Math.round(ch[1]) << 8) | Math.round(ch[2]);
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const span = (t: number, start: number, length: number) => clamp01((t - start) / length);
export const outCubic = (p: number) => 1 - (1 - p) ** 3;
export const outBack = (p: number, s = 1.7) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2;
export const inOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

export type Mode = "wide" | "tall" | "square";
export interface Layout {
  W: number;
  H: number;
  /** One unit at 1080 px on the short side. */
  u: number;
  mode: Mode;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The frame's size and safe area, and which way it leans. */
export function layout(ctx: VisualContext): Layout {
  const W = ctx.width;
  const H = ctx.height;
  const sa = ctx.target?.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const r = W / H;
  return { W, H, u: Math.min(W, H) / 1080, mode: r > 1.2 ? "wide" : r < 0.8 ? "tall" : "square", top: sa.top, bottom: H - sa.bottom, left: sa.left, right: W - sa.right };
}

/** A hill across the frame: a soft wave from edge to edge, filled down to the bottom. */
function hill(g: Graphics, L: Layout, base: number, amp: number, waves: number, phase: number, color: number) {
  const y = (x: number) => base + Math.sin((x / L.W) * Math.PI * 2 * waves + phase) * amp + Math.sin((x / L.W) * Math.PI * 5.3 + phase * 2) * amp * 0.25;
  g.moveTo(-40, y(-40));
  for (let x = -40; x <= L.W + 40; x += 24) g.lineTo(x, y(x));
  g.lineTo(L.W + 40, L.H + 40).lineTo(-40, L.H + 40).closePath().fill(color);
}

export interface Backdrop {
  root: Container;
  /** `rise` 0…1 lifts the hills into place; `clock` is the film's clock, for the sway that runs across cuts. */
  pose(rise: number, drop: number, clock: number): void;
}

export function backdrop(ctx: VisualContext, C: Pal, seed = 7): Backdrop {
  const L = layout(ctx);
  const { W, H, u } = L;
  const root = new Container();
  root.addChild(new Graphics().rect(0, 0, W, H).fill(C.sky));

  // Paper grain: a scatter of faint flecks.
  const r = rng(seed);
  const grain = new Graphics();
  for (let i = 0; i < 260; i++) grain.circle(r() * W, r() * H, (0.8 + r() * 1.6) * u).fill({ color: C.deep, alpha: 0.03 });
  root.addChild(grain);

  // The sun: a paper disc with soft rays turning slowly behind it.
  const sun = new Container();
  const R = (L.mode === "tall" ? 120 : L.mode === "square" ? 72 : 110) * u;
  const rays = new Graphics();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const a1 = a - 0.08;
    const a2 = a + 0.08;
    rays.poly([Math.cos(a1) * R * 1.15, Math.sin(a1) * R * 1.15, Math.cos(a) * R * 1.85, Math.sin(a) * R * 1.85, Math.cos(a2) * R * 1.15, Math.sin(a2) * R * 1.15]).fill({ color: C.sun, alpha: 0.35 });
  }
  const disc = new Graphics().circle(6 * u, 9 * u, R).fill({ color: shade(C.sun, 0.6), alpha: 0.25 }).circle(0, 0, R).fill(C.sun);
  sun.addChild(rays, disc);
  const sunAt = L.mode === "tall" ? { x: W * 0.74, y: L.top + H * 0.13 } : L.mode === "square" ? { x: W * 0.9, y: H * 0.11 } : { x: W * 0.83, y: H * 0.26 };
  sun.position.set(sunAt.x, sunAt.y);
  root.addChild(sun);

  // Three hills, back to front, each with its own paper shadow.
  const bases = L.mode === "tall" ? [0.76, 0.83, 0.9] : [0.7, 0.79, 0.88];
  const specs = [
    { amp: 0.035, waves: 1.6, phase: 0.3, color: C.cool },
    { amp: 0.04, waves: 2.2, phase: 1.7, color: C.warm },
    { amp: 0.028, waves: 1.2, phase: 2.9, color: C.deep },
  ];
  const hills = specs.map((s, i) => {
    const c = new Container();
    const shadow = new Graphics();
    hill(shadow, L, H * bases[i] - 10 * u, H * s.amp, s.waves, s.phase, shade(s.color, 0.55));
    shadow.alpha = 0.28;
    const face = new Graphics();
    hill(face, L, H * bases[i], H * s.amp, s.waves, s.phase, s.color);
    c.addChild(shadow, face);
    root.addChild(c);
    return c;
  });

  // Bunting: a sagging string with triangle flags, redrawn as it sways.
  const bunting = new Graphics();
  root.addChild(bunting);
  const flagColors = [C.warm, C.sun, C.cool, C.paper];

  return {
    root,
    pose(rise, drop, clock) {
      hills.forEach((h, i) => {
        const p = outCubic(span(rise, i * 0.15, 0.7));
        h.y = (1 - p) * H * 0.35;
      });
      sun.y = sunAt.y + (1 - outCubic(span(rise, 0.2, 0.8))) * H * 0.5;
      rays.rotation = clock * 0.12;

      bunting.clear();
      const d = outBack(span(drop, 0, 1), 1.2);
      if (d <= 0) return;
      const topY = L.top + (L.mode === "tall" ? 70 : 40) * u;
      const y0 = -140 * u + (topY + 140 * u) * d;
      const sag = (L.mode === "tall" ? 70 : 90) * u;
      const at = (x: number) => y0 + sag * 4 * (x / W) * (1 - x / W);
      bunting.moveTo(-20, at(-20));
      for (let x = -20; x <= W + 20; x += 20) bunting.lineTo(x, at(x));
      bunting.stroke({ color: C.ink, width: 2.5 * u, alpha: 0.6 });
      const gap = 92 * u;
      const fw = 58 * u;
      const fh = 74 * u;
      let i = 0;
      for (let x = gap / 2; x < W; x += gap, i++) {
        const a = Math.sin(clock * 2.1 + i * 0.9) * 0.09;
        const cx = x;
        const cy = at(x);
        const pts = [
          [-fw / 2, 0],
          [fw / 2, 0],
          [0, fh],
        ].map(([px, py]) => [cx + px * Math.cos(a) - py * Math.sin(a), cy + px * Math.sin(a) + py * Math.cos(a)]);
        const flat = pts.flat();
        bunting.poly(flat.map((v, k) => v + (k % 2 ? 6 * u : 3 * u))).fill({ color: C.ink, alpha: 0.12 });
        bunting.poly(flat).fill(flagColors[i % flagColors.length]);
      }
    },
  };
}

/** Confetti bursting from a point: paper rectangles and dots that fly up, tumble and fall. */
export function confetti(L: Layout, C: Pal, seed: number, count: number, origin: { x: number; y: number }, power = 1) {
  const r = rng(seed);
  const colors = [C.warm, C.sun, C.cool, C.deep, C.paper];
  const pieces = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.15;
    const v = (900 + r() * 1300) * L.u * power;
    return {
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      w: (10 + r() * 14) * L.u,
      h: (6 + r() * 9) * L.u,
      spin: (r() - 0.5) * 14,
      flip: 4 + r() * 8,
      round: r() < 0.25,
      color: colors[Math.floor(r() * colors.length)],
      delay: r() * 0.12,
    };
  });
  const g = new Graphics();
  const K = 2.6; // air drag, 1/s
  const G = 900 * L.u; // gravity, px/s²
  return {
    g,
    pose(t: number) {
      g.clear();
      for (const p of pieces) {
        const s = t - p.delay;
        if (s <= 0) continue;
        const e = (1 - Math.exp(-K * s)) / K;
        const x = origin.x + p.vx * e;
        const y = origin.y + (p.vy + G / K) * e - (G / K) * s;
        if (y > L.H + 40) continue;
        const rot = p.spin * s;
        const sx = Math.cos(p.flip * s);
        if (p.round) {
          g.circle(x, y, (p.w / 2) * Math.max(0.3, Math.abs(sx))).fill(p.color);
          continue;
        }
        const hw = (p.w / 2) * sx;
        const hh = p.h / 2;
        const c = Math.cos(rot);
        const n = Math.sin(rot);
        g.poly([x - hw * c + hh * n, y - hw * n - hh * c, x + hw * c + hh * n, y + hw * n - hh * c, x + hw * c - hh * n, y + hw * n + hh * c, x - hw * c - hh * n, y - hw * n + hh * c]).fill(p.color);
      }
    },
  };
}

/** A paper card: a soft shadow and a rounded face. */
export function card(w: number, h: number, color: number, u: number, radius = 34) {
  return new Graphics()
    .roundRect(-w / 2 + 8 * u, -h / 2 + 16 * u, w, h, radius * u)
    .fill({ color: 0x06213f, alpha: 0.14 })
    .roundRect(-w / 2, -h / 2, w, h, radius * u)
    .fill(color);
}
