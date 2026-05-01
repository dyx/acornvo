import type { JSX } from 'react'
import { useParams, Link } from 'react-router-dom'

export function EditorPlaceholder(): JSX.Element {
  const params = useParams<{ path?: string }>()
  const decoded = params.path ? decodeURIComponent(params.path) : ''
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-[color:var(--ink-3)]">
      <p>编辑器将在后续阶段实装</p>
      <p className="font-mono text-xs">当前路径：{decoded}</p>
      <Link to="/library" className="text-[color:var(--acorn)] underline">
        返回果仓
      </Link>
    </div>
  )
}
