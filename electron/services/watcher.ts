const SELF_WRITE_TTL_MS = 3000
const MTIME_TOLERANCE_MS = 50

interface SelfWriteEntry { mtimeMs: number; expiresAt: number }
const selfWrites = new Map<string, SelfWriteEntry>()

export function registerSelfWrite(absPath: string, mtimeMs: number, now: number = Date.now()): void {
  selfWrites.set(absPath, { mtimeMs, expiresAt: now + SELF_WRITE_TTL_MS })
}

export function shouldIgnore(absPath: string, mtimeMs: number, now: number = Date.now()): boolean {
  const entry = selfWrites.get(absPath)
  if (!entry) return false
  if (entry.expiresAt < now) {
    selfWrites.delete(absPath)
    return false
  }
  if (Math.abs(entry.mtimeMs - mtimeMs) > MTIME_TOLERANCE_MS) return false
  selfWrites.delete(absPath)
  return true
}

export function _resetSelfWritesForTest(): void {
  selfWrites.clear()
}

export function _gcSelfWrites(now: number = Date.now()): void {
  for (const [k, v] of selfWrites) {
    if (v.expiresAt < now) selfWrites.delete(k)
  }
}

export function _selfWritesSizeForTest(): number { return selfWrites.size }

let _gcTimer: NodeJS.Timeout | null = null

export function startSelfWritesGc(intervalMs: number = 30_000): void {
  if (_gcTimer) return
  _gcTimer = setInterval(() => _gcSelfWrites(), intervalMs)
  if (typeof _gcTimer.unref === 'function') _gcTimer.unref()
}

export function stopSelfWritesGc(): void {
  if (_gcTimer) {
    clearInterval(_gcTimer)
    _gcTimer = null
  }
}
