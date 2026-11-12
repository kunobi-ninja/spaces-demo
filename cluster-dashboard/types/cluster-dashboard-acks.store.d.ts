/** The `cluster-dashboard-acks` LiveStore's data (version 1), as `useStore('cluster-dashboard-acks')` returns it. */
export interface ClusterDashboardAcksStore {
  acks: Record<string, { at: string | null; note: string | null; state: "known" | "ignored" | null }>;
}
