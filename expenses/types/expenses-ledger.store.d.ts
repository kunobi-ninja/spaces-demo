/** The `expenses-ledger` LiveStore's data (version 2), as `useStore('expenses-ledger')` returns it. */
export interface ExpensesLedgerStore {
  expenses: Record<string, { amount: number | null; category: "Rent" | "Bills" | "Groceries" | "Household" | "Takeaway" | null; date: string | null; paid_by: "Amara" | "Diego" | "Mei" | "Rohan" | null; split: string | null; what: string | null }>;
  payments: Record<string, { amount: number | null; date: string | null; from: "Amara" | "Diego" | "Mei" | "Rohan" | null; to: "Amara" | "Diego" | "Mei" | "Rohan" | null }>;
}
