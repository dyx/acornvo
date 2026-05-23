// src/components/settings/ProfileDialog.tsx
import type { JSX } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '@/stores/profiles'
import type {
  AiProviderProfile,
  AiProviderKind,
  ProfileCreateInput,
  ProfileUpdateInput
} from '@shared/settings-types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

interface ProfileDialogProps {
  profile: AiProviderProfile | null
  onClose: () => void
}

const PROVIDERS: AiProviderKind[] = ['openai', 'anthropic', 'ollama', 'openai-compatible']

interface FormState {
  name: string
  provider: AiProviderKind
  baseUrl: string
  model: string
  temperature: string
  topP: string
  maxTokens: string
  apiKey: string
}

function initialState(profile: AiProviderProfile | null): FormState {
  if (!profile) {
    return {
      name: '',
      provider: 'openai',
      baseUrl: '',
      model: '',
      temperature: '0.7',
      topP: '1.0',
      maxTokens: '',
      apiKey: ''
    }
  }
  return {
    name: profile.name,
    provider: profile.provider,
    baseUrl: profile.baseUrl ?? '',
    model: profile.model,
    temperature: String(profile.temperature),
    topP: String(profile.topP),
    maxTokens: profile.maxTokens != null ? String(profile.maxTokens) : '',
    apiKey: ''
  }
}

export function ProfileDialog({ profile, onClose }: ProfileDialogProps): JSX.Element {
  const { t } = useTranslation()
  const create = useProfilesStore((s) => s.create)
  const update = useProfilesStore((s) => s.update)
  const [form, setForm] = useState<FormState>(() => initialState(profile))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSave(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const baseUrl = form.baseUrl.trim().length > 0 ? form.baseUrl.trim() : null
      const maxTokens = form.maxTokens.trim().length > 0 ? Number(form.maxTokens) : null
      if (profile === null) {
        const input: ProfileCreateInput = {
          name: form.name.trim(),
          provider: form.provider,
          baseUrl,
          model: form.model.trim(),
          temperature: Number(form.temperature),
          topP: Number(form.topP),
          maxTokens,
          ...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {})
        }
        await create(input)
      } else {
        const patch: ProfileUpdateInput = {
          name: form.name.trim(),
          provider: form.provider,
          baseUrl,
          model: form.model.trim(),
          temperature: Number(form.temperature),
          topP: Number(form.topP),
          maxTokens,
          ...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {})
        }
        await update(profile.id, patch)
      }
      onClose()
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === 'E_DUPLICATE_NAME') setError(t('settings.ai.errorDuplicateName'))
      else if (code === 'E_KEYCHAIN_UNAVAILABLE') setError(t('settings.secret.unavailable'))
      else setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
    >
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-medium">
          {profile ? t('settings.ai.editProfile') : t('settings.ai.addProfile')}
        </h3>
        <div className="space-y-4 text-sm">
          <div className="space-y-1">
            <span className="block font-medium">{t('settings.ai.name')}</span>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <span className="block font-medium">{t('settings.ai.provider')}</span>
            <Select
              value={form.provider}
              onValueChange={(value) => set('provider', value as AiProviderKind)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(form.provider === 'openai-compatible' || form.provider === 'ollama') && (
            <div className="space-y-1">
              <span className="block font-medium">{t('settings.ai.baseUrl')}</span>
              <Input
                value={form.baseUrl}
                placeholder={form.provider === 'ollama' ? 'http://localhost:11434' : ''}
                onChange={(e) => set('baseUrl', e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <span className="block font-medium">{t('settings.ai.model')}</span>
            <Input value={form.model} onChange={(e) => set('model', e.target.value)} />
          </div>
          <div className="space-y-1">
            <span className="block font-medium">
              {t('settings.ai.temperature')} ({form.temperature})
            </span>
            <Slider
              min={0}
              max={2}
              step={0.1}
              value={[Number(form.temperature)]}
              onValueChange={([v]) => set('temperature', String(v))}
            />
          </div>
          <div className="space-y-1">
            <span className="block font-medium">
              {t('settings.ai.topP')} ({form.topP})
            </span>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[Number(form.topP)]}
              onValueChange={([v]) => set('topP', String(v))}
            />
          </div>
          <div className="space-y-1">
            <span className="block font-medium">{t('settings.ai.maxTokens')}</span>
            <Input
              type="number"
              value={form.maxTokens}
              onChange={(e) => set('maxTokens', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <span className="block font-medium">{t('settings.ai.apiKey')}</span>
            <Input
              type="password"
              autoComplete="off"
              value={form.apiKey}
              placeholder={profile ? t('settings.ai.apiKeyKeepEmpty') : ''}
              onChange={(e) => set('apiKey', e.target.value)}
            />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void onSave()} disabled={busy}>
            {t('settings.ai.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
