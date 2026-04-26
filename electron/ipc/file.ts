import { lstat, mkdir, readdir, rename as fsRename, stat as fsStat, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, relative } from 'node:path'
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

  async list(dirRel: string, opts: FileListOptions = {}): Promise<FileListEntry[]> {
    const root = requireGroveRoot()
    const absDir = safeResolve(root, dirRel)
    const recursive = opts.recursive === true
    const includeHidden = opts.includeHidden === true
    const out: FileListEntry[] = []
    await walk(absDir)
    return out

    async function walk(curAbs: string): Promise<void> {
      let entries: string[]
      try {
        entries = await readdir(curAbs)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new IpcError('E_NOT_FOUND', `${dirRel}: not found`)
        }
        throw err
      }
      for (const name of entries) {
        if (!includeHidden && name.startsWith('.')) continue
        const childAbs = join(curAbs, name)
        let st
        try {
          st = await lstat(childAbs)
        } catch (err) {
          // Race with deletion — skip.
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw err
        }
        if (st.isSymbolicLink()) continue // policy: skip symlinks entirely
        const isFile = st.isFile()
        const isDirectory = st.isDirectory()
        const rel = relative(root, childAbs)
        out.push({
          rel,
          isFile,
          isDirectory,
          size: st.size,
          mtimeMs: st.mtimeMs
        })
        if (recursive && isDirectory) await walk(childAbs)
      }
    }
  },

  async rename(oldRel: string, newRel: string): Promise<void> {
    const root = requireGroveRoot()
    const absOld = safeResolve(root, oldRel)
    const absNew = safeResolve(root, newRel)
    await mkdir(dirname(absNew), { recursive: true })
    try {
      await fsRename(absOld, absNew)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new IpcError('E_NOT_FOUND', `${oldRel}: not found`)
      }
      throw err
    }
  },
}
