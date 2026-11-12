/** The `meals-shopping` LiveStore's data (version 3), as `useStore('meals-shopping')` returns it. */
export interface MealsShoppingStore {
  extras: Array<{ id: string; aisle: "Produce" | "Meat and fish" | "Dairy and eggs" | "Bakery" | "Pantry" | "Frozen" | "Other" | null; got: "yes" | "no" | null; name: string | null; qty: string | null }>;
  ticks: Record<string, { got: "yes" | "no" | null }>;
}
