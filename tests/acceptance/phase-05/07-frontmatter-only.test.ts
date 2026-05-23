import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import {
  start as watcherStart,
  stop as watcherStop,
  _resetSelfWritesForTest
} from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, cleanup, waitFor } from './_helpers'

describe('Acceptance 9.7 — frontmatter-only change keeps content_hash', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(async () => {
    _resetForTest()
    _resetSelfWritesForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.7-')
    writeFileSync(join(root, 'a.md'), '---\nrating: 3\n---\nstable body')
    await startScan(root)
    await watcherStart(root, db)
  })
  afterEach(async () => {
    await watcherStop()
    cleanup(root, db)
  })

  it('keeps content_hash, updates frontmatter_json + rating', async () => {
    const before = db
      .prepare('SELECT content_hash, rating FROM files WHERE path=?')
      .get('a.md') as {
      content_hash: string
      rating: number
    }
    expect(before.rating).toBe(3)

    writeFileSync(join(root, 'a.md'), '---\nrating: 4\n---\nstable body')

    await waitFor(() => {
      const row = db.prepare('SELECT rating FROM files WHERE path=?').get('a.md') as
        | { rating: number }
        | undefined
      return row?.rating === 4
    }, 2000)

    const after = db.prepare('SELECT content_hash, rating FROM files WHERE path=?').get('a.md') as {
      content_hash: string
      rating: number
    }
    expect(after.content_hash).toBe(before.content_hash)
    expect(after.rating).toBe(4)
  })
})
