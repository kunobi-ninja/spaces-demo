/** The `content-calendar-posts` LiveStore's data (version 3), as `useStore('content-calendar-posts')` returns it. */
export interface ContentCalendarPostsStore {
  posts: Record<string, { campaign: string | null; channel: "instagram" | "blog" | "newsletter" | "linkedin" | "video" | null; date: string | null; link: string | null; owner: "Lucía" | "Tom" | "Priya" | "Marco" | null; status: "idea" | "drafting" | "review" | "scheduled" | "published" | null; title: string | null }>;
}
