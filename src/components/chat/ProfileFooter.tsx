import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useChatStore } from '@/stores/chat'
import { useProfilesStore } from '@/stores/profiles'

export function ProfileFooter(): JSX.Element {
  const { t } = useTranslation()
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const sessions = useChatStore((s) => s.sessions)
  const profiles = useProfilesStore((s) => s.profiles)

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const profile = activeSession?.profileId
    ? profiles.find((p) => p.id === activeSession.profileId) ?? null
    : null

  if (profile) {
    return (
      <span
        data-testid="chat-input-profile"
        className="text-xs text-muted-foreground"
      >
        {profile.name} · {profile.model}
      </span>
    )
  }

  return (
    <Link
      to="/settings/ai"
      data-testid="chat-input-no-profile"
      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
    >
      {t('chat.input.noProfile')} — {t('chat.input.goToSettings')}
    </Link>
  )
}
