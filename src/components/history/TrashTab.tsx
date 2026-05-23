import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ipc } from '@/ipc/client'
import { EmptyState } from './EmptyState'
import type { OpsItem, Op } from '@shared/ops-types'
import { Trash2 } from 'lucide-react'

const ROW_HEIGHT = 44
const OVERSCAN = 10
const LIMIT = 100
const VIRTUALIZE_THRESHOLD = 50

function opLabel(op: Op): string {
  switch (op) {
    case 'trash':
      return '废纸篓'
    case 'hard_delete':
      return '永久删除'
    default:
      return op
  }
}

function opBadgeColor(op: Op): string {
  switch (op) {
    case 'trash':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    case 'hard_delete':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
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

function TrashRow({
  item,
  onClick
}: {
  item: OpsItem
  onClick: (path: string) => void
}): JSX.Element {
  return (
    <div
      data-testid="trash-row"
      className="flex items-center gap-3 px-4 py-2.5 border-b border-[color:var(--color-line)] hover:bg-[color:var(--color-paper-2)] cursor-pointer transition-colors"
      style={{ height: ROW_HEIGHT }}
      onClick={() => onClick(item.path)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(item.path)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${item.path} - ${opLabel(item.op)}`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[color:var(--color-ink)] truncate">{item.path}</p>
        <p className="text-xs text-muted-foreground">{formatTime(item.ts)}</p>
      </div>
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 ${opBadgeColor(item.op)}`}
      >
        {opLabel(item.op)}
      </span>
    </div>
  )
}

export function TrashTab(): JSX.Element {
  const [items, setItems] = useState<OpsItem[]>([])
  const [loading, setLoading] = useState(true)
  const parentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      try {
        const [trashRes, hardDeleteRes] = await Promise.all([
          ipc.ops.list({ op: 'trash', limit: LIMIT, offset: 0 }),
          ipc.ops.list({ op: 'hard_delete', limit: LIMIT, offset: 0 })
        ])
        if (cancelled) return

        // Merge and sort by ts descending (newest first)
        const merged = [...trashRes.items, ...hardDeleteRes.items].sort(
          (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
        )
        setItems(merged)
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const useVirtual = items.length > VIRTUALIZE_THRESHOLD

  const virtualizer = useVirtualizer({
    count: useVirtual ? items.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    enabled: useVirtual
  })

  const handleRowClick = async (path: string) => {
    await ipc.file.openContainingDir(path)
  }

  if (loading) {
    return (
      <div data-testid="trash-tab" className="p-4">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div data-testid="trash-tab">
        <EmptyState icon={<Trash2 />} title="废纸篓为空" description="被删除的文件会出现在这里" />
      </div>
    )
  }

  return (
    <div data-testid="trash-tab" className="flex flex-col h-full">
      {useVirtual ? (
        <div ref={parentRef} className="flex-1 overflow-y-auto outline-none">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const item = items[vi.index]
              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`,
                    height: vi.size
                  }}
                >
                  <TrashRow item={item} onClick={handleRowClick} />
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {items.map((item) => (
            <TrashRow key={item.id} item={item} onClick={handleRowClick} />
          ))}
        </div>
      )}
    </div>
  )
}
