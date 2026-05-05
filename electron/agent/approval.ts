import { randomUUID } from 'node:crypto';
import type { ToolCall } from '../../shared/agent-types';

const TIMEOUT_MS = 30 * 60 * 1000;

interface Pending {
  callId: string;
  sessionId: string;
  toolCall: ToolCall;
  reason?: string;
  resolve: (r: { ok: true; args: unknown } | { ok: false; error: 'E_USER_REJECTED' | 'E_APPROVAL_TIMEOUT' | 'E_CANCELED' }) => void;
  timer: NodeJS.Timeout;
  createdAt: number;
}

export interface ApprovalGate {
  register(sessionId: string, toolCall: ToolCall, reason?: string): string;
  await(callId: string): Promise<{ ok: true; args: unknown } | { ok: false; error: 'E_USER_REJECTED' | 'E_APPROVAL_TIMEOUT' | 'E_CANCELED' }>;
  approve(callId: string, editedArgs?: unknown): void;
  reject(callId: string): void;
  cancelSession(sessionId: string): void;
  peek(callId: string): { sessionId: string; toolCall: ToolCall; reason?: string } | undefined;
  onRequested(cb: (e: { sessionId: string; callId: string; tool: string; args: unknown; reason?: string }) => void): () => void;
}

export function createApproval(): ApprovalGate {
  const pending = new Map<string, Pending>();
  const promises = new Map<string, Promise<any>>();
  const subscribers = new Set<(e: any) => void>();

  function emit(e: any) { for (const s of subscribers) s(e); }

  return {
    register(sessionId, toolCall, reason) {
      const callId = randomUUID();
      const p = new Promise<any>((resolve) => {
        const timer = setTimeout(() => {
          if (pending.has(callId)) { pending.delete(callId); promises.delete(callId); resolve({ ok: false, error: 'E_APPROVAL_TIMEOUT' }); }
        }, TIMEOUT_MS);
        pending.set(callId, { callId, sessionId, toolCall, reason, resolve, timer, createdAt: Date.now() });
      });
      promises.set(callId, p);
      emit({ sessionId, callId, tool: toolCall.name, args: toolCall.args, reason });
      return callId;
    },
    await(callId) {
      const p = promises.get(callId);
      if (!p) return Promise.resolve({ ok: false as const, error: 'E_CANCELED' });
      return p;
    },
    approve(callId, editedArgs) {
      const e = pending.get(callId);
      if (!e) throw new Error(`unknown callId: ${callId}`);
      pending.delete(callId);
      promises.delete(callId);
      clearTimeout(e.timer);
      e.resolve({ ok: true, args: editedArgs ?? e.toolCall.args });
    },
    reject(callId) {
      const e = pending.get(callId);
      if (!e) throw new Error(`unknown callId: ${callId}`);
      pending.delete(callId);
      promises.delete(callId);
      clearTimeout(e.timer);
      e.resolve({ ok: false, error: 'E_USER_REJECTED' });
    },
    cancelSession(sessionId) {
      for (const e of [...pending.values()]) {
        if (e.sessionId !== sessionId) continue;
        pending.delete(e.callId);
        promises.delete(e.callId);
        clearTimeout(e.timer);
        e.resolve({ ok: false, error: 'E_CANCELED' });
      }
    },
    peek(callId) {
      const e = pending.get(callId);
      return e ? { sessionId: e.sessionId, toolCall: e.toolCall, reason: e.reason } : undefined;
    },
    onRequested(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
  };
}

export const approvalGate = createApproval();
