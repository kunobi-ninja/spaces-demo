import { Container, Graphics, type Text } from "pixi.js";
import { defineVisual, type VisualContext } from "@vixi/vx";
import { fitText, safeArea, spring, text } from "@vixi/helpers";
import type { Theme } from "./index";

/*
 * One slide of the deck. The words come from the scene's Markdown (## kicker,
 * # title, a paragraph, list items); the figures come from data/deck.json.
 * Everything is built once and posed from the scene's clock in seek(t).
 */

const HEAD = "Parkinsans";
const BODY = "Figtree";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
/** 0 to 1 over `len` seconds from `at`. */
const ramp = (t: number, at: number, len = 0.5) => smooth((t - at) / len);

type Box = { x: number; y: number; w: number; h: number };
type Pose = (t: number) => void;
type Figure = { root: Container; seek: Pose };
type Kit = { th: Theme; u: number; portrait: boolean };

function label(value: string, size: number, color: number, weight = "400", font = BODY): Text {
  return text(value, { font, size: Math.round(size), weight, color });
}

function wrap(value: string, size: number, color: number, width: number, maxLines: number, weight = "400", font = BODY): Text {
  return fitText(value, {
    font, size: Math.round(size), minSize: Math.round(size * 0.7), weight, color,
    width, height: Math.ceil(size * 1.32 * maxLines), maxLines,
  });
}

/** A node that slides up and fades in at `at`. */
function riser(node: Container, at: number, dy: number): Pose {
  const y = node.y;
  return (t) => {
    const a = ramp(t, at, 0.45);
    node.alpha = a;
    node.y = y + (1 - spring(Math.max(0, t - at), { stiffness: 140, damping: 20 })) * dy;
  };
}

function card(w: number, h: number, k: Kit, fill = k.th.card): Graphics {
  return new Graphics().roundRect(0, 0, w, h, 26 * k.u).fill(fill).stroke({ color: k.th.line, width: 2 * k.u });
}

function chips(items: { value: string; label: string }[], w: number, k: Kit, at: number): Figure {
  const root = new Container();
  const gap = 18 * k.u;
  const cw = (w - gap * (items.length - 1)) / items.length;
  const ch = 118 * k.u;
  const poses: Pose[] = [];
  items.forEach((item, i) => {
    const c = new Container();
    c.x = i * (cw + gap);
    c.addChild(card(cw, ch, k));
    const v = label(item.value, 44 * k.u, k.th.ink, "800", HEAD);
    v.position.set(24 * k.u, 18 * k.u);
    const l = wrap(item.label, 21 * k.u, k.th.muted, cw - 48 * k.u, 1);
    l.position.set(24 * k.u, 18 * k.u + v.height + 4 * k.u);
    c.addChild(v, l);
    root.addChild(c);
    poses.push(riser(c, at + i * 0.12, 18 * k.u));
  });
  return { root, seek: (t) => poses.forEach((p) => p(t)) };
}

// --- figures -----------------------------------------------------------------

function wheel(b: Box, k: Kit): Figure {
  const root = new Container();
  const R = Math.min(b.w, b.h) * 0.42;
  const spin = new Container();
  spin.position.set(b.w / 2, b.h / 2);
  const g = new Graphics();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const off = i % 2 ? 0.18 : -0.18;
    g.moveTo(Math.cos(a + off) * R * 0.1, Math.sin(a + off) * R * 0.1).lineTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86);
  }
  g.stroke({ color: k.th.muted, width: 2.2 * k.u, alpha: 0.55 });
  g.circle(0, 0, R * 0.88).stroke({ color: k.th.muted, width: 9 * k.u, alpha: 0.6 });
  g.circle(0, 0, R).stroke({ color: k.th.ink, width: 30 * k.u });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    g.circle(Math.cos(a) * R, Math.sin(a) * R, 3.4 * k.u).fill({ color: k.th.bg, alpha: 0.5 });
  }
  g.circle(0, 0, R * 0.12).fill(k.th.sun);
  g.circle(0, 0, R * 0.05).fill(k.th.ink);
  spin.addChild(g);
  const glow = new Graphics().circle(b.w / 2, b.h / 2, R * 1.25).fill({ color: k.th.glow, alpha: k.th.glowAlpha });
  root.addChild(glow, spin);
  return {
    root,
    seek: (t) => {
      const a = ramp(t, 0, 0.8);
      spin.alpha = a;
      spin.scale.set(0.92 + 0.08 * spring(Math.max(0, t), { stiffness: 80, damping: 14 }));
      spin.rotation = t * 0.32;
      glow.alpha = a;
    },
  };
}

