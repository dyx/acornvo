import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { ipc } from '@/ipc/client'
import { Badge } from '@/components/ui/badge'

type Status = 'unknown' | 'ok' | 'error'

interface State {
  status: Status
  user_version: number | null
  message?: string
}

const INITIAL: State = { status: 'unknown', user_version: null }

export function DbHealthBadge(): JSX.Element {
  const [state, setState] = useState<State>(INITIAL)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const v = await ipc.db.version()
        if (cancelled) return
        setState({ status: 'ok', user_version: v.user_version })
      } catch (err) {
        if (cancelled) return
        setState({
          status: 'error',
          user_version: null,
          message: err instanceof Error ? err.message : String(err)
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const dot =
    state.status === 'ok' ? (
      <span aria-label="healthy" className="inline-block h-2 w-2 rounded-full bg-green-500" />
    ) : state.status === 'error' ? (
      <span aria-label="error" className="inline-block h-2 w-2 rounded-full bg-amber-500" />
    ) : (
      <span aria-label="unknown" className="inline-block h-2 w-2 rounded-full bg-muted" />
    )

  const label = state.user_version != null ? `db v${state.user_version}` : 'db ?'

  return (
    <Badge
      variant="outline"
      className="gap-1.5 text-xs text-muted-foreground font-normal border-transparent bg-transparent"
      title={state.message ?? label}
    >
      {dot}
      {label}
    </Badge>
  )
}
