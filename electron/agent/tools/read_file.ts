import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { RunnableConfig } from '@langchain/core/runnables'
import { safeResolve } from '../../services/path-safety'
import { readFileDetect } from '../../services/fs-atomic'
import { parseFile } from '../../services/frontmatter'
import { IpcError } from '../../../shared/ipc-contract'

const MAX_BODY = 60_000

const ReadFileSchema = z.object({
  path: z.string().min(1).describe('Relative path within the grove, e.g. "notes/a.md".')
})

function vaultRootFromConfig(config?: RunnableConfig): string {
  const root = (config?.configurable as { vaultRoot?: unknown } | undefined)?.vaultRoot
  if (typeof root !== 'string' || !root) throw new Error('vaultRoot missing from configurable')
  return root
}

export const readFileTool = tool(
  async ({ path: rel }, config) => {
    const vaultRoot = vaultRootFromConfig(config)
    let abs: string
    try {
      abs = safeResolve(vaultRoot, rel, { realpath: true })
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
    const body = parsed.body.length > MAX_BODY ? parsed.body.slice(0, MAX_BODY) : parsed.body
    return {
      ok: true as const,
      data: {
        path: rel,
        frontmatter: parsed.frontmatter,
        body,
        truncated: parsed.body.length > MAX_BODY,
        mtimeMs: read.mtimeMs
      }
    }
  },
  {
    name: 'read_file',
    description:
      'Read a markdown file from the grove. Returns parsed frontmatter and body. Body is truncated to 60_000 chars; check `truncated` to know if more exists.',
    schema: ReadFileSchema
  }
)

export default readFileTool
