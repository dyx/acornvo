// src/components/settings/AiTab.tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { useProfilesStore } from '@/stores/profiles'
import type { AiProviderProfile } from '@shared/settings-types'
import { ProfileDialog } from './ProfileDialog'

interface AiTabProps {
  keychainAvailable: boolean
}

export function AiTab({ keychainAvailable }: AiTabProps): JSX.Element {
  const { t } = useTranslation()
  const profiles = useProfilesStore((s) => s.profiles)
  const refresh = useProfilesStore((s) => s.refresh)
  const remove = useProfilesStore((s) => s.remove)
  const ai = useSettingsStore((s) => s.ai)
  const setAi = useSettingsStore((s) => s.setAi)
  const [dialogProfile, setDialogProfile] = useState<AiProviderProfile | null | 'new'>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div data-testid="settings-tab-ai" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{t('settings.tab.ai')}</h3>
        <button
          type="button"
          className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground hover:opacity-90"
          onClick={() => setDialogProfile('new')}
          disabled={!keychainAvailable}
        >
          {t('settings.ai.addProfile')}
        </button>
      </div>

      {!keychainAvailable && (
        <div role="alert" className="rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t('settings.secret.unavailable')}
        </div>
      )}

      {profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.ai.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded border bg-background px-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {p.name}
                  {ai.defaultProfileId === p.id && (
                    <span className="ml-2 rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      {t('settings.ai.default')}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.provider} · {p.model}
                </span>
              </div>
              <div className="flex gap-2 text-sm">
                {ai.defaultProfileId !== p.id && (
                  <button type="button" className="rounded border px-2 py-1 hover:bg-muted"
                    onClick={() => void setAi({ defaultProfileId: p.id })}>
                    {t('settings.ai.setDefault')}
                  </button>
                )}
                <button type="button" className="rounded border px-2 py-1 hover:bg-muted"
                  onClick={() => setDialogProfile(p)}>
                  {t('settings.ai.editProfile')}
                </button>
                <button type="button" className="rounded border border-destructive px-2 py-1 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (window.confirm(t('settings.ai.confirmDelete', { name: p.name }))) {
                      void remove(p.id)
                    }
                  }}>
                  {t('settings.ai.deleteProfile')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialogProfile !== null && (
        <ProfileDialog
          profile={dialogProfile === 'new' ? null : dialogProfile}
          onClose={() => setDialogProfile(null)}
        />
      )}
    </div>
  )
}
