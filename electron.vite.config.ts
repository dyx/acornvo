import { resolve, join } from 'path'
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

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
