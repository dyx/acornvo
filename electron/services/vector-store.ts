import type Database from 'better-sqlite3'
import { dbService, isVecAvailable } from './db'

export interface VectorStore {
  upsert(chunkId: string, vec: Float32Array): void
  delete(chunkIds: string[]): void
  /** KNN：distance 越小越相似（cosine） */
  knn(query: Float32Array, k: number): { chunkId: string; distance: number }[]
}

export function createVecStore(db: Database.Database): VectorStore {
  // 预编译 statement 缓存
  const getRowIdStmt = db.prepare('SELECT rowid FROM chunks WHERE chunk_id = ?')
  const deleteStmt = db.prepare('DELETE FROM chunk_vectors WHERE rowid = ?')
  const insertStmt = db.prepare('INSERT INTO chunk_vectors(rowid, embedding) VALUES (?, ?)')
  const delStmt = db.prepare('DELETE FROM chunk_vectors WHERE rowid IN (SELECT rowid FROM chunks WHERE chunk_id IN (SELECT value FROM json_each(?)))')
  const knnStmt = db.prepare('SELECT c.chunk_id, v.distance FROM chunk_vectors v JOIN chunks c ON c.rowid = v.rowid WHERE v.embedding MATCH ? AND k=? ORDER BY v.distance')
  
  return {
    upsert: (id, v) => {
      const row = getRowIdStmt.get(id) as { rowid: number | bigint } | undefined
      if (row) {
        const rowId = BigInt(row.rowid)
        deleteStmt.run(rowId)
        insertStmt.run(rowId, Buffer.from(v.buffer, v.byteOffset, v.byteLength))
      }
    },
    delete: (ids) => {
      if (ids.length === 0) return
      delStmt.run(JSON.stringify(ids))
    },
    knn: (q, k) => {
      const rows = knnStmt.all(Buffer.from(q.buffer, q.byteOffset, q.byteLength), k) as { chunk_id: string; distance: number }[]
      return rows.map(r => ({ chunkId: r.chunk_id, distance: r.distance }))
    }
  }
}

/** 启动时探测；扩展未加载则返回 null → 上层自动纯 FTS */
export function getVectorStore(): VectorStore | null {
  if (!isVecAvailable()) return null
  try {
    return createVecStore(dbService.requireCurrent())
  } catch {
    return null
  }
}
