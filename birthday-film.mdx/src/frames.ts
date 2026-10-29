import { Container, Graphics, Text } from "pixi.js";
import { rng } from "@vixi/core";
import { fitText } from "@vixi/helpers";
import { defineVisual } from "@vixi/vx";
import { icon } from "./icons";
import { backdrop, card, clamp01, confetti, inOut, layout, outBack, outCubic, palette, shade, span, type Colors } from "./paper";

// The film's four scenes. Every word on screen arrives as a prop from
// full.mdx (which reads data/film.json); every movement is a function of the
// scene's clock. `offset` is where the scene starts in the film, so the
// bunting's sway and the sun's turn carry on across cuts.

const HEAD = "Parkinsans";
const BODY = "Figtree";

function centre(t: Text, ax = 0.5, ay = 0.5) {
  t.anchor.set(ax, ay);
  return t;
}

/** A small rounded label, drawn as a pill around its text. */
function pill(label: string, size: number, fg: number, bg: number) {
  const c = new Container();
  const t = new Text({ text: label, style: { fontFamily: BODY, fontWeight: "700", fontSize: size, fill: fg, letterSpacing: size * 0.04 } });
  t.anchor.set(0.5);
  const w = t.width + size * 1.4;
  const h = size * 1.9;
  c.addChild(new Graphics().roundRect(-w / 2, -h / 2, w, h, h / 2).fill(bg), t);
  return c;
}

/** Four-pointed sparkles that twinkle around a point. */
function sparkles(color: number, seed: number, area: { x: number; y: number; w: number; h: number }, u: number, n = 7) {
  const r = rng(seed);
  const items = Array.from({ length: n }, () => ({ x: area.x + r() * area.w, y: area.y + r() * area.h, s: (10 + r() * 16) * u, ph: r() * 6, sp: 2 + r() * 3 }));
  const g = new Graphics();
  return {
    g,
    pose(t: number, on: number) {
      g.clear();
      if (on <= 0) return;
      for (const it of items) {
        const k = on * (0.55 + 0.45 * Math.sin(t * it.sp + it.ph));
        const s = it.s * k;
        g.poly([it.x, it.y - s, it.x + s * 0.28, it.y - s * 0.28, it.x + s, it.y, it.x + s * 0.28, it.y + s * 0.28, it.x, it.y + s, it.x - s * 0.28, it.y + s * 0.28, it.x - s, it.y, it.x - s * 0.28, it.y - s * 0.28]).fill({ color, alpha: 0.9 });
      }
    },
  };
}

interface Base {
  colors: Colors;
  offset: number;
}

// ── Opening: the world rises out of the paper, the bunting drops, the name pops. ──

interface OpeningProps extends Base {
  eyebrow: string;
  name: string;
  line: string;
  pop: number;
}

