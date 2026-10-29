import "@fontsource/parkinsans/800.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import { loadFaces } from "@vixi/helpers";
import { vxFamily, type VxModule } from "@vixi/vx";

export { Opening, Memory, Cake, Finale } from "./frames";

export function createCut(id: string, doc: VxModule) {
  return vxFamily({
    id,
    doc,
    themes: [{ id: "paper", name: "Paper party", intent: "Warm paper-cut world: cream sky, layered hills, bunting, pop-up cards and confetti." }],
    load: () => loadFaces(['800 64px "Parkinsans"', '600 32px "Figtree"', '700 32px "Figtree"']),
  });
}
