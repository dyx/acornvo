// electron/settings/store.ts
import { EventEmitter } from 'node:events'
import { IpcError } from '@shared/ipc-contract'
import type {
  SettingsNamespace,
  SettingsByNs,
  SettingsChangedPayload
} from '@shared/settings-types'
import { getGlobalDb } from '../services/global-db'
import { getDefault, isKnownNamespace } from './defaults'

interface SettingChangeEvent {
  ns: SettingsNamespace
  key: string
  newValue: unknown
  oldValue: unknown
}

const emitter = new EventEmitter()

function readNamespaceRaw(ns: SettingsNamespace): Record<string, unknown> {
  const db = getGlobalDb()
  const rows = db.prepare('SELECT key, value_json FROM settings WHERE ns = ?').all(ns) as {
    key: string
    value_json: string
  }[]
  const out: Record<string, unknown> = {}
  for (const r of rows) {
    out[r.key] = JSON.parse(r.value_json)
  }
  return out
}

function get<NS extends SettingsNamespace>(ns: NS): SettingsByNs[NS] {
  if (!isKnownNamespace(ns)) {
    throw new IpcError(
      'E_UNKNOWN_NAMESPACE',
      `E_UNKNOWN_NAMESPACE: unknown settings namespace: ${ns}`
    )
  }
  const raw = readNamespaceRaw(ns)
  return { ...getDefault(ns), ...raw } as SettingsByNs[NS]
}

function set<NS extends SettingsNamespace>(ns: NS, patch: Partial<SettingsByNs[NS]>): void {
  if (!isKnownNamespace(ns)) {
    throw new IpcError(
      'E_UNKNOWN_NAMESPACE',
      `E_UNKNOWN_NAMESPACE: unknown settings namespace: ${ns}`
    )
  }
  const db = getGlobalDb()
  const before = get(ns)
  const updatedAt = new Date().toISOString()
  const upsert = db.prepare(`
    INSERT INTO settings (ns, key, value_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(ns, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `)
  const events: SettingChangeEvent[] = []
  const tx = db.transaction((entries: [string, unknown][]) => {
    for (const [key, value] of entries) {
      const oldValue = (before as unknown as Record<string, unknown>)[key]
      // Idempotent: skip if shallow-equal via JSON encoding
      if (JSON.stringify(oldValue) === JSON.stringify(value)) continue
      upsert.run(ns, key, JSON.stringify(value), updatedAt)
      events.push({ ns, key, newValue: value, oldValue })
    }
  })
  tx(Object.entries(patch as Record<string, unknown>))
  for (const ev of events) emitter.emit('change', ev)
}

function onChange(listener: (ev: SettingChangeEvent) => void): () => void {
  emitter.on('change', listener)
  return () => emitter.off('change', listener)
}

/** Test-only: drop all listeners. */
function __resetSubscribers(): void {
  emitter.removeAllListeners('change')
}

/** Test-only: emit a change event without a DB write. */
function __emitForTest(event: SettingChangeEvent): void {
  emitter.emit('change', event)
}

/** Convenience for the broadcaster (Plan 2): emit shape matches the IPC payload. */
export type { SettingChangeEvent, SettingsChangedPayload }

export const settingsStore = {
  get,
  set,
  onChange,
  __resetSubscribers,
  __emitForTest
}
