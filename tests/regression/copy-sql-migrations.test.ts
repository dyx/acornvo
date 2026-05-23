import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

function sqlFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
}

describe('copy-sql-migrations script', () => {
  it('copies every SQL migration into out/main for runtime migration discovery', () => {
    const root = resolve(__dirname, '../..')
    const src = resolve(root, 'electron/services/db/migrations')
    const dest = resolve(root, 'out/main')

    execFileSync(process.execPath, [resolve(root, 'scripts/copy-sql-migrations.mjs')], {
      cwd: root,
      stdio: 'pipe'
    })

    expect(sqlFiles(dest)).toEqual(sqlFiles(src))
  })
})
