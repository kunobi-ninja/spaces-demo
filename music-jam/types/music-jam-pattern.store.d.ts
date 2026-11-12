/** The `music-jam-pattern` LiveStore's data (version 1), as `useStore('music-jam-pattern')` returns it. */
export interface MusicJamPatternStore {
  key: "C major" | "D minor" | "E minor" | "F major" | "G major" | "A minor" | null;
  tempo: number | null;
  tracks: Array<{ id: string; instrument: "kick" | "snare" | "clap" | "hat" | "bass" | "chords" | "lead" | null; name: string | null; owner: string | null; steps: string | null; volume: number | null }>;
}
