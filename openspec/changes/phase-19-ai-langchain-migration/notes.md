# Phase 19 — AI LangChain Migration: Implementation Notes

## eventsource-parser usage (recorded by Task 1.2)

Grep command:

```
grep -rn "eventsource-parser" electron shared src
```

Output:

```
electron/ai/providers/anthropic.ts:1:import { createParser } from 'eventsource-parser';
electron/ai/providers/openai.ts:1:import { createParser } from 'eventsource-parser';
```

Findings:
- Only two import sites, both inside `electron/ai/providers/**`.
- These provider files are slated for deletion in Plan 5/6 (tasks 7.10–9.4).
- Therefore `eventsource-parser` must remain in `package.json` until those providers are removed; cleanup is deferred to Plan 6/6 (tasks 9.5/9.6).
- No usage outside `electron/ai/providers/**`, so the dependency can be removed permanently once the providers are gone (no other consumer keeps it alive).

## ajv / ajv-formats usage (verified by Task 1.2)

Grep command:

```
grep -rn "from 'ajv(-formats)?'|from \"ajv(-formats)?\"" electron shared src
```

Output:

```
electron/ai/parse-json.ts:1:import Ajv from 'ajv';
electron/ai/parse-json.ts:2:import addFormats from 'ajv-formats';
electron/ai/parse-tool-args.ts:1:import Ajv, { type ValidateFunction } from 'ajv';
electron/ai/prompts/review-clip.test.ts:3:import Ajv from 'ajv';
```

Consumers of those helpers (excluding tests):

```
electron/ai/client.ts:120:      const { parseAndValidate } = await import('./parse-json');
electron/ai/providers/openai.ts:4:import { parseAndValidate } from '../parse-tool-args';
```

Findings:
- All `ajv` / `ajv-formats` imports live inside `electron/ai/**`. No `shared/**` or `src/**` consumer was found (e.g. `shared/frontmatter-schema.ts` / `shared/schemas/` do not exist or do not import ajv).
- `electron/ai/parse-json.ts` is still consumed by `electron/ai/client.ts` (dynamic import) — i.e. by code outside `electron/ai/providers/**`. Its test (`prompts/review-clip.test.ts`) also pulls ajv directly.
- Therefore `ajv` and `ajv-formats` MUST be retained in `dependencies` for now. Whether they can be removed after the migration depends on whether `parse-json.ts` / `parse-tool-args.ts` survive Plan 5/6 — flag for re-evaluation during that cleanup phase, but do NOT remove during Plan 1/6.

Action: keep `ajv` and `ajv-formats` in `package.json`; revisit in Plan 6/6 cleanup once provider files are deleted and `parse-json.ts` / `parse-tool-args.ts` fate is decided.
