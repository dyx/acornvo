import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import updateFm from './update_frontmatter';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'phase16-uf-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const ctx = () => ({ sessionId: 's1', vaultRoot: root, signal: new AbortController().signal, log: () => {} });

describe('update_frontmatter', () => {
  it('rejects without reason -> E_MISSING_REASON', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\nrating: 3\n---\nbody');
    const mtime = statSync(join(root, 'a.md')).mtimeMs;
    const r: any = await updateFm.execute({ path: 'a.md', patch: { rating: 5 }, expectedMtime: mtime } as any, ctx());
    expect(r).toEqual({ ok: false, error: 'E_MISSING_REASON' });
  });

  it('merges patch into existing frontmatter and writes atomically', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\nrating: 3\n---\nbody');
    const mtime = statSync(join(root, 'a.md')).mtimeMs;
    const r: any = await updateFm.execute({ path: 'a.md', patch: { rating: 5, status: 'reviewed' }, reason: 'user asked', expectedMtime: mtime } as any, ctx());
    expect(r.ok).toBe(true);
    const txt = readFileSync(join(root, 'a.md'), 'utf8');
    expect(txt).toMatch(/rating: 5/);
    expect(txt).toMatch(/status: reviewed/);
    expect(txt).toMatch(/title: A/);
  });

  it('null in patch deletes the key', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\nrating: 3\nstatus: draft\n---\nbody');
    const mtime = statSync(join(root, 'a.md')).mtimeMs;
    const r: any = await updateFm.execute({ path: 'a.md', patch: { status: null }, reason: 'cleanup', expectedMtime: mtime } as any, ctx());
    expect(r.ok).toBe(true);
    const txt = readFileSync(join(root, 'a.md'), 'utf8');
    expect(txt).not.toMatch(/^status:/m);
    expect(txt).toMatch(/title: A/);
  });

  it('returns E_MTIME_CONFLICT when expectedMtime is stale', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\n---\n');
    const r: any = await updateFm.execute({ path: 'a.md', patch: { rating: 5 }, reason: 'r', expectedMtime: 0 } as any, ctx());
    expect(r).toMatchObject({ ok: false, error: 'E_MTIME_CONFLICT' });
  });

  it('returns E_PATH_ESCAPE on ../', async () => {
    const r: any = await updateFm.execute({ path: '../x', patch: {}, reason: 'r', expectedMtime: 0 } as any, ctx());
    expect(r).toEqual({ ok: false, error: 'E_PATH_ESCAPE' });
  });

  it('declares sideEffect=true and reason in parameters', () => {
    expect(updateFm.sideEffect).toBe(true);
    expect((updateFm.parameters as any).required).toEqual(expect.arrayContaining(['path', 'patch', 'reason']));
  });
});
