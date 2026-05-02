#!/usr/bin/env node
// Copies node_modules/vditor/dist into src/public/vditor so the renderer
// can load Vditor's icons/i18n/code-mirror assets offline at /vditor/...
//
// Idempotent: deletes the destination first, then copies. Safe to re-run.

import { existsSync } from 'node:fs'
import { cp, rm, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)
const src = join(root, 'node_modules', 'vditor', 'dist')
const dest = join(root, 'src', 'public', 'vditor')

if (!existsSync(src)) {
  console.warn(`[copy-vditor-assets] ${src} not found — skipping (vditor not installed yet).`)
  process.exit(0)
}

await rm(dest, { recursive: true, force: true })
await mkdir(dirname(dest), { recursive: true })
await cp(src, dest, { recursive: true })
console.log(`[copy-vditor-assets] copied ${src} -> ${dest}`)
