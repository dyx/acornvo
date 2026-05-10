import { IpcError } from '@shared/ipc-contract'
import { getAggregates } from '../obs/perf'
import { dbService } from '../services/db'

export const perfHandlers = {
  aggregates(area: string, windowMs: number): { count: number; p50: number; p95: number; successRate: number } {
    if (!area || typeof area !== 'string') {
      throw new IpcError('E_INVALID_ARGS', 'area is required')
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new IpcError('E_INVALID_ARGS', 'windowMs must be a positive number')
    }
    const db = dbService.requireCurrent()
    return getAggregates({ db, area, windowMs })
  }
}
