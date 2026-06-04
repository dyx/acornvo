// src/components/settings/ProviderDialog.tsx
import type { JSX } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { XIcon, ExternalLinkIcon, CheckCircleIcon, XCircleIcon, Loader2Icon } from 'lucide-react'
import { useProvidersStore } from '@/stores/providers'
import type {
  AiProvider,
  AiProviderKind,
  ProviderCreateInput,
  ProviderUpdateInput
} from '@shared/settings-types'
import { AI_PROVIDER_DEFAULTS } from '@shared/ai-provider-defaults'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

interface ProviderDialogProps {
  provider: AiProvider | null
  onClose: () => void
}

const PROVIDERS: AiProviderKind[] = ['deepseek', 'openai-compatible', 'openrouter', 'ollama']

interface FormState {
  name: string
  type: AiProviderKind
  baseUrl: string
  apiKey: string
}

function initialState(provider: AiProvider | null): FormState {
  if (!provider) {
    const defs = AI_PROVIDER_DEFAULTS['deepseek']
    return {
      name: '',
      type: 'deepseek',
      baseUrl: defs?.baseUrl ?? '',
      apiKey: ''
    }
  }
  return {
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl ?? '',
    apiKey: ''
  }
}

export function ProviderDialog({ provider, onClose }: ProviderDialogProps): JSX.Element {
  const { t } = useTranslation()
  const create = useProvidersStore((s) => s.createProvider)
  const update = useProvidersStore((s) => s.updateProvider)
  const [form, setForm] = useState<FormState>(() => initialState(provider))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const testConnection = useProvidersStore((s) => s.testConnection)

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleTypeChange(value: string) {
    const p = value as AiProviderKind
    setForm((f) => {
      const next = { ...f, type: p }
      if (!provider) {
        const defs = AI_PROVIDER_DEFAULTS[p]
        if (defs) {
          next.baseUrl = defs.baseUrl ?? ''
        } else {
          next.baseUrl = ''
        }
      }
      return next
    })
  }

  async function handleTestConnection(): Promise<void> {
    setTestStatus('testing')
    setTestMessage(null)
    const defs = AI_PROVIDER_DEFAULTS[form.type]
    const baseUrl = form.baseUrl.trim().length > 0 ? form.baseUrl.trim() : undefined
    
    try {
      const res = await testConnection({
        baseUrl,
        apiKey: form.apiKey.trim() || undefined,
        providerId: provider?.id,
        testPath: defs?.testConnectionPath
      })
      if (res.ok) {
        setTestStatus('success')
        setTestMessage(t('settings.ai.testSuccess', 'Connection successful'))
      } else {
        setTestStatus('error')
        setTestMessage(res.message || t('settings.ai.testError', 'Connection failed'))
      }
    } catch (err: any) {
      setTestStatus('error')
      setTestMessage(err.message || String(err))
    }
  }

  async function onSave(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const name = form.name.trim()
      
      if (!name) {
        setError(t('settings.ai.errorNameRequired', 'Provider name is required'))
        setBusy(false)
        return
      }

      const baseUrl = form.baseUrl.trim().length > 0 ? form.baseUrl.trim() : null
      if (provider === null) {
        const input: ProviderCreateInput = {
          name,
          type: form.type,
          baseUrl,
          ...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {})
        }
        await create(input)
      } else {
        const patch: ProviderUpdateInput = {
          name,
          baseUrl,
          ...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {})
        }
        await update(provider.id, patch)
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
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg relative">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
        >
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </button>
        <h3 className="mb-4 text-lg font-medium pr-8">
          {provider ? t('settings.ai.editProvider', 'Edit Provider') : t('settings.ai.addProvider', 'Add Provider')}
        </h3>
        <div className="space-y-4 text-sm">
          <div className="space-y-1">
            <span className="block font-medium">{t('settings.ai.name')}</span>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <span className="block font-medium">{t('settings.ai.providerType', 'Type')}</span>
            <Select
              value={form.type}
              onValueChange={handleTypeChange}
              disabled={!!provider} // Disable changing type after creation
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
          {(form.type === 'openai-compatible' || form.type === 'ollama' || form.type === 'openrouter' || form.type === 'deepseek') && (
            <div className="space-y-1">
              <span className="block font-medium">{t('settings.ai.baseUrl')}</span>
              <Input
                value={form.baseUrl}
                placeholder={form.type === 'ollama' ? 'http://localhost:11434' : ''}
                onChange={(e) => set('baseUrl', e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="block font-medium">{t('settings.ai.apiKey')}</span>
              {AI_PROVIDER_DEFAULTS[form.type]?.apiKeyHelpUrl && (
                <a
                  href={AI_PROVIDER_DEFAULTS[form.type]?.apiKeyHelpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs flex items-center text-muted-foreground hover:text-foreground"
                >
                  {t('settings.ai.getApiKey', 'Get API Key')}
                  <ExternalLinkIcon className="ml-1 size-3" />
                </a>
              )}
            </div>
            <Input
              type="password"
              autoComplete="off"
              value={form.apiKey}
              placeholder={provider ? t('settings.ai.apiKeyKeepEmpty') : ''}
              onChange={(e) => set('apiKey', e.target.value)}
            />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleTestConnection()}
              disabled={busy || testStatus === 'testing' || (!form.baseUrl && !AI_PROVIDER_DEFAULTS[form.type]?.baseUrl)}
            >
              {testStatus === 'testing' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {t('settings.ai.testConnection', 'Test Connection')}
            </Button>
            {testStatus === 'success' && (
              <span className="ml-3 flex items-center text-sm text-green-600 dark:text-green-500">
                <CheckCircleIcon className="mr-1 size-4" />
                {testMessage}
              </span>
            )}
            {testStatus === 'error' && (
              <span className="ml-3 flex items-center text-sm text-destructive" title={testMessage ?? ''}>
                <XCircleIcon className="mr-1 size-4 flex-shrink-0" />
                <span className="max-w-[250px] line-clamp-2 leading-tight">{testMessage}</span>
              </span>
            )}
          </div>
          <Button type="button" onClick={() => void onSave()} disabled={busy}>
            {t('settings.ai.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
