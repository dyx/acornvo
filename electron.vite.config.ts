import { resolve, join } from 'path'
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

function gitHash(): string {
  if (process.env.NODE_ENV !== 'production') return 'dev'
  try { return execSync('git rev-parse --short HEAD').toString('utf8').trim() }
  catch { return 'dev' }
}
const HASH = JSON.stringify(gitHash())

function copyPublicHosts(): Plugin {
  return {
    name: 'copy-public-hosts',
    writeBundle(outputOptions) {
      const src = resolve(__dirname, 'public/hosts')
      const dest = join(outputOptions.dir ?? '', 'hosts')
      if (!existsSync(src)) return
      mkdirSync(dest, { recursive: true })
      for (const file of readdirSync(src).sort()) {
        cpSync(resolve(src, file), join(dest, file))
      }
      console.log('[copy-public-hosts] copied hosts files to', dest)
    }
  }
}

function copyMigrationFiles(): Plugin {
  return {
    name: 'copy-migration-files',
    writeBundle(outputOptions) {
      const src = resolve(__dirname, 'electron/services/db/migrations')
      const dest = outputOptions.dir ?? ''
      if (!existsSync(src)) return
      mkdirSync(dest, { recursive: true })
      for (const file of readdirSync(src).filter((name) => name.endsWith('.sql')).sort()) {
        cpSync(resolve(src, file), join(dest, file))
      }
      console.log('[copy-migration-files] copied SQL files to', dest)
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyMigrationFiles(), copyPublicHosts()],
    define: { __GIT_HASH__: HASH },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    },
    build: {
      rollupOptions: {
        external: ['better-sqlite3']
      },
      lib: {
        entry: resolve(__dirname, 'electron/main.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    define: { __GIT_HASH__: HASH },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    },
    build: {
      lib: {
        entry: resolve(__dirname, 'preload/preload.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    define: { __GIT_HASH__: HASH },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/index.html')
        }
      }
    }
  }
})
