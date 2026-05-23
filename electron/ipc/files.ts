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
import type { ReviewStatus } from '@shared/file-types'
import { fileHandlers } from './file'
import type { Frontmatter } from '@shared/frontmatter-schema'
import { shell } from 'electron'
import { safeResolve } from '../services/path-safety'
import * as groveSvc from '../services/grove'

type FileQueryHandlers = {
  [M in keyof IpcContract['files']]: IpcContract['files'][M] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
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
  job_status: string | null
  job_error: string | null
  total: number
}

function deriveReviewStatus(
  rating: number | null,
  hasSummary: boolean,
  jobStatus: string | null
): ReviewStatus {
  if (rating !== null) return 'done'
  if (hasSummary) return 'done'
  if (jobStatus === 'running') return 'running'
  if (jobStatus === 'pending') return 'pending'
  if (jobStatus === 'failed') return 'failed'
  return 'none'
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
      rj.status AS job_status,
      rj.last_error AS job_error,
      COUNT(*) OVER() AS total
    FROM files f
    LEFT JOIN file_tags ft ON ft.path = f.path
    LEFT JOIN clips c ON c.path = f.path
    LEFT JOIN (
      SELECT
        json_extract(payload_json, '$.clipId') AS clip_id,
        status, last_error,
        ROW_NUMBER() OVER (
          PARTITION BY json_extract(payload_json, '$.clipId')
          ORDER BY updated_at DESC
        ) AS rn
      FROM jobs
      WHERE kind = 'ai-review-clip'
    ) rj ON rj.clip_id = CAST(c.id AS TEXT) AND rj.rn = 1
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
  const items: FileSummary[] = rows.map((r) => {
    const hasSummary = r.has_summary === 1
    const reviewStatus = deriveReviewStatus(r.rating, hasSummary, r.job_status)
    return {
      path: r.path,
      title: r.title,
      category: r.category,
      rating: r.rating,
      clipped_at: r.clipped_at,
      site: r.site,
      has_summary: hasSummary,
      tags: r.tags_concat ? r.tags_concat.split(TAG_SEP).filter(Boolean) : [],
      is_reviewing: reviewStatus === 'pending' || reviewStatus === 'running',
      review_status: reviewStatus,
      review_error: reviewStatus === 'failed' ? (r.job_error ?? null) : null
    }
  })
  return { items, total }
}

async function get(path: string): Promise<{
  summary: FileSummary
  frontmatter: Frontmatter
  body: string
}> {
  const db = dbService.requireCurrent()
  let row: (Omit<ListRow, 'total'>) | undefined
  try {
    row = db
      .prepare(
        `SELECT f.path, f.title, f.category, f.rating, f.clipped_at,
                json_extract(f.frontmatter_json, '$.site') AS site,
                CASE WHEN f.summary IS NOT NULL AND length(f.summary) > 0 THEN 1 ELSE 0 END AS has_summary,
                GROUP_CONCAT(REPLACE(ft.tag, char(1), '?'), char(1)) AS tags_concat,
                rj.status AS job_status,
                rj.last_error AS job_error
         FROM files f
         LEFT JOIN file_tags ft ON ft.path = f.path
         LEFT JOIN clips c ON c.path = f.path
         LEFT JOIN (
           SELECT
             json_extract(payload_json, '$.clipId') AS clip_id,
             status, last_error,
             ROW_NUMBER() OVER (
               PARTITION BY json_extract(payload_json, '$.clipId')
               ORDER BY updated_at DESC
             ) AS rn
           FROM jobs
           WHERE kind = 'ai-review-clip'
         ) rj ON rj.clip_id = CAST(c.id AS TEXT) AND rj.rn = 1
         WHERE f.path = ?
         GROUP BY f.path`
      )
      .get(path) as
      | (Omit<ListRow, 'total'>)
      | undefined
  } catch (err) {
    throw new IpcError('E_INTERNAL', `files.get: ${(err as Error).message}`)
  }

  if (!row) {
    throw new IpcError('E_NOT_FOUND', `files.get: ${path} not in index`)
  }

  const parsed = await fileHandlers.readParsed(path)
  const hasSummary = row.has_summary === 1
  const reviewStatus = deriveReviewStatus(row.rating, hasSummary, row.job_status)

  const summary: FileSummary = {
    path: row.path,
    title: row.title,
    category: row.category,
    rating: row.rating,
    clipped_at: row.clipped_at,
    site: row.site,
    has_summary: hasSummary,
    tags: row.tags_concat ? row.tags_concat.split(TAG_SEP).filter(Boolean) : [],
    is_reviewing: reviewStatus === 'pending' || reviewStatus === 'running',
    review_status: reviewStatus,
    review_error: reviewStatus === 'failed' ? (row.job_error ?? null) : null
  }
  return { summary, frontmatter: parsed.frontmatter, body: parsed.body }
}

const MAX_TREE_DEPTH = 3

async function getCategoryTree(): Promise<CategoryNode[]> {
  const db = dbService.requireCurrent()
  let rows: Array<{ category: string; count: number }>
  try {
    rows = db
      .prepare(
        `SELECT category, COUNT(*) AS count
         FROM files
         WHERE category IS NOT NULL AND category <> ''
         GROUP BY category`
      )
      .all() as Array<{ category: string; count: number }>
  } catch (err) {
    throw new IpcError('E_INTERNAL', `files.getCategoryTree: ${(err as Error).message}`)
  }

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
  let rows: TagCloudItem[]
  try {
    rows = db
      .prepare(
        `SELECT name, usage_count
         FROM tags
         WHERE usage_count > 0
         ORDER BY usage_count DESC, name ASC
         LIMIT ?`
      )
      .all(opts.limit) as TagCloudItem[]
  } catch (err) {
    throw new IpcError('E_INTERNAL', `files.getTagCloud: ${(err as Error).message}`)
  }
  return rows
}

function requireGroveRoot(): string {
  const grove = groveSvc.getCurrent()
  if (!grove) throw new IpcError('E_NOT_FOUND', 'no grove is currently open')
  return grove.path
}

async function revealInFinder(path: string): Promise<{ ok: true }> {
  const root = requireGroveRoot()
  const abs = safeResolve(root, path)
  shell.showItemInFolder(abs)
  return { ok: true }
}

export const fileQueryHandlers: FileQueryHandlers = {
  list,
  get,
  getCategoryTree,
  getTagCloud,
  revealInFinder
}
