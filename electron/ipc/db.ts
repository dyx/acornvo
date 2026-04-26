import type { IpcContract, DbVersionInfo } from '@shared/ipc-contract'
import { dbService } from '../services/db'
import { listApplied } from '../services/db/migrations'
import { migrationsDir } from '../services/db/migrations/index'
import { integrityCheck as runIntegrityCheck } from '../services/db'

type DbHandlers = {
  [M in keyof IpcContract['db']]: IpcContract['db'][M] extends (...args: infer A) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

function version(): DbVersionInfo {
  const db = dbService.requireCurrent()
  return listApplied(db, migrationsDir())
}

function integrityCheck(): string {
  const db = dbService.requireCurrent()
  return runIntegrityCheck(db)
}

export const dbHandlers = {
  version,
  integrityCheck
} satisfies DbHandlers
