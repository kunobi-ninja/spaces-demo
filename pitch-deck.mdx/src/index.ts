import "@fontsource/parkinsans/600.css";
import "@fontsource/parkinsans/800.css";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/600.css";
import { loadFaces } from "@vixi/helpers";
import { vxFamily, type VxModule } from "@vixi/vx";

export interface Theme {
  id: string;
  name: string;
  intent: string;
  bg: number;
  card: number;
  ink: number;
  muted: number;
  line: number;
  sun: number;
  horizon: number;
  tide: number;
  ocean: number;
  onSun: number;
  glow: number;
  glowAlpha: number;
}

/** Two looks: a light deck for screens and a dark one for stages. */
const themes: Theme[] = [
  {
    id: "cloud", name: "Cloud", intent: "Light deck for laptops and shared screens",
    bg: 0xf7f9fc, card: 0xffffff, ink: 0x06213f, muted: 0x5b6b7d, line: 0xdde5ee,
    sun: 0xf3aa08, horizon: 0x0984c8, tide: 0x30ccd5, ocean: 0x5bcbf9, onSun: 0x06213f,
    glow: 0xf3aa08, glowAlpha: 0.1,
  },
  {
    id: "midnight", name: "Midnight", intent: "Dark deck for a stage or a big room",
    bg: 0x06213f, card: 0x0d2e52, ink: 0xffffff, muted: 0xa9bdd3, line: 0x1f4470,
    sun: 0xf3aa08, horizon: 0x5bcbf9, tide: 0x30ccd5, ocean: 0x5bcbf9, onSun: 0x06213f,
    glow: 0x5bcbf9, glowAlpha: 0.07,
  },
];

export function createCut(id: string, doc: VxModule) {
  return vxFamily({
    id, doc, themes,
    load: () => loadFaces(['800 64px "Parkinsans"', '600 32px "Parkinsans"', '400 28px "Figtree"', '600 28px "Figtree"']),
  });
}
