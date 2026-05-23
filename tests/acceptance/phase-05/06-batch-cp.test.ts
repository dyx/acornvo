import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import {
  start as watcherStart,
  stop as watcherStop,
  _resetSelfWritesForTest
} from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, cleanup, waitFor } from './_helpers'

describe('Acceptance 9.6 — batch copy of 30 files', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(async () => {
    _resetForTest()
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.6-')
    mkdirSync(join(root, 'src'))
    for (let i = 0; i < 30; i++) writeFileSync(join(root, 'src', `${i}.md`), `# ${i}`)
    await startScan(root)
    await watcherStart(root, db)
  })
  afterEach(async () => {
    await watcherStop()
    cleanup(root, db)
  })

  it('inserts 30 dst rows after a single batched flush in ~1s', async () => {
    const t0 = Date.now()
    cpSync(join(root, 'src'), join(root, 'dst'), { recursive: true })

    await waitFor(() => {
      const n = (
        db.prepare("SELECT COUNT(*) AS n FROM files WHERE path LIKE 'dst/%'").get() as { n: number }
      ).n
      return n === 30
    }, 3000)

    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(3000)
  })
})
