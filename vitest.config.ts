import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared')
    }
  },
  test: {
    include: ['electron/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    testTimeout: 5000,
    passWithNoTests: true
  }
})
