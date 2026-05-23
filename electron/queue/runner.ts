import type { JobHandlerResult } from '@shared/job-types'
import type { JobStore } from './store'
import type { Job } from '@shared/job-types'
import { nextDelay } from './policy'

function pickOpsPath(kind: string, payload: Record<string, unknown>): string {
  const p = payload as { path?: unknown; clipId?: unknown }
  if (typeof p.path === 'string') return p.path
  if (kind === 'ai-review-clip' && typeof p.clipId === 'number') return `clip:${p.clipId}`
  return ''
}

export interface HandlerCtx {
  job: Job
  payload: Record<string, unknown>
  log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string) => void
  cancel: AbortSignal
}

export type JobHandler = (ctx: HandlerCtx) => Promise<JobHandlerResult>

export interface RegisterOpts {
  kind: string
  concurrency: number
  minGapMs: number
  handler: JobHandler
}

export interface QueueRunner {
  register(opts: RegisterOpts): void
  start(): void
  stop(): void
  /** Cancel a job by id. */
  cancel(id: string): { ok: true } | { error: 'E_NOT_FOUND' | 'E_STATUS_NOT_ALLOWED' }
  /** Drains running handlers up to `timeoutMs`. */
  drainOnQuit(timeoutMs: number): Promise<void>
}

export interface QueueRunnerDeps {
  store: JobStore
  tickMs?: number
  now?: () => number
  opsLog?: (record: { op: string; path: string; meta?: Record<string, unknown> }) => void
  log?: (
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    ctx?: Record<string, unknown>
  ) => void
}

interface KindEntry extends RegisterOpts {
  running: Map<string, AbortController>
  lastPickedAt: number
}

export function createQueueRunner(deps: QueueRunnerDeps): QueueRunner {
  const tickMs = deps.tickMs ?? 250
  const now = deps.now ?? (() => Date.now())
  const log = deps.log ?? (() => {})
  const kinds = new Map<string, KindEntry>()
  let timer: ReturnType<typeof setInterval> | null = null
  let acceptingNew = true

  const REASON_TO_OP: Record<string, string> = {
    enqueued: 'job.enqueued',
    running: 'job.started',
    done: 'job.succeeded',
    retry: 'job.retry',
    failed: 'job.failed',
    canceled: 'job.canceled',
    manualRetry: 'job.retry'
  }

  if (deps.opsLog) {
    deps.store.events.on('stateChanged', ({ reason, job }) => {
      const op = REASON_TO_OP[reason]
      if (!op) return
      const path = pickOpsPath(job.kind, job.payload)
      const meta: Record<string, unknown> = {
        kind: job.kind,
        id: job.id,
        attempts: job.attempts
      }
      if (job.lastError) meta.reason = job.lastError
      try {
        deps.opsLog!({ op, path, meta })
      } catch (e) {
        log('warn', 'opsLog write failed', { error: String(e) })
      }
    })
  }

  function register(opts: RegisterOpts): void {
    if (kinds.has(opts.kind)) {
      throw new Error(`E_DUPLICATE_KIND: ${opts.kind}`)
    }
    kinds.set(opts.kind, { ...opts, running: new Map(), lastPickedAt: 0 })
  }

  function start(): void {
    if (timer) return
    timer = setInterval(tick, tickMs)
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function tick(): void {
    if (!acceptingNew) return
    try {
      const nowMs = now()
      const nowIso = new Date(nowMs).toISOString()
      for (const entry of kinds.values()) {
        if (entry.running.size >= entry.concurrency) continue
        if (nowMs - entry.lastPickedAt < entry.minGapMs) continue
        const slots = entry.concurrency - entry.running.size
        // Single-pick per tick when minGapMs is set; otherwise fill all slots.
        const limit = entry.minGapMs > 0 ? 1 : slots
        const due = deps.store.list({
          kind: entry.kind,
          status: 'pending',
          limit,
          offset: 0
        })
        const ready = due.items.filter((j) => j.nextRunAt <= nowIso)
        if (ready.length === 0) continue
        entry.lastPickedAt = nowMs
        for (const job of ready) runOne(entry, job)
      }
    } catch (err) {
      log('error', 'queue runner tick failed', { error: String(err) })
    }
  }

  function runOne(entry: KindEntry, job: Job): void {
    const controller = new AbortController()
    entry.running.set(job.id, controller)
    deps.store.markRunning(job.id)
    void Promise.resolve()
      .then(() =>
        entry.handler({
          job,
          payload: job.payload,
          log: (level, msg) => log(level, msg, { jobId: job.id, kind: job.kind }),
          cancel: controller.signal
        })
      )
      .then(
        (result) => settle(entry, job, controller, result, null),
        (err: unknown) => settle(entry, job, controller, null, err)
      )
  }

  function settle(
    entry: KindEntry,
    job: Job,
    controller: AbortController,
    result: JobHandlerResult | null,
    threw: unknown
  ): void {
    entry.running.delete(job.id)
    if (controller.signal.aborted) return

    if (threw) {
      const msg = threw instanceof Error ? threw.message : String(threw)
      const delay = nextDelay(job.attempts)
      if (delay === null) deps.store.markFailed(job.id, msg)
      else deps.store.markRetry(job.id, delay, msg)
      return
    }
    if (!result) return
    if (result.kind === 'ok') {
      deps.store.markDone(job.id)
      return
    }
    if (result.kind === 'fail') {
      deps.store.markFailed(job.id, result.error)
      return
    }
    // retry
    const supplied = Number.isFinite(result.delayMs) && result.delayMs > 0 ? result.delayMs : null
    const delay = supplied ?? nextDelay(job.attempts)
    if (delay === null) deps.store.markFailed(job.id, result.reason)
    else deps.store.markRetry(job.id, delay, result.reason)
  }

  function cancel(id: string): { ok: true } | { error: 'E_NOT_FOUND' | 'E_STATUS_NOT_ALLOWED' } {
    const job = deps.store.getById(id)
    if (!job) return { error: 'E_NOT_FOUND' }
    if (job.status === 'pending') {
      deps.store.markCanceled(id)
      return { ok: true }
    }
    if (job.status === 'running') {
      const entry = kinds.get(job.kind)
      const ctl = entry?.running.get(id)
      deps.store.markCanceled(id)
      ctl?.abort()
      return { ok: true }
    }
    return { error: 'E_STATUS_NOT_ALLOWED' }
  }

  async function drainOnQuit(timeoutMs: number): Promise<void> {
    acceptingNew = false
    stop()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      let any = false
      for (const e of kinds.values()) if (e.running.size > 0) any = true
      if (!any) return
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  return { register, start, stop, cancel, drainOnQuit }
}
