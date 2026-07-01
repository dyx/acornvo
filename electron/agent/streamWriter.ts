import type { AgentEvent } from '../../shared/agent-types'
import { logger } from '../obs/logger'

export interface RendererTarget {
  send(channel: string, payload: unknown): void
  isDestroyed(): boolean
}

export interface StreamWriter {
  readonly channel: string
  write(e: AgentEvent): void
}

export function createStreamWriter(
  sessionId: string,
  getTargets: () => RendererTarget[]
): StreamWriter {
  const channel = `chat:stream:${sessionId}`
  return {
    channel,
    write(e) {
      const targets = getTargets()
      const live = targets.filter((w) => !w.isDestroyed())

      if (live.length === 0) {
        logger().warn('streamWriter', { msg: 'write: NO live targets — event will be dropped' })
      }
      for (const w of live) {
        w.send(channel, e)
      }
    }
  }
}
