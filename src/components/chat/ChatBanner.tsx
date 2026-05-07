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
      className="flex items-center gap-2 px-4 py-2 text-sm bg-yellow-50 dark:bg-yellow-950 border-b border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200"
    >
      <AlertCircle className="size-4 shrink-0" />
      <span className="flex-1">{t('chat.error.missingProfile')}</span>
      <Link
        to="/settings/ai"
        data-testid="chat-banner-settings-link"
        className="text-sm underline underline-offset-2 hover:opacity-80"
      >
        {t('chat.error.goToSettings')}
      </Link>
    </div>
  )
}
