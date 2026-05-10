import type { JobStore } from '../../queue/store'

function utcDayOf(d: Date): string { return d.toISOString().slice(0, 10) }

function nextRunAtMs(now: Date): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 10, 0, 0))
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1)
  return next.getTime() - now.getTime()
}

export interface TelemetrySchedulerDeps {
  store: JobStore
  now?: () => Date
}

export function scheduleDailyTelemetry(deps: TelemetrySchedulerDeps): { stop: () => void } {
  const now = deps.now ?? (() => new Date())
  let timer: ReturnType<typeof setTimeout> | null = null

  function tick(): void {
    const d = now()
    const yesterday = new Date(d.getTime() - 86400_000)
    deps.store.enqueue('telemetry-aggregate', { day: utcDayOf(yesterday) })
    timer = setTimeout(tick, nextRunAtMs(now()))
  }

  tick()
  return { stop() { if (timer) clearTimeout(timer); timer = null } }
}
