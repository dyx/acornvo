import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Star, Sparkles, RefreshCw, Check, X, Edit3, Eye, PanelRightOpen, PanelRightClose } from 'lucide-react'
import { useLibraryStore } from '@/stores/library'
import { useEditorStore } from '@/stores/editor'
import { cn } from '@/lib/utils'

export interface EditorTitleBarProps {
  collapsed: boolean
  isPreviewMode: boolean
  onTogglePreview: () => void
  onToggleCollapse: () => void
  onOpenSidebar: () => void
}

export function EditorTitleBar({
  collapsed,
  isPreviewMode,
  onTogglePreview,
  onToggleCollapse,
  onOpenSidebar
}: EditorTitleBarProps): JSX.Element | null {
  const { t } = useTranslation()
  const fm = useEditorStore((s) => (s.state.kind === 'ready' ? s.state.frontmatter : null))
  const detail = useLibraryStore((s) =>
    s.selectedPath ? (s.detailsByPath.get(s.selectedPath) ?? null) : null
  )

  if (!detail || !fm) return null

  const { summary } = detail

  return (
    <div className="flex-none h-11 border-b border-[color:var(--color-line)] bg-[color:var(--color-paper)] flex items-center justify-between px-4">
      <div className="flex items-center gap-3 overflow-hidden">
        <h1 className="font-serif text-[16px] font-semibold text-[color:var(--color-ink)] truncate tracking-tight">
          {summary.title ?? summary.path}
        </h1>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onTogglePreview}
          className="p-1.5 hover:bg-[color:var(--color-bg-2)] rounded-md text-[color:var(--color-ink-2)] transition-colors flex items-center gap-1.5 text-xs font-medium mr-1"
          title={isPreviewMode ? "进入编辑模式" : "预览文档"}
        >
          {isPreviewMode ? <><Edit3 size={15} /> 编辑</> : <><Eye size={15} /> 预览</>}
        </button>
        
        <div className="w-[1px] h-5 bg-[color:var(--color-line)] mx-1" />
        
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1.5 hover:bg-[color:var(--color-bg-2)] rounded-md text-[color:var(--color-ink-2)] transition-colors"
          title={collapsed ? "展开 AI 审读" : "收起 AI 审读"}
        >
          {collapsed ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </div>
    </div>
  )
}
