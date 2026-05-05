// phase-14: barrel — fully implemented in Task 5
import type Database from 'better-sqlite3'
import type { QueueRunner } from './runner'

export function bootstrapQueueRunner(_db: Database.Database): QueueRunner {
  throw new Error('Not implemented — see Task 5')
}
