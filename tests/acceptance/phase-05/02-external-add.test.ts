import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import {
  start as watcherStart,
  stop as watcherStop,
  onFileChanged,
  _resetSelfWritesForTest
} from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, cleanup, waitFor } from './_helpers'

describe('Acceptance 9.2 — external add detected within 1s', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(async () => {
    _resetForTest()
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.2-')
    await startScan(root)
    await watcherStart(root, db)
  })
  afterEach(async () => {
    await watcherStop()
    cleanup(root, db)
  })

  it('inserts the new file within 1s and emits fileChanged', async () => {
    const events: { path: string }[] = []
    onFileChanged((p) => events.push(p))

    writeFileSync(join(root, 'new.md'), '# x')

    const t0 = Date.now()
    await waitFor(
      () => (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n === 1,
      2000
    )
    const elapsed = Date.now() - t0

    expect(elapsed).toBeLessThan(2000)
    expect(events.find((e) => e.path === 'new.md')).toBeDefined()
  })
})
