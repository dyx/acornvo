import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

function setup(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, MIGRATIONS_DIR)
  return db
}

function columns(db: Database.Database, table: string): string[] {
  return (db.pragma(`table_info('${table}')`) as { name: string }[]).map((c) => c.name)
}

function indexes(db: Database.Database, table: string): string[] {
  return (db.pragma(`index_list('${table}')`) as { name: string }[]).map((i) => i.name)
}

describe('001_schema', () => {
  it('migrations bump user_version (001 sets 1, 002 sets 2)', () => {
    const db = setup()
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(1)
  })

  // --- files ---
  it('creates files table', () => {
    const db = setup()
    expect(columns(db, 'files')).toEqual(
      expect.arrayContaining([
        'path',
        'title',
        'url',
        'category',
        'rating',
        'summary',
        'clipped_at',
        'reviewed_at',
        'mtime',
        'content_hash',
        'frontmatter_json',
        'size_bytes',
        'created_at',
        'updated_at'
      ])
    )
    expect(indexes(db, 'files')).toEqual(
      expect.arrayContaining(['idx_files_category', 'idx_files_rating', 'idx_files_content_hash'])
    )
  })


  // --- files_fts ---
  it('creates files_fts virtual table with trigram tokenizer', () => {
    const db = setup()
    const cols = db.prepare("PRAGMA table_info('files_fts')").all() as { name: string }[]
    expect(cols.map((c) => c.name)).toEqual(['path', 'title', 'body'])
  })

  // --- bookmarks ---
  it('creates bookmarks table (final schema)', () => {
    const db = setup()
    expect(columns(db, 'bookmarks')).toEqual(
      expect.arrayContaining([
        'id',
        'url',
        'title',
        'favicon',
        'tags_json',
        'created_at',
        'updated_at',
        'sort_order'
      ])
    )
    expect(indexes(db, 'bookmarks')).toEqual(
      expect.arrayContaining(['idx_bookmarks_created', 'idx_bookmarks_url'])
    )
  })


  // --- ops_log ---
  it('creates ops_log table', () => {
    const db = setup()
    expect(columns(db, 'ops_log')).toEqual(
      expect.arrayContaining(['id', 'op', 'path', 'ts', 'meta_json'])
    )
    expect(indexes(db, 'ops_log')).toEqual(
      expect.arrayContaining(['idx_ops_log_ts', 'idx_ops_log_op_ts'])
    )
  })

  // --- clips ---
  it('creates clips table', () => {
    const db = setup()
    expect(columns(db, 'clips')).toEqual(
      expect.arrayContaining([
        'id',
        'url',
        'path',
        'title',
        'site',
        'author',
        'published_at',
        'clipped_at',
        'excerpt',
        'content_length',
        'degraded',
        'created_at'
      ])
    )
    expect(indexes(db, 'clips')).toEqual(
      expect.arrayContaining(['idx_clips_clipped_at', 'idx_clips_site'])
    )
  })


  // --- jobs ---
  it('creates jobs table', () => {
    const db = setup()
    expect(columns(db, 'jobs')).toEqual(
      expect.arrayContaining([
        'id',
        'kind',
        'payload_json',
        'status',
        'attempts',
        'next_run_at',
        'last_error',
        'created_at',
        'updated_at'
      ])
    )
    expect(indexes(db, 'jobs')).toEqual(
      expect.arrayContaining(['idx_jobs_status_next_run', 'idx_jobs_kind_status'])
    )
  })


  // --- sessions ---
  it('creates sessions + session_messages + tool_calls tables', () => {
    const db = setup()
    expect(columns(db, 'sessions')).toEqual(
      expect.arrayContaining(['id', 'title', 'profile_id', 'created_at', 'updated_at'])
    )
    expect(indexes(db, 'sessions')).toContain('idx_sessions_updated')

    expect(columns(db, 'session_messages')).toEqual(
      expect.arrayContaining([
        'id',
        'session_id',
        'role',
        'content',
        'tool_calls_json',
        'tool_call_id',
        'created_at'
      ])
    )
    expect(indexes(db, 'session_messages')).toContain('idx_session_messages_session')

    expect(columns(db, 'tool_calls')).toEqual(
      expect.arrayContaining([
        'id',
        'session_id',
        'message_id',
        'tool_name',
        'args_json',
        'result_json',
        'approved',
        'started_at',
        'finished_at',
        'error'
      ])
    )
    expect(indexes(db, 'tool_calls')).toContain('idx_tool_calls_session')
  })


  // --- idempotency ---
  it('is idempotent', () => {
    const db = setup()
    expect(() => runMigrations(db, MIGRATIONS_DIR)).not.toThrow()
  })
})
