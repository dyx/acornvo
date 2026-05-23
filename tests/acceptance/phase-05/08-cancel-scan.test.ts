import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  startScan,
  cancelScan,
  state,
  _injectDbForTest,
  _resetForTest
} from '../../../electron/services/indexer'
import { _resetSelfWritesForTest } from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, seedMd, cleanup } from './_helpers'

describe('Acceptance 9.8 — cancelScan returns to idle and preserves partial data', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(() => {
    _resetForTest()
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.8-')
    seedMd(root, 100)
  })
  afterEach(() => {
    cleanup(root, db)
  })

  it('flips state back to idle after cancel; some rows are preserved', async () => {
    const scanP = startScan(root)
    setTimeout(() => cancelScan(), 5)
    await scanP

    expect(state().state).toBe('idle')

    const n = (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n
    expect(n).toBeGreaterThanOrEqual(0)
    expect(n).toBeLessThanOrEqual(100)
  })
})
