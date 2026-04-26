import { stat as fsStat, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import * as groveSvc from '../services/grove'
import { safeResolve } from '../services/path-safety'
import { readFileDetect, writeWithVerify } from '../services/fs-atomic'
import type { Frontmatter } from '@shared/frontmatter-schema'
import {
  IpcError,
  type FileListEntry,
  type FileListOptions,
  type FileReadParsedResult,
  type FileReadResult,
  type FileStat,
  type FileWriteOptions,
  type FileWriteResult
} from '@shared/ipc-contract'

function requireGroveRoot(): string {
  const grove = groveSvc.getCurrent()
  if (!grove) throw new IpcError('E_NOT_FOUND', 'no grove is currently open')
  return grove.path
}

export const fileHandlers = {
  async read(rel: string): Promise<FileReadResult> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    try {
      const r = await readFileDetect(abs)
      return {
        content: r.content,
        eol: r.eol,
        mtimeMs: r.mtimeMs,
        sha256: r.sha256,
        hadBom: r.hadBom,
        originalEncoding: r.originalEncoding
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new IpcError('E_NOT_FOUND', `${rel}: not found`)
      }
      throw err
    }
  },

  async readParsed(_rel: string): Promise<FileReadParsedResult> {
    throw new IpcError('E_INTERNAL', 'readParsed not yet implemented (phase-04 plan 3 task 10)')
  },

  async write(
    rel: string,
    content: string,
    opts: FileWriteOptions = {}
  ): Promise<FileWriteResult> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    return writeWithVerify(abs, content, opts)
  },

  async writeParsed(
    _rel: string,
    _frontmatter: Frontmatter,
    _body: string,
    _opts?: FileWriteOptions
  ): Promise<FileWriteResult> {
    throw new IpcError('E_INTERNAL', 'writeParsed not yet implemented (phase-04 plan 3 task 10)')
  },

  async stat(rel: string): Promise<FileStat> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    try {
      const s = await fsStat(abs)
      return {
        size: s.size,
        mtimeMs: s.mtimeMs,
        ctimeMs: s.ctimeMs,
        isFile: s.isFile(),
        isDirectory: s.isDirectory()
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new IpcError('E_NOT_FOUND', `${rel}: not found`)
      }
      throw err
    }
  },

  async exists(rel: string): Promise<boolean> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    try {
      await access(abs, constants.F_OK)
      return true
    } catch {
      return false
    }
  },

  async list(_dirRel: string, _opts: FileListOptions = {}): Promise<FileListEntry[]> {
    throw new IpcError('E_INTERNAL', 'list not yet implemented (phase-04 plan 3 task 8)')
  },

  async rename(_oldRel: string, _newRel: string): Promise<void> {
    throw new IpcError('E_INTERNAL', 'rename not yet implemented (phase-04 plan 3 task 9)')
  }
}
