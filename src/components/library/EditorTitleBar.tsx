import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { Edit3, Eye, PanelRightOpen, PanelRightClose, CircleHelp } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { useLibraryStore } from '@/stores/library'
import { useEditorStore } from '@/stores/editor'
import { useRootStore } from '@/stores/root'

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
  onToggleCollapse
}: EditorTitleBarProps): JSX.Element | null {
  const { t } = useTranslation()
  const fm = useEditorStore((s) => (s.state.kind === 'ready' ? s.state.frontmatter : null))
  const detail = useLibraryStore((s) =>
    s.selectedPath ? (s.detailsByPath.get(s.selectedPath) ?? null) : null
  )
  const sidebarOpen = useRootStore((s) => s.sidebarOpen)

  const titleRef = useRef<HTMLHeadingElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setIsTruncated(el.scrollWidth > el.clientWidth)
    })
    observer.observe(el)
    setIsTruncated(el.scrollWidth > el.clientWidth)
    return () => observer.disconnect()
  }, [])

  if (!detail || !fm) return null

  const { summary } = detail
  const displayTitle = summary.title ?? summary.path

  const titleElement = (
    <h1 ref={titleRef} className="text-[15px] font-medium text-[color:var(--color-ink)] truncate tracking-tight cursor-default max-w-full">
      {displayTitle}
    </h1>
  )

  return (
    <div className={`flex-none h-10 bg-[color:var(--color-paper)] flex items-center pr-4 relative z-10 border-b border-[color:var(--color-line)] after:content-[''] after:absolute after:top-full after:inset-x-0 after:h-4 after:bg-gradient-to-b after:from-[color:var(--color-paper)] after:to-transparent after:pointer-events-none [-webkit-app-region:drag]`}>
      <div className={`shrink-0 h-full [-webkit-app-region:no-drag] transition-[width] duration-300 ${sidebarOpen ? 'w-0' : 'w-[60px]'}`} />
      <div className={`flex flex-1 min-w-0 items-center justify-between transition-[padding] duration-300 ${sidebarOpen ? 'pl-4' : 'pl-0'}`}>
        <div className="flex flex-1 items-center gap-3 overflow-hidden min-w-0 pr-4 [-webkit-app-region:no-drag]">
          <TooltipProvider delayDuration={500}>
            {isTruncated ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  {titleElement}
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="max-w-[400px] break-words">
                  <p className="text-xs font-serif">{displayTitle}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              titleElement
            )}
          </TooltipProvider>
        </div>

      <div className="flex items-center gap-1 shrink-0 [-webkit-app-region:no-drag]">
        <TooltipProvider delayDuration={500}>

          {!isPreviewMode && (
            <Dialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="flex size-[28px] items-center justify-center rounded-md text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-3)] transition-colors cursor-pointer"
                    >
                      <CircleHelp size={15} />
                    </button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{t('editor.markdown_help', { defaultValue: 'Markdown 语法说明' })}</p>
                </TooltipContent>
              </Tooltip>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t('editor.markdown.guide_title', 'Markdown 语法指南')}</DialogTitle>
                  <DialogDescription>{t('editor.markdown.guide_desc', '基础 Markdown 语法与快捷输入')}</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 text-sm mt-4 text-[color:var(--color-ink)]">
                  <div>
                    <h3 className="text-sm font-medium mb-2 text-[color:var(--color-ink-2)]">{t('editor.markdown.heading', '标题')}</h3>
                    <pre className="text-[13px] font-mono whitespace-pre-wrap break-words bg-[color:var(--color-paper-2)] border border-[color:var(--color-line)] p-3 rounded-md shadow-sm">{'# 一级标题\n## 二级标题\n### 三级标题'}</pre>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium mb-2 text-[color:var(--color-ink-2)]">{t('editor.markdown.style', '文本样式')}</h3>
                    <pre className="text-[13px] font-mono whitespace-pre-wrap break-words bg-[color:var(--color-paper-2)] border border-[color:var(--color-line)] p-3 rounded-md shadow-sm">{'**粗体**\n*斜体*\n~~删除线~~\n`行内代码`'}</pre>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium mb-2 text-[color:var(--color-ink-2)]">{t('editor.markdown.list', '列表')}</h3>
                    <pre className="text-[13px] font-mono whitespace-pre-wrap break-words bg-[color:var(--color-paper-2)] border border-[color:var(--color-line)] p-3 rounded-md shadow-sm">{'- 无序列表项\n* 无序列表项\n\n1. 有序列表项\n2. 有序列表项\n\n- [ ] 待办事项\n- [x] 已完成事项'}</pre>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium mb-2 text-[color:var(--color-ink-2)]">{t('editor.markdown.block', '块级元素')}</h3>
                    <pre className="text-[13px] font-mono whitespace-pre-wrap break-words bg-[color:var(--color-paper-2)] border border-[color:var(--color-line)] p-3 rounded-md shadow-sm">{'> 引用文字\n\n```语言\n代码块\n```\n\n--- (分隔线)'}</pre>
                  </div>
                  <div className="col-span-2">
                    <h3 className="text-sm font-medium mb-2 text-[color:var(--color-ink-2)]">{t('editor.markdown.link_img', '链接与图片')}</h3>
                    <pre className="text-[13px] font-mono whitespace-pre-wrap break-words bg-[color:var(--color-paper-2)] border border-[color:var(--color-line)] p-3 rounded-md shadow-sm">{'[链接文本](https://example.com)\n![图片描述](https://example.com/image.jpg)'}</pre>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={onTogglePreview}
              className="flex size-[28px] items-center justify-center rounded-md text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-3)] transition-colors cursor-pointer"
            >
              {isPreviewMode ? <Edit3 size={15} /> : <Eye size={15} />}
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{isPreviewMode ? t('editor.preview.enter_edit', '进入编辑模式') : t('editor.preview.enter_preview', '预览文档')}</p>
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
    </div>
  )
}
