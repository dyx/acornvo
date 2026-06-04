// src/components/settings/ModelDialog.tsx
import type { JSX } from 'react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'
import { useProvidersStore } from '@/stores/providers'
import type {
  AiModel,
  ModelCreateInput,
  ModelUpdateInput
} from '@shared/settings-types'
import { AI_PROVIDER_DEFAULTS } from '@shared/ai-provider-defaults'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface ModelDialogProps {
  model: AiModel | null
  providerId: string
  onClose: () => void
}

interface FormState {
  modelId: string
  displayName: string
}

export function ModelDialog({ model, providerId, onClose }: ModelDialogProps): JSX.Element {
  const { t } = useTranslation()
  const create = useProvidersStore((s) => s.createModel)
  const update = useProvidersStore((s) => s.updateModel)
  const providers = useProvidersStore((s) => s.providers)
  
  const provider = useMemo(() => providers.find(p => p.id === providerId), [providers, providerId])

  const [form, setForm] = useState<FormState>(() => {
    if (!model) {
      const defs = provider ? AI_PROVIDER_DEFAULTS[provider.type] : null
      return {
        modelId: defs?.models?.[0]?.id ?? '',
        displayName: defs?.models?.[0]?.displayName ?? ''
      }
    }
    return {
      modelId: model.modelId,
      displayName: model.displayName
    }
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSave(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const modelId = form.modelId.trim()
      let displayName = form.displayName.trim()
      
      if (!modelId) {
        setError(t('settings.ai.errorModelIdRequired', 'Model ID is required'))
        setBusy(false)
        return
      }
      
      if (!displayName) {
        displayName = modelId
      }

      if (model === null) {
        const input: ModelCreateInput = {
          providerId,
          modelId,
          displayName
        }
        await create(input)
      } else {
        const patch: ModelUpdateInput = {
          modelId,
          displayName
        }
        await update(model.id, patch)
      }
      onClose()
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === 'E_DUPLICATE_MODEL') setError(t('settings.ai.errorDuplicateModel', 'Model already exists'))
      else setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const defaultModels = provider ? AI_PROVIDER_DEFAULTS[provider.type]?.models : []

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
          {model ? t('settings.ai.editModel', 'Edit Model') : t('settings.ai.addModel', 'Add Model')}
        </h3>
        <div className="space-y-4 text-sm">
          <div className="space-y-1">
            <span className="block font-medium">{t('settings.ai.modelId', 'Model ID')}</span>
            <Input value={form.modelId} onChange={(e) => set('modelId', e.target.value)} placeholder="e.g. gpt-4" />
            {defaultModels && defaultModels.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {defaultModels.map((m) => (
                  <Badge
                    key={m.id}
                    variant={form.modelId === m.id ? 'default' : 'secondary'}
                    className="cursor-pointer font-normal"
                    onClick={() => {
                      set('modelId', m.id)
                      set('displayName', m.displayName)
                    }}
                  >
                    {m.displayName}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <span className="block font-medium">{t('settings.ai.modelDisplayName', 'Display Name')}</span>
            <Input 
              value={form.displayName} 
              onChange={(e) => set('displayName', e.target.value)} 
              placeholder={form.modelId || 'Leave empty to use Model ID'}
            />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" onClick={() => void onSave()} disabled={busy}>
            {t('settings.ai.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
