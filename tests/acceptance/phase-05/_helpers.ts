import Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function makeIndexedDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE files (
      path TEXT PRIMARY KEY, title TEXT, summary TEXT, category TEXT, rating INTEGER,
      content_hash TEXT NOT NULL, mtime INTEGER NOT NULL, size_bytes INTEGER NOT NULL,
      frontmatter_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE file_tags (path TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (path, tag));
    CREATE VIRTUAL TABLE files_fts USING fts5(path UNINDEXED, title, body, tokenize='trigram');
  `)
  return db
}

export function makeGroveTmp(prefix = 'p5-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function seedMd(root: string, count: number, withFrontmatter = false): string[] {
  const paths: string[] = []
  mkdirSync(join(root, 'notes'), { recursive: true })
  for (let i = 0; i < count; i++) {
    const rel = `notes/note-${i.toString().padStart(3, '0')}.md`
    const body = withFrontmatter
      ? `---\ntitle: Note ${i}\ntags: [t${i % 5}]\n---\nbody ${i}`
      : `# note ${i}\ntext`
    writeFileSync(join(root, rel), body, 'utf8')
    paths.push(rel)
  }
  return paths
}

export function cleanup(root: string, db: Database.Database): void {
  rmSync(root, { recursive: true, force: true })
  db.close()
}

export function waitFor(predicate: () => boolean, timeoutMs = 5000, intervalMs = 100): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const id = setInterval(() => {
      if (predicate()) { clearInterval(id); resolve() }
      else if (Date.now() - start > timeoutMs) { clearInterval(id); reject(new Error(`timeout after ${timeoutMs}ms`)) }
    }, intervalMs)
  })
}
