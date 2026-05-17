#!/usr/bin/env node
// Copies node_modules/vditor/dist into src/public/vditor/dist so the
// renderer can load Vditor's icons/i18n/code-mirror assets offline.
//
// Vditor builds asset URLs as `${cdn}/dist/<sub>` (see vditor/dist/index.js,
// e.g. addScript(`${cdn}/dist/js/i18n/${lang}.js`)). With cdn:'/vditor' the
// files MUST live at <publicDir>/vditor/dist/… — copying to
// <publicDir>/vditor would put them one level too shallow.
//
// Idempotent: wipes <publicDir>/vditor first, then recreates dist inside.

import { existsSync } from 'node:fs'
import { cp, rm, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)
const src = join(root, 'node_modules', 'vditor', 'dist')
const vditorRoot = join(root, 'src', 'public', 'vditor')
const dest = join(vditorRoot, 'dist')

if (!existsSync(src)) {
  console.warn(`[copy-vditor-assets] ${src} not found — skipping (vditor not installed yet).`)
  process.exit(0)
}

await rm(vditorRoot, { recursive: true, force: true })
await mkdir(vditorRoot, { recursive: true })
await cp(src, dest, { recursive: true })
console.log(`[copy-vditor-assets] copied ${src} -> ${dest}`)
