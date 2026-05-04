import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { ipc } from '@/ipc/client'
import { EmptyState } from './EmptyState'
import { OpsRow } from './OpsRow'
import type { OpsItem } from '@shared/ops-types'
import { History } from 'lucide-react'

const LIMIT = 100

export function OpsTab(): JSX.Element {
  const [items, setItems] = useState<OpsItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      try {
        const result = await ipc.ops.list({ limit: LIMIT, offset: 0 })
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

  if (loading) {
    return (
      <div data-testid="ops-tab" className="p-4">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div data-testid="ops-tab">
        <EmptyState
          icon={<History />}
          title="暂无操作记录"
          description="对文件的操作会出现在这里"
        />
      </div>
    )
  }

  return (
    <div data-testid="ops-tab" className="flex flex-col h-full overflow-y-auto" role="list">
      {items.map((item) => (
        <OpsRow key={item.id} item={item} />
      ))}
    </div>
  )
}
