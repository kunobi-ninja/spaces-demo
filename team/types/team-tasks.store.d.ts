/** The `team-tasks` LiveStore's data (version 2), as `useStore('team-tasks')` returns it. */
export interface TeamTasksStore {
  tasks: Array<{ id: string; ai: string | null; due: string | null; owner: "Ana" | "Ben" | "Chloe" | "Dev" | null; page: string | null; priority: "High" | "Medium" | "Low" | null; project: "Shop" | "Menu" | "Hiring" | "Online" | "Opening" | "Money" | null; start: string | null; status: "Idea" | "To do" | "Doing" | "Waiting" | "Done" | null; title: string | null }>;
}
