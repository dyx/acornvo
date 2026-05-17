import type { JSX } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ipc } from '@/ipc/client'
import type { Job, JobStatus } from '@shared/job-types'

export const JOB_ROW_HEIGHT = 48

// --- helpers ---

function kindLabel(kind: string): string {
  switch (kind) {
    case 'index-retry':
      return '索引重试'
    case 'ai-review-clip':
      return 'AI 审查'
    default:
      return kind
  }
}

function kindBadgeColor(kind: string): string {
  switch (kind) {
    case 'index-retry':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    case 'ai-review-clip':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function statusLabel(status: JobStatus): string {
  switch (status) {
    case 'pending':
      return '等待中'
    case 'running':
      return '运行中'
    case 'failed':
      return '失败'
    case 'done':
      return '已完成'
    case 'canceled':
      return '已取消'
    default:
      return status
  }
}

function statusBadgeColor(status: JobStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    case 'running':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    case 'failed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    case 'done':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    case 'canceled':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function formatTime(ts: string): string {
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: zhCN })
  } catch {
    return ts
  }
}

function payloadSummary(payload: Record<string, unknown>): string {
  if (typeof payload.path === 'string') return payload.path
  if (typeof payload.clipId === 'string' || typeof payload.clipId === 'number') return `clip: ${payload.clipId}`
  if (typeof payload.file === 'string') return payload.file
  // Pick the first string value
  for (const v of Object.values(payload)) {
    if (typeof v === 'string') return v
  }
  return '-'
}

// --- component ---

interface JobRowProps {
  job: Job
  /** Called after retry/cancel so the parent can refresh the list. */
  onChanged?: () => void
}

export function JobRow({ job, onChanged }: JobRowProps): JSX.Element {
  const showRetry = job.status === 'failed'
  const showCancel = job.status === 'pending' || job.status === 'running'

  const handleRetry = async () => {
    await ipc.jobs.retry(job.id)
    onChanged?.()
  }

  const handleCancel = async () => {
    await ipc.jobs.cancel(job.id)
    onChanged?.()
  }

  const truncatedError =
    job.lastError && job.lastError.length > 60
      ? job.lastError.slice(0, 60) + '…'
      : job.lastError

  return (
    <div
      data-testid="job-row"
      className="flex items-center gap-3 px-4 py-2.5 border-b border-[color:var(--color-line)]"
      style={{ height: JOB_ROW_HEIGHT }}
    >
      {/* kind badge */}
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 ${kindBadgeColor(job.kind)}`}
      >
        {kindLabel(job.kind)}
      </span>

      {/* payload summary + meta + lastError */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[color:var(--color-ink)] truncate">
          {payloadSummary(job.payload)}
        </p>
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <span>{formatTime(job.nextRunAt)}</span>
          {job.attempts > 0 && (
            <span className="text-muted-foreground/60">第 {job.attempts} 次</span>
          )}
        </p>
        {job.status === 'failed' && truncatedError && (
          <p className="text-xs text-red-500 dark:text-red-400 truncate mt-0.5">
            {truncatedError}
          </p>
        )}
      </div>

      {/* status badge */}
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 ${statusBadgeColor(job.status)}`}
      >
        {statusLabel(job.status)}
      </span>

      {/* action buttons */}
      {showRetry && (
        <button
          type="button"
          onClick={handleRetry}
          className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors flex-shrink-0 cursor-pointer"
          aria-label="重试"
        >
          重试
        </button>
      )}
      {showCancel && (
        <button
          type="button"
          onClick={handleCancel}
          className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors flex-shrink-0 cursor-pointer"
          aria-label="取消"
        >
          取消
        </button>
      )}
    </div>
  )
}
