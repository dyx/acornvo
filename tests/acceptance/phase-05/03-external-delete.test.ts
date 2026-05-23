import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import {
  start as watcherStart,
  stop as watcherStop,
  onFileDeleted,
  _resetSelfWritesForTest
} from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, cleanup, waitFor } from './_helpers'

describe('Acceptance 9.3 — external delete', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(async () => {
    _resetForTest()
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.3-')
    writeFileSync(join(root, 'gone.md'), '# bye')
    await startScan(root)
    await watcherStart(root, db)
  })
  afterEach(async () => {
    await watcherStop()
    cleanup(root, db)
  })

  it('removes the row and emits fileDeleted', async () => {
    const events: { path: string }[] = []
    onFileDeleted((p) => events.push(p))

    rmSync(join(root, 'gone.md'))

    await waitFor(
      () => (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n === 0,
      2000
    )
    expect(events).toEqual([{ path: 'gone.md' }])
  })
})
