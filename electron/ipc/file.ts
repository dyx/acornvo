import { lstat, mkdir, readdir, rename as fsRename, stat as fsStat, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { shell } from 'electron'
import * as groveSvc from '../services/grove'
import { safeResolve } from '../services/path-safety'
import { parseFile, stringify } from '../services/frontmatter'
import { readFileDetect, writeWithVerify, writeFileAtomic } from '../services/fs-atomic'
import { createHash } from 'node:crypto'
import { registerSelfWrite } from '../services/watcher'
import { dbService } from '../services/db'
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

  async readParsed(rel: string): Promise<FileReadParsedResult> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    let r
    try {
      r = await readFileDetect(abs)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new IpcError('E_NOT_FOUND', `${rel}: not found`)
      }
      throw err
    }
    const parsed = parseFile(r.content)
    let clip: { id: number } | undefined
    try {
      clip = dbService.requireCurrent().prepare('SELECT rowid as id FROM files WHERE path = ?').get(rel) as
        | { id: number }
        | undefined
    } catch {
      clip = undefined
    }
    return {
      content: r.content,
      eol: r.eol,
      mtimeMs: r.mtimeMs,
      sha256: r.sha256,
      hadBom: r.hadBom,
      originalEncoding: r.originalEncoding,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      rawYaml: parsed.rawYaml,
      clipId: clip?.id ?? null
    }
  },

  async write(rel: string, content: string, opts: FileWriteOptions = {}): Promise<FileWriteResult> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    // opts.force / opts.expectedMtime / opts.eol all flow through to writeWithVerify,
    // which is responsible for the mtime guard and force-write audit.
    const result = await writeWithVerify(abs, content, opts)
    return result
  },

  async writeParsed(
    rel: string,
    frontmatter: Frontmatter,
    body: string,
    opts: FileWriteOptions & { rawYaml?: string } = {}
  ): Promise<FileWriteResult> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    const md = stringify(frontmatter, body, opts.rawYaml)
    return writeWithVerify(abs, md, opts)
  },

  async writeBinary(rel: string, data: Uint8Array): Promise<FileWriteResult> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    await writeFileAtomic(abs, data)
    const expectedSha = createHash('sha256').update(data).digest('hex')
    const finalStat = await fsStat(abs)
    return { mtimeMs: finalStat.mtimeMs, sha256: expectedSha }
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

  async openExternal(rel: string): Promise<{ ok: true }> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    const result = await shell.openPath(abs)
    if (result !== '') {
      throw new IpcError('E_INTERNAL', `openExternal failed: ${result}`)
    }
    return { ok: true }
  },

  async openContainingDir(rel: string): Promise<{ ok: true } | { ok: false; reason: 'missing' }> {
    const root = requireGroveRoot()
    const abs = safeResolve(root, rel)
    try {
      await access(dirname(abs))
    } catch {
      return { ok: false, reason: 'missing' }
    }
    shell.showItemInFolder(abs)
    return { ok: true }
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
  }
}
