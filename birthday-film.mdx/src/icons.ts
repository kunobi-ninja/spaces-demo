import { Container, Graphics } from "pixi.js";
import { shade, type Pal } from "./paper";

// Paper cut-out icons for the memories, drawn about 200 units across around
// 0,0 and scaled to fit. `film.json` names one per memory; an unknown name
// gets a heart.

export const ICONS = ["tent", "bike", "pasta", "plane", "music", "heart", "star"] as const;

function shadowed(draw: (g: Graphics, dark: boolean) => void) {
  const c = new Container();
  const s = new Graphics();
  draw(s, true);
  s.position.set(5, 9);
  s.alpha = 0.18;
  const f = new Graphics();
  draw(f, false);
  c.addChild(s, f);
  return c;
}

const ink = (dark: boolean, color: number) => (dark ? 0x06213f : color);

export function icon(name: string, C: Pal): Container {
  switch (name) {
    case "tent":
      return shadowed((g, d) => {
        g.poly([-110, 70, 0, -95, 110, 70]).fill(ink(d, C.warm));
        g.poly([-24, 70, 0, 4, 24, 70]).fill(ink(d, shade(C.warm, 0.6)));
        g.poly([0, -95, 110, 70, 70, 70]).fill(ink(d, shade(C.warm, 0.82)));
        g.rect(-135, 70, 270, 12).fill(ink(d, C.deep));
        // Rain, because of course.
        for (const [x, y] of [[-90, -110], [-40, -140], [60, -125], [100, -80], [-125, -60]]) g.roundRect(x, y, 7, 26, 4).fill(ink(d, C.cool));
      });
    case "bike":
      return shadowed((g, d) => {
        const wheel = (x: number) => g.circle(x, 40, 52).stroke({ color: ink(d, C.deep), width: 12 }).circle(x, 40, 8).fill(ink(d, C.deep));
        wheel(-78);
        wheel(78);
        g.moveTo(-78, 40).lineTo(-20, -40).lineTo(50, -40).lineTo(78, 40).moveTo(-20, -40).lineTo(8, 40).lineTo(50, -40).stroke({ color: ink(d, C.warm), width: 12, join: "round", cap: "round" });
        g.moveTo(-28, -58).lineTo(-6, -58).stroke({ color: ink(d, C.deep), width: 12, cap: "round" });
        g.moveTo(50, -40).lineTo(42, -72).lineTo(70, -78).stroke({ color: ink(d, C.deep), width: 10, cap: "round", join: "round" });
        g.circle(8, 40, 14).fill(ink(d, C.sun));
      });
    case "pasta":
      return shadowed((g, d) => {
        g.ellipse(0, 52, 128, 34).fill(ink(d, C.paper)).ellipse(0, 52, 128, 34).stroke({ color: ink(d, shade(C.paper, 0.85)), width: 6 });
        g.ellipse(0, 38, 98, 40).fill(ink(d, C.sun));
        for (let i = 0; i < 6; i++) g.moveTo(-80 + i * 30, 30).bezierCurveTo(-60 + i * 30, -10, -100 + i * 30, -30, -70 + i * 30, -50).stroke({ color: ink(d, shade(C.sun, 0.85)), width: 9, cap: "round" });
        g.circle(-30, 22, 15).fill(ink(d, C.warm)).circle(22, 30, 13).fill(ink(d, C.warm)).circle(50, 12, 11).fill(ink(d, C.warm));
        g.ellipse(-8, 4, 18, 8).fill(ink(d, 0x6fbf73));
        g.moveTo(84, -10).lineTo(126, -96).stroke({ color: ink(d, C.deep), width: 9, cap: "round" });
      });
    case "plane":
      return shadowed((g, d) => {
        g.poly([-120, 10, 110, -40, 130, -20, -100, 40]).fill(ink(d, C.paper));
        g.poly([-10, -10, 40, -90, 70, -86, 40, -16]).fill(ink(d, C.cool));
        g.poly([-20, 26, 10, 96, 40, 92, 26, 20]).fill(ink(d, C.cool));
        g.poly([-110, 14, -130, -40, -104, -40, -84, 8]).fill(ink(d, C.warm));
      });
    case "music":
      return shadowed((g, d) => {
        g.ellipse(-56, 60, 38, 28).fill(ink(d, C.deep)).ellipse(70, 34, 38, 28).fill(ink(d, C.deep));
        g.rect(-24, -90, 16, 150).fill(ink(d, C.deep)).rect(102, -116, 16, 150).fill(ink(d, C.deep));
        g.poly([-24, -90, 118, -116, 118, -76, -24, -50]).fill(ink(d, C.warm));
      });
    case "star":
      return shadowed((g, d) => {
        const pts: number[] = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 ? 50 : 120;
          pts.push(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.poly(pts).fill(ink(d, C.sun));
      });
    default:
      return shadowed((g, d) => {
        g.moveTo(0, 96).bezierCurveTo(-60, 50, -120, 10, -120, -36).bezierCurveTo(-120, -80, -80, -104, -48, -104).bezierCurveTo(-24, -104, -8, -92, 0, -74).bezierCurveTo(8, -92, 24, -104, 48, -104).bezierCurveTo(80, -104, 120, -80, 120, -36).bezierCurveTo(120, 10, 60, 50, 0, 96).closePath().fill(ink(d, C.warm));
      });
  }
}
