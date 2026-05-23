import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Edit2Icon, Trash2Icon, PlusIcon, MessageSquareIcon, MoreVerticalIcon } from 'lucide-react'
import { useChatStore } from '@/stores/chat'
import { groupSession } from '@/lib/date-utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
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
    sessions.forEach(s => {
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
      <div className="p-3 border-b border-border bg-background">
        <Button onClick={() => void createSession()} variant="default" className={cn("w-full justify-start", narrow && "justify-center px-0")}>
          <PlusIcon className={cn("size-4", !narrow && "mr-2")} />
          {!narrow && t('chat.newSession')}
        </Button>
      </div>

      <ScrollArea className="flex-1 bg-background">
        <div className="p-2 space-y-4">
          {Object.entries(itemsByGroup).map(([groupName, groupSessions]) => (
            <div key={groupName}>
              {!narrow && <h3 className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{groupName}</h3>}
              <div className="space-y-0.5">
                {groupSessions.map((s) => {
                  const isActive = s.id === activeSessionId
                  const isEditing = editingId === s.id
                  const hasApproval = s.id !== activeSessionId && (bySession[s.id]?.pendingApprovals?.length ?? 0) > 0
                  const baseLabel = s.title || t('chat.untitled')
                  const displayLabel = narrow ? baseLabel.slice(0, 8) : baseLabel

                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "group flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors",
                        isActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                      onClick={() => !isEditing && selectSession(s.id)}
                    >
                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <MessageSquareIcon className="size-4 shrink-0 opacity-70" />
                        
                        {isEditing ? (
                          <Input
                            autoFocus
                            size={1}
                            className="h-6 py-0 px-1 text-sm bg-background"
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
                          <span className="truncate flex-1 relative pr-2">
                            {displayLabel}
                            {hasApproval && <span className="absolute right-0 top-1.5 size-1.5 rounded-full bg-orange-500" />}
                          </span>
                        )}
                      </div>

                      {!narrow && !isEditing && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 shrink-0 ml-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVerticalIcon className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingId(s.id); setEditingTitle(baseLabel); }}>
                              <Edit2Icon className="size-4 mr-2" />
                              {t('chat.session.rename')}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:bg-destructive focus:text-destructive-foreground" onClick={(e) => { e.stopPropagation(); setDeletingId(s.id); }}>
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

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chat.session.confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('chat.session.confirmDeleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => { if (deletingId) deleteSession(deletingId); setDeletingId(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('chat.session.confirmDeleteOk')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
