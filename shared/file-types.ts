/** Shared DTO for file summary rows returned by search and library queries. */
export interface FileSummary {
  path: string
  title: string | null
  category: string | null
  rating: number | null
  clipped_at: string | null
  site: string | null
  has_summary: boolean
  tags: string[]
  is_reviewing: boolean
}