function problem(b: Box, k: Kit, items: { value: string; label: string }[]): Figure {
  const root = new Container();
  const inner = new Container();
  root.addChild(inner);
  const gap = 22 * k.u;
  const h = Math.min(250 * k.u, (b.h - gap * (items.length - 1)) / items.length);
  inner.y = (b.h - (h * items.length + gap * (items.length - 1))) / 2;
  const poses: Pose[] = [];
  const valueSize = Math.min(76 * k.u, h * 0.42);
  const valueW = Math.max(...items.map((it) => label(it.value, valueSize, k.th.ink, "800", HEAD).width));
  items.forEach((item, i) => {
    const c = new Container();
    c.y = i * (h + gap);
    c.addChild(card(b.w, h, k));
    const bar = new Graphics().roundRect(0, 0, 8 * k.u, h - 56 * k.u, 4 * k.u).fill(i === 0 ? k.th.sun : i === 1 ? k.th.horizon : k.th.tide);
    bar.position.set(30 * k.u, 28 * k.u);
    const v = label(item.value, valueSize, k.th.ink, "800", HEAD);
    v.position.set(64 * k.u, (h - v.height) / 2);
    const lx = 64 * k.u + valueW + 44 * k.u;
    const l = wrap(item.label, 27 * k.u, k.th.muted, b.w - lx - 34 * k.u, 2);
    l.position.set(lx, (h - l.height) / 2);
    c.addChild(bar, v, l);
    inner.addChild(c);
    poses.push(riser(c, i * 0.35, 28 * k.u));
  });
  return { root, seek: (t) => poses.forEach((p) => p(t)) };
}

function steps(b: Box, k: Kit, items: { title: string; label: string }[]): Figure {
  const root = new Container();
  const n = items.length;
  const colW = b.w / n;
  const r = 52 * k.u;
  const titles = items.map((item) => wrap(item.title, 34 * k.u, k.th.ink, colW - 36 * k.u, 2, "800", HEAD));
  const titleH = Math.max(...titles.map((t) => t.height));
  const cy = Math.max(r + 10 * k.u, b.h * 0.42 - (r + 34 * k.u + titleH) / 2);
  const line = new Graphics();
  root.addChild(line);
  const poses: Pose[] = [];
  const colors = [k.th.sun, k.th.horizon, k.th.tide];
  items.forEach((item, i) => {
    const c = new Container();
    const cx = colW * i + colW / 2;
    const dot = new Graphics().circle(0, 0, r).fill(colors[i % 3]);
    dot.position.set(cx, cy);
    const num = label(String(i + 1), 40 * k.u, i === 0 ? k.th.onSun : 0xffffff, "800", HEAD);
    num.anchor.set(0.5);
    num.position.set(cx, cy);
    const tt = titles[i];
    tt.style.align = "center";
    tt.anchor.set(0.5, 0);
    tt.position.set(cx, cy + r + 34 * k.u);
    const l = wrap(item.label, 24 * k.u, k.th.muted, colW - 44 * k.u, 3);
    l.style.align = "center";
    l.anchor.set(0.5, 0);
    l.position.set(cx, tt.y + titleH + 12 * k.u);
    c.addChild(dot, num, tt, l);
    root.addChild(c);
    poses.push(riser(c, 0.2 + i * 0.55, 26 * k.u));
  });
  return {
    root,
    seek: (t) => {
      poses.forEach((p) => p(t));
      const p = ramp(t, 0.3, 1.5);
      line.clear();
      if (p > 0) {
        const x0 = colW / 2;
        const x1 = colW / 2 + (b.w - colW) * p;
        line.moveTo(x0, cy).lineTo(x1, cy).stroke({ color: k.th.line, width: 6 * k.u });
      }
    },
  };
}

