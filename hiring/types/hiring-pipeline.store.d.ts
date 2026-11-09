/** The `hiring-pipeline` LiveStore's data (version 2), as `useStore('hiring-pipeline')` returns it. */
export interface HiringPipelineStore {
  candidates: Record<string, { reached: "applied" | "screen" | "interview" | "offer" | "hired" | null; since: string | null; stage: "applied" | "screen" | "interview" | "offer" | "hired" | "declined" | null }>;
  verdicts: Record<string, { by: "hannah" | "marco" | "sofia" | null; candidate: string | null; recommend: "strong yes" | "yes" | "unsure" | "no" | null }>;
}
