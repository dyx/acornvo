#!/usr/bin/env node
// Copies SQL migration files into the electron-vite output directory so
// the main-process bundle can find and run them at startup.
//
// electron-vite bundles electron/main.ts → out/main/main.js.
// __dirname at runtime is out/main/, so .sql files must live alongside main.js.

import { existsSync, mkdirSync, cpSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)
const src = resolve(root, 'electron', 'services', 'db', 'migrations')
const dest = resolve(root, 'out', 'main')

if (!existsSync(src)) {
  console.warn('[copy-sql-migrations] no migration source dir — skipping')
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
for (const file of ['001_init.sql']) {
  cpSync(join(src, file), join(dest, file))
}
console.log(`[copy-sql-migrations] copied SQL files to ${dest}`)
