import { pipeline, env } from '@huggingface/transformers'
import { Embeddings } from '@langchain/core/embeddings'
import { join } from 'node:path'

// 打包模型：resources/models/bge-small-zh-v1.5
env.localModelPath = join(__dirname, '../../resources/models')
env.allowRemoteModels = false
// @ts-ignore
env.backends.onnx.wasm.proxy = false

const MODEL_ID = 'bge-small-zh-v1.5'
const DIM = 512
let _pipe: any

export class LocalEmbeddings extends Embeddings {
  modelName: string

  constructor(opts: { modelName: string }) {
    super({})
    this.modelName = opts.modelName
  }

  async embedQuery(text: string): Promise<number[]> {
    const p = await getPipe()
    const out = await p(text, { pooling: 'mean', normalize: true })
    return Array.from(out.data as Float32Array)
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    const p = await getPipe()

    // Batch processing to prevent OOM
    const BATCH_SIZE = 4
    const allVecs: number[][] = []

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batchTexts = texts.slice(i, i + BATCH_SIZE)
      const out = await p(batchTexts, { pooling: 'mean', normalize: true })
      const vecs = splitBatch(Array.from(out.data as Float32Array), batchTexts.length, DIM)
      allVecs.push(...vecs)
    }
    return allVecs
  }
}

async function getPipe() {
  if (!_pipe) {
    _pipe = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' })
  }
  return _pipe
}

function splitBatch(flat: number[], n: number, dim: number): number[][] {
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    out.push(flat.slice(i * dim, (i + 1) * dim))
  }
  return out
}
