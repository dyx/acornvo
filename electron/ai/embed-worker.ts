import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { BGE_QUERY_INSTRUCTION } from './bge-instruction'

let worker: UtilityProcess | null = null

export function ensureEmbedWorker(): void {
  if (worker) return
  worker = utilityProcess.fork(join(__dirname, 'embed-worker-main.js'), [], {
    serviceName: 'acornvo-embed',
    stdio: 'pipe'
  })
  worker.stderr?.on('data', (d) => console.error(`[Worker STDERR] ${d}`))
  worker.on('exit', () => {
    worker = null
  })
}

export async function embedBatchLocal(texts: string[]): Promise<number[][]> {
  ensureEmbedWorker()
  const batchId = randomUUID()
  return new Promise((resolve, reject) => {
    let resolved = false
    const onMsg = (m: any) => {
      if (m && m.batchId === batchId) {
        resolved = true
        worker?.off('message', onMsg)
        worker?.off('exit', onExit)
        if (m.ok) resolve(m.vecs)
        else reject(new Error(m.error || 'unknown worker error'))
      }
    }
    const onExit = () => {
      if (!resolved) {
        resolved = true
        reject(new Error('embed worker exited unexpectedly'))
      }
    }
    worker!.on('message', onMsg)
    worker!.on('exit', onExit)
    worker!.postMessage({ batchId, texts })

    setTimeout(() => {
      if (!resolved) {
        resolved = true
        worker?.off('message', onMsg)
        worker?.off('exit', onExit)
        reject(new Error('embed timeout'))
      }
    }, 600_000) // 10 minutes timeout for large files on CPU
  })
}

export function disposeEmbedWorker(): void {
  if (worker) {
    worker.kill()
    worker = null
  }
}

export async function embedQueryLocal(query: string): Promise<number[]> {
  const vecs = await embedBatchLocal([BGE_QUERY_INSTRUCTION + query])
  return vecs[0]
}
