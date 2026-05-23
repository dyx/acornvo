import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import { makeIndexedDb, makeGroveTmp, seedMd, cleanup } from './_helpers'

describe('Acceptance 9.1 — full scan of 50-file grove', () => {
  let root: string
  let db: ReturnType<typeof makeIndexedDb>

  beforeEach(() => {
    _resetForTest()
    db = makeIndexedDb()
    _injectDbForTest(db)
    root = makeGroveTmp('p5-9.1-')
  })
  afterEach(() => {
    cleanup(root, db)
  })

  it('inserts 50 rows after scan', async () => {
    seedMd(root, 50, true)
    await startScan(root)
    const n = (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n
    expect(n).toBe(50)
  })

  it('files_fts matches files row count', async () => {
    seedMd(root, 50, true)
    await startScan(root)
    const fts = (db.prepare('SELECT COUNT(*) AS n FROM files_fts').get() as { n: number }).n
    expect(fts).toBe(50)
  })

  it('tags.usage_count reflects seeded tag distribution (10 per tag)', async () => {
    seedMd(root, 50, true)
    await startScan(root)
    const tags = db.prepare('SELECT name, usage_count FROM tags ORDER BY name').all()
    expect(tags).toEqual([
      { name: 't0', usage_count: 10 },
      { name: 't1', usage_count: 10 },
      { name: 't2', usage_count: 10 },
      { name: 't3', usage_count: 10 },
      { name: 't4', usage_count: 10 }
    ])
  })
})