function product(b: Box, k: Kit, d: any): Figure {
  const root = new Container();
  const ph = Math.min(b.h, 700 * k.u);
  const pw = ph * 0.5;
  const phone = new Container();
  phone.position.set(0, (b.h - ph) / 2);
  phone.addChild(new Graphics().roundRect(0, 0, pw, ph, 52 * k.u).fill(k.th.ink));
  phone.addChild(new Graphics().roundRect(10 * k.u, 10 * k.u, pw - 20 * k.u, ph - 20 * k.u, 44 * k.u).fill(k.th.card));
  phone.addChild(new Graphics().roundRect(pw / 2 - 46 * k.u, 24 * k.u, 92 * k.u, 22 * k.u, 11 * k.u).fill(k.th.ink));
  const px = 34 * k.u;
  const next = label(d.label ?? "Next visit", 20 * k.u, k.th.muted, "600");
  next.position.set(px, 84 * k.u);
  const when = label(d.visit, 48 * k.u, k.th.ink, "800", HEAD);
  when.position.set(px, 112 * k.u);
  const chip = new Container();
  chip.position.set(px, 186 * k.u);
  const st = label(d.status, 18 * k.u, k.th.ink, "600");
  st.position.set(34 * k.u, 10 * k.u);
  chip.addChild(new Graphics().roundRect(0, 0, st.width + 52 * k.u, 42 * k.u, 21 * k.u).fill({ color: k.th.sun, alpha: 0.22 }));
  const pulse = new Graphics().circle(18 * k.u, 21 * k.u, 6 * k.u).fill(k.th.sun);
  chip.addChild(pulse, st);
  const route = new Graphics();
  route.position.set(px, 252 * k.u);
  const mw = pw - 2 * px;
  const mh = ph * 0.3;
  route.roundRect(0, 0, mw, mh, 22 * k.u).fill({ color: k.th.ocean, alpha: 0.16 });
  for (const f of [0.22, 0.5, 0.78]) route.moveTo(0, mh * f).lineTo(mw, mh * f + (f - 0.5) * mh * 0.3);
  for (const f of [0.18, 0.42, 0.7]) route.moveTo(mw * f, 0).lineTo(mw * f + mw * 0.06, mh);
  route.stroke({ color: k.th.card, width: 7 * k.u, alpha: 0.9 });
  route.moveTo(mw * 0.05, mh * 0.95).lineTo(mw * 0.95, mh * 0.08).stroke({ color: k.th.card, width: 11 * k.u, alpha: 0.9 });
  const pts = [[0.12, 0.8], [0.32, 0.62], [0.5, 0.7], [0.66, 0.38], [0.86, 0.22]];
  const path = new Graphics();
  path.position.copyFrom(route.position);
  const van = new Graphics().circle(0, 0, 9 * k.u).fill(k.th.horizon);
  van.position.copyFrom(route.position);
  const home = new Graphics().circle(pts[4][0] * mw, pts[4][1] * mh, 11 * k.u).fill(k.th.sun);
  home.position.copyFrom(route.position);
  const checks = new Container();
  checks.position.set(px, 252 * k.u + mh + 26 * k.u);
  (d.checks as string[]).forEach((c, i) => {
    const row = new Container();
    row.y = i * 40 * k.u;
    row.addChild(new Graphics().circle(10 * k.u, 13 * k.u, 10 * k.u).fill({ color: k.th.tide, alpha: 0.9 }));
    const tick = new Graphics().moveTo(5 * k.u, 13 * k.u).lineTo(9 * k.u, 17 * k.u).lineTo(15 * k.u, 9 * k.u).stroke({ color: 0xffffff, width: 2.6 * k.u, cap: "round", join: "round" });
    const l = label(c, 21 * k.u, k.th.ink, "600");
    l.position.set(32 * k.u, 0);
    row.addChild(tick, l);
    checks.addChild(row);
  });
  phone.addChild(next, when, chip, route, path, home, van, checks);
  root.addChild(phone);

  const plans = new Container();
  const gx = pw + 48 * k.u;
  const gw = b.w - gx;
  const gap = 18 * k.u;
  const chH = Math.min(150 * k.u, (b.h - gap * 2) / 3);
  plans.position.set(gx, (b.h - (chH * 3 + gap * 2)) / 2);
  const poses: Pose[] = [];
  (d.plans as any[]).forEach((pl, i) => {
    const c = new Container();
    c.y = i * (chH + gap);
    c.addChild(card(gw, chH, k));
    const name = label(pl.name, 30 * k.u, k.th.ink, "800", HEAD);
    name.position.set(28 * k.u, 26 * k.u);
    const note = label(pl.note, 21 * k.u, k.th.muted);
    note.position.set(28 * k.u, 26 * k.u + name.height + 6 * k.u);
    const price = label(pl.price, 46 * k.u, k.th.sun, "800", HEAD);
    price.anchor.set(1, 0.5);
    price.position.set(gw - 28 * k.u, chH / 2);
    c.addChild(name, note, price);
    plans.addChild(c);
    poses.push(riser(c, 0.9 + i * 0.2, 20 * k.u));
  });
  root.addChild(plans);
  const phonePose = riser(phone, 0, 40 * k.u);
  const checkPoses = checks.children.map((row, i) => riser(row as Container, 1.4 + i * 0.18, 10 * k.u));
  return {
    root,
    seek: (t) => {
      phonePose(t);
      poses.forEach((p) => p(t));
      checkPoses.forEach((p) => p(t));
      pulse.alpha = 0.55 + 0.45 * Math.sin(t * 4);
      const p = ramp(t, 0.6, 2.4);
      path.clear();
      const seg = p * (pts.length - 1);
      path.moveTo(pts[0][0] * mw, pts[0][1] * mh);
      let vx = pts[0][0] * mw;
      let vy = pts[0][1] * mh;
      for (let i = 1; i < pts.length; i++) {
        const f = clamp01(seg - (i - 1));
        if (f <= 0) break;
        vx = (pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f) * mw;
        vy = (pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f) * mh;
        path.lineTo(vx, vy);
      }
      path.stroke({ color: k.th.horizon, width: 5 * k.u, cap: "round", join: "round" });
      van.position.set(route.x + vx, route.y + vy);
    },
  };
}

