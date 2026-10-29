// The quiz's rules, kept apart from the drawing: what the next step is and how points are scored.

export interface Player {
  name: string
  color: string
}

export interface Question {
  q: string
  options: string[]
  answer: number
  fact?: string
  seconds?: number
}

export interface Round {
  theme: string
  color: string
  questions: Question[]
}

export interface Quiz {
  title: string
  host?: string
  seconds?: number
  players: Player[]
  rounds: Round[]
}

/** One answer: the option chosen and how many seconds it took. */
export interface Pick {
  option: number
  at: number
}

export type Phase = 'lobby' | 'round' | 'question' | 'reveal' | 'board' | 'final'

export interface State {
  phase: Phase
  round: number
  question: number
  picks: (Pick | null)[]
  scores: number[]
  /** Scores at the start of the round, to show who moved up. */
  before: number[]
  /** Points each player won on the question just revealed. */
  gained: number[]
}

export const start = (quiz: Quiz): State => {
  const zero = quiz.players.map(() => 0)
  return { phase: 'lobby', round: 0, question: 0, picks: quiz.players.map(() => null), scores: zero, before: zero, gained: zero }
}

export const current = (quiz: Quiz, s: State) => quiz.rounds[s.round].questions[s.question]

export const secondsFor = (quiz: Quiz, q: Question) => q.seconds ?? quiz.seconds ?? 20

export const questionNumber = (quiz: Quiz, s: State) =>
  quiz.rounds.slice(0, s.round).reduce((n, r) => n + r.questions.length, 0) + s.question + 1

export const totalQuestions = (quiz: Quiz) => quiz.rounds.reduce((n, r) => n + r.questions.length, 0)

/** 500 for a right answer, plus up to 500 more for answering quickly. */
export const points = (pick: Pick | null, answer: number, seconds: number) =>
  pick && pick.option === answer ? 500 + Math.round(500 * Math.max(0, 1 - pick.at / seconds)) : 0

export const reveal = (quiz: Quiz, s: State): State => {
  const q = current(quiz, s)
  const limit = secondsFor(quiz, q)
  const gained = s.picks.map((p) => points(p, q.answer, limit))
  return { ...s, phase: 'reveal', gained, scores: s.scores.map((v, i) => v + gained[i]) }
}

export const next = (quiz: Quiz, s: State): State => {
  const blank = quiz.players.map(() => null)
  if (s.phase === 'lobby') return { ...s, phase: 'round', before: s.scores }
  if (s.phase === 'round') return { ...s, phase: 'question', picks: blank, gained: s.scores.map(() => 0) }
  if (s.phase === 'reveal') {
    if (s.question + 1 < quiz.rounds[s.round].questions.length) return { ...s, phase: 'question', question: s.question + 1, picks: blank }
    return { ...s, phase: s.round + 1 < quiz.rounds.length ? 'board' : 'final' }
  }
  if (s.phase === 'board') return { ...s, phase: 'round', round: s.round + 1, question: 0, before: s.scores }
  return start(quiz)
}

/** Player indexes from first to last place; ties keep the lobby order. */
export const ranking = (scores: number[]) => scores.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i)
