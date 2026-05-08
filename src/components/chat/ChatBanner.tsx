import { AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useChatStore } from '@/stores/chat'
import { useProfilesStore } from '@/stores/profiles'

export function ChatBanner(): JSX.Element | null {
  const { t } = useTranslation()

  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const sessions = useChatStore((s) => s.sessions)
  const profiles = useProfilesStore((s) => s.profiles)

  const hasDefaultProfile = profiles.length > 0

  const activeSession = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId)
    : undefined

  // Show banner when: active session has no profileId AND no default profile exists
  if (hasDefaultProfile) return null
  if (!activeSession) return null
  if (activeSession.profileId) return null

  return (
    <div
      data-testid="chat-missing-profile-banner"
      className="flex items-center gap-2 px-[18px] py-2 text-[12.5px] bg-[color:var(--color-berry-bg)] border-b border-[color:var(--color-berry)] text-[color:var(--color-berry)] font-mono"
    >
      <AlertCircle className="size-[14px] shrink-0" />
      <span className="flex-1">{t('chat.error.missingProfile')}</span>
      <Link
        to="/settings/ai"
        data-testid="chat-banner-settings-link"
        className="text-[12.5px] underline underline-offset-2 hover:opacity-80"
      >
        {t('chat.error.goToSettings')}
      </Link>
    </div>
  )
}