export const Opening = defineVisual<OpeningProps>({
  name: "Opening",
  times: { pop: "at" },
  defaults: { pop: 1.3, offset: 0 },
  create(p, ctx) {
    const C = palette(p.colors);
    const L = layout(ctx);
    const { W, H, u } = L;
    const bg = backdrop(ctx, C, 11);
    const root = new Container();
    root.addChild(bg.root);

    const wide = L.mode === "wide";
    const boxW = wide ? W * 0.6 : W * 0.86;
    const x = wide ? L.left + W * 0.09 : W / 2;
    const ax = wide ? 0 : 0.5;
    const y = wide ? H * 0.4 : L.mode === "tall" ? H * 0.43 : H * 0.4;

    const eyebrow = centre(new Text({ text: p.eyebrow, style: { fontFamily: BODY, fontWeight: "700", fontSize: 44 * u, fill: C.ink } }), ax, 1);
    const name = fitText(p.name, { font: HEAD, weight: "800", size: (wide ? 250 : 220) * u, color: C.ink, width: boxW, height: 270 * u, maxLines: 1, align: wide ? "left" : "center", tracking: -4 * u });
    // A single line needs no line gap: fit the box to the letters so the line below can sit close.
    name.style.lineHeight = Number(name.style.fontSize) * 1.02;
    centre(name, ax, 0.5);
    const line = fitText(p.line, { font: HEAD, weight: "800", size: 120 * u, color: C.warm, width: boxW, height: 140 * u, maxLines: 1, align: wide ? "left" : "center" });
    centre(line, ax, 0);
    eyebrow.position.set(x, y - 130 * u);
    name.position.set(x, y);
    line.position.set(x, y + name.height / 2 + 14 * u);

    const nameW = name.width;
    const sp = sparkles(C.sun, 3, { x: wide ? x : x - nameW / 2, y: y - 160 * u, w: nameW + 60 * u, h: 300 * u }, u);
    const burst = confetti(L, C, 21, 70, { x: wide ? x + nameW * 0.8 : W / 2, y: y + 40 * u }, 0.9);
    root.addChild(sp.g, eyebrow, name, line, burst.g);

    return {
      root,
      seek(t) {
        const clock = p.offset + t;
        bg.pose(t / 1.4, span(t, 0.5, 1), clock);
        const e = outCubic(span(t, p.pop - 0.45, 0.4));
        eyebrow.alpha = e;
        eyebrow.y = y - 130 * u + (1 - e) * 24 * u;
        const n = span(t, p.pop, 0.5);
        name.alpha = clamp01(n * 3);
        name.scale.set(0.6 + 0.4 * outBack(n, 2.2));
        const l = span(t, p.pop + 0.5, 0.45);
        line.alpha = clamp01(l * 3);
        line.scale.set(0.7 + 0.3 * outBack(l, 2));
        sp.pose(clock, outCubic(span(t, p.pop + 0.3, 0.6)));
        burst.pose(t - (p.pop + 0.5));
      },
      destroy() {
        root.destroy({ children: true });
      },
    };
  },
});

// ── Memory: a pop-up card unfolds from the hills, holds, and folds away. ──

interface MemoryProps extends Base {
  index: number;
  total: number;
  when: string;
  title: string;
  line: string;
  icon: string;
  open: number;
}

