import { LocalEmbeddings } from './local-embeddings'

let emb: LocalEmbeddings

process.parentPort.on('message', async (e: { data: { batchId: string; texts: string[] } }) => {
  const { batchId, texts } = e.data
  try {
    if (!emb) {
      emb = new LocalEmbeddings({ modelName: 'bge-small-zh-v1.5' })
    }
    const vecs = await emb.embedDocuments(texts)
    process.parentPort.postMessage({ batchId, vecs, ok: true })
  } catch (err) {
    console.error(`[embed-worker] Error processing batch ${batchId}:`, err)
    process.parentPort.postMessage({ batchId, ok: false, error: String(err) })
  }
})
