import { createAgent } from 'langchain';
import { MemorySaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { agentTools } from './tools';
import { buildChatModel, type ResolvedProfile } from '../ai/model-factory';

type AgentInstance = ReturnType<typeof createAgent>;

interface SingletonHandle {
  buildForProfile: (profile: ResolvedProfile) => AgentInstance;
}

let handle: SingletonHandle | null = null;

/**
 * Returns a builder that produces a LangGraph agent for a given profile.
 * The model is profile-specific (re-bind per call); the tools array and the
 * checkpointer are stable across profiles.
 *
 * Plan 4 swaps `MemorySaver` for `SqliteSaver` and adds HITL middleware.
 */
export function getAgentBuilder(): SingletonHandle {
  if (handle) return handle;
  const checkpointer = new MemorySaver();
  handle = {
    buildForProfile: (profile: ResolvedProfile) => {
      const model = buildChatModel(profile) as unknown as BaseChatModel;
      return createAgent({
        model,
        tools: agentTools as unknown as Parameters<typeof createAgent>[0]['tools'],
        checkpointer,
      });
    },
  };
  return handle;
}

/** Test helper — reset the singleton. */
export function __resetAgentSingleton(): void {
  handle = null;
}
