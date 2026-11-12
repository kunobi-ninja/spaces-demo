/** The `quiz-night-scores` LiveStore's data (version 2), as `useStore('quiz-night-scores')` returns it. */
export interface QuizNightScoresStore {
  nights: Record<string, { date: string | null; points: number | null; winner: string | null }>;
  tonight: Record<string, number>;
  total: Record<string, number>;
}
