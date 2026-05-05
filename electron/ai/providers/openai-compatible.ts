import type { LlmError, LlmErrorCode } from '@shared/ai-types';
import { callProvider as callOpenai } from './openai';

function err(code: LlmErrorCode, message: string): LlmError & Error {
  const e = new Error(message) as LlmError & Error;
  (e as any).code = code;
  return e;
}

export async function callProvider(req: Parameters<typeof callOpenai>[0]) {
  if (!req.profile.baseUrl) {
    throw err('E_CONFIG', 'openai-compatible requires profile.baseUrl');
  }
  return callOpenai(req);
}
