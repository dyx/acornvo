import { createAgent, humanInTheLoopMiddleware } from 'langchain';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { agentTools } from './tools';
import { buildChatModel, type ResolvedProfile } from '../ai/model-factory';
import { dbService } from '../services/db';

type AgentInstance = ReturnType<typeof createAgent>;

interface SingletonHandle {
  buildForProfile: (profile: ResolvedProfile) => AgentInstance;
}

let handle: SingletonHandle | null = null;
let checkpointer: BaseCheckpointSaver | null = null;
let currentDbForAgent: unknown = null;

function getCheckpointer(): BaseCheckpointSaver {
  const db = dbService.requireCurrent();
  if (checkpointer && currentDbForAgent === db) return checkpointer;
  currentDbForAgent = db;
  checkpointer = new SqliteSaver(db as unknown as ConstructorParameters<typeof SqliteSaver>[0]);
  return checkpointer;
}

/**
 * Returns a builder that produces a LangGraph agent for a given profile.
 * The model is profile-specific (re-bind per call); the tools array and the
 * checkpointer are stable across profiles.
 *
 * The checkpointer is `SqliteSaver` over the same `better-sqlite3` instance
 * the app uses for everything else, so HITL state survives restarts.
 */
export function getAgentBuilder(): SingletonHandle {
  const db = dbService.requireCurrent();
  if (handle && currentDbForAgent === db) return handle;
  const cp = getCheckpointer();
  const hitl = humanInTheLoopMiddleware({
    interruptOn: {
      update_frontmatter: {
        allowedDecisions: ['approve', 'edit', 'reject'],
        description: 'update_frontmatter writes to disk and requires user confirmation.',
      },
    },
  });
  handle = {
    buildForProfile: (profile: ResolvedProfile) => {
      const model = buildChatModel(profile) as unknown as BaseChatModel;
      return createAgent({
        model,
        tools: agentTools as unknown as Parameters<typeof createAgent>[0]['tools'],
        middleware: [hitl] as unknown as Parameters<typeof createAgent>[0]['middleware'],
        checkpointer: cp,
      });
    },
  };
  return handle;
}

export function getCheckpointerInstance(): BaseCheckpointSaver {
  return getCheckpointer();
}

/** Test helper — reset the singleton (also clears the checkpointer). */
export function __resetAgentSingleton(): void {
  handle = null;
  checkpointer = null;
  currentDbForAgent = null;
}
