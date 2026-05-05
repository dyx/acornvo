import { vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runMigrations } from '../../services/db/migrations';
import { dbService } from '../../services/db';
import { createSessions } from '../../agent/sessions';
import { createRegistry } from '../../agent/registry';
import { createApproval } from '../../agent/approval';
import { createConcurrencyGate } from '../../agent/concurrency';
import { bootstrapAgent } from '../../agent/bootstrap';
import { createChatHandlers } from '../../ipc/chat';
import type { ChatWithToolsResult } from '../../../shared/agent-types';

export interface Rig {
  db: Database.Database;
  vaultRoot: string;
  events: any[];
  llm: { chatWithTools: ReturnType<typeof vi.fn>; queue(r: any): void };
  handlers: ReturnType<typeof createChatHandlers>;
  registry: ReturnType<typeof createRegistry>;
  approval: ReturnType<typeof createApproval>;
  concurrency: ReturnType<typeof createConcurrencyGate>;
  sessions: ReturnType<typeof createSessions>;
  cleanup(): void;
  waitFor(pred: () => boolean, ms?: number): Promise<void>;
}

export function setup(opts?: { globalCap?: number }): Rig {
  const db = new Database(':memory:');
  runMigrations(db, resolve(__dirname, '../../services/db/migrations'));
  (dbService.requireCurrent as any).mockReturnValue(db);
  const vaultRoot = mkdtempSync(join(tmpdir(), 'phase16-acc-'));

  const events: any[] = [];
  const queue: any[] = [];
  const llm = {
    chatWithTools: vi.fn(async (): Promise<ChatWithToolsResult> => {
      const next = queue.shift();
      if (!next) return { text: '(no fixture)', toolCalls: [], finishReason: 'stop' };
      if (typeof next === 'function') return await next();
      return next;
    }),
    queue(r: any) { queue.push(r); },
  };

  const registry = createRegistry();
  bootstrapAgent(registry);
  const approval = createApproval();
  const concurrency = createConcurrencyGate({ globalCap: opts?.globalCap ?? 4 });
  const sessions = createSessions();
  const handlers = createChatHandlers({
    registry, approval, concurrency, sessions,
    getTargets: () => [{ send: (_c: string, e: any) => events.push(e), isDestroyed: () => false }] as any,
    vaultRoot: () => vaultRoot,
    llmClient: llm as any,
  });

  return {
    db, vaultRoot, events, llm, handlers, registry, approval, concurrency, sessions,
    cleanup: () => { rmSync(vaultRoot, { recursive: true, force: true }); db.close(); },
    waitFor: async (pred, ms = 2000) => {
      const t0 = Date.now();
      while (!pred()) {
        if (Date.now() - t0 > ms) throw new Error('waitFor timeout');
        await new Promise(r => setTimeout(r, 5));
      }
    },
  };
}
