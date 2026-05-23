import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../electron/services/db/migrations'
import { quickSwitch } from '../../../electron/services/search/queries'
import { join } from 'node:path'

const migrationsDir = join(__dirname, '..', '..', '..', 'electron', 'services', 'db', 'migrations')

function seedDb(rows: { path: string; title: string; clipped_at?: string }[]): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db, migrationsDir)
  const insert = db.prepare(
    'INSERT INTO files (path, title, mtime, content_hash, clipped_at, size_bytes, created_at, updated_at) VALUES (?, ?, 0, ?, ?, 0, 0, 0)'
  )
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    insert.run(
      r.path,
      r.title,
      r.path,
      r.clipped_at ?? `2025-${String((i % 12) + 1).padStart(2, '0')}-01`
    )
  }
  return db
}

// 9.3 — quickSwitch perf
describe('9.3 quickSwitch perf', () => {
  it('returns within 60ms on 10K rows', () => {
    const rows: { path: string; title: string }[] = []
    for (let i = 0; i < 10_000; i++) {
      rows.push({ path: `n/${i}.md`, title: i % 100 === 0 ? `attention ${i}` : `other ${i}` })
    }
    const db = seedDb(rows)
    const start = performance.now()
    const out = quickSwitch(db, 'attention', { limit: 10 })
    const elapsed = performance.now() - start
    expect(out.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(60)
    db.close()
  })

  it('cn substring on title', () => {
    const db = seedDb([
      { path: 'a.md', title: '注意力机制综述', clipped_at: '2025-04-01' },
      { path: 'b.md', title: '其他笔记', clipped_at: '2025-04-02' }
    ])
    const items = quickSwitch(db, '注意力', { limit: 10 })
    expect(items.map((i) => i.path)).toEqual(['a.md'])
    db.close()
  })

  it('priority sort: exact > prefix > contains > path', () => {
    const db = seedDb([
      { path: 'projects/attention.md', title: 'unrelated', clipped_at: '2025-01-01' },
      { path: 'old/x.md', title: 'contains attention here', clipped_at: '2025-03-01' },
      { path: 'a.md', title: 'attention is all you need', clipped_at: '2025-02-01' },
      { path: 'b.md', title: 'attention', clipped_at: '2025-04-01' }
    ])
    const items = quickSwitch(db, 'attention', { limit: 10 })
    // Priority: exact title match first
    expect(items[0].path).toBe('b.md')
    db.close()
  })
})
