import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Star, Sparkles, RefreshCw, Check, X, Edit3, Eye, PanelRightOpen, PanelRightClose } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
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
    <div className="flex-none h-11 bg-[color:var(--color-paper)] flex items-center justify-between px-4 relative z-10 after:content-[''] after:absolute after:top-full after:inset-x-0 after:h-6 after:bg-gradient-to-b after:from-[color:var(--color-paper)] after:to-transparent after:pointer-events-none">
      <div className="flex items-center gap-3 overflow-hidden">
        <h1 className="font-serif text-[16px] font-semibold text-[color:var(--color-ink)] truncate tracking-tight">
          {summary.title ?? summary.path}
        </h1>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={onTogglePreview}
              className="flex size-[28px] items-center justify-center rounded-md text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-3)] transition-colors cursor-pointer"
            >
              {isPreviewMode ? <Edit3 size={15} /> : <Eye size={15} />}
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{isPreviewMode ? "进入编辑模式" : "预览文档"}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={onToggleCollapse}
              className="flex size-[28px] items-center justify-center rounded-md text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-3)] transition-colors cursor-pointer"
            >
              {collapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{collapsed ? t('common.open', { defaultValue: 'Open Sidebar' }) : t('common.close', { defaultValue: 'Close Sidebar' })}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}
