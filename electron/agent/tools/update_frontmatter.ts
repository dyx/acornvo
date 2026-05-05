import type { Tool } from '../../../shared/agent-types';
import { safeResolve } from '../../services/path-safety';
import { readFileDetect, writeWithVerify, normalizeForDisk } from '../../services/fs-atomic';
import { parseFile, stringify } from '../../services/frontmatter';
import { IpcError } from '../../../shared/ipc-contract';

const tool: Tool<{ path: string; patch: Record<string, unknown>; reason: string; expectedMtime?: number }, unknown> = {
  name: 'update_frontmatter',
  description: 'Merge a JSON patch into a markdown file\'s YAML frontmatter. Setting a key to null deletes that key. ALWAYS provide a `reason`. The user will be asked to approve before this runs.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path within the grove.' },
      patch: { type: 'object', description: 'Object whose keys will be merged into existing frontmatter; null values delete the key.' },
      reason: { type: 'string', description: 'Why this change is being made (shown to the user).' },
      expectedMtime: { type: 'number', description: 'Last-known file mtimeMs for optimistic locking. Get this from a prior read_file.' },
    },
    required: ['path', 'patch', 'reason'],
  },
  sideEffect: true,
  async execute(args, ctx) {
    if (!args.reason || typeof args.reason !== 'string' || !args.reason.trim()) {
      return { ok: false as const, error: 'E_MISSING_REASON' };
    }
    let abs: string;
    try { abs = safeResolve(ctx.vaultRoot, args.path); }
    catch (e: any) {
      const code = e instanceof IpcError && e.code === 'E_PERMISSION' ? 'E_PATH_ESCAPE' : (e?.code ?? 'E_PATH_ESCAPE');
      return { ok: false as const, error: code };
    }

    let read;
    try { read = await readFileDetect(abs); }
    catch (e: any) {
      if (e?.code === 'ENOENT' || e?.code === 'E_NOT_FOUND') return { ok: false as const, error: 'E_NOT_FOUND' };
      return { ok: false as const, error: e?.code ?? 'E_READ_FAILED', detail: e?.message };
    }
    const parsed = parseFile(read.content);
    const merged = mergePatch(parsed.frontmatter as Record<string, unknown>, args.patch);
    const newContent = normalizeForDisk(stringify(merged, parsed.body), { eol: read.eol });
    try {
      const w = await writeWithVerify(abs, newContent, { expectedMtime: args.expectedMtime, eol: read.eol });
      return { ok: true as const, data: { path: args.path, mtimeMs: w.mtimeMs, sha256: w.sha256, frontmatter: merged } };
    } catch (e: any) {
      if (e instanceof IpcError && e.code === 'E_MTIME_MISMATCH') {
        return { ok: false as const, error: 'E_MTIME_CONFLICT', detail: e.context };
      }
      return { ok: false as const, error: e?.code ?? 'E_WRITE_FAILED', detail: e?.message };
    }
  },
};
export default tool;

function mergePatch(prev: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}
