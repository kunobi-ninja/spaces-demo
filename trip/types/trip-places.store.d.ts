/** The `trip-places` LiveStore's data (version 2), as `useStore('trip-places')` returns it. */
export interface TripPlacesStore {
  places: Record<string, { addedBy: string | null; booking: "none" | "to-book" | "booked" | null; day: number | null; kind: "stay" | "food" | "see" | "coffee" | "viewpoint" | null; lat: string | null; lng: string | null; name: string | null; note: string | null; price: number | null; time: string | null }>;
}