function market(b: Box, k: Kit, rings: { label: string; value: string }[]): Figure {
  const root = new Container();
  const D = Math.min(b.h, b.w * (k.portrait ? 0.56 : 0.6));
  const R = D / 2;
  const cx = R;
  const bottom = (b.h + D) / 2;
  const radii = [R, R * 0.6, R * 0.28];
  const fills = [{ color: k.th.ocean, alpha: 0.22 }, { color: k.th.horizon, alpha: 0.42 }, { color: k.th.sun, alpha: 1 }];
  const circles = radii.map((r, i) => {
    const g = new Graphics().circle(0, 0, r).fill(fills[i]);
    g.position.set(cx, bottom - r);
    root.addChild(g);
    return g;
  });
  const lx = D + 54 * k.u;
  const lw = b.w - lx;
  const poses: Pose[] = [];
  rings.forEach((ring, i) => {
    const c = new Container();
    const y = bottom - radii[i] * 2 + 6 * k.u;
    const v = label(ring.value, 54 * k.u, i === 2 ? k.th.sun : k.th.ink, "800", HEAD);
    const l = wrap(ring.label, 22 * k.u, k.th.muted, lw, 2);
    l.y = v.height + 2 * k.u;
    c.addChild(v, l);
    c.position.set(lx, Math.min(y, b.h - c.height));
    const lead = new Graphics().moveTo(cx, bottom - radii[i] * 2 + 2 * k.u).lineTo(lx - 16 * k.u, c.y + v.height / 2).stroke({ color: k.th.line, width: 2 * k.u });
    root.addChildAt(lead, 0);
    root.addChild(c);
    const rp = riser(c, 0.5 + i * 0.5, 16 * k.u);
    poses.push((t) => {
      rp(t);
      lead.alpha = ramp(t, 0.5 + i * 0.5, 0.4);
    });
  });
  return {
    root,
    seek: (t) => {
      circles.forEach((g, i) => {
        const s = spring(Math.max(0, t - i * 0.45), { stiffness: 120, damping: 16 });
        g.scale.set(Math.max(0.001, s));
        g.alpha = ramp(t, i * 0.45, 0.3);
      });
      poses.forEach((p) => p(t));
    },
  };
}

function traction(b: Box, k: Kit, d: any): Figure {
  const root = new Container();
  const top = chips(d.chips, b.w, k, 0);
  root.addChild(top.root);
  const cy0 = 118 * k.u + 92 * k.u;
  const ch = b.h - cy0 - 40 * k.u;
  const cw = b.w;
  const plot = new Container();
  plot.y = cy0;
  root.addChild(plot);
  const values: number[] = d.values;
  const max = 5000;
  const grid = new Graphics();
  const labels = new Container();
  [0, 2500, 5000].forEach((v) => {
    const y = ch - (v / max) * ch;
    grid.moveTo(0, y).lineTo(cw, y);
    const l = label(v === 0 ? "0" : `${v / 1000}k`, 18 * k.u, k.th.muted);
    l.anchor.set(1, 0.5);
    l.position.set(-14 * k.u, y);
    labels.addChild(l);
  });
  grid.stroke({ color: k.th.line, width: 1.5 * k.u });
  const months: string[] = d.months;
  [0, 6, 12, months.length - 1].forEach((i) => {
    const l = label(months[i], 18 * k.u, k.th.muted);
    l.anchor.set(i === months.length - 1 ? 1 : 0.5, 0);
    l.position.set((i / (values.length - 1)) * cw, ch + 12 * k.u);
    labels.addChild(l);
  });
  const area = new Graphics();
  const line = new Graphics();
  const dot = new Graphics().circle(0, 0, 10 * k.u).fill(k.th.sun).circle(0, 0, 18 * k.u).fill({ color: k.th.sun, alpha: 0.25 });
  const now = new Container();
  const nowV = label("", 30 * k.u, k.th.ink, "800", HEAD);
  now.addChild(nowV);
  plot.addChild(grid, labels, area, line, dot, now);
  const xs = values.map((_, i) => (i / (values.length - 1)) * cw);
  const ys = values.map((v) => ch - (v / max) * ch);
  return {
    root,
    seek: (t) => {
      top.seek(t);
      const p = ramp(t, 0.5, 2.6);
      const f = p * (values.length - 1);
      const n = Math.floor(f);
      const frac = f - n;
      const ex = n < values.length - 1 ? xs[n] + (xs[n + 1] - xs[n]) * frac : xs[n];
      const ey = n < values.length - 1 ? ys[n] + (ys[n + 1] - ys[n]) * frac : ys[n];
      const ev = n < values.length - 1 ? values[n] + (values[n + 1] - values[n]) * frac : values[n];
      line.clear();
      area.clear();
      const vis = p > 0.001;
      dot.visible = vis;
      now.visible = vis;
      if (!vis) return;
      area.moveTo(xs[0], ch).lineTo(xs[0], ys[0]);
      line.moveTo(xs[0], ys[0]);
      for (let i = 1; i <= n; i++) {
        area.lineTo(xs[i], ys[i]);
        line.lineTo(xs[i], ys[i]);
      }
      area.lineTo(ex, ey).lineTo(ex, ch).closePath().fill({ color: k.th.horizon, alpha: 0.14 });
      line.lineTo(ex, ey).stroke({ color: k.th.horizon, width: 6 * k.u, cap: "round", join: "round" });
      dot.position.set(ex, ey);
      nowV.text = Math.round(ev).toLocaleString("en-US");
      now.position.set(Math.min(ex - nowV.width / 2, cw - nowV.width), ey - 66 * k.u);
    },
  };
}

