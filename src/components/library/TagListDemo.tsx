import type { JSX } from 'react'
import { useState } from 'react'
import { Hash, Search, MoreVertical, Plus, ChevronDown, Tag } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface TagItem {
  id: string
  name: string
  count: number
}

// 模拟数据
const MOCK_TAGS: TagItem[] = [
  { id: '1', name: 'AI & 大模型', count: 28 },
  { id: '2', name: '前端开发 (React/Vue)', count: 15 },
  { id: '3', name: '设计系统', count: 9 },
  { id: '4', name: 'ChatGPT 提示词', count: 32 },
  { id: '5', name: '效率工具', count: 11 },
  { id: '6', name: '读书笔记', count: 6 },
  { id: '7', name: '个人生活与随笔', count: 3 },
]

export function TagListDemo(): JSX.Element {
  const { t } = useTranslation()
  const [activeTag, setActiveTag] = useState<string>('1')

  return (
    <div className="flex w-[260px] flex-col h-full bg-[color:var(--color-paper-2)] border-r border-[color:var(--color-line)] font-sans">
      
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="text-[15px] font-medium text-[color:var(--color-ink)] flex items-center gap-2">
          <Tag size={16} className="text-[color:var(--color-ink-3)]" />
          <span>{t('library.tags', '所有标签')}</span>
        </h2>
        <div className="flex gap-1">
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-paper-3)] hover:text-[color:var(--color-ink)] transition-colors">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="px-3 pb-3">
        <div className="flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-2.5 transition-colors focus-within:border-[color:var(--color-acorn)] focus-within:ring-1 focus-within:ring-[color:var(--color-acorn)] shadow-sm">
          <Search size={14} className="text-[color:var(--color-ink-3)] shrink-0" />
          <input
            type="text"
            placeholder={t('library.search_tags', '搜索标签...')}
            className="flex-1 bg-transparent text-[13px] text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-ink-4)] min-w-0"
          />
        </div>
      </div>

      {/* 列表容器 */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        
        {/* 分组标题（模拟树形结构的顶层） */}
        <div className="flex items-center px-2 py-1.5 mt-1 group cursor-pointer hover:bg-[color:var(--color-paper-3)] rounded-md transition-colors">
          <ChevronDown size={14} className="text-[color:var(--color-ink-3)] mr-1 shrink-0" />
          <span className="text-[12px] font-medium text-[color:var(--color-ink-3)] flex-1">
            常用标签
          </span>
        </div>

        {/* 标签列表项 */}
        <div className="flex flex-col gap-[2px] mt-1 relative">
          {/* 左侧的缩进参考线 */}
          <div className="absolute left-[13px] top-1 bottom-1 w-[1px] bg-[color:var(--color-line)]/50" />

          {MOCK_TAGS.map(tag => {
            const isActive = activeTag === tag.id
            return (
              <div 
                key={tag.id}
                onClick={() => setActiveTag(tag.id)}
                className={`group relative flex items-center justify-between pl-6 pr-2 py-1.5 rounded-md cursor-pointer transition-all duration-200 ${
                  isActive 
                    ? 'bg-[color:var(--color-acorn-bg)] text-[color:var(--color-acorn-2)]' 
                    : 'text-[color:var(--color-ink)] hover:bg-[color:var(--color-paper-3)]'
                }`}
              >
                {/* 选中状态的左侧指示条 */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-[60%] bg-[color:var(--color-acorn)] rounded-r-md" />
                )}

                {/* 左侧：Icon与文字 */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Hash size={13} className={`shrink-0 ${isActive ? 'text-[color:var(--color-acorn)]' : 'text-[color:var(--color-ink-4)] group-hover:text-[color:var(--color-ink-3)]'}`} />
                  <span className="text-[13px] truncate">{tag.name}</span>
                </div>
                
                {/* 右侧：数字与操作按钮 */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* 数量标签 */}
                  <span className={`text-[11px] tabular-nums px-1.5 rounded-full ${
                    isActive 
                      ? 'bg-[color:var(--color-acorn)]/10 text-[color:var(--color-acorn)]' 
                      : 'text-[color:var(--color-ink-4)]'
                  }`}>
                    {tag.count}
                  </span>
                  
                  {/* Hover时显示的操作按钮 */}
                  <button 
                    className={`flex h-6 w-6 items-center justify-center rounded-sm transition-all duration-200 ${
                      isActive 
                        ? 'opacity-100 text-[color:var(--color-acorn)] hover:bg-[color:var(--color-acorn)]/20' 
                        : 'opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-paper-4)] hover:text-[color:var(--color-ink)]'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      // 打开菜单逻辑
                    }}
                  >
                    <MoreVertical size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
