/** The `home-hunt-takes` LiveStore's data (version 2), as `useStore('home-hunt-takes')` returns it. */
export interface HomeHuntTakesStore {
  takes: Record<string, { home: string | null; note: string | null; person: "maya" | "alex" | null; verdict: "keen" | "maybe" | "no" | null }>;
}
