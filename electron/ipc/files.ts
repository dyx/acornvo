import { dbService } from '../services/db'
import { IpcError } from '@shared/ipc-contract'
import type {
  FileSummary,
  FileFilter,
  Pagination,
  IpcContract
} from '@shared/ipc-contract'

type FileQueryHandlers = {
  [M in keyof IpcContract['files']]: IpcContract['files'][M] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

// Stub bodies that throw — replaced in tasks 2.2–2.6.
function notImplemented(): never {
  throw new Error('not implemented')
}

const TAG_SEP = '\x01'

interface ListRow {
  path: string
  title: string | null
  category: string | null
  rating: number | null
  clipped_at: string | null
  site: string | null
  has_summary: number
  tags_concat: string | null
  total: number
}

async function list(
  filter: FileFilter,
  pagination: Pagination
): Promise<{ items: FileSummary[]; total: number }> {
  const db = dbService.requireCurrent()
  const sql = `
    SELECT
      f.path,
      f.title,
      f.category,
      f.rating,
      f.clipped_at,
      json_extract(f.frontmatter_json, '$.site') AS site,
      CASE WHEN f.summary IS NOT NULL AND length(f.summary) > 0 THEN 1 ELSE 0 END AS has_summary,
      GROUP_CONCAT(REPLACE(ft.tag, char(1), '?'), char(1)) AS tags_concat,
      COUNT(*) OVER() AS total
    FROM files f
    LEFT JOIN file_tags ft ON ft.path = f.path
    WHERE
      (:category IS NULL OR f.category = :category OR f.category LIKE :category || '/%')
      AND (:pathPrefix IS NULL OR f.path LIKE :pathPrefix || '%')
      AND (:minRating IS NULL OR f.rating >= :minRating)
      AND (:maxRating IS NULL OR f.rating <= :maxRating)
      AND (:q IS NULL OR f.title LIKE '%' || :q || '%' OR f.path LIKE '%' || :q || '%')
      AND (:tag IS NULL OR f.path IN (SELECT path FROM file_tags WHERE tag = :tag))
    GROUP BY f.path
    ORDER BY
      CASE WHEN :orderBy = 'clipped_desc' THEN f.clipped_at END DESC,
      CASE WHEN :orderBy = 'title_asc' THEN f.title END ASC
    LIMIT :limit OFFSET :offset
  `

  const params = {
    category: filter.category ?? null,
    tag: filter.tag ?? null,
    pathPrefix: filter.pathPrefix ?? null,
    minRating: filter.rating?.min ?? null,
    maxRating: filter.rating?.max ?? null,
    q: filter.q ?? null,
    orderBy: pagination.orderBy,
    limit: pagination.limit,
    offset: pagination.offset
  }

  let rows: ListRow[]
  try {
    rows = db.prepare(sql).all(params) as ListRow[]
  } catch (err) {
    throw new IpcError('E_INTERNAL', `files.list: ${(err as Error).message}`)
  }

  if (rows.length === 0) return { items: [], total: 0 }

  const total = rows[0].total
  const items: FileSummary[] = rows.map((r) => ({
    path: r.path,
    title: r.title,
    category: r.category,
    rating: r.rating,
    clipped_at: r.clipped_at,
    site: r.site,
    has_summary: r.has_summary === 1,
    tags: r.tags_concat ? r.tags_concat.split(TAG_SEP).filter(Boolean) : [],
    is_reviewing: false
  }))
  return { items, total }
}

export const fileQueryHandlers: FileQueryHandlers = {
  list,
  get: notImplemented,
  getCategoryTree: notImplemented,
  getTagCloud: notImplemented,
  revealInFinder: notImplemented
}
