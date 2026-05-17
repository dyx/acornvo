import type { AgentEvent } from '../../shared/agent-types';

export interface RendererTarget {
  send(channel: string, payload: unknown): void;
  isDestroyed(): boolean;
}

export interface StreamWriter {
  readonly channel: string;
  write(e: AgentEvent): void;
}

export function createStreamWriter(sessionId: string, getTargets: () => RendererTarget[]): StreamWriter {
  const channel = `chat:stream:${sessionId}`;
  return {
    channel,
    write(e) {
      const targets = getTargets();
      const live = targets.filter((w) => !w.isDestroyed());
      console.log('[streamWriter] write channel=%s type=%s targets=%d/%d', channel, (e as { type?: string }).type, live.length, targets.length);
      if (live.length === 0) {
        console.warn('[streamWriter] write: NO live targets — event will be dropped');
      }
      for (const w of live) {
        w.send(channel, e);
      }
    },
  };
}
