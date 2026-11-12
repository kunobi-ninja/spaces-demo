/** The `flat-tour-pins` LiveStore's data (version 1), as `useStore('flat-tour-pins')` returns it. */
export interface FlatTourPinsStore {
  pins: Record<string, { added: string | null; author: string | null; kind: "like" | "issue" | "question" | "idea" | null; resolved: "no" | "yes" | null; room: string | null; text: string | null; x: number | null; y: number | null; z: number | null }>;
}