function economics(b: Box, k: Kit, d: any): Figure {
  const root = new Container();
  const price: number = d.price;
  const parts: { label: string; value: number }[] = d.parts;
  const margin = Math.round((price - parts.reduce((s, p) => s + p.value, 0)) * 100) / 100;
  const segs = [...parts.map((p, i) => ({ ...p, color: [k.th.horizon, k.th.tide, k.th.ocean][i % 3], ink: 0xffffff })), { label: d.marginLabel ?? "Margin", value: margin, color: k.th.sun, ink: k.th.onSun }];
  const barY = 70 * k.u;
  const barH = 120 * k.u;
  const bar = new Container();
  bar.y = barY;
  root.addChild(bar);
  const fills: { g: Graphics; x: number; w: number; at: number }[] = [];
  let x = 0;
  const legend = new Container();
  legend.y = barY + barH + 38 * k.u;
  root.addChild(legend);
  const poses: Pose[] = [];
  const colW = b.w / segs.length;
  segs.forEach((s, i) => {
    const w = (s.value / price) * b.w;
    const g = new Graphics();
    bar.addChild(g);
    fills.push({ g, x, w, at: 0.2 + i * 0.35 });
    const v = label(`€${s.value.toFixed(2)}`, 30 * k.u, s.ink, "800", HEAD);
    v.anchor.set(0.5);
    v.position.set(x + w / 2, barH / 2);
    v.visible = w > v.width + 20 * k.u;
    bar.addChild(v);
    const item = new Container();
    item.x = i * colW;
    item.addChild(new Graphics().roundRect(0, 6 * k.u, 18 * k.u, 18 * k.u, 5 * k.u).fill(s.color));
    const l = wrap(s.label, 22 * k.u, k.th.ink, colW - 44 * k.u, 2, "600");
    l.x = 28 * k.u;
    const val = label(`€${s.value.toFixed(2)}`, 26 * k.u, k.th.muted, "600", HEAD);
    val.position.set(28 * k.u, l.height + 6 * k.u);
    item.addChild(l, val);
    legend.addChild(item);
    poses.push(riser(item, 0.4 + i * 0.35, 12 * k.u));
    const vp = v;
    poses.push((t) => (vp.alpha = ramp(t, 0.5 + i * 0.35, 0.3)));
    x += w;
  });
  const total = label(d.priceLabel, 24 * k.u, k.th.muted, "600");
  root.addChild(total);
  const ch = chips(d.chips, b.w, k, 1.8);
  ch.root.y = legend.y + legend.height + 70 * k.u;
  const shift = Math.max(0, (b.h - (ch.root.y + 118 * k.u)) / 2);
  root.y = shift;
  root.addChild(ch.root);
  const wrapper = new Container();
  wrapper.addChild(root);
  return {
    root: wrapper,
    seek: (t) => {
      fills.forEach((f, i) => {
        const p = ramp(t, f.at, 0.5);
        const r = 18 * k.u;
        f.g.clear();
        if (p <= 0) return;
        const w = Math.max(1, f.w * p);
        const first = i === 0;
        const last = i === fills.length - 1;
        if (first || last) {
          f.g.roundRect(f.x, 0, w, barH, r).fill(segs[i].color);
          if (first && w > r) f.g.rect(f.x + w - r, 0, r, barH).fill(segs[i].color);
          if (last) f.g.rect(f.x, 0, Math.min(r, w), barH).fill(segs[i].color);
        } else {
          f.g.rect(f.x, 0, w, barH).fill(segs[i].color);
        }
      });
      poses.forEach((p) => p(t));
      total.alpha = ramp(t, 0, 0.4);
      ch.seek(t);
    },
  };
}

