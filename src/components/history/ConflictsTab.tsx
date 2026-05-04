import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { ipc } from '@/ipc/client'
import { EmptyState } from './EmptyState'
import { ConflictListItem } from './ConflictListItem'
import type { ConflictItem } from '@shared/conflict-types'
import { AlertTriangle } from 'lucide-react'

const LIMIT = 100

export interface ConflictsTabProps {
  onSelectConflict?: (id: string) => void
}

export function ConflictsTab({ onSelectConflict }: ConflictsTabProps): JSX.Element {
  const [items, setItems] = useState<ConflictItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      try {
        const result = await ipc.conflict.list({ limit: LIMIT })
        if (cancelled) return
        setItems(result.items)
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

  const handleClick = (id: string) => {
    onSelectConflict?.(id)
  }

  if (loading) {
    return (
      <div data-testid="conflicts-tab" className="p-4">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div data-testid="conflicts-tab">
        <EmptyState
          icon={<AlertTriangle />}
          title="暂无冲突"
          description="已解决的冲突会出现在这里"
        />
      </div>
    )
  }

  return (
    <div data-testid="conflicts-tab" className="flex flex-col h-full overflow-y-auto">
      {items.map((item) => (
        <ConflictListItem
          key={item.id}
          conflict={item}
          onClick={handleClick}
        />
      ))}
    </div>
  )
}
