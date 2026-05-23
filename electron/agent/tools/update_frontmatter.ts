import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { RunnableConfig } from '@langchain/core/runnables'
import { safeResolve } from '../../services/path-safety'
import { readFileDetect, writeWithVerify, normalizeForDisk } from '../../services/fs-atomic'
import { parseFile, stringify } from '../../services/frontmatter'
import { IpcError } from '../../../shared/ipc-contract'

const UpdateFrontmatterSchema = z.object({
  path: z.string().min(1).describe('Relative path within the grove.'),
  patch: z
    .record(z.string(), z.unknown())
    .describe(
      'Object whose keys will be merged into existing frontmatter; null values delete the key.'
    ),
  reason: z.string().min(1).describe('Why this change is being made (shown to the user).'),
  expectedMtime: z
    .number()
    .optional()
    .describe('Last-known file mtimeMs for optimistic locking. Get this from a prior read_file.')
})

function vaultRootFromConfig(config?: RunnableConfig): string {
  const root = (config?.configurable as { vaultRoot?: unknown } | undefined)?.vaultRoot
  if (typeof root !== 'string' || !root) throw new Error('vaultRoot missing from configurable')
  return root
}

function mergePatch(
  prev: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...prev }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k]
    else out[k] = v
  }
  return out
}

export const updateFrontmatterTool = tool(
  async (args, config) => {
    const vaultRoot = vaultRootFromConfig(config)
    if (!args.reason || !args.reason.trim()) {
      return { ok: false as const, error: 'E_MISSING_REASON' }
    }
    let abs: string
    try {
      abs = safeResolve(vaultRoot, args.path)
    } catch (e) {
      const err = e as { code?: string }
      const code =
        e instanceof IpcError && err.code === 'E_PERMISSION'
          ? 'E_PATH_ESCAPE'
          : (err.code ?? 'E_PATH_ESCAPE')
      return { ok: false as const, error: code }
    }

    let read: Awaited<ReturnType<typeof readFileDetect>>
    try {
      read = await readFileDetect(abs)
    } catch (e) {
      const err = e as { code?: string; message?: string }
      if (err.code === 'ENOENT' || err.code === 'E_NOT_FOUND') {
        return { ok: false as const, error: 'E_NOT_FOUND' }
      }
      return { ok: false as const, error: err.code ?? 'E_READ_FAILED', detail: err.message }
    }
    const parsed = parseFile(read.content)
    const merged = mergePatch(
      parsed.frontmatter as Record<string, unknown>,
      args.patch as Record<string, unknown>
    )
    const eol: 'lf' | 'crlf' = read.eol === 'crlf' ? 'crlf' : 'lf'
    const newContent = normalizeForDisk(stringify(merged, parsed.body), { eol })
    try {
      const w = await writeWithVerify(abs, newContent, {
        expectedMtime: args.expectedMtime,
        eol
      })
      return {
        ok: true as const,
        data: { path: args.path, mtimeMs: w.mtimeMs, sha256: w.sha256, frontmatter: merged }
      }
    } catch (e) {
      const err = e as { code?: string; message?: string; context?: unknown }
      if (e instanceof IpcError && err.code === 'E_MTIME_MISMATCH') {
        return { ok: false as const, error: 'E_MTIME_CONFLICT', detail: err.context }
      }
      return { ok: false as const, error: err.code ?? 'E_WRITE_FAILED', detail: err.message }
    }
  },
  {
    name: 'update_frontmatter',
    description:
      "Merge a JSON patch into a markdown file's YAML frontmatter. Setting a key to null deletes that key. ALWAYS provide a `reason`. The user will be asked to approve before this runs.",
    schema: UpdateFrontmatterSchema
  }
)

export default updateFrontmatterTool
