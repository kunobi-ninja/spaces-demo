/** The `on-call-handover-items` LiveStore's data (version 1), as `useStore('on-call-handover-items')` returns it. */
export interface OnCallHandoverItemsStore {
  handedAt: string | null;
  handedBy: string | null;
  items: Record<string, { check: string | null; comment: string | null; detail: string | null; order: number | null; owner: string | null; severity: "high" | "medium" | "low" | null; since: string | null; source: string | null; status: "open" | "acked" | "done" | null; title: string | null }>;
  takenAt: string | null;
  takenBy: string | null;
}
