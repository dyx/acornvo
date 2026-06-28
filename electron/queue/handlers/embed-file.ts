import type { HandlerCtx, JobHandler } from '../runner'
import { resolveEmbeddings } from '../../ai/embeddings'
import { embedBatchLocal } from '../../ai/embed-worker'
import { getVectorStore } from '../../services/vector-store'
import { dbService } from '../../services/db'
import { logger } from '../../obs/logger'

export const embedFileHandler: JobHandler = async (ctx: HandlerCtx) => {
  const payload = ctx.job.payload as { path: string }
  const path = payload.path

  const db = dbService.getCurrent()
  if (!db) throw new Error('No grove open')

  const chunks = db.prepare('SELECT chunk_id, ordinal, heading_path, body, char_count FROM chunks WHERE path = ? ORDER BY ordinal ASC').all(path) as any[]
  
  if (chunks.length === 0) {
    logger().info('embed', { msg: 'skip empty file', meta: { path } })
    return { kind: 'ok' }
  }

  logger().info('embed', { msg: 'start embedding file', meta: { path, chunks: chunks.length } })

  const { model, dim, modelId, isLocal } = resolveEmbeddings()
  const texts = chunks.map(c => c.heading_path ? `${c.heading_path}\n${c.body}` : c.body)

  let vecs: number[][]
  try {
  if (isLocal) {
    vecs = await embedBatchLocal(texts)
  } else {
    vecs = await model!.embedDocuments(texts)
  }

  } catch (err) {
    logger().error('embed', { msg: 'file embedding failed', meta: { path, error: String(err) } })
    throw err
  }

  const tx = db.transaction(() => {
    const upd = db.prepare('UPDATE chunks SET model_id = ?, embedded_at = ? WHERE chunk_id = ?')
    for (let i = 0; i < chunks.length; i++) {
      if (vecs[i] && vecs[i].length === dim) {
        upd.run(modelId, new Date().toISOString(), chunks[i].chunk_id)
      }
    }
  })
  tx()

  const vs = getVectorStore()
  if (vs) {
    for (let i = 0; i < chunks.length; i++) {
      if (vecs[i] && vecs[i].length === dim) {
        vs.upsert(chunks[i].chunk_id, new Float32Array(vecs[i]))
      }
    }
  }

  logger().info('embed', { msg: 'file embedded successfully', meta: { path } })
  return { kind: 'ok' }
}
