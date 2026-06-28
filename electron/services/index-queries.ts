import type Database from 'better-sqlite3'
import { segment } from './search/jiebaSegment'

export interface FileRow {
  path: string
  content_hash: string
  mtime: number
  size_bytes: number
  frontmatter_json: string | null
  created_at: number
  updated_at: number
}

export type UpsertResult = 'inserted' | 'updated' | 'unchanged'

export function upsertFile(db: Database.Database, row: FileRow): UpsertResult {
  const existing = db
    .prepare(
      'SELECT content_hash, mtime, size_bytes FROM files WHERE path=?'
    )
    .get(row.path) as
    | {
        content_hash: string
        mtime: number
        size_bytes: number
      }
    | undefined

  if (
    existing &&
    existing.content_hash === row.content_hash &&
    existing.mtime === row.mtime &&
    existing.size_bytes === row.size_bytes
  ) {
    return 'unchanged'
  }

  db.prepare(
    `INSERT INTO files
       (path, content_hash, mtime, size_bytes, frontmatter_json, created_at, updated_at)
       VALUES (@path, @content_hash, @mtime, @size_bytes, @frontmatter_json, @created_at, @updated_at)
     ON CONFLICT(path) DO UPDATE SET
       content_hash = excluded.content_hash,
       mtime = excluded.mtime,
       size_bytes = excluded.size_bytes,
       frontmatter_json = excluded.frontmatter_json,
       updated_at = excluded.updated_at`
  ).run(row)

  return existing ? 'updated' : 'inserted'
}

import { getVectorStore, type VectorStore } from './vector-store'

export function deleteFile(db: Database.Database, path: string): void {
  const vs = getVectorStore()
  const tx = db.transaction(() => {
    const ids = db.prepare('SELECT chunk_id FROM chunks WHERE path=?').all(path) as { chunk_id: string }[]
    if (vs && ids.length) vs.delete(ids.map(r => r.chunk_id))
    db.prepare('DELETE FROM chunks WHERE path=?').run(path)
    db.prepare('DELETE FROM files_fts WHERE path=?').run(path)
    db.prepare('DELETE FROM files WHERE path=?').run(path)
  })
  tx()
}

export function renameFile(db: Database.Database, oldPath: string, newPath: string): void {
  const tx = db.transaction(() => {
    db.prepare('UPDATE files SET path=? WHERE path=?').run(newPath, oldPath)
    db.prepare('UPDATE files_fts SET path=? WHERE path=?').run(newPath, oldPath)
    db.prepare('UPDATE chunks SET path=? WHERE path=?').run(newPath, oldPath)
  })
  tx()
}

import { MarkdownChunk } from './chunker'

/** Escape HTML-special chars so SQLite snippet wrappers (<mark></mark>) are unambiguous. */
export function escapeForFts(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function upsertFts(db: Database.Database, path: string, title: string, chunks: MarkdownChunk[]): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM files_fts WHERE path=?').run(path)
    const insertStmt = db.prepare('INSERT INTO files_fts(chunk_id, path, heading_path, title, body) VALUES (?, ?, ?, ?, ?)')
    for (const chunk of chunks) {
      const spacedTitle = segment(title).join(' ')
      const spacedBody = segment(chunk.body).join(' ')
      insertStmt.run(chunk.id, path, chunk.heading_path, spacedTitle, escapeForFts(spacedBody))
    }
  })
  tx()
}

export function upsertChunks(
  db: Database.Database, path: string, chunks: MarkdownChunk[],
  vecs: (Float32Array | null)[], modelId: string, dim: number, vs: VectorStore | null
): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM chunks WHERE path=?').run(path)
    const ins = db.prepare('INSERT INTO chunks(chunk_id,path,ordinal,heading_path,body,char_count,model_id,embedded_at) VALUES(?,?,?,?,?,?,?,?)')
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      const has = vecs[i] && vecs[i]!.length === dim
      ins.run(c.id, path, c.ordinal, c.heading_path, c.body, c.char_count, has ? modelId : null, has ? new Date().toISOString() : null)
      if (has && vs) vs.upsert(c.id, vecs[i]!)
    }
  })
  tx()
}

export function listAllPaths(db: Database.Database): Set<string> {
  const rows = db.prepare('SELECT path FROM files').all() as { path: string }[]
  return new Set(rows.map((r) => r.path))
}



export interface UpsertWithBodyDelta {
  result: UpsertResult
  bodyChanged: boolean
}

/** Like upsertFile but also returns whether the body content changed (content_hash diff). */
export function upsertFileWithBodyDelta(db: Database.Database, row: FileRow): UpsertWithBodyDelta {
  const existing = db.prepare('SELECT content_hash FROM files WHERE path=?').get(row.path) as
    | { content_hash: string }
    | undefined

  const bodyChanged = !existing || existing.content_hash !== row.content_hash
  const result = upsertFile(db, row)
  return { result, bodyChanged }
}

