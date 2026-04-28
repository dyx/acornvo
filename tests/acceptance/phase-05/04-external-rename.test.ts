import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import { start as watcherStart, stop as watcherStop, onFileRenamed, _resetSelfWritesForTest } from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, cleanup, waitFor } from './_helpers'

describe('Acceptance 9.4 — external rename', () => {
  let root: string; let db: ReturnType<typeof makeIndexedDb>

  beforeEach(async () => {
    _resetForTest(); _resetSelfWritesForTest()
    db = makeIndexedDb(); _injectDbForTest(db)
    root = makeGroveTmp('p5-9.4-')
    writeFileSync(join(root, 'a.md'), 'identical body')
    await startScan(root)
    await watcherStart(root, db)
  })
  afterEach(async () => { await watcherStop(); cleanup(root, db) })

  it('updates files.path to b.md and emits fileRenamed (not delete+insert)', async () => {
    const renameEvents: { oldPath: string; newPath: string }[] = []
    onFileRenamed((p) => renameEvents.push(p))

    const beforeHash = (db.prepare('SELECT content_hash FROM files WHERE path=?').get('a.md') as { content_hash: string }).content_hash

    renameSync(join(root, 'a.md'), join(root, 'b.md'))

    await waitFor(() => {
      const row = db.prepare('SELECT path FROM files').get() as { path: string } | undefined
      return row?.path === 'b.md'
    }, 2000)

    const afterHash = (db.prepare('SELECT content_hash FROM files WHERE path=?').get('b.md') as { content_hash: string }).content_hash
    expect(afterHash).toBe(beforeHash)
    expect(renameEvents).toEqual([{ oldPath: 'a.md', newPath: 'b.md' }])
  })
})
