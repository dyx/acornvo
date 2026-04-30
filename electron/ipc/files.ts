import { dbService } from '../services/db'
import { IpcError } from '@shared/ipc-contract'
import type {
  FileSummary,
  FileFilter,
  Pagination,
  IpcContract,
  CategoryNode,
  TagCloudItem
} from '@shared/ipc-contract'
import { fileHandlers } from './file'
import type { Frontmatter } from '@shared/frontmatter-schema'

type FileQueryHandlers = {
  [M in keyof IpcContract['files']]: IpcContract['files'][M] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

// Stub bodies that throw — replaced in tasks 2.2–2.6.
function notImplemented(): never {
  throw new IpcError('E_INTERNAL', 'not implemented')
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
      GROUP_CONCAT(REPLACE(ft.tag, char(1), '?'), char(1) ORDER BY ft.tag) AS tags_concat,
      COUNT(*) OVER() AS total
    FROM files f
    LEFT JOIN file_tags ft ON ft.path = f.path
    WHERE
      (:category IS NULL OR f.category = :category OR f.category LIKE :category || '/%')
      AND (:pathPrefix IS NULL OR f.path LIKE :pathPrefix || '%')
      AND (:minRating IS NULL OR f.rating >= :minRating)
      AND (:maxRating IS NULL OR f.rating <= :maxRating)
      AND (:q IS NULL OR f.title LIKE '%' || :q || '%' ESCAPE '\\' OR f.path LIKE '%' || :q || '%' ESCAPE '\\')
      AND (:tag IS NULL OR f.path IN (SELECT path FROM file_tags WHERE tag = :tag))
    GROUP BY f.path
    ORDER BY
      CASE WHEN :orderBy = 'clipped_desc' THEN f.clipped_at END DESC,
      CASE WHEN :orderBy = 'title_asc' THEN f.title END ASC
    LIMIT :limit OFFSET :offset
  `

  const q = filter.q ? filter.q.replace(/%/g, '\\%').replace(/_/g, '\\_') : null

  const params = {
    category: filter.category ?? null,
    tag: filter.tag ?? null,
    pathPrefix: filter.pathPrefix ?? null,
    minRating: filter.rating?.min ?? null,
    maxRating: filter.rating?.max ?? null,
    q,
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

async function get(path: string): Promise<{
  summary: FileSummary
  frontmatter: Frontmatter
  body: string
}> {
  const db = dbService.requireCurrent()
  const row = db
    .prepare(
      `SELECT f.path, f.title, f.category, f.rating, f.clipped_at,
              json_extract(f.frontmatter_json, '$.site') AS site,
              CASE WHEN f.summary IS NOT NULL AND length(f.summary) > 0 THEN 1 ELSE 0 END AS has_summary,
              GROUP_CONCAT(REPLACE(ft.tag, char(1), '?'), char(1)) AS tags_concat
       FROM files f
       LEFT JOIN file_tags ft ON ft.path = f.path
       WHERE f.path = ?
       GROUP BY f.path`
    )
    .get(path) as
    | (Omit<ListRow, 'total'>)
    | undefined

  if (!row) {
    throw new IpcError('E_NOT_FOUND', `files.get: ${path} not in index`)
  }

  const parsed = await fileHandlers.readParsed(path)

  const summary: FileSummary = {
    path: row.path,
    title: row.title,
    category: row.category,
    rating: row.rating,
    clipped_at: row.clipped_at,
    site: row.site,
    has_summary: row.has_summary === 1,
    tags: row.tags_concat ? row.tags_concat.split(TAG_SEP).filter(Boolean) : [],
    is_reviewing: false
  }
  return { summary, frontmatter: parsed.frontmatter, body: parsed.body }
}

const MAX_TREE_DEPTH = 3

async function getCategoryTree(): Promise<CategoryNode[]> {
  const db = dbService.requireCurrent()
  const rows = db
    .prepare(
      `SELECT category, COUNT(*) AS count
       FROM files
       WHERE category IS NOT NULL AND category <> ''
       GROUP BY category`
    )
    .all() as Array<{ category: string; count: number }>

  const root: CategoryNode = { name: '', count: 0, children: [] }

  for (const r of rows) {
    const segments = r.category.split('/').slice(0, MAX_TREE_DEPTH)
    let cursor = root
    for (let i = 0; i < segments.length; i++) {
      const name = segments[i]
      let next = cursor.children.find((c) => c.name === name)
      if (!next) {
        next = { name, count: 0, children: [] }
        cursor.children.push(next)
      }
      next.count += r.count
      cursor = next
    }
  }
  return root.children
}

async function getTagCloud(opts: { limit: number }): Promise<TagCloudItem[]> {
  const db = dbService.requireCurrent()
  const rows = db
    .prepare(
      `SELECT name, usage_count
       FROM tags
       WHERE usage_count > 0
       ORDER BY usage_count DESC, name ASC
       LIMIT ?`
    )
    .all(opts.limit) as TagCloudItem[]
  return rows
}

export const fileQueryHandlers: FileQueryHandlers = {
  list,
  get,
  getCategoryTree,
  getTagCloud,
  revealInFinder: notImplemented
}
