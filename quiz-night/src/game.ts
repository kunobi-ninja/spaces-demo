// The quiz's rules, kept apart from the drawing: what the next step is and how points are scored.

export interface Team {
  id: string
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
  teams: Team[]
  rounds: Round[]
}

/** Points by team id. */
export type Points = Record<string, number>

/** The `quiz-night-scores` store: points tonight and over every quiz night, and the nights played. */
export interface Scores {
  tonight: Points
  total: Points
  nights: Record<string, { date: string | null; winner: string | null; points: number | null }>
}

/** Someone playing: their actor id in the room, their team and the name they gave. */
export interface Player {
  id: string
  team: string
  name: string
}

/** One answer: the option chosen and how many seconds it took. */
export interface Answer {
  option: number
  at: number
}

export type Phase = 'lobby' | 'round' | 'question' | 'reveal' | 'board' | 'final'

/** Where the quiz is. Only the host moves it, in the room's `stage` key. */
export interface Stage {
  /** Counts the quizzes played in this room, so each one's answers have keys of their own. */
  game: number
  phase: Phase
  round: number
  question: number
  /** Points each team won on the question just revealed. */
  gained?: Points
  /** Who gave the quickest right answer. */
  fastest?: string
  /** Tonight's points at the start of the round, to show who moved up. */
  before?: Points
}

export const ROOM = 'quiz-night-round'
export const STORE = 'quiz-night-scores'

export const lobby = (game = 1): Stage => ({ game, phase: 'lobby', round: 0, question: 0 })

export const current = (quiz: Quiz, s: Stage) => quiz.rounds[s.round]?.questions[s.question] ?? quiz.rounds[0].questions[0]

export const secondsFor = (quiz: Quiz, q: Question) => q.seconds ?? quiz.seconds ?? 20

export const questionNumber = (quiz: Quiz, s: Stage) =>
  quiz.rounds.slice(0, s.round).reduce((n, r) => n + r.questions.length, 0) + s.question + 1

export const totalQuestions = (quiz: Quiz) => quiz.rounds.reduce((n, r) => n + r.questions.length, 0)

/** The room key of one player's answer: set once, then fixed. */
export const answerKey = (quiz: Quiz, s: Stage, id: string) => `answer.${s.game}.${questionNumber(quiz, s)}.${id}`

/** Players from the room's `team.<id>` entries, on teams the quiz knows. */
export const playersIn = (quiz: Quiz, state: Record<string, unknown>): Player[] =>
  Object.entries(state).flatMap(([key, value]) => {
    const entry = value as { team?: unknown; name?: unknown } | null
    if (!key.startsWith('team.') || !entry || !quiz.teams.some((t) => t.id === entry.team)) return []
    return [{ id: key.slice(5), team: String(entry.team), name: String(entry.name ?? '').slice(0, 24) }]
  })

/** A right answer is 1 point for the team; the quickest right answer gets 1 more. */
export const score = (quiz: Quiz, s: Stage, players: Player[], answerOf: (id: string) => Answer | undefined) => {
  const q = current(quiz, s)
  const gained: Points = Object.fromEntries(quiz.teams.map((t) => [t.id, 0]))
  let fastest: Player | undefined
  for (const p of players) {
    const a = answerOf(p.id)
    if (!a || a.option !== q.answer) continue
    gained[p.team] += 1
    if (!fastest || a.at < (answerOf(fastest.id)?.at ?? Infinity)) fastest = p
  }
  if (fastest) gained[fastest.team] += 1
  return { gained, fastest: fastest?.id }
}

/** The stage after `s` when the host moves on. */
export const next = (quiz: Quiz, s: Stage, tonight: Points): Stage => {
  const step = { game: s.game, round: s.round, question: s.question }
  if (s.phase === 'lobby') return { ...step, phase: 'round', round: 0, question: 0, before: {} }
  if (s.phase === 'round') return { ...step, phase: 'question', before: s.before }
  if (s.phase === 'reveal') {
    if (s.question + 1 < quiz.rounds[s.round].questions.length) return { ...step, phase: 'question', question: s.question + 1, before: s.before }
    return { ...step, phase: s.round + 1 < quiz.rounds.length ? 'board' : 'final', before: s.before }
  }
  if (s.phase === 'board') return { ...step, phase: 'round', round: s.round + 1, question: 0, before: { ...tonight } }
  return lobby(s.game + 1)
}

/** Teams from first to last place; ties keep the quiz's order. */
export const ranking = (quiz: Quiz, points: Points) =>
  quiz.teams.map((t, i) => [points[t.id] ?? 0, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => quiz.teams[i])