export const Memory = defineVisual<MemoryProps>({
  name: "Memory",
  times: { open: "at" },
  defaults: { open: 0, offset: 0 },
  create(p, ctx) {
    const C = palette(p.colors);
    const L = layout(ctx);
    const { W, H, u, mode } = L;
    const bg = backdrop(ctx, C, 11);
    const root = new Container();
    root.addChild(bg.root);

    const cw = mode === "wide" ? Math.min(W * 0.6, 1180 * u) : mode === "tall" ? W * 0.84 : W * 0.8;
    const ch = mode === "wide" ? H * 0.62 : mode === "tall" ? H * 0.5 : H * 0.64;
    const cy = mode === "tall" ? H * 0.47 : H * 0.48;
    const hinge = new Container();
    hinge.position.set(W / 2, cy + ch / 2);
    const face = new Container();
    face.y = -ch / 2;
    hinge.addChild(face);
    face.addChild(card(cw, ch, C.paper, u));

    // A coloured panel for the icon: left on a wide card, top on the others.
    const side = mode === "wide";
    const pw = side ? cw * 0.38 : cw;
    const ph = side ? ch : ch * 0.42;
    const panelColor = [C.cool, C.sun, C.warm][(p.index - 1) % 3];
    const panel = new Graphics();
    const r = 34 * u;
    if (side) panel.roundRect(-cw / 2, -ch / 2, pw, ph, r).fill(shade(panelColor, 1.55)).rect(-cw / 2 + pw - r, -ch / 2, r, ph).fill(shade(panelColor, 1.55));
    else panel.roundRect(-cw / 2, -ch / 2, pw, ph, r).fill(shade(panelColor, 1.55)).rect(-cw / 2, -ch / 2 + ph - r, pw, r).fill(shade(panelColor, 1.55));
    face.addChild(panel);

    const ic = icon(p.icon, C);
    const icX = side ? -cw / 2 + pw / 2 : 0;
    const icY = side ? 0 : -ch / 2 + ph / 2 + 6 * u;
    const icScale = (Math.min(pw, ph) / 330) * (side ? 1 : 0.95);
    ic.position.set(icX, icY);
    face.addChild(ic);

    // The words: when, the title and a line, fitted to their box.
    const pad = 54 * u;
    const tx = side ? -cw / 2 + pw + pad : -cw / 2 + pad;
    const tw = side ? cw - pw - pad * 2 : cw - pad * 2;
    const ty = side ? -ch / 2 + pad * 1.2 : -ch / 2 + ph + pad * 0.7;
    const th = side ? ch - pad * 2.4 : ch - ph - pad * 1.4;
    const when = pill(p.when.toUpperCase(), 26 * u, C.ink, shade(panelColor, 1.25));
    when.position.set(tx + when.width / 2, ty + when.height / 2);
    const title = fitText(p.title, { font: HEAD, weight: "800", size: (side ? 92 : 84) * u, color: C.ink, width: tw, height: th * 0.5, maxLines: 2, minSize: 40 * u, tracking: -1 * u });
    title.position.set(tx, ty + when.height + 26 * u);
    const line = fitText(p.line, { font: BODY, weight: "600", size: 46 * u, color: shade(C.ink, 1.35), width: tw, height: th * 0.42, maxLines: 3, minSize: 26 * u });
    line.position.set(tx, title.y + title.height + 22 * u);
    face.addChild(when, title, line);

    const count = pill(`${p.index} / ${p.total}`, 24 * u, C.paper, C.ink);
    // The counter sits in the card's top right corner and folds with it.
    count.position.set(cw / 2 - count.width / 2 - 28 * u, -ch / 2 + count.height / 2 + 26 * u);
    face.addChild(count);
    root.addChild(hinge);

    const burst = confetti(L, C, 30 + p.index, 34, { x: W / 2 + (side ? cw * 0.28 : 0), y: cy - ch / 2 }, 0.7);
    root.addChild(burst.g);
    const close = Math.max(p.open + 2.4, ctx.scene.duration - 0.45);

    return {
      root,
      seek(t) {
        const clock = p.offset + t;
        bg.pose(1, 1, clock);
        // Unfold up from the hinge, then fold back down to leave.
        const up = outBack(span(t, p.open, 0.6), 1.4);
        const down = inOut(span(t, close, 0.4));
        hinge.scale.y = Math.max(0.001, up * (1 - down));
        hinge.rotation = (1 - outCubic(span(t, p.open, 0.8))) * -0.05;
        hinge.alpha = clamp01(span(t, p.open, 0.12) * (1 - span(t, close + 0.3, 0.1)));
        // The icon pops up off the card like a paper cut-out.
        const ip = outBack(span(t, p.open + 0.3, 0.5), 2.4);
        ic.scale.set(icScale * Math.max(0.001, ip), icScale * Math.max(0.001, ip) * (1 + 0.03 * Math.sin(clock * 3)));
        const w1 = outCubic(span(t, p.open + 0.45, 0.4));
        when.alpha = w1;
        const t1 = outCubic(span(t, p.open + 0.55, 0.45));
        title.alpha = t1;
        title.y = ty + when.height + 26 * u + (1 - t1) * 30 * u;
        const l1 = outCubic(span(t, p.open + 0.8, 0.45));
        line.alpha = l1;
        line.y = title.y + title.height + 22 * u + (1 - l1) * 20 * u;
        count.alpha = outCubic(span(t, p.open + 0.2, 0.3)) * (1 - span(t, close, 0.3));
        burst.pose(t - (p.open + 0.35));
      },
      destroy() {
        root.destroy({ children: true });
      },
    };
  },
});

