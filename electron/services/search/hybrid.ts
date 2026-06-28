import { dbService } from '../db'
import { getVectorStore } from '../vector-store'
import { resolveEmbeddings } from '../../ai/embeddings'
import { embedBatchLocal } from '../../ai/embed-worker'
import { logger } from '../../obs/logger'
import type { FileSummary } from '@shared/file-types'
import { rowToFileSummary, escapeForSnippet, type SummaryRow } from './queries'

export interface HybridSearchResultItem {
  summary: FileSummary
  body: string
  heading_path: string
  score: number
  source: 'fts' | 'semantic' | 'hybrid'
}

export interface HybridSearchResult {
  items: HybridSearchResultItem[]
  total: number
  pending: boolean
  error?: string
}

// RRF constant (typically 60)
const K = 60

export async function hybridSearch(query: string, ftsWeight = 1.0, vecWeight = 1.0, limit = 50): Promise<HybridSearchResult> {
  const db = dbService.getCurrent()
  if (!db) throw new Error('No grove open')

  if (!query || query.trim() === '') {
    return { items: [], total: 0, pending: false }
  }

  // 1. FTS Search
  // FTS5 bm25 score is negative, more negative = better match
  const ftsStmt = db.prepare(`
    SELECT 
      chunk_id, 
      bm25(files_fts) as raw_score 
    FROM files_fts
    WHERE files_fts MATCH ?
    ORDER BY raw_score ASC
    LIMIT 100
  `)
  
  const ftsQuery = `"${query.replace(/"/g, '""')}"*`
  let ftsRows: { chunk_id: string, raw_score: number }[] = []
  if (ftsWeight > 0) {
    try {
      ftsRows = ftsStmt.all(ftsQuery) as any
    } catch (err) {
      logger().warn('hybrid', { msg: 'FTS search failed', meta: { query, err: String(err) } })
    }
  }

  // Rank FTS results (0 to N-1)
  const ftsRanks = new Map<string, number>()
  ftsRows.forEach((r, idx) => ftsRanks.set(r.chunk_id, idx))

  // 2. Vector Search
  const vs = getVectorStore()
  const vecRanks = new Map<string, number>()
  if (vs && vecWeight > 0) {
    try {
      const { model, isLocal } = resolveEmbeddings()
      let vecQuery: number[]
      if (isLocal) {
        const vecs = await embedBatchLocal([query])
        vecQuery = vecs[0]
      } else {
        vecQuery = await model!.embedQuery(query)
      }
      
      if (vecQuery && vecQuery.length > 0) {
        const results = vs.knn(new Float32Array(vecQuery), 100)
        results.forEach((r, idx) => vecRanks.set(r.chunkId, idx))
      }
    } catch (err) {
      logger().warn('hybrid', { msg: 'Vector search failed', meta: { query, err: String(err) } })
    }
  }

  // 3. RRF Combination
  const allIds = new Set([...ftsRanks.keys(), ...vecRanks.keys()])
  const scored: { chunk_id: string, score: number }[] = []

  for (const id of allIds) {
    if (!id) continue // skip null chunk_ids just in case old db has them
    const rFts = ftsRanks.get(id)
    const rVec = vecRanks.get(id)
    
    let score = 0
    if (rFts !== undefined && ftsWeight > 0) {
      score += ftsWeight * (1 / (K + rFts))
    }
    if (rVec !== undefined && vecWeight > 0) {
      score += vecWeight * (1 / (K + rVec))
    }
    
    scored.push({ chunk_id: id, score })
  }

  // Sort by combined score descending
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, limit)

  if (top.length === 0) return { items: [], total: 0, pending: false }

  // 4. Hydrate Results
  const ids = top.map(t => t.chunk_id)
  const placeholders = ids.map(() => '?').join(',')
  const hydrateStmt = db.prepare(`SELECT chunk_id, path, heading_path, body FROM chunks WHERE chunk_id IN (${placeholders})`)
  const rows = hydrateStmt.all(ids) as { chunk_id: string, path: string, heading_path: string, body: string }[]
  const rowMap = new Map(rows.map(r => [r.chunk_id, r]))

  const pathSet = new Set(rows.map(r => r.path))
  const paths = Array.from(pathSet)
  const pathPlaceholders = paths.map(() => '?').join(',')
  const summaryRows = db.prepare(`
    SELECT
      files.path, files.title, files.category, files.clipped_at,
      files.summary, files.frontmatter_json,
      json_extract(files.frontmatter_json, '$.tags') AS tags_json
    FROM files
    WHERE files.path IN (${pathPlaceholders})
  `).all(...paths) as SummaryRow[]
  const summaryMap = new Map(summaryRows.map(r => [r.path, r]))
  
  const items = top.map(t => {
    const r = rowMap.get(t.chunk_id)
    if (!r) return null
    const sr = summaryMap.get(r.path)
    if (!sr) return null
    
    let source: 'fts' | 'semantic' | 'hybrid' = 'hybrid'
    const hasFts = ftsRanks.has(t.chunk_id)
    const hasVec = vecRanks.has(t.chunk_id)
    if (hasFts && !hasVec) source = 'fts'
    if (!hasFts && hasVec) source = 'semantic'

    // naive snippeting: just truncate body
    const bodySnippet = r.body.length > 300 ? r.body.slice(0, 300) + '...' : r.body

    return {
      summary: rowToFileSummary(sr),
      body: escapeForSnippet(bodySnippet),
      heading_path: r.heading_path,
      score: t.score,
      source
    }
  }).filter((r): r is HybridSearchResultItem => r !== null)

  return { items, total: allIds.size, pending: false }
}
