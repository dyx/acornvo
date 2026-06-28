import { LocalEmbeddings } from './local-embeddings'

let emb: LocalEmbeddings

process.parentPort.on('message', async (e: { data: { batchId: string; texts: string[] } }) => {
  const { batchId, texts } = e.data
  try {
    console.log(`[embed-worker] Received batch ${batchId} with ${texts.length} texts`)
    if (!emb) {
      console.log(`[embed-worker] Initializing LocalEmbeddings model 'bge-small-zh-v1.5'...`)
      emb = new LocalEmbeddings({ modelName: 'bge-small-zh-v1.5' })
    }
    const vecs = await emb.embedDocuments(texts)
    console.log(`[embed-worker] Generated vectors for batch ${batchId}`)
    process.parentPort.postMessage({ batchId, vecs, ok: true })
  } catch (err) {
    console.error(`[embed-worker] Error processing batch ${batchId}:`, err)
    process.parentPort.postMessage({ batchId, ok: false, error: String(err) })
  }
})
