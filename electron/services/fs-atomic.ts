// electron/services/fs-atomic.ts
// Implemented in Plan 2 of phase-04-file-io-atomic (tasks 3.1-3.7).
// This file is a placeholder so type-only imports compile cleanly.

export interface ReadFileDetectResult {
  content: string
  eol: 'lf' | 'crlf' | 'mixed'
  originalEncoding: 'utf8' | 'gbk'
  hadBom: boolean
  mtimeMs: number
  sha256: string
}

export interface WriteWithVerifyOptions {
  eol?: 'lf' | 'crlf'
  expectedMtime?: number
}

export function writeFileAtomic(_abs: string, _data: string | Uint8Array): Promise<void> {
  throw new Error('writeFileAtomic: not yet implemented (phase-04 plan 2)')
}

export function readFileDetect(_abs: string): Promise<ReadFileDetectResult> {
  throw new Error('readFileDetect: not yet implemented (phase-04 plan 2)')
}

export function normalizeForDisk(_content: string, _opts: { eol: 'lf' | 'crlf' }): string {
  throw new Error('normalizeForDisk: not yet implemented (phase-04 plan 2)')
}

export function writeWithVerify(
  _abs: string,
  _content: string,
  _opts: WriteWithVerifyOptions
): Promise<{ mtimeMs: number; sha256: string }> {
  throw new Error('writeWithVerify: not yet implemented (phase-04 plan 2)')
}