function team(b: Box, k: Kit, people: { name: string; role: string; note: string }[]): Figure {
  const root = new Container();
  const cols = 2;
  const gap = 22 * k.u;
  const cw = (b.w - gap) / cols;
  const chh = Math.min(232 * k.u, (b.h - gap) / 2);
  const colors = [k.th.sun, k.th.horizon, k.th.tide, k.th.ocean];
  const poses: Pose[] = [];
  people.forEach((p, i) => {
    const c = new Container();
    c.position.set((i % cols) * (cw + gap), Math.floor(i / cols) * (chh + gap) + (b.h - chh * 2 - gap) / 2);
    c.addChild(card(cw, chh, k));
    const av = new Graphics().circle(0, 0, 40 * k.u).fill(colors[i % 4]);
    av.position.set(30 * k.u + 40 * k.u, 30 * k.u + 40 * k.u);
    const ini = label(p.name.split(" ").map((s) => s[0]).join(""), 28 * k.u, i === 0 ? k.th.onSun : 0xffffff, "800", HEAD);
    ini.anchor.set(0.5);
    ini.position.copyFrom(av.position);
    const tx = 30 * k.u + 80 * k.u + 22 * k.u;
    const name = label(p.name, 30 * k.u, k.th.ink, "800", HEAD);
    name.position.set(tx, 32 * k.u);
    const role = label(p.role, 21 * k.u, k.th.horizon, "600");
    role.position.set(tx, 32 * k.u + name.height + 2 * k.u);
    const note = wrap(p.note, 22 * k.u, k.th.muted, cw - 60 * k.u, 2);
    note.position.set(30 * k.u, 30 * k.u + 80 * k.u + 24 * k.u);
    c.addChild(av, ini, name, role, note);
    root.addChild(c);
    poses.push(riser(c, i * 0.22, 22 * k.u));
  });
  return { root, seek: (t) => poses.forEach((p) => p(t)) };
}

function plan(b: Box, k: Kit, items: { when: string; what: string; vans: number }[], vansLabel: string): Figure {
  const root = new Container();
  const n = items.length;
  const colW = b.w / n;
  const lineY = b.h * 0.3;
  const line = new Graphics();
  root.addChild(line);
  const maxV = Math.max(...items.map((i) => i.vans));
  const poses: Pose[] = [];
  const bars: { g: Graphics; x: number; h: number; at: number; label: Text }[] = [];
  const base = b.h - 10 * k.u;
  const baseLine = new Graphics().moveTo(0, base).lineTo(b.w, base).stroke({ color: k.th.line, width: 2 * k.u });
  root.addChild(baseLine);
  items.forEach((it, i) => {
    const cx = colW * i + colW / 2;
    const c = new Container();
    const dot = new Graphics().circle(cx, lineY, 16 * k.u).fill(i === n - 1 ? k.th.sun : k.th.horizon).circle(cx, lineY, 28 * k.u).fill({ color: i === n - 1 ? k.th.sun : k.th.horizon, alpha: 0.18 });
    const when = label(it.when, 26 * k.u, k.th.ink, "800", HEAD);
    when.anchor.set(0.5, 1);
    when.position.set(cx, lineY - 48 * k.u);
    const what = wrap(it.what, 22 * k.u, k.th.muted, colW - 30 * k.u, 2);
    what.style.align = "center";
    what.anchor.set(0.5, 1);
    what.position.set(cx, when.y - when.height - 8 * k.u);
    c.addChild(dot, when, what);
    const vans = label(`${it.vans} ${vansLabel}`, 22 * k.u, k.th.ink, "600");
    vans.anchor.set(0.5, 1);
    const bh = (it.vans / maxV) * (base - lineY - 130 * k.u);
    vans.position.set(cx, base - bh - 12 * k.u);
    const g = new Graphics();
    root.addChild(g);
    bars.push({ g, x: cx, h: bh, at: 0.6 + i * 0.4, label: vans });
    root.addChild(vans);
    root.addChild(c);
    poses.push(riser(c, 0.3 + i * 0.4, 14 * k.u));
  });
  return {
    root,
    seek: (t) => {
      const p = ramp(t, 0.1, 1.8);
      line.clear();
      if (p > 0) line.moveTo(colW / 2, lineY).lineTo(colW / 2 + (b.w - colW) * p, lineY).stroke({ color: k.th.line, width: 6 * k.u });
      poses.forEach((ps) => ps(t));
      bars.forEach((bar) => {
        const h = bar.h * spring(Math.max(0, t - bar.at), { stiffness: 110, damping: 16 });
        bar.g.clear();
        if (h > 0.5) bar.g.roundRect(bar.x - 34 * k.u, base - h, 68 * k.u, h, 14 * k.u).fill({ color: k.th.ocean, alpha: 0.6 });
        bar.label.y = base - h - 12 * k.u;
        bar.label.alpha = ramp(t, bar.at + 0.2, 0.4);
      });
    },
  };
}

