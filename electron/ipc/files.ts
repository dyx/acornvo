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
  [M in keyof IpcContract['files']]: IpcContract['files'][M] extends (...args: infer A) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

interface FileRow {
  path: string
  title: string | null
  category: string | null
  rating: number | null
  ai_rating: number | null
  clipped_at: string | null
  mtime: number
  created_at: number
  site: string | null
  has_summary: number
  tags_json: string | null
  job_status: string | null
  job_error: string | null
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

async function getAll(): Promise<FileSummary[]> {
  const db = dbService.requireCurrent()
  const sql = `
    SELECT
      f.path,
      f.title,
      f.category,
      f.rating,
      json_extract(f.frontmatter_json, '$.ai_rating') AS ai_rating,
      f.clipped_at,
      f.mtime,
      f.created_at,
      json_extract(f.frontmatter_json, '$.site') AS site,
      CASE WHEN f.summary IS NOT NULL AND length(f.summary) > 0 THEN 1 ELSE 0 END AS has_summary,
      json_extract(f.frontmatter_json, '$.tags') AS tags_json,
      rj.status AS job_status,
      rj.last_error AS job_error
    FROM files f
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
    ) rj ON CAST(rj.clip_id AS INTEGER) = c.id AND rj.rn = 1
  `

  let rows: FileRow[]
  try {
    rows = db.prepare(sql).all() as FileRow[]
  } catch (err) {
    throw new IpcError('E_INTERNAL', `files.getAll: ${(err as Error).message}`)
  }

  return rows.map((r) => {
    const hasSummary = r.has_summary === 1
    const reviewStatus = deriveReviewStatus(r.rating, hasSummary, r.job_status)
    let tags: string[] = []
    if (r.tags_json) {
      try {
        const parsed = JSON.parse(r.tags_json)
        if (Array.isArray(parsed)) tags = parsed.filter((t) => typeof t === 'string')
      } catch { /* ignore */ }
    }
    return {
      path: r.path,
      title: r.title,
      category: r.category,
      rating: r.rating,
      ai_rating: r.ai_rating,
      clipped_at: r.clipped_at,
      mtime: r.mtime,
      created_at: r.created_at,
      site: r.site,
      has_summary: hasSummary,
      tags,
      is_reviewing: reviewStatus === 'pending' || reviewStatus === 'running',
      review_status: reviewStatus,
      review_error: reviewStatus === 'failed' ? (r.job_error ?? null) : null
    }
  })
}

async function get(path: string): Promise<{
  summary: FileSummary
  frontmatter: Frontmatter
  body: string
}> {
  const db = dbService.requireCurrent()
  let row: FileRow | undefined
  try {
    row = db
      .prepare(
        `SELECT f.path, f.title, f.category, f.rating, 
                json_extract(f.frontmatter_json, '$.ai_rating') AS ai_rating,
                f.clipped_at,
                f.mtime,
                f.created_at,
                json_extract(f.frontmatter_json, '$.site') AS site,
                CASE WHEN f.summary IS NOT NULL AND length(f.summary) > 0 THEN 1 ELSE 0 END AS has_summary,
                json_extract(f.frontmatter_json, '$.tags') AS tags_json,
                rj.status AS job_status,
                rj.last_error AS job_error
         FROM files f
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
         ) rj ON CAST(rj.clip_id AS INTEGER) = c.id AND rj.rn = 1
         WHERE f.path = ?`
      )
      .get(path) as FileRow | undefined
  } catch (err) {
    throw new IpcError('E_INTERNAL', `files.get: ${(err as Error).message}`)
  }

  if (!row) {
    throw new IpcError('E_NOT_FOUND', `files.get: ${path} not in index`)
  }

  const parsed = await fileHandlers.readParsed(path)
  const hasSummary = row.has_summary === 1
  const reviewStatus = deriveReviewStatus(row.rating, hasSummary, row.job_status)
  
  let tags: string[] = []
  if (row.tags_json) {
    try {
      const p = JSON.parse(row.tags_json)
      if (Array.isArray(p)) tags = p.filter((t) => typeof t === 'string')
    } catch { /* ignore */ }
  }

  const summary: FileSummary = {
    path: row.path,
    title: row.title,
    category: row.category,
    rating: row.rating,
    ai_rating: row.ai_rating,
    clipped_at: row.clipped_at,
    mtime: row.mtime,
    created_at: row.created_at,
    site: row.site,
    has_summary: hasSummary,
    tags,
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
  getAll,
  get,
  getCategoryTree,
  revealInFinder
}
