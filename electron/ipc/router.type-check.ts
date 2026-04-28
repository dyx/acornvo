/**
 * Compile-time self-check — never imported at runtime. If the exports drift
 * (e.g. `normalize` renamed or `IpcErrorShape` changed), this file fails to
 * compile and CI catches the drift.
 */
import { normalize, registerHandlers } from './router'
import { IpcError, type IpcErrorShape } from '@shared/ipc-contract'

const _shape: IpcErrorShape = normalize(new IpcError('E_NOT_FOUND', 'nope'))
const _shape2: IpcErrorShape = normalize(new Error('boom'))
const _shape3: IpcErrorShape = normalize('not-an-error')

// registerHandlers must accept the ping+log+project+db shape — exercise it structurally.
const _accepts: Parameters<typeof registerHandlers>[0] = {
  ping: { echo: (input: string) => input },
  log: {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  },
  project: {
    listRecent: () => [],
    createGrove: () => ({ id: '', path: '', name: '', color: 'acorn', sync_warning: null }),
    openGrove: () => ({
      status: 'opened',
      grove: { id: '', path: '', name: '', color: 'acorn', sync_warning: null }
    }),
    closeGrove: () => undefined,
    getCurrent: () => null,
    removeFromRecent: () => undefined,
    selectDirectory: () => null
  },
  db: {
    version: () => ({ user_version: 0, migrations_applied: [] }),
    integrityCheck: () => 'ok'
  },
  file: {
    read: () => ({
      content: '',
      eol: 'lf' as const,
      mtimeMs: 0,
      sha256: '',
      hadBom: false,
      originalEncoding: 'utf8' as const
    }),
    readParsed: () => ({
      content: '',
      eol: 'lf' as const,
      mtimeMs: 0,
      sha256: '',
      hadBom: false,
      originalEncoding: 'utf8' as const,
      frontmatter: {},
      body: '',
      rawYaml: ''
    }),
    write: () => ({ mtimeMs: 0, sha256: '' }),
    writeParsed: () => ({ mtimeMs: 0, sha256: '' }),
    stat: () => ({
      size: 0,
      mtimeMs: 0,
      ctimeMs: 0,
      isFile: false,
      isDirectory: false
    }),
    exists: () => false,
    list: () => [],
    rename: () => undefined
  },
  index: {
    status: () => ({ state: 'idle' as const, total: 0, scanned: 0 }),
    startScan: () => undefined,
    cancelScan: () => undefined
  }
}

export const _selfCheck = { _shape, _shape2, _shape3, _accepts } as const
