import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { startScan, _injectDbForTest, _resetForTest } from '../../../electron/services/indexer'
import { start as watcherStart, stop as watcherStop, onFileChanged, registerSelfWrite, _resetSelfWritesForTest } from '../../../electron/services/watcher'
import { makeIndexedDb, makeGroveTmp, cleanup } from './_helpers'

describe('Acceptance 9.5 — self-write is filtered', () => {
  let root: string; let db: ReturnType<typeof makeIndexedDb>

  beforeEach(async () => {
    _resetForTest(); _resetSelfWritesForTest()
    db = makeIndexedDb(); _injectDbForTest(db)
    root = makeGroveTmp('p5-9.5-')
    writeFileSync(join(root, 'a.md'), 'v1')
    await startScan(root)
    await watcherStart(root, db)
  })
  afterEach(async () => { await watcherStop(); cleanup(root, db) })

  it('does not emit fileChanged when the change was registered as a self-write', async () => {
    const events: { path: string }[] = []
    onFileChanged((p) => events.push(p))

    const abs = join(root, 'a.md')
    writeFileSync(abs, 'v2-from-app')
    const mtime = statSync(abs).mtimeMs
    registerSelfWrite(abs, mtime)

    await new Promise((r) => setTimeout(r, 1200))

    expect(events.find((e) => e.path === 'a.md')).toBeUndefined()
  })
})
