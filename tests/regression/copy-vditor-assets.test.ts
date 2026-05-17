import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('copy-vditor-assets script', () => {
  it('publishes vditor dist at /vditor/dist so cdn:"/vditor" resolves the lazy assets', () => {
    const root = resolve(__dirname, '../..')

    execFileSync(process.execPath, [resolve(root, 'scripts/copy-vditor-assets.mjs')], {
      cwd: root,
      stdio: 'pipe'
    })

    // Vditor hardcodes the `/dist/` segment after `cdn` when fetching lazy
    // assets — see node_modules/vditor/dist/index.js:2484 etc., e.g.
    //   addScript(`${mergedOptions.cdn}/dist/js/i18n/${lang}.js`, …)
    // With cdn:'/vditor', the file MUST exist at <publicDir>/vditor/dist/...
    expect(existsSync(resolve(root, 'src/public/vditor/dist/index.css'))).toBe(true)
    expect(existsSync(resolve(root, 'src/public/vditor/dist/js/i18n/zh_CN.js'))).toBe(true)
    expect(existsSync(resolve(root, 'src/public/vditor/dist/js/i18n/en_US.js'))).toBe(true)
  })
})
