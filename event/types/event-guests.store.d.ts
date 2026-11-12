/** The `event-guests` LiveStore's data (version 5), as `useStore('event-guests')` returns it. */
export interface EventGuestsStore {
  guests: Record<string, { diet: string | null; household: string | null; name: string | null; note: string | null; party: number | null; plusOneOf: string | null; rsvp: "yes" | "maybe" | "no" | "none" | null; side: string | null; table: string | null }>;
}
