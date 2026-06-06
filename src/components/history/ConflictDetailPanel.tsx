import { useEffect, useState, useCallback } from 'react'
import type { JSX } from 'react'
import { formatRelativeTime } from '@/lib/date-utils'
import { ipc } from '@/ipc/client'
import { useToast } from '@/hooks/use-toast'
import { DiffView } from './DiffView'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import type { ConflictMeta } from '@shared/conflict-types'
import type { DiffResult, DiffSidesPair, DiffSide } from '@shared/ipc-contract'
import { X, FolderOpen, FileText, Trash2 } from 'lucide-react'

export interface ConflictDetailPanelProps {
  conflictId: string
  onClose?: () => void
}

const SIDES_OPTIONS: { value: DiffSidesPair; label: string }[] = [
  { value: 'local-remote', label: '本地 ↔ 远端' },
  { value: 'local-base', label: '本地 ↔ 基准' },
  { value: 'remote-base', label: '远端 ↔ 基准' }
]

const SNAPSHOT_SIDES: { side: DiffSide; label: string }[] = [
  { side: 'local', label: '本地' },
  { side: 'remote', label: '远端' },
  { side: 'base', label: '基准' }
]

function resolvedByLabel(resolvedBy: string): string {
  switch (resolvedBy) {
    case 'keep_local':
      return '保留本地'
    case 'load_remote':
      return '重载远端'
    case 'load_remote_banner':
      return '远端覆盖'
    case 'save_as':
      return '另存副本'
    default:
      return resolvedBy
  }
}

function resolvedByBadgeColor(resolvedBy: string): string {
  switch (resolvedBy) {
    case 'keep_local':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    case 'load_remote':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    case 'load_remote_banner':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    case 'save_as':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function formatTime(ts: string): string {
  try {
    return formatRelativeTime(ts)
  } catch {
    return ts
  }
}

function hashSnippet(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

export function ConflictDetailPanel({
  conflictId,
  onClose
}: ConflictDetailPanelProps): JSX.Element {
  const [meta, setMeta] = useState<ConflictMeta | null>(null)
  const [sides, setSides] = useState<DiffSidesPair>('local-remote')
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [diffLoading, setDiffLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false)
  const { toast } = useToast()

  // Fetch conflict meta on mount
  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      try {
        const result = await ipc.conflict.read(conflictId)
        if (cancelled) return
        setMeta(result.meta)
      } catch {
        if (!cancelled) {
          toast({ title: '读取冲突失败', variant: 'destructive' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [conflictId, toast])

  // Fetch diff on mount and when sides change
  useEffect(() => {
    let cancelled = false

    void (async () => {
      setDiffLoading(true)
      try {
        const result = await ipc.conflict.diff(conflictId, sides)
        if (cancelled) return
        setDiff(result)
      } catch {
        if (!cancelled) {
          toast({ title: '加载差异失败', variant: 'destructive' })
        }
      } finally {
        if (!cancelled) setDiffLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [conflictId, sides, toast])

  const handleDelete = useCallback(async () => {
    try {
      await ipc.conflict.delete(conflictId)
      toast({ title: '冲突已删除' })
      onClose?.()
    } catch {
      toast({ title: '删除失败', variant: 'destructive' })
    }
  }, [conflictId, toast, onClose])

  const handleDeleteAll = useCallback(async () => {
    try {
      const result = await ipc.conflict.deleteAll()
      toast({ title: `已删除 ${result.deleted} 个冲突` })
      onClose?.()
    } catch {
      toast({ title: '删除全部失败', variant: 'destructive' })
    }
  }, [toast, onClose])

  const handleOpenContainingDir = useCallback(async () => {
    if (!meta) return
    try {
      await ipc.file.openContainingDir(meta.path)
    } catch {
      toast({ title: '打开目录失败', variant: 'destructive' })
    }
  }, [meta, toast])

  const handleOpenSnapshot = useCallback(
    async (side: DiffSide) => {
      try {
        await ipc.conflict.openSnapshotFile(conflictId, side)
      } catch {
        toast({ title: '打开快照失败', variant: 'destructive' })
      }
    },
    [conflictId, toast]
  )

  if (loading) {
    return (
      <div
        data-testid="conflict-detail-panel"
        className="flex flex-col h-full border-l border-[color:var(--color-line)]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--color-line)]">
          <p className="text-sm text-muted-foreground">加载中…</p>
        </div>
      </div>
    )
  }

  if (!meta) {
    return (
      <div
        data-testid="conflict-detail-panel"
        className="flex flex-col h-full border-l border-[color:var(--color-line)]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--color-line)]">
          <p className="text-sm text-muted-foreground">无法加载冲突信息</p>
          {onClose ? (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="conflict-detail-panel"
      className="flex flex-col h-full border-l border-[color:var(--color-line)]"
    >
      {/* Header */}
      <div className="border-b border-[color:var(--color-line)] px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-[color:var(--color-ink)] truncate">
                {meta.path}
              </p>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0',
                  resolvedByBadgeColor(meta.resolved_by)
                )}
              >
                {resolvedByLabel(meta.resolved_by)}
              </span>
            </div>
            {/* Metadata */}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span>{formatTime(meta.ts)}</span>
              <span className="font-mono">#{hashSnippet(conflictId)}</span>
            </div>
          </div>
          {onClose ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="关闭"
              className="flex-shrink-0"
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleOpenContainingDir}>
            <FolderOpen className="size-3.5 mr-1" />
            在原目录中打开
          </Button>
          {SNAPSHOT_SIDES.map(({ side, label }) => (
            <Button key={side} variant="outline" size="sm" onClick={() => handleOpenSnapshot(side)}>
              <FileText className="size-3.5 mr-1" />
              打开 {label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="size-3.5 mr-1" />
            删除此冲突
          </Button>
        </div>
      </div>

      {/* Side selector */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[color:var(--color-line)] bg-[color:var(--color-paper-2)]">
        <span className="text-xs text-muted-foreground mr-2">对比：</span>
        {SIDES_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={sides === opt.value ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setSides(opt.value)}
            className="text-xs h-7"
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Diff view */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {diffLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">加载差异…</p>
          </div>
        ) : diff ? (
          <DiffView diff={diff} />
        ) : null}
      </div>

      {/* Footer */}
      <div className="border-t border-[color:var(--color-line)] px-4 py-2.5 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeleteAllDialogOpen(true)}
          className="text-red-600 hover:text-red-700"
        >
          <Trash2 className="size-3.5 mr-1" />
          删除全部冲突
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除此冲突</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 <span className="font-mono text-xs">{meta.path}</span>{' '}
              的冲突记录吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete all confirmation dialog */}
      <AlertDialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除全部冲突</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除所有冲突记录吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteAll}>
              删除全部
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
