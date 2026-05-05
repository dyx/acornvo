import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { runMigrations } from '../services/db/migrations';

vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) },
}));
vi.mock('../ai/client', () => ({ llmClient: { chatWithTools: vi.fn() } }));

import { IpcError } from '../../shared/ipc-contract';
import { dbService } from '../services/db';
import { llmClient } from '../ai/client';
import { createChatHandlers } from './chat';
import { createApproval } from '../agent/approval';
import { createRegistry } from '../agent/registry';
import { createConcurrencyGate } from '../agent/concurrency';
import { createSessions } from '../agent/sessions';
import { bootstrapAgent } from '../agent/bootstrap';

let db: Database.Database;
let handlers: ReturnType<typeof createChatHandlers>;
let captured: any[];

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db, resolve(__dirname, '../services/db/migrations'));
  (dbService.requireCurrent as any).mockReturnValue(db);
  (llmClient.chatWithTools as any).mockReset();

  captured = [];
  const registry = createRegistry();
  bootstrapAgent(registry);
  const approval = createApproval();
  const gate = createConcurrencyGate({ globalCap: 4 });
  const sessionsDao = createSessions();
  handlers = createChatHandlers({
    registry,
    approval,
    concurrency: gate,
    sessions: sessionsDao,
    getTargets: () =>
      [{ send: (_c: string, e: any) => captured.push(e), isDestroyed: () => false }] as any,
    vaultRoot: () => '/vault',
    llmClient: llmClient as any,
  });
});

describe('chat IPC', () => {
  it('sessions.create + sessions.list round-trip', async () => {
    const a = await handlers['sessions.create']({ profileId: 'p1' });
    const list = await handlers['sessions.list']();
    expect(list.find(x => x.id === a.id)).toBeDefined();
  });

  it('sendUserMessage on missing session throws E_NOT_FOUND', async () => {
    try {
      await handlers.sendUserMessage({ sessionId: 'nope', text: 'hi', profileId: 'p1' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IpcError);
      expect((err as IpcError).code).toBe('E_NOT_FOUND');
    }
  });

  it('sendUserMessage starts a loop and emits done event on the stream channel', async () => {
    const sess = await handlers['sessions.create']({ profileId: 'p1' });
    (llmClient.chatWithTools as any).mockResolvedValueOnce({
      text: 'hello',
      toolCalls: [],
      finishReason: 'stop',
    });
    await handlers.sendUserMessage({ sessionId: sess.id, text: 'hi', profileId: 'p1' });
    await waitFor(() => captured.some(e => e.type === 'done'));
    expect(captured.some(e => e.type === 'message.appended')).toBe(true);
  });

  it('sendUserMessage twice in same session — second throws E_BUSY', async () => {
    const sess = await handlers['sessions.create']({ profileId: 'p1' });
    (llmClient.chatWithTools as any).mockImplementationOnce(
      () => new Promise(() => {}), // never resolves
    );
    await handlers.sendUserMessage({ sessionId: sess.id, text: 'hi', profileId: 'p1' });
    try {
      await handlers.sendUserMessage({ sessionId: sess.id, text: 'again', profileId: 'p1' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IpcError);
      expect((err as IpcError).code).toBe('E_BUSY');
    }
  });

  it('cancelStream aborts and emits canceled', async () => {
    const sess = await handlers['sessions.create']({ profileId: 'p1' });
    (llmClient.chatWithTools as any).mockImplementationOnce(async (opts: any) => {
      await new Promise((_res, rej) =>
        opts.signal.addEventListener('abort', () =>
          rej(Object.assign(new Error('abort'), { name: 'AbortError' })),
        ),
      );
      return { toolCalls: [], finishReason: 'stop' };
    });
    await handlers.sendUserMessage({ sessionId: sess.id, text: 'hi', profileId: 'p1' });
    await new Promise(r => setTimeout(r, 5));
    await handlers.cancelStream(sess.id);
    await waitFor(() => captured.some(e => e.type === 'canceled'));
  });

  it('subscribeStream returns the documented channel name', async () => {
    const r = await handlers.subscribeStream('abc');
    expect(r).toEqual({ ok: true, channel: 'chat:stream:abc' });
  });
});

async function waitFor(pred: () => boolean, ms = 1000) {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor timeout');
    await new Promise(r => setTimeout(r, 5));
  }
}