function ask(b: Box, k: Kit, d: any): Figure {
  const root = new Container();
  const R = Math.min(b.h * 0.42, b.w * 0.26);
  const cx = R;
  const cy = b.h / 2;
  const ring = new Graphics();
  const amount = label(d.amount, R * 0.42, k.th.ink, "800", HEAD);
  amount.anchor.set(0.5);
  amount.position.set(cx, cy);
  root.addChild(ring, amount);
  const colors = [k.th.sun, k.th.horizon, k.th.tide, k.th.ocean];
  const uses: { label: string; value: number }[] = d.uses;
  const legend = new Container();
  const lx = 2 * R + 70 * k.u;
  const lw = b.w - lx;
  legend.x = lx;
  const rowH = 74 * k.u;
  legend.y = cy - (uses.length * rowH) / 2;
  const poses: Pose[] = [];
  uses.forEach((u, i) => {
    const row = new Container();
    row.y = i * rowH;
    row.addChild(new Graphics().roundRect(0, 10 * k.u, 22 * k.u, 22 * k.u, 6 * k.u).fill(colors[i % 4]));
    const pct = label(`${u.value}%`, 34 * k.u, k.th.ink, "800", HEAD);
    pct.x = 40 * k.u;
    const l = wrap(u.label, 24 * k.u, k.th.muted, lw - 170 * k.u, 1);
    l.position.set(150 * k.u, 6 * k.u);
    row.addChild(pct, l);
    legend.addChild(row);
    poses.push(riser(row, 0.5 + i * 0.3, 12 * k.u));
  });
  root.addChild(legend);
  const contact = label(d.contact, 24 * k.u, k.th.horizon, "600");
  contact.position.set(lx + 40 * k.u, legend.y + uses.length * rowH + 22 * k.u);
  root.addChild(contact);
  const total = uses.reduce((s, u) => s + u.value, 0);
  return {
    root,
    seek: (t) => {
      ring.clear();
      const p = ramp(t, 0.2, 1.8);
      let a = -Math.PI / 2;
      const thick = R * 0.2;
      uses.forEach((u, i) => {
        const span = (u.value / total) * Math.PI * 2 * p;
        if (span <= 0.001) return;
        ring.arc(cx, cy, R - thick / 2, a + 0.012, a + span - 0.012).stroke({ color: colors[i % 4], width: thick });
        a += span;
      });
      amount.alpha = ramp(t, 0, 0.5);
      poses.forEach((ps) => ps(t));
      contact.alpha = ramp(t, 1.8, 0.4);
    },
  };
}

// --- the slide ------------------------------------------------------------------

