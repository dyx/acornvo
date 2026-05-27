import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ChevronDownIcon, LockIcon } from 'lucide-react'
import { useChatStore } from '@/stores/chat'
import { useProfilesStore } from '@/stores/profiles'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function ProfileChip({
  sessionId,
  profileId,
  className
}: {
  sessionId: string
  profileId: string | null
  className?: string
}) {
  const { t } = useTranslation()
  const profiles = useProfilesStore((s) => s.profiles)
  const updateSessionProfile = useChatStore((s) => s.updateSessionProfile)
  
  const hasMessages = useChatStore((s) => {
    const state = s.bySession[sessionId]
    if (state?.loaded) return state.messages.length > 0
    const info = s.sessions.find(x => x.id === sessionId)
    return (info?.messageCount ?? 0) > 0
  })

  const current = profiles.find((p) => p.id === profileId) ?? null

  const chipContent = (
    <button
      type="button"
      data-testid="chat-profile-chip"
      disabled={hasMessages}
      className={cn(
        'h-8 text-xs px-3 py-1.5 rounded-md border border-transparent inline-flex items-center gap-2 shrink-0 max-w-[280px] min-w-[120px] w-max transition-colors outline-none text-muted-foreground',
        hasMessages 
          ? 'opacity-80 cursor-default' 
          : 'bg-transparent hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring hover:text-foreground',
        className
      )}
      title={
        current
          ? `${current.name} ${t('chat.topbar.modelSeparator')} ${current.model}`
          : t('chat.topbar.noProfile')
      }
    >
      {current ? (
        <div className="flex items-center gap-1.5 overflow-hidden flex-1 text-left">
          <span className="truncate font-medium text-foreground">{current.name}</span>
          <span className="text-muted-foreground shrink-0">·</span>
          <span className="truncate">{current.model}</span>
        </div>
      ) : (
        <span className="flex-1 text-left">{t('chat.topbar.noProfile')}</span>
      )}
      {hasMessages ? (
        <LockIcon className="size-3 opacity-50 shrink-0" />
      ) : (
        <ChevronDownIcon className="size-3 opacity-50 shrink-0" />
      )}
    </button>
  )

  if (hasMessages) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-block">
              {chipContent}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t('chat.topbar.modelLocked', 'Model cannot be changed after conversation starts')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {chipContent}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[160px]">
        {profiles.length === 0 ? (
          <DropdownMenuItem asChild>
            <Link to="/settings/ai">
              {t('chat.topbar.noProfile')} — {t('chat.error.goToSettings')}
            </Link>
          </DropdownMenuItem>
        ) : (
          profiles.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => void updateSessionProfile(sessionId, p.id)}>
              <span className="font-medium">{p.name}</span>
              <span className="text-muted-foreground ml-2 text-xs">{p.model}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
