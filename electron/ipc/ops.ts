import * as opsLog from '../services/ops/log'
import type { Op, OpsItem } from '@shared/ops-types'
import { exportDiagnosticBundle } from '../obs/diagnostic'

export async function handleOpsList(
  input: { limit: number; offset: number; op?: Op }
): Promise<{ items: OpsItem[]; total: number }> {
  return opsLog.list(input as any)
}

export const opsHandlers = {
  list: handleOpsList,
  exportDiagnostic: () => exportDiagnosticBundle()
}
