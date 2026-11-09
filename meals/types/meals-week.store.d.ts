/** The `meals-week` LiveStore's data (version 3), as `useStore('meals-week')` returns it. */
export interface MealsWeekStore {
  nights: Record<string, { cook: string | null; recipe: string | null; servings: number | null }>;
}
