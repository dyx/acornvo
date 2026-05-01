import type { FileSummary } from '@shared/file-types'

export interface FixtureFile {
  path: string
  title?: string
  category?: string
  rating?: number | null
  clipped_at?: string
  site?: string
  tags?: string[]
  has_summary?: boolean
}

export function buildSummaries(rows: FixtureFile[]): FileSummary[] {
  return rows.map<FileSummary>((r, i) => ({
    path: r.path,
    title: r.title ?? r.path.replace(/\.md$/, ''),
    category: r.category ?? null,
    rating: r.rating === undefined ? null : r.rating,
    clipped_at: r.clipped_at ?? new Date(2026, 0, i + 1).toISOString(),
    site: r.site ?? null,
    has_summary: r.has_summary ?? false,
    tags: r.tags ?? [],
    is_reviewing: false
  }))
}

export function sortByClippedDesc(rows: FileSummary[]): FileSummary[] {
  return [...rows].sort(
    (a, b) => (b.clipped_at ?? '').localeCompare(a.clipped_at ?? '')
  )
}
