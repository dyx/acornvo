import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

describe('003_drop_legacy_tables', () => {
  it('drops queue, usage, and chats tables', () => {
    const db = new Database(':memory:')
    
    // We need to simulate a DB that already has them first if we want to truly test the drop.
    // However, 001_schema.sql no longer creates them.
    // But since DROP TABLE IF EXISTS doesn't fail if they don't exist, we can just run all migrations
    // and assert they don't exist.
    
    // Let's create them manually to ensure 003 drops them
    db.exec('CREATE TABLE queue (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE usage (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE chats (id INTEGER PRIMARY KEY)')
    
    runMigrations(db, MIGRATIONS_DIR)
    
    const tables = (db.pragma('table_list') as { name: string }[]).map((t) => t.name)
    expect(tables).not.toContain('queue')
    expect(tables).not.toContain('usage')
    expect(tables).not.toContain('chats')
  })
})
