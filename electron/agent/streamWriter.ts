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
      for (const w of getTargets()) {
        if (w.isDestroyed()) continue;
        w.send(channel, e);
      }
    },
  };
}
