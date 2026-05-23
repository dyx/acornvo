import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../electron/services/db/migrations'
import { fullText } from '../../../electron/services/search/queries'
import { upsertFile, upsertFts } from '../../../electron/services/index-queries'
import { join } from 'node:path'

const migrationsDir = join(__dirname, '..', '..', '..', 'electron', 'services', 'db', 'migrations')

const RUN = process.env.RUN_PERF === '1'
const describeOrSkip = RUN ? describe : describe.skip

// 9.15 fullText P50 perf (RUN_PERF=1 to enable)
describeOrSkip('9.15 fullText P50 perf (RUN_PERF=1)', () => {
  it('P50 < 300ms on 10K files', () => {
    const db = new Database(':memory:')
    runMigrations(db, migrationsDir)

    const tx = db.transaction(() => {
      for (let i = 0; i < 10_000; i++) {
        const path = `n/${Math.floor(i / 100)}/${i}.md`
        upsertFile(db, {
          path,
          title: `T${i}`,
          summary: null,
          category: null,
          rating: null,
          content_hash: `h${i}`,
          mtime: 0,
          size_bytes: 0,
          frontmatter_json: null,
          created_at: 0,
          updated_at: 0
        })
        const rowid = (
          db.prepare('SELECT rowid FROM files WHERE path=?').get(path) as { rowid: number }
        ).rowid
        const body = i % 7 === 0 ? `注意力机制${i} 研究` : `attention mechanism ${i}`
        upsertFts(db, { rowid, path, title: `T${i}`, body })
      }
    })
    tx()

    const queries = ['注意力', 'attention', 'mechanism', '注意力 机制', '"注意力机制"']
    const samples: number[] = []
    for (let i = 0; i < 50; i++) {
      const q = queries[i % queries.length]
      const t0 = performance.now()
      fullText(db, q, { limit: 50 })
      samples.push(performance.now() - t0)
    }
    samples.sort((a, b) => a - b)
    const p50 = samples[Math.floor(samples.length / 2)]

    // eslint-disable-next-line no-console
    console.log('[perf] fullText P50:', p50.toFixed(2), 'ms across', samples.length, 'samples')
    expect(p50).toBeLessThan(300)
    db.close()
  }, 60_000)
})
