import type { Tool } from '../../../shared/agent-types';
import { safeResolve } from '../../services/path-safety';
import { readFileDetect } from '../../services/fs-atomic';
import { parseFile } from '../../services/frontmatter';
import { IpcError } from '../../../shared/ipc-contract';

const MAX_BODY = 60_000;

const tool: Tool<{ path: string }, unknown> = {
  name: 'read_file',
  description: 'Read a markdown file from the grove. Returns parsed frontmatter and body. Body is truncated to 60_000 chars; check `truncated` to know if more exists.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Relative path within the grove, e.g. "notes/a.md".' } },
    required: ['path'],
  },
  sideEffect: false,
  async execute(args, ctx) {
    let abs: string;
    try {
      abs = safeResolve(ctx.vaultRoot, args.path);
    } catch (e: any) {
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
    const body = parsed.body.length > MAX_BODY ? parsed.body.slice(0, MAX_BODY) : parsed.body;
    return { ok: true as const, data: { path: args.path, frontmatter: parsed.frontmatter, body, truncated: parsed.body.length > MAX_BODY, mtimeMs: read.mtimeMs } };
  },
};
export default tool;