// ── Cake: the wish, candles shaped like the age light on the beat, then a big breath. ──

interface CakeProps extends Base {
  wish: string;
  age: string;
  light: number;
  blow: number;
}

export const Cake = defineVisual<CakeProps>({
  name: "Cake",
  times: { light: "at", blow: "at" },
  defaults: { light: 0.5, blow: 3, offset: 0 },
  create(p, ctx) {
    const C = palette(p.colors);
    const L = layout(ctx);
    const { W, H, u, mode } = L;
    const bg = backdrop(ctx, C, 11);
    const root = new Container();
    root.addChild(bg.root);

    const k = mode === "tall" ? 1.1 : mode === "square" ? 0.9 : 0.85;
    const cx = W / 2;
    const base = (mode === "tall" ? H * 0.74 : H * 0.83) ;
    const cake = new Container();
    cake.position.set(cx, base);
    const g = new Graphics();
    const w1 = 560 * u * k;
    const h1 = 170 * u * k;
    const w2 = 400 * u * k;
    const h2 = 150 * u * k;
    // Plate, bottom tier, icing drips, top tier, drips, sprinkles.
    g.ellipse(0, 6 * u, w1 * 0.66, 34 * u * k).fill({ color: C.ink, alpha: 0.12 }).ellipse(0, 0, w1 * 0.62, 30 * u * k).fill(C.paper);
    g.roundRect(-w1 / 2, -h1, w1, h1, 22 * u).fill(C.warm);
    const drips = (y: number, w: number, color: number, seed: number) => {
      const r = rng(seed);
      g.moveTo(-w / 2, y);
      for (let x = -w / 2; x < w / 2 - 1; x += w / 9) {
        const d = (18 + r() * 38) * u * k;
        g.lineTo(x, y).quadraticCurveTo(x + w / 36, y + d, x + w / 18, y);
      }
      g.lineTo(w / 2, y - 30 * u * k).lineTo(-w / 2, y - 30 * u * k).closePath().fill(color);
    };
    drips(-h1 + 26 * u * k, w1, C.paper, 4);
    g.roundRect(-w2 / 2, -h1 - h2, w2, h2, 20 * u).fill(C.cool);
    drips(-h1 - h2 + 24 * u * k, w2, C.paper, 9);
    const rs = rng(13);
    for (let i = 0; i < 26; i++) {
      const sx = (rs() - 0.5) * w1 * 0.9;
      const sy = -h1 * (0.15 + rs() * 0.55);
      g.roundRect(sx, sy, 16 * u, 6 * u, 3 * u).fill([C.sun, C.deep, C.paper][i % 3]);
    }
    cake.addChild(g);

    // Candles shaped like the age's digits, standing on the top tier.
    const digits = [...p.age];
    const candles = digits.map((d, i) => {
      const c = new Container();
      const t = new Text({ text: d, style: { fontFamily: HEAD, fontWeight: "800", fontSize: 230 * u * k, fill: [C.sun, C.deep, C.warm][i % 3], stroke: { color: C.paper, width: 10 * u } } });
      t.anchor.set(0.5, 1);
      // The face's descent space sits under the digit: drop it so the candle stands on the icing.
      t.y = t.height * 0.16;
      // The digit's letters start about a fifth of the way into its box: the wick stands on them.
      const top = -t.height * 0.62;
      const wick = new Graphics().rect(-3 * u, top - 26 * u, 6 * u, 30 * u).fill(C.ink);
      const flame = new Graphics()
        .moveTo(0, -60 * u)
        .bezierCurveTo(26 * u, -20 * u, 22 * u, 10 * u, 0, 12 * u)
        .bezierCurveTo(-22 * u, 10 * u, -26 * u, -20 * u, 0, -60 * u)
        .fill(C.sun)
        .moveTo(0, -32 * u)
        .bezierCurveTo(12 * u, -10 * u, 10 * u, 6 * u, 0, 8 * u)
        .bezierCurveTo(-10 * u, 6 * u, -12 * u, -10 * u, 0, -32 * u)
        .fill(C.paper);
      flame.position.set(0, top - 32 * u);
      const glow = new Graphics().circle(0, 0, 70 * u).fill({ color: C.sun, alpha: 0.18 });
      glow.position.copyFrom(flame.position);
      c.addChild(glow, t, wick, flame);
      const spread = 190 * u * k;
      c.position.set((i - (digits.length - 1) / 2) * spread, -h1 - h2 + 18 * u);
      cake.addChild(c);
      return { c, flame, glow };
    });
    const smoke = new Graphics();
    cake.addChild(smoke);

    // Under the sun in a tall frame, under the bunting in the others.
    const wishY = mode === "tall" ? H * 0.33 : mode === "square" ? H * 0.27 : H * 0.255;
    const wish = fitText(p.wish, { font: HEAD, weight: "800", size: 116 * u, color: C.ink, width: W * 0.86, height: 170 * u, maxLines: 1, align: "center", tracking: -2 * u });
    centre(wish);
    wish.position.set(cx, wishY);
    const sp = sparkles(C.sun, 8, { x: cx - wish.width / 2 - 40 * u, y: wishY - 90 * u, w: wish.width + 80 * u, h: 180 * u }, u, 8);
    root.addChild(cake, sp.g, wish);

    return {
      root,
      seek(t) {
        const clock = p.offset + t;
        bg.pose(1, 1, clock);
        const rise = outBack(span(t, 0, 0.6), 1.3);
        cake.y = base + (1 - rise) * H * 0.4;
        // The candles appear once the cake has landed, so nothing sits off frame on the way in.
        candles.forEach(({ c }) => (c.alpha = outCubic(span(t, 0.35, 0.25))));
        const wv = outCubic(span(t, 0.15, 0.5));
        wish.alpha = wv;
        wish.scale.set(0.85 + 0.15 * outBack(span(t, 0.15, 0.5), 2));
        sp.pose(clock, wv);
        const out = span(t, p.blow, 0.25);
        candles.forEach(({ flame, glow }, i) => {
          const on = outBack(span(t, p.light + i * 0.5, 0.25), 2.5) * (1 - out);
          const flick = 1 + 0.09 * Math.sin(clock * 17 + i * 2) + 0.05 * Math.sin(clock * 29 + i);
          flame.scale.set(Math.max(0.001, on * (1 - 0.04 * Math.sin(clock * 23 + i))), Math.max(0.001, on * flick));
          flame.rotation = out * 0.6 + 0.05 * Math.sin(clock * 11 + i);
          glow.alpha = on;
        });
        // Smoke curls up from each wick after the breath.
        smoke.clear();
        const s = t - p.blow;
        if (s > 0 && s < 1.6)
          candles.forEach(({ c, flame }, i) => {
            for (let j = 0; j < 5; j++) {
              const q = s - j * 0.12;
              if (q <= 0) continue;
              const x = c.x + Math.sin(q * 5 + i + j) * 14 * u;
              const y = c.y + flame.y - q * 100 * u;
              smoke.circle(x, y, (10 + q * 26) * u).fill({ color: C.deep, alpha: Math.max(0, 0.16 * (1 - q / 1.4)) });
            }
          });
      },
      destroy() {
        root.destroy({ children: true });
      },
    };
  },
});

