/** The `incident-timeline` LiveStore's data (version 1), as `useStore('incident-timeline')` returns it. */
export interface IncidentTimelineStore {
  commander: string | null;
  entries: Array<{ id: string; author: string | null; kind: "detect" | "finding" | "action" | "decision" | "note" | null; source: string | null; text: string | null; time: string | null }>;
  followups: Array<{ id: string; done: "open" | "done" | null; owner: string | null; text: string | null }>;
  resolved: string | null;
  severity: "SEV1" | "SEV2" | "SEV3" | "SEV4" | null;
  started: string | null;
  status: "investigating" | "mitigated" | "resolved" | null;
  title: string | null;
}
