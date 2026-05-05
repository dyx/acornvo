import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import readFile from './read_file';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'phase16-read-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const ctx = (vault = root) => ({ sessionId: 's1', vaultRoot: vault, signal: new AbortController().signal, log: () => {} });

describe('read_file tool', () => {
  it('reads frontmatter + body', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\nrating: 4\n---\nbody text\n');
    const r: any = await readFile.execute({ path: 'a.md' } as any, ctx());
    expect(r.ok).toBe(true);
    expect(r.data.frontmatter.title).toBe('A');
    expect(r.data.body).toContain('body text');
  });

  it('returns ok:false E_NOT_FOUND for missing file', async () => {
    const r: any = await readFile.execute({ path: 'missing.md' } as any, ctx());
    expect(r).toEqual({ ok: false, error: 'E_NOT_FOUND' });
  });

  it('returns E_PATH_ESCAPE on ../ traversal', async () => {
    const r: any = await readFile.execute({ path: '../etc/passwd' } as any, ctx());
    expect(r).toEqual({ ok: false, error: 'E_PATH_ESCAPE' });
  });

  it('truncates body > 60k and reports truncated:true', async () => {
    writeFileSync(join(root, 'big.md'), '---\ntitle: B\n---\n' + 'x'.repeat(70_000));
    const r: any = await readFile.execute({ path: 'big.md' } as any, ctx());
    expect(r.ok).toBe(true);
    expect(r.data.body.length).toBe(60_000);
    expect(r.data.truncated).toBe(true);
  });

  it('parameters require path', () => {
    expect(readFile.parameters).toMatchObject({ type: 'object', required: ['path'] });
    expect(readFile.sideEffect).toBe(false);
  });
});
