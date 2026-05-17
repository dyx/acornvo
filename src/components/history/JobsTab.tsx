import { useEffect, useReducer, useRef, useCallback } from 'react'
import type { JSX } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ipc } from '@/ipc/client'
import { EmptyState } from './EmptyState'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { Job, JobStatus } from '@shared/job-types'
import { JOB_KINDS } from '@shared/job-types'
import { ListChecks, Trash2 } from 'lucide-react'
import { JobRow, JOB_ROW_HEIGHT } from './JobRow'

// --- constants ---

const ROW_HEIGHT = JOB_ROW_HEIGHT
const OVERSCAN = 10
const LIMIT = 200
const VIRTUALIZE_THRESHOLD = 50

/** Statuses that are considered "active" and shown in the main list. */
const ACTIVE_STATUSES: JobStatus[] = ['pending', 'running', 'failed']

/** Statuses eligible for clear-done. */
const DONE_STATUSES: JobStatus[] = ['done', 'canceled']

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

// --- state ---

interface State {
  jobs: Job[]
  loading: boolean
  kindFilter: string // '' = all
  statusFilter: string // '' = all
  confirmOpen: boolean
  clearDoneLoading: boolean
  clearDoneResult: string | null
}

type Action =
  | { type: 'SET_JOBS'; jobs: Job[] }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_KIND_FILTER'; kind: string }
  | { type: 'SET_STATUS_FILTER'; status: string }
  | { type: 'OPEN_CONFIRM' }
  | { type: 'CLOSE_CONFIRM' }
  | { type: 'CLEAR_DONE_START' }
  | { type: 'CLEAR_DONE_RESULT'; removed: number }
  | { type: 'CLEAR_DONE_ERROR'; message: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_JOBS':
      return { ...state, jobs: action.jobs, loading: false }
    case 'SET_LOADING':
      return { ...state, loading: action.loading }
    case 'SET_KIND_FILTER':
      return { ...state, kindFilter: action.kind }
    case 'SET_STATUS_FILTER':
      return { ...state, statusFilter: action.status }
    case 'OPEN_CONFIRM':
      return { ...state, confirmOpen: true, clearDoneResult: null }
    case 'CLOSE_CONFIRM':
      return { ...state, confirmOpen: false }
    case 'CLEAR_DONE_START':
      return { ...state, clearDoneLoading: true, clearDoneResult: null }
    case 'CLEAR_DONE_RESULT':
      return { ...state, clearDoneLoading: false, clearDoneResult: `已清除 ${action.removed} 个任务`, confirmOpen: false }
    case 'CLEAR_DONE_ERROR':
      return { ...state, clearDoneLoading: false, clearDoneResult: null, confirmOpen: false }
    default:
      return state
  }
}

const initialState: State = {
  jobs: [],
  loading: true,
  kindFilter: '',
  statusFilter: '',
  confirmOpen: false,
  clearDoneLoading: false,
  clearDoneResult: null
}

// --- main component ---

export function JobsTab(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState)
  const parentRef = useRef<HTMLDivElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch jobs on mount
  const fetchJobs = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', loading: true })
    try {
      const results = await Promise.allSettled(
        ACTIVE_STATUSES.map((status) =>
          ipc.jobs.list({ status, limit: LIMIT, offset: 0 })
        )
      )

      const allJobs: Job[] = []
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allJobs.push(...result.value.items)
        }
      }

      // Sort by nextRunAt ascending (sooner runs first)
      allJobs.sort(
        (a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime()
      )

      dispatch({ type: 'SET_JOBS', jobs: allJobs })
    } catch {
      dispatch({ type: 'SET_JOBS', jobs: [] })
    }
  }, [])

  useEffect(() => {
    void fetchJobs()

    // Subscribe to job changes with 100ms debounce
    const unsub = ipc.on('jobs:changed', () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        void fetchJobs()
      }, 100)
    })

    return () => {
      unsub()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fetchJobs])

  // Filter jobs client-side
  const filteredJobs = state.jobs.filter((job) => {
    if (state.kindFilter && job.kind !== state.kindFilter) return false
    if (state.statusFilter && job.status !== state.statusFilter) return false
    return true
  })

  const useVirtual = filteredJobs.length > VIRTUALIZE_THRESHOLD

  const virtualizer = useVirtualizer({
    count: useVirtual ? filteredJobs.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    enabled: useVirtual
  })

  // clearDone handler
  const handleClearDone = useCallback(async () => {
    dispatch({ type: 'CLEAR_DONE_START' })
    try {
      const result = await ipc.jobs.clearDone()
      dispatch({ type: 'CLEAR_DONE_RESULT', removed: result.removed })
      void fetchJobs()
    } catch {
      dispatch({ type: 'CLEAR_DONE_ERROR', message: '清除失败' })
    }
  }, [fetchJobs])

  // --- render ---

  if (state.loading) {
    return (
      <div data-testid="jobs-tab" className="p-4">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    )
  }

  return (
    <div data-testid="jobs-tab" className="flex flex-col h-full">
      {/* toolbar: filters + clear-done button */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[color:var(--line)] flex-shrink-0">
        {/* kind filter */}
        <select
          data-testid="kind-filter"
          className="h-8 rounded-md border border-[color:var(--line)] bg-[color:var(--paper)] px-2 text-xs text-[color:var(--ink)]"
          value={state.kindFilter}
          onChange={(e) => dispatch({ type: 'SET_KIND_FILTER', kind: e.target.value })}
        >
          <option value="">全部类型</option>
          {JOB_KINDS.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k)}
            </option>
          ))}
        </select>

        {/* status filter */}
        <select
          data-testid="status-filter"
          className="h-8 rounded-md border border-[color:var(--line)] bg-[color:var(--paper)] px-2 text-xs text-[color:var(--ink)]"
          value={state.statusFilter}
          onChange={(e) => dispatch({ type: 'SET_STATUS_FILTER', status: e.target.value })}
        >
          <option value="">全部状态</option>
          {[...ACTIVE_STATUSES, ...DONE_STATUSES].map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>

        {/* spacer */}
        <div className="flex-1" />

        {/* clear-done result */}
        {state.clearDoneResult && (
          <span className="text-xs text-muted-foreground">{state.clearDoneResult}</span>
        )}

        {/* clear-done button */}
        <AlertDialog open={state.confirmOpen} onOpenChange={(open) => dispatch({ type: open ? 'OPEN_CONFIRM' : 'CLOSE_CONFIRM' })}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={state.clearDoneLoading}>
              <Trash2 className="h-3.5 w-3.5" />
              清除已完成
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>确认清除</AlertDialogTitle>
              <AlertDialogDescription>
                将清除所有已完成和已取消的任务，此操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleClearDone}>
                确定
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* job list or empty state */}
      {filteredJobs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<ListChecks />}
            title="暂无任务"
            description="后台任务会出现在这里"
          />
        </div>
      ) : useVirtual ? (
        <div ref={parentRef} className="flex-1 overflow-y-auto outline-none">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const job = filteredJobs[vi.index]
              return (
                <div
                  key={job.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`,
                    height: vi.size
                  }}
                >
                  <JobRow job={job} onChanged={fetchJobs} />
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filteredJobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}