// ── Finale: the card, the signature, balloons and confetti. ──

interface FinaleProps extends Base {
  headline: string;
  from: string;
  burst: number;
}

export const Finale = defineVisual<FinaleProps>({
  name: "Finale",
  times: { burst: "at" },
  defaults: { burst: 0.3, offset: 0 },
  create(p, ctx) {
    const C = palette(p.colors);
    const L = layout(ctx);
    const { W, H, u, mode } = L;
    const bg = backdrop(ctx, C, 11);
    const root = new Container();
    root.addChild(bg.root);

    // Balloons drifting up behind the card.
    const r = rng(5);
    const colors = [C.warm, C.cool, C.sun, C.deep, C.warm, C.cool];
    const balloons = colors.map((col, i) => {
      const b = new Container();
      const R = (70 + r() * 30) * u;
      const g = new Graphics()
        .moveTo(0, R * 1.15)
        .bezierCurveTo(14 * u, R * 1.6, -14 * u, R * 2.1, 6 * u, R * 2.8)
        .stroke({ color: C.ink, width: 2.5 * u, alpha: 0.5 })
        .ellipse(8 * u, 10 * u, R * 0.9, R * 1.1)
        .fill({ color: C.ink, alpha: 0.12 })
        .ellipse(0, 0, R * 0.9, R * 1.1)
        .fill(col)
        .poly([-10 * u, R * 1.08, 10 * u, R * 1.08, 0, R * 1.22])
        .fill(col)
        .ellipse(-R * 0.35, -R * 0.45, R * 0.18, R * 0.3)
        .fill({ color: 0xffffff, alpha: 0.35 });
      b.addChild(g);
      root.addChild(b);
      return { b, x: ((i + 0.5) / colors.length) * W + (r() - 0.5) * 80 * u, speed: (160 + r() * 120) * u, delay: r() * 0.6, sway: r() * 6 };
    });

    const cw = mode === "wide" ? W * 0.5 : W * 0.84;
    const ch = mode === "wide" ? H * 0.5 : mode === "tall" ? H * 0.36 : H * 0.52;
    const cy = mode === "tall" ? H * 0.45 : H * 0.46;
    const holder = new Container();
    holder.position.set(W / 2, cy);
    holder.addChild(card(cw, ch, C.paper, u, 40));
    const band = new Graphics().roundRect(-cw / 2, -ch / 2, cw, 22 * u, 11 * u).fill(C.sun);
    holder.addChild(band);
    const head = fitText(p.headline, { font: HEAD, weight: "800", size: 150 * u, color: C.ink, width: cw - 120 * u, height: ch * 0.58, maxLines: 2, align: "center", minSize: 60 * u, tracking: -3 * u });
    centre(head, 0.5, 1);
    head.position.set(0, ch * 0.12);
    const sig = new Text({ text: p.from, style: { fontFamily: BODY, fontWeight: "700", fontSize: 54 * u, fill: C.warm } });
    centre(sig, 0.5, 0);
    sig.position.set(0, ch * 0.18);
    holder.addChild(head, sig);
    root.addChild(holder);

    const left = confetti(L, C, 41, 80, { x: W * 0.12, y: H * 0.95 }, 1.15);
    const right = confetti(L, C, 42, 80, { x: W * 0.88, y: H * 0.95 }, 1.15);
    root.addChild(left.g, right.g);

    return {
      root,
      seek(t) {
        const clock = p.offset + t;
        bg.pose(1, 1, clock);
        const pop = span(t, 0.05, 0.6);
        holder.scale.set(Math.max(0.001, 0.55 + 0.45 * outBack(pop, 1.8)));
        holder.alpha = clamp01(pop * 4);
        holder.rotation = (1 - outCubic(pop)) * 0.06;
        const s = outCubic(span(t, 0.7, 0.45));
        sig.alpha = s;
        sig.y = ch * 0.18 + (1 - s) * 18 * u;
        for (const bl of balloons) {
          const q = Math.max(0, t - bl.delay);
          bl.b.position.set(bl.x + Math.sin(clock * 1.3 + bl.sway) * 16 * u, H + 260 * u - q * bl.speed);
          bl.b.rotation = Math.sin(clock * 1.1 + bl.sway) * 0.06;
        }
        left.pose(t - p.burst);
        right.pose(t - p.burst - 0.08);
      },
      destroy() {
        root.destroy({ children: true });
      },
    };
  },
});