export const Slide = defineVisual<any, Theme>({
  name: "Slide",
  times: {},
  create(p, ctx: VisualContext<Theme>) {
    const { width: W, height: H } = ctx;
    const th = ctx.theme;
    const portrait = H > W;
    const u = Math.min(W, H) / 1080;
    const k: Kit = { th, u, portrait };
    const ins = (ctx.target?.safeArea ?? {}) as { top?: number; bottom?: number; left?: number; right?: number };
    const area = safeArea(W, H, {
      top: (ins.top ?? 0) + (portrait ? 64 : 78) * u,
      bottom: (ins.bottom ?? 0) + (portrait ? 64 : 70) * u,
      left: (ins.left ?? 0) + (portrait ? 72 : 110) * u,
      right: (ins.right ?? 0) + (portrait ? 72 : 110) * u,
    });
    const box: Box = { x: area.x, y: area.y, w: area.width, h: area.height };
    const root = new Container();
    root.addChild(new Graphics().rect(0, 0, W, H).fill(th.bg));
    const poses: Pose[] = [];

    const blocks = ctx.scene.blocks;
    const kicker = blocks.find((b) => b.tag === "h2")?.text ?? "";
    const title = blocks.find((b) => b.tag === "h1")?.text ?? "";
    const sub = blocks.find((b) => b.tag === "p")?.text ?? "";
    const bullets = blocks.filter((b) => b.tag === "li").map((b) => b.text);
    const isTitle = p.kind === "title";

    // Header: page number and kicker.
    const head = new Container();
    head.position.set(box.x, box.y);
    const num = label(String(p.n).padStart(2, "0"), 22 * u, th.onSun, "800", HEAD);
    const pill = new Graphics().roundRect(0, 0, num.width + 32 * u, 40 * u, 20 * u).fill(th.sun);
    num.position.set(16 * u, (40 * u - num.height) / 2);
    const kick = label(kicker.toUpperCase(), 20 * u, th.muted, "600");
    kick.style.letterSpacing = 2.4 * u;
    kick.position.set(num.width + 32 * u + 16 * u, (40 * u - kick.height) / 2);
    head.addChild(pill, num, kick);
    root.addChild(head);
    poses.push((t) => (head.alpha = ramp(t, 0, 0.35)));

    // Footer.
    const foot = new Container();
    foot.position.set(box.x, box.y + box.h - 30 * u);
    const brand = label(p.company, 20 * u, th.muted, "600", HEAD);
    const pageNo = label(`${p.n} / ${p.of}`, 20 * u, th.muted, "600");
    pageNo.anchor.set(1, 0);
    pageNo.x = box.w;
    foot.addChild(new Graphics().moveTo(0, -18 * u).lineTo(box.w, -18 * u).stroke({ color: th.line, width: 1.5 * u }), brand, pageNo);
    root.addChild(foot);

    // Text column.
    const colW = portrait ? box.w : box.w * (isTitle ? 0.5 : 0.4);
    let y = box.y + 40 * u + (portrait ? 52 : 70) * u;
    const titleSize = isTitle ? (portrait ? 140 : 156) * u : (portrait ? 74 : 72) * u;
    const tt = wrap(title, titleSize, th.ink, colW, isTitle ? 2 : 3, "800", HEAD);
    tt.style.letterSpacing = -0.02 * titleSize;
    tt.position.set(box.x, y);
    root.addChild(tt);
    poses.push(riser(tt, 0.1, 30 * u));
    y += tt.height + 26 * u;
    if (sub) {
      const s = wrap(sub, (isTitle ? 36 : 30) * u, th.muted, colW, 3);
      s.position.set(box.x, y);
      root.addChild(s);
      poses.push(riser(s, 0.35, 20 * u));
      y += s.height + 34 * u;
    }
    bullets.forEach((b, i) => {
      const row = new Container();
      row.position.set(box.x, y);
      const dot = new Graphics().circle(9 * u, 18 * u, 7 * u).fill([th.sun, th.horizon, th.tide, th.ocean][i % 4]);
      const l = wrap(b, 27 * u, th.ink, colW - 40 * u, 2);
      l.x = 34 * u;
      row.addChild(dot, l);
      root.addChild(row);
      poses.push(riser(row, 0.6 + i * 0.22, 16 * u));
      y += l.height + 20 * u;
    });
    if (isTitle && p.round) {
      const r = new Container();
      r.position.set(box.x, y + 10 * u);
      const l = label(p.round, 24 * u, th.ink, "600");
      l.position.set(24 * u, 12 * u);
      r.addChild(new Graphics().roundRect(0, 0, l.width + 48 * u, l.height + 24 * u, 999).fill({ color: th.sun, alpha: 0.22 }), l);
      root.addChild(r);
      poses.push(riser(r, 0.7, 14 * u));
      y += r.height + 30 * u;
    }

    // Figure area.
    const fig: Box = portrait
      ? { x: box.x, y: y + 30 * u, w: box.w, h: box.y + box.h - 70 * u - (y + 30 * u) }
      : { x: box.x + box.w * (isTitle ? 0.55 : 0.46), y: box.y + 92 * u, w: box.w * (isTitle ? 0.45 : 0.54), h: box.h - 92 * u - 80 * u };
    const d = p.data ?? {};
    const make: Record<string, () => Figure> = {
      title: () => wheel(fig, k),
      problem: () => problem(fig, k, d),
      solution: () => steps(fig, k, d),
      product: () => product(fig, k, d),
      market: () => market(fig, k, d),
      traction: () => traction(fig, k, d),
      economics: () => economics(fig, k, d),
      team: () => team(fig, k, d),
      plan: () => plan(fig, k, d, p.vansLabel ?? "vans"),
      ask: () => ask(fig, k, d),
    };
    const figure = make[p.kind]?.();
    if (figure) {
      figure.root.position.set(fig.x, fig.y);
      root.addChild(figure.root);
    }
    const figAt = isTitle ? 0.2 : 0.7;

    return {
      root,
      seek(t: number) {
        poses.forEach((ps) => ps(t));
        figure?.seek(t - figAt);
      },
      destroy() {
        root.destroy({ children: true });
      },
    };
  },
});
