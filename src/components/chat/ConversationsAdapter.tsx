import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Edit2Icon, Trash2Icon, PlusIcon, MoreVerticalIcon } from 'lucide-react'
import { useChatStore } from '@/stores/chat'
import { groupSession } from '@/lib/date-utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const NARROW_BREAKPOINT = 960

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_BREAKPOINT)
  useEffect(() => {
    const h = () => setNarrow(window.innerWidth < NARROW_BREAKPOINT)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return narrow
}

export function ConversationsAdapter() {
  const { t } = useTranslation()
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const bySession = useChatStore((s) => s.bySession)
  const selectSession = useChatStore((s) => s.selectSession)
  const createSession = useChatStore((s) => s.createSession)
  const renameSession = useChatStore((s) => s.renameSession)
  const deleteSession = useChatStore((s) => s.deleteSession)

  const narrow = useNarrow()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const itemsByGroup = useMemo(() => {
    const groups: Record<string, typeof sessions> = {}
    sessions.forEach((s) => {
      const group = groupSession(s.updatedAt)
      if (!groups[group]) groups[group] = []
      groups[group].push(s)
    })
    return groups
  }, [sessions])

  const commitRename = (id: string) => {
    if (editingTitle.trim()) {
      renameSession(id, editingTitle.trim())
    }
    setEditingId(null)
    setEditingTitle('')
  }

  return (
    <>
      <div className="flex h-14 shrink-0 items-center px-3 bg-background">
        <Button
          onClick={() => void createSession()}
          variant="default"
          className={cn('w-full justify-start', narrow && 'justify-center px-0')}
        >
          <PlusIcon className={cn('size-4', !narrow && 'mr-2')} />
          {!narrow && t('chat.newSession')}
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0 bg-background">
        <div className="p-2 pt-2 space-y-2">
          {Object.entries(itemsByGroup).map(([groupName, groupSessions]) => (
            <div key={groupName}>
              {!narrow && (
                <h3 className="px-2 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest mt-1 mb-1">
                  {t(`chat.group.${groupName}` as const)}
                </h3>
              )}
              <div className="space-y-0.5">
                {groupSessions.map((s) => {
                  const isActive = s.id === activeSessionId
                  const isEditing = editingId === s.id
                  const hasApproval =
                    s.id !== activeSessionId && (bySession[s.id]?.pendingApprovals?.length ?? 0) > 0
                  const baseLabel = s.title || t('chat.untitled')
                  const displayLabel = baseLabel

                  return (
                    <div
                      key={s.id}
                      className={cn(
                        'group relative flex items-center rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors overflow-hidden',
                        isActive
                          ? 'bg-muted/60 font-medium text-foreground'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      )}
                      onClick={() => !isEditing && selectSession(s.id)}
                    >
                      {isEditing ? (
                        <Input
                          autoFocus
                          size={1}
                          className="h-6 py-0 px-1 text-sm bg-background flex-1 min-w-0"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(s.id)
                            if (e.key === 'Escape') {
                              setEditingId(null)
                              setEditingTitle('')
                            }
                          }}
                          onBlur={() => commitRename(s.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <span className="line-clamp-1 break-all flex-1 min-w-0 pr-1" title={displayLabel}>
                            {displayLabel}
                          </span>
                          {hasApproval && (
                            <span className="size-1.5 shrink-0 rounded-full bg-orange-500 mr-1" />
                          )}
                        </>
                      )}

                      {!narrow && !isEditing && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-sm shadow-sm border border-border/50 transition-all duration-200 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 data-[state=open]:opacity-100 data-[state=open]:translate-x-0 bg-background text-muted-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVerticalIcon size={14} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingId(s.id)
                                setEditingTitle(baseLabel)
                              }}
                            >
                              <Edit2Icon className="size-4 mr-2 text-[color:var(--color-ink-3)]" />
                              {t('chat.session.rename')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:bg-destructive/15 focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeletingId(s.id)
                              }}
                            >
                              <Trash2Icon className="size-4 mr-2" />
                              {t('chat.session.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title={t('chat.session.confirmDeleteTitle')}
        description={t('chat.session.confirmDeleteBody')}
        cancelText={t('common.cancel')}
        confirmText={t('chat.session.confirmDeleteOk')}
        destructive
        onConfirm={() => {
          if (deletingId) deleteSession(deletingId)
          setDeletingId(null)
        }}
      />
    </>
  )
}
