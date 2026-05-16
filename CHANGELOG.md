# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Highlights — Phase 19: AI core migration to LangChain v1 + LangGraph v1

The entire AI link (reviewer + chat agent) has been rewritten on top of
LangChain v1 and LangGraph v1. The migration is internal — all IPC channels
(`chat.*`, `ai.*`) keep their existing signatures, with one additive change.

### Added

- **Restart recovery for pending HITL approvals.** A new startup hook scans
  LangGraph SqliteSaver checkpoints for unresolved `__interrupt__` records
  and re-emits `tool.approval-needed` once the renderer is ready
  (`electron/agent/startup-recovery.ts`).
- **24-hour checkpointer sweeper.** Idle and canceled agent threads are
  garbage-collected from the SqliteSaver tables 24 hours after their last
  activity (`electron/agent/checkpointer-sweeper.ts`, hourly tick, `.unref()`).
- **Additive `callId` on `tool.start` / `tool.result` events** in
  `shared/agent-types.ts`. Renderers (phase-20 `bubbleSelectors`) can use it
  to fold parallel tool calls under a single bubble. Older renderers ignore
  the field — no breaking change.
- **`AIMessage.usage_metadata`-based token accounting** via the new
  `rowFromUsageMetadata` / `writeUsage` helpers in `electron/ai/usage.ts`.

### Changed

- **Reviewer.** `electron/ai/reviewer.ts` now uses
  `buildChatModel(profile).withStructuredOutput(AiReviewSchema).invoke(...)`.
  Code-fence stripping, Ajv validation, and manual JSON repair are gone —
  LangChain handles structured output natively. Error mapping is preserved
  via the new `normalizeLLMError` helper.
- **Agent.** `electron/agent/runner.ts` replaces the hand-rolled ReAct loop.
  It calls `agent.stream({ messages: [...history] }, { configurable, streamMode })`
  and feeds events through `stream-translator.ts` (8 mapping scenarios).
  Tool execution, interrupts, and resumption are all handled by LangGraph.
- **Parallel tool calls now execute concurrently** (LangGraph default). The
  `step.warning` event from the old loop is no longer emitted.
- **HITL approvals** flow through `humanInTheLoopMiddleware` and resume via
  `agent.invoke(new Command({ resume: { decisions: [...] } }))`. IPC
  `approveTool` / `rejectTool` signatures are unchanged.
- **Ollama tool-fallback removed.** LangChain's native tool calling is used
  for all four providers. The pre-tool-call JSON repair path is gone.

### Removed

- `electron/ai/providers/{openai,anthropic,ollama,openai-compatible}.ts`
  and tests (~1,061 LOC) — superseded by `electron/ai/model-factory.ts`.
- `electron/ai/client.ts` + `parse-json.ts` + `parse-tool-args.ts` and tests
  (~600 LOC) — superseded by `withStructuredOutput` and Zod schemas on the
  tool definitions themselves.
- `electron/agent/loop.ts` + `approval.ts` + `registry.ts` + `bootstrap.ts`
  and tests (~700 LOC) — superseded by `runner.ts` + HITL middleware +
  declarative tool exports in `electron/agent/tools/index.ts`.
- `eventsource-parser` dependency — no `.ts` file imports it after the
  provider deletion.

### Internals

- New dependencies: `langchain`, `@langchain/core`, `@langchain/openai`,
  `@langchain/anthropic`, `@langchain/ollama`, `@langchain/langgraph`,
  `@langchain/langgraph-checkpoint-sqlite`.
- New migration `002_langgraph_checkpoints.sql` adds `checkpoints`, `writes`,
  and `checkpoint_meta` tables. `user_version` bumped 1 → 2.
- 5 agent tools rewritten with Zod schemas via `tool()` from
  `@langchain/core/tools` (`search_files`, `read_file`, `list_tags`,
  `update_frontmatter`, `clip_summary`).
- Net change: roughly 1,900 LOC of bespoke code removed in favor of
  framework primitives.

### Acceptance

- 18-test phase-19 acceptance suite (`electron/__acceptance__/phase-19-agent-runner.test.ts`)
  covers K1 contract conformance: streaming, tool execution, approval flow,
  cancellation, busy/global-busy gates, attachment context, etc.
- Reviewer, runner, stream-translator, HITL middleware, sweeper, and
  startup-recovery all have dedicated unit tests.
