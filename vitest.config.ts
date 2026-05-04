import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared')
    }
  },
  test: {
    include: [
      'electron/**/*.test.ts',
      'preload/**/*.test.ts',
      'shared/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx'
    ],
    environment: 'node',
    environmentMatchGlobs: [
      ['src/**/*.test.tsx', 'jsdom'],
      ['tests/**/*.test.tsx', 'jsdom']
    ],
    pool: 'threads',
    testTimeout: 5000,
    passWithNoTests: true
  }
})
