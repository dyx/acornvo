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
  it('sets user_version to 1', () => {
    const db = setup()
    expect(db.pragma('user_version', { simple: true })).toBe(1)
  })

  // --- files ---
  it('creates files table', () => {
    const db = setup()
    expect(columns(db, 'files')).toEqual(expect.arrayContaining([
      'path', 'title', 'url', 'category', 'rating', 'summary',
      'clipped_at', 'reviewed_at', 'mtime', 'content_hash', 'frontmatter_json',
      'size_bytes', 'created_at', 'updated_at'
    ]))
    expect(indexes(db, 'files')).toEqual(
      expect.arrayContaining(['idx_files_category', 'idx_files_rating', 'idx_files_content_hash'])
    )
  })

  // --- tags ---
  it('creates tags + file_tags tables', () => {
    const db = setup()
    expect(columns(db, 'tags')).toEqual(expect.arrayContaining(['name', 'usage_count']))
    expect(columns(db, 'file_tags')).toEqual(expect.arrayContaining(['path', 'tag']))
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
    expect(columns(db, 'bookmarks')).toEqual(expect.arrayContaining([
      'id', 'url', 'title', 'favicon', 'tags_json', 'created_at', 'updated_at', 'sort_order'
    ]))
    expect(indexes(db, 'bookmarks')).toEqual(
      expect.arrayContaining(['idx_bookmarks_created', 'idx_bookmarks_url'])
    )
  })

  // --- chats ---
  it('creates chats table', () => {
    const db = setup()
    expect(columns(db, 'chats')).toEqual(expect.arrayContaining(['id', 'title', 'model', 'created_at', 'updated_at']))
  })

  // --- queue ---
  it('creates queue table', () => {
    const db = setup()
    expect(columns(db, 'queue')).toEqual(expect.arrayContaining([
      'id', 'kind', 'payload_json', 'status', 'retry_count', 'last_error', 'created_at', 'updated_at'
    ]))
    expect(indexes(db, 'queue')).toContain('idx_queue_status')
  })

  // --- usage ---
  it('creates usage table', () => {
    const db = setup()
    expect(columns(db, 'usage')).toEqual(expect.arrayContaining([
      'id', 'ts', 'purpose', 'model_id', 'model_name', 'input_tokens', 'output_tokens',
      'estimated_cost_usd', 'file_path', 'chat_id'
    ]))
    expect(indexes(db, 'usage')).toEqual(
      expect.arrayContaining(['idx_usage_ts', 'idx_usage_model', 'idx_usage_purpose'])
    )
  })

  // --- ops_log ---
  it('creates ops_log table', () => {
    const db = setup()
    expect(columns(db, 'ops_log')).toEqual(expect.arrayContaining(['id', 'op', 'path', 'ts', 'meta_json']))
    expect(indexes(db, 'ops_log')).toEqual(
      expect.arrayContaining(['idx_ops_log_ts', 'idx_ops_log_op_ts'])
    )
  })

  // --- clips ---
  it('creates clips table', () => {
    const db = setup()
    expect(columns(db, 'clips')).toEqual(expect.arrayContaining([
      'id', 'url', 'path', 'title', 'site', 'author', 'published_at',
      'clipped_at', 'excerpt', 'content_length', 'degraded', 'created_at'
    ]))
    expect(indexes(db, 'clips')).toEqual(
      expect.arrayContaining(['idx_clips_clipped_at', 'idx_clips_site'])
    )
  })

  // --- settings ---
  it('creates settings + settings_secrets tables', () => {
    const db = setup()
    expect(columns(db, 'settings')).toEqual(expect.arrayContaining(['ns', 'key', 'value_json', 'updated_at']))
    expect(columns(db, 'settings_secrets')).toEqual(expect.arrayContaining(['key', 'encrypted_value', 'updated_at']))
  })

  // --- ai_provider_profiles ---
  it('creates ai_provider_profiles table', () => {
    const db = setup()
    expect(columns(db, 'ai_provider_profiles')).toEqual(expect.arrayContaining([
      'id', 'name', 'provider', 'base_url', 'model', 'temperature', 'top_p',
      'max_tokens', 'api_key_ref', 'created_at', 'updated_at'
    ]))
  })

  // --- jobs ---
  it('creates jobs table', () => {
    const db = setup()
    expect(columns(db, 'jobs')).toEqual(expect.arrayContaining([
      'id', 'kind', 'payload_json', 'status', 'attempts', 'next_run_at',
      'last_error', 'created_at', 'updated_at'
    ]))
    expect(indexes(db, 'jobs')).toEqual(
      expect.arrayContaining(['idx_jobs_status_next_run', 'idx_jobs_kind_status'])
    )
  })

  // --- ai_usage ---
  it('creates ai_usage table', () => {
    const db = setup()
    expect(columns(db, 'ai_usage')).toEqual(expect.arrayContaining([
      'id', 'job_id', 'profile_id', 'model', 'prompt_tokens', 'completion_tokens',
      'latency_ms', 'ok', 'error', 'created_at', 'session_id'
    ]))
    expect(indexes(db, 'ai_usage')).toEqual(
      expect.arrayContaining(['idx_ai_usage_created', 'idx_ai_usage_profile'])
    )
  })

  // --- sessions ---
  it('creates sessions + session_messages + tool_calls tables', () => {
    const db = setup()
    expect(columns(db, 'sessions')).toEqual(expect.arrayContaining(['id', 'title', 'profile_id', 'created_at', 'updated_at']))
    expect(indexes(db, 'sessions')).toContain('idx_sessions_updated')

    expect(columns(db, 'session_messages')).toEqual(expect.arrayContaining([
      'id', 'session_id', 'role', 'content', 'tool_calls_json', 'tool_call_id', 'created_at'
    ]))
    expect(indexes(db, 'session_messages')).toContain('idx_session_messages_session')

    expect(columns(db, 'tool_calls')).toEqual(expect.arrayContaining([
      'id', 'session_id', 'message_id', 'tool_name', 'args_json', 'result_json',
      'approved', 'started_at', 'finished_at', 'error'
    ]))
    expect(indexes(db, 'tool_calls')).toContain('idx_tool_calls_session')
  })

  // --- perf_samples ---
  it('creates perf_samples table', () => {
    const db = setup()
    expect(columns(db, 'perf_samples')).toEqual(expect.arrayContaining(['id', 'ts', 'area', 'ok', 'ms', 'meta']))
    expect(indexes(db, 'perf_samples')).toContain('idx_perf_area_ts')
  })

  // --- telemetry_local ---
  it('creates telemetry_local table', () => {
    const db = setup()
    expect(columns(db, 'telemetry_local')).toEqual(expect.arrayContaining(['id', 'day', 'metric', 'value', 'meta']))
    expect(indexes(db, 'telemetry_local')).toContain('uniq_telemetry_day_metric')
  })

  // --- idempotency ---
  it('is idempotent', () => {
    const db = setup()
    expect(() => runMigrations(db, MIGRATIONS_DIR)).not.toThrow()
  })
})
