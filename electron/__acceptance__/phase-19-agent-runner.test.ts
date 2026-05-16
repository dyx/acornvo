/**
 * Phase 19 acceptance — exercises the new LangGraph agent runner end-to-end
 * through the chat IPC surface. Supersedes the phase-16 acceptance suite,
 * which was written for the legacy `loop.ts` event contract (sequential
 * tools, wrapped tool results, `step.warning`).
 *
 * Mocked surfaces: `electron`, `services/db`, `settings/profile-key`,
 * `ai/model-factory`, `agent/agent-singleton` (the agent itself is a
 * scriptable queue of LangGraph stream entries).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AIMessage, ToolMessage } from '@langchain/core/messages';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  ipcMain: { handle: () => {}, on: () => {}, removeHandler: () => {} },
  app: { getPath: () => '/tmp', isPackaged: false, on: () => {} },
  BrowserWindow: class {},
}));
vi.mock('../services/db', () => ({
  dbService: {
    requireCurrent: vi.fn(),
    getCurrent: vi.fn(() => null),
    getCurrentGrovePath: vi.fn(() => '/vault'),
  },
}));
vi.mock('../settings/profile-key', () => ({
  getProfileDecryptedKey: vi.fn(() => 'sk-test'),
}));
vi.mock('../ai/model-factory', () => ({
  buildChatModel: vi.fn(() => ({})),
}));
vi.mock('../agent/agent-singleton', () => ({
  getAgentBuilder: vi.fn(),
}));

import { runMigrations } from '../services/db/migrations';
import { dbService } from '../services/db';
import { getAgentBuilder } from '../agent/agent-singleton';
import { createSessions } from '../agent/sessions';
import { createApproval } from '../agent/approval';
import { createConcurrencyGate } from '../agent/concurrency';
import { createChatHandlers, pendingInterrupts } from '../ipc/chat';
import type { AgentEvent } from '../../shared/agent-types';

type StreamEntry = [string, unknown];

interface MockAgent {
  queueEntries(entries: StreamEntry[]): void;
  streamCalls: Array<{ input: unknown; signal: AbortSignal }>;
}

interface Rig {
  db: Database.Database;
  events: AgentEvent[];
  agent: MockAgent;
  handlers: ReturnType<typeof createChatHandlers>;
  approval: ReturnType<typeof createApproval>;
  sessions: ReturnType<typeof createSessions>;
  vaultRoot: string;
  cleanup(): void;
  waitFor(pred: () => boolean, ms?: number): Promise<void>;
}

function setupRig(opts?: { globalCap?: number }): Rig {
  const db = new Database(':memory:');
  runMigrations(db, resolve(__dirname, '../services/db/migrations'));
  (dbService.requireCurrent as ReturnType<typeof vi.fn>).mockReturnValue(db);
  db.prepare(`
    INSERT INTO ai_provider_profiles (id, name, provider, base_url, model, temperature, top_p, max_tokens, api_key_ref, created_at, updated_at)
    VALUES ('p1', 'Test', 'openai', NULL, 'gpt-4o-mini', 0, 1, NULL, NULL, 't0', 't0')
  `).run();

  pendingInterrupts.clear();
  const vaultRoot = mkdtempSync(join(tmpdir(), 'phase19-acc-'));
  const events: AgentEvent[] = [];

  const queued: StreamEntry[][] = [];
  const streamCalls: Array<{ input: unknown; signal: AbortSignal }> = [];

  const agentInstance = {
    stream(input: unknown, config: { signal: AbortSignal }) {
      streamCalls.push({ input, signal: config.signal });
      const items = queued.shift() ?? [];
      return {
        async *[Symbol.asyncIterator]() {
          for (const e of items) yield e;
        },
      };
    },
  };
  (getAgentBuilder as ReturnType<typeof vi.fn>).mockReturnValue({
    buildForProfile: () => agentInstance,
  });

  const approval = createApproval();
  const concurrency = createConcurrencyGate({ globalCap: opts?.globalCap ?? 4 });
  const sessions = createSessions();
  const handlers = createChatHandlers({
    approval,
    concurrency,
    sessions,
    getTargets: () => [{ send: (_c: string, e: AgentEvent) => events.push(e), isDestroyed: () => false }],
    vaultRoot: () => vaultRoot,
    llmClient: { chatWithTools: vi.fn() },
  });

  return {
    db,
    events,
    agent: {
      queueEntries: (entries) => queued.push(entries),
      streamCalls,
    },
    handlers,
    approval,
    sessions,
    vaultRoot,
    cleanup: () => {
      rmSync(vaultRoot, { recursive: true, force: true });
      db.close();
      pendingInterrupts.clear();
    },
    waitFor: async (pred, ms = 2000) => {
      const t0 = Date.now();
      while (!pred()) {
        if (Date.now() - t0 > ms) throw new Error('waitFor timeout');
        await new Promise((r) => setTimeout(r, 5));
      }
    },
  };
}

describe('phase-19 acceptance: chat IPC drives new LangGraph runner (K1)', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setupRig();
  });
  afterEach(() => rig.cleanup());

  it('K1 ▶ search → tool → assistant → done; persists 4 messages', async () => {
    const aiToolCall = new AIMessage({
      content: '',
      id: 'ai-1',
      tool_calls: [{ id: 'tc-1', name: 'search_files', args: { query: 'attention' } }],
    });
    const toolMsg = new ToolMessage({
      content: JSON.stringify({ ok: true, data: { items: [{ path: 'a.md' }] } }),
      tool_call_id: 'tc-1',
      name: 'search_files',
    });
    const aiFinal = new AIMessage({
      content: 'Found a.md.',
      id: 'ai-2',
      usage_metadata: { input_tokens: 30, output_tokens: 4, total_tokens: 34 },
    });
    rig.agent.queueEntries([
      ['updates', { model: { messages: [aiToolCall] } }],
      ['updates', { tools: { messages: [toolMsg] } }],
      ['updates', { model: { messages: [aiFinal] } }],
    ]);

    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'search', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'));

    const types = rig.events.map((e) => e.type);
    expect(types).toContain('tool.start');
    expect(types).toContain('tool.result');
    expect(types[types.length - 1]).toBe('done');
    const start = rig.events.find((e) => e.type === 'tool.start');
    const result = rig.events.find((e) => e.type === 'tool.result');
    if (start?.type === 'tool.start') expect(start.callId).toBe('tc-1');
    if (result?.type === 'tool.result') expect(result.callId).toBe('tc-1');

    const persisted = await rig.handlers['sessions.getMessages'](sess.id);
    expect(persisted.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });

  it('K1 ▶ HITL approve: interrupt → tool.approval-needed → Command(resume) → done', async () => {
    // First stream emits the tool_calls AIMessage then the interrupt.
    const aiUf = new AIMessage({
      content: '',
      id: 'ai-1',
      tool_calls: [
        { id: 'tc-uf', name: 'update_frontmatter', args: { path: 'x.md', patch: { rating: 5 }, reason: 'r' } },
      ],
    });
    rig.agent.queueEntries([
      ['updates', { model: { messages: [aiUf] } }],
      [
        'updates',
        {
          __interrupt__: [
            {
              id: 'int-1',
              value: {
                actionRequests: [
                  { name: 'update_frontmatter', args: { path: 'x.md', patch: { rating: 5 }, reason: 'r' } },
                ],
              },
            },
          ],
        },
      ],
    ]);

    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'set rating', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some((e) => e.type === 'tool.approval-needed'));
    expect(pendingInterrupts.has('tc-uf')).toBe(true);

    // Resume queue: tool message + final assistant + done.
    const toolMsg = new ToolMessage({
      content: JSON.stringify({ ok: true, data: { mtime: 123 } }),
      tool_call_id: 'tc-uf',
      name: 'update_frontmatter',
    });
    const aiFinal = new AIMessage({
      content: 'Done.',
      id: 'ai-2',
      usage_metadata: { input_tokens: 5, output_tokens: 1, total_tokens: 6 },
    });
    rig.agent.queueEntries([
      ['updates', { tools: { messages: [toolMsg] } }],
      ['updates', { model: { messages: [aiFinal] } }],
    ]);

    await rig.handlers.approveTool('tc-uf');
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'));

    expect(pendingInterrupts.has('tc-uf')).toBe(false);
    const resumeCall = rig.agent.streamCalls[1];
    expect(resumeCall.input).toMatchObject({
      lg_name: expect.any(String),
      resume: { decisions: [{ type: 'approve' }] },
    });
  });

  it('K1 ▶ HITL edit: approveTool with editedArgs becomes an `edit` decision', async () => {
    const aiUf = new AIMessage({
      content: '',
      id: 'ai-1',
      tool_calls: [{ id: 'tc-e', name: 'update_frontmatter', args: { path: 'a.md', patch: { rating: 3 }, reason: 'r' } }],
    });
    rig.agent.queueEntries([
      ['updates', { model: { messages: [aiUf] } }],
      [
        'updates',
        {
          __interrupt__: [
            {
              id: 'int-e',
              value: {
                actionRequests: [
                  { name: 'update_frontmatter', args: { path: 'a.md', patch: { rating: 3 }, reason: 'r' } },
                ],
              },
            },
          ],
        },
      ],
    ]);
    rig.agent.queueEntries([]); // empty resume — we only need to inspect input.

    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'edit me', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some((e) => e.type === 'tool.approval-needed'));

    await rig.handlers.approveTool('tc-e', { editedArgs: { path: 'a.md', patch: { rating: 5 }, reason: 'r' } });
    await rig.waitFor(() => rig.agent.streamCalls.length >= 2);

    const resumeInput = rig.agent.streamCalls[1].input as { resume: { decisions: unknown[] } };
    expect(resumeInput.resume.decisions[0]).toMatchObject({
      type: 'edit',
      editedAction: {
        name: 'update_frontmatter',
        args: { path: 'a.md', patch: { rating: 5 }, reason: 'r' },
      },
    });
  });

  it('K1 ▶ HITL reject: rejectTool sends `reject` decision', async () => {
    const aiUf = new AIMessage({
      content: '',
      id: 'ai-1',
      tool_calls: [{ id: 'tc-r', name: 'update_frontmatter', args: { path: 'a.md', patch: { rating: 1 }, reason: 'r' } }],
    });
    rig.agent.queueEntries([
      ['updates', { model: { messages: [aiUf] } }],
      [
        'updates',
        {
          __interrupt__: [
            {
              id: 'int-r',
              value: {
                actionRequests: [
                  { name: 'update_frontmatter', args: { path: 'a.md', patch: { rating: 1 }, reason: 'r' } },
                ],
              },
            },
          ],
        },
      ],
    ]);
    rig.agent.queueEntries([]); // resume: nothing to emit

    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'reject me', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some((e) => e.type === 'tool.approval-needed'));

    await rig.handlers.rejectTool('tc-r');
    await rig.waitFor(() => rig.agent.streamCalls.length >= 2);

    const resumeInput = rig.agent.streamCalls[1].input as { resume: { decisions: unknown[] } };
    expect(resumeInput.resume.decisions[0]).toMatchObject({ type: 'reject' });
  });

  it('K1 ▶ cancel: cancelStream aborts the in-flight stream and stamps checkpoint_meta.canceled_at', async () => {
    // Stash the abort signal off the runner's stream call so cancelStream
    // has something to abort while the stream is still hanging.
    const holdOpen = new Promise<never>(() => {
      /* never resolves */
    });
    // Override the agent for this test only — yield the first entry, then await
    // a never-resolving promise so the runner is parked inside `for await`.
    const aiHang = new AIMessage({ content: 'thinking...', id: 'ai-1' });
    const agentInstance = {
      stream(_input: unknown, config: { signal: AbortSignal }) {
        rig.agent.streamCalls.push({ input: _input, signal: config.signal });
        return {
          async *[Symbol.asyncIterator]() {
            yield ['updates', { model: { messages: [aiHang] } }];
            await holdOpen;
          },
        };
      },
    };
    (getAgentBuilder as ReturnType<typeof vi.fn>).mockReturnValue({
      buildForProfile: () => agentInstance,
    });

    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    void rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'go', profileId: 'p1' });
    await rig.waitFor(() => rig.agent.streamCalls.length === 1);
    const abort = rig.agent.streamCalls[0].signal;
    await rig.handlers.cancelStream(sess.id);
    expect(abort.aborted).toBe(true);

    const row = rig.db
      .prepare('SELECT canceled_at FROM checkpoint_meta WHERE thread_id = ?')
      .get(sess.id) as { canceled_at: number | null } | undefined;
    expect(row?.canceled_at).toBeGreaterThan(0);
  });

  it('K1 ▶ concurrency gate: second sendUserMessage on same session returns E_BUSY', async () => {
    const ai = new AIMessage({ content: 'first', id: 'ai-1' });
    rig.agent.queueEntries([['updates', { model: { messages: [ai] } }]]);
    rig.agent.queueEntries([]);

    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    const p1 = rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'a', profileId: 'p1' });
    await expect(
      rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'b', profileId: 'p1' }),
    ).rejects.toMatchObject({ code: 'E_BUSY' });
    await p1;
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'));
  });

  it('K1 ▶ records ai_usage row with sessionId on done', async () => {
    const ai = new AIMessage({
      content: 'hi',
      id: 'ai-1',
      usage_metadata: { input_tokens: 12, output_tokens: 7, total_tokens: 19 },
    });
    rig.agent.queueEntries([['updates', { model: { messages: [ai] } }]]);

    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'hello', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'));

    const row = rig.db
      .prepare(
        'SELECT profile_id, model, prompt_tokens, completion_tokens, ok, session_id FROM ai_usage WHERE session_id = ?',
      )
      .get(sess.id) as
      | {
          profile_id: string;
          model: string;
          prompt_tokens: number;
          completion_tokens: number;
          ok: number;
          session_id: string;
        }
      | undefined;
    expect(row).toMatchObject({
      profile_id: 'p1',
      model: 'gpt-4o-mini',
      prompt_tokens: 12,
      completion_tokens: 7,
      ok: 1,
      session_id: sess.id,
    });
  });

  it('K1 ▶ persists tool_calls audit row on tool result', async () => {
    const aiToolCall = new AIMessage({
      content: '',
      id: 'ai-1',
      tool_calls: [{ id: 'tc-aud', name: 'list_tags', args: { limit: 10 } }],
    });
    const toolMsg = new ToolMessage({
      content: JSON.stringify({ ok: true, data: { tags: ['a'] } }),
      tool_call_id: 'tc-aud',
      name: 'list_tags',
    });
    const aiFinal = new AIMessage({ content: 'ok', id: 'ai-2' });
    rig.agent.queueEntries([
      ['updates', { model: { messages: [aiToolCall] } }],
      ['updates', { tools: { messages: [toolMsg] } }],
      ['updates', { model: { messages: [aiFinal] } }],
    ]);

    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' });
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'tags', profileId: 'p1' });
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'));

    const row = rig.db
      .prepare("SELECT tool_name, args_json, result_json FROM tool_calls WHERE session_id = ?")
      .get(sess.id) as { tool_name: string; args_json: string; result_json: string } | undefined;
    expect(row?.tool_name).toBe('list_tags');
    expect(JSON.parse(row?.args_json ?? '{}')).toEqual({ limit: 10 });
    expect(JSON.parse(row?.result_json ?? '{}')).toMatchObject({ ok: true });
  });
});
