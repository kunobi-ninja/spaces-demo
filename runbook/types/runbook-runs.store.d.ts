/** The `runbook-runs` LiveStore's data (version 1), as `useStore('runbook-runs')` returns it. */
export interface RunbookRunsStore {
  checks: Record<string, { note: string | null; result: "pass" | "fail" | "unknown" | null; run: string | null; seen: string | null; step: "ready" | "suspend" | "source" | "retries" | "history" | "workloads" | "downstream" | "pending" | null }>;
  runs: Record<string, { at: string | null; by: string | null; note: string | null; source: "live" | "snapshot" | "agent" | null; target: string | null }>;
}
