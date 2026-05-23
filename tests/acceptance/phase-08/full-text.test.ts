import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../electron/services/db/migrations'
import { fullText } from '../../../electron/services/search/queries'
import { upsertFile, upsertFts } from '../../../electron/services/index-queries'
import { join } from 'node:path'

const migrationsDir = join(__dirname, '..', '..', '..', 'electron', 'services', 'db', 'migrations')

function seedFtsDb(items: { path: string; title: string; body: string }[]): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db, migrationsDir)
  for (const it of items) {
    upsertFile(db, {
      path: it.path,
      title: it.title,
      summary: null,
      category: null,
      rating: null,
      content_hash: it.path,
      mtime: 0,
      size_bytes: it.body.length,
      frontmatter_json: null,
      created_at: 0,
      updated_at: 0
    })
    const rowid = (
      db.prepare('SELECT rowid FROM files WHERE path=?').get(it.path) as { rowid: number }
    ).rowid
    upsertFts(db, { rowid, path: it.path, title: it.title, body: it.body })
  }
  return db
}

// 9.5 — fullText cn search with <mark>
describe('9.5 fullText cn search', () => {
  it('hits "注意力" with <mark> wrap', () => {
    const db = seedFtsDb([
      { path: 'a.md', title: 'A', body: '研究 注意力 机制 的 文章' },
      { path: 'b.md', title: 'B', body: '无关内容' }
    ])
    const out = fullText(db, '注意力', { limit: 10, offset: 0 })
    expect(out.items.length).toBe(1)
    expect(out.items[0].summary.path).toBe('a.md')
    expect(out.items[0].snippet).toMatch(/<mark>/)
    db.close()
  })
})

// 9.6 — AND across two cn tokens
describe('9.6 fullText AND', () => {
  it('returns only files containing both tokens', () => {
    const db = seedFtsDb([
      { path: 'both.md', title: 'B', body: '注意力 计算机 研究' },
      { path: 'one.md', title: 'O', body: '只有注意力' },
      { path: 'two.md', title: 'T', body: '只有计算机' }
    ])
    const out = fullText(db, '注意力 计算机', { limit: 10, offset: 0 })
    expect(out.items.map((i) => i.summary.path)).toEqual(['both.md'])
    db.close()
  })
})

// 9.7 — quoted phrase
describe('9.7 fullText phrase', () => {
  it('quoted phrase returns only consecutive matches', () => {
    const db = seedFtsDb([
      { path: 'phrase.md', title: 'P', body: '注意力机制非常重要' },
      { path: 'split.md', title: 'S', body: '注意 力 加 机制' }
    ])
    const out = fullText(db, '"注意力机制"', { limit: 10, offset: 0 })
    expect(out.items.map((i) => i.summary.path)).toEqual(['phrase.md'])
    db.close()
  })
})

// 9.8 — stopword filter
describe('9.8 fullText stopword filter', () => {
  it('strips "的" and queries only "注意力"', () => {
    const db = seedFtsDb([
      { path: 'a.md', title: 'A', body: '注意力' },
      { path: 'b.md', title: 'B', body: '其他内容' }
    ])
    const withStop = fullText(db, '的 注意力', { limit: 10, offset: 0 })
    const withoutStop = fullText(db, '注意力', { limit: 10, offset: 0 })
    expect(withStop.items.map((i) => i.summary.path)).toEqual(
      withoutStop.items.map((i) => i.summary.path)
    )
    db.close()
  })
})

// 9.9 — single-token prefix match
describe('9.9 fullText single-token prefix', () => {
  it('"att" prefix matches "attention"', () => {
    const db = seedFtsDb([
      { path: 'a.md', title: 'A', body: 'attention is all you need' },
      { path: 'b.md', title: 'B', body: 'unrelated content' }
    ])
    const out = fullText(db, 'att', { limit: 10, offset: 0 })
    expect(out.items.length).toBe(1)
    expect(out.items[0].summary.path).toBe('a.md')
    db.close()
  })
})

// 9.10 — FTS5 syntax error
describe('9.10 fullText syntax error fallback', () => {
  it('returns empty without throwing on FTS5 reserved char', () => {
    const db = seedFtsDb([{ path: 'a.md', title: 'A', body: 'attention' }])
    const out = fullText(db, 'foo :', { limit: 10, offset: 0 })
    expect(out.items).toEqual([])
    expect(out.total).toBe(0)
    expect(out.pending).toBe(false)
    db.close()
  })
})
