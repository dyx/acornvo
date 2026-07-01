import * as opsLog from '../services/ops/log'
import type { Op, OpsItem } from '@shared/ops-types'
import { IpcError } from '@shared/ipc-contract'
import { exportDiagnosticBundle } from '../obs/diagnostic'

export async function handleOpsList(input: unknown): Promise<{ items: OpsItem[]; total: number }> {
  if (!input || typeof input !== 'object') throw new IpcError('E_INVALID_ARGS', 'invalid input')
  const { limit, offset, op } = input as any
  if (typeof limit !== 'number' || typeof offset !== 'number') {
    throw new IpcError('E_INVALID_ARGS', 'limit and offset must be numbers')
  }
  return opsLog.list({ limit, offset, op: op as Op | undefined })
}

export const opsHandlers = {
  list: handleOpsList,
  exportDiagnostic: () => exportDiagnosticBundle()
}
