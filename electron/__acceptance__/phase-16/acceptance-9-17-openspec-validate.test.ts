import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('acceptance 9.17: openspec validate --strict', () => {
  it('exits 0 with no error output', () => {
    const out = execFileSync('npx', ['openspec', 'validate', 'phase-16-chat-agent-tools', '--strict'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(out).toMatch(/(valid|passed|ok)/i);
  });
});
