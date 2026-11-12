/** The `blast-radius-review` LiveStore's data (version 1), as `useStore('blast-radius-review')` returns it. */
export interface BlastRadiusReviewStore {
  checks: Record<string, { item: string | null; object: string | null; state: "done" | "skipped" | null }>;
  notes: Array<{ id: string; at: string | null; object: string | null; text: string | null }>;
}
