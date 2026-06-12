// src/components/settings/ModelDialog.tsx
import type { JSX } from 'react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { XIcon, InfoIcon } from 'lucide-react'
import { useProvidersStore } from '@/stores/providers'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
  name: string
  displayName: string
  contextWindow: string
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
        name: defs?.models?.[0]?.name ?? '',
        displayName: defs?.models?.[0]?.displayName ?? '',
        contextWindow: String(defs?.models?.[0]?.contextWindow ?? 128000)
      }
    }
    return {
      name: model.name,
      displayName: model.displayName,
      contextWindow: String(model.contextWindow)
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
      const name = form.name.trim()
      let displayName = form.displayName.trim()
      
      if (!name) {
        setError(t('settings.ai.errorNameRequired', 'Model Name is required'))
        setBusy(false)
        return
      }
      
      if (!displayName) {
        displayName = name
      }
      
      const cw = Number(form.contextWindow)
      if (isNaN(cw) || cw < 128000 || cw > 1000000) {
        setError(t('settings.ai.errorContextWindowRange', 'Context Window must be between 128,000 and 1,000,000'))
        setBusy(false)
        return
      }

      if (model === null) {
        const input: ModelCreateInput = {
          providerId,
          name,
          displayName,
          contextWindow: Number(form.contextWindow) || 128000
        }
        await create(input)
      } else {
        const patch: ModelUpdateInput = {
          name,
          displayName,
          contextWindow: Number(form.contextWindow) || 128000
        }
        await update(model.id, patch)
      }
      onClose()
    } catch (err) {
      const code = (err as { message?: string })?.message ?? ''
      if (code.includes('E_DUPLICATE_NAME')) setError(t('settings.ai.errorDuplicateName', 'Model name already exists'))
      else if (code.includes('E_DUPLICATE_DISPLAY_NAME')) setError(t('settings.ai.errorDuplicateDisplayName', 'Display name already exists'))
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
            <span className="block font-medium">{t('settings.ai.modelName', 'Model Name (e.g. gpt-4)')}</span>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. gpt-4" />
            {defaultModels && defaultModels.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {defaultModels.map((m) => (
                  <Badge
                    key={m.name}
                    variant={form.name === m.name ? 'default' : 'secondary'}
                    className="cursor-pointer font-normal"
                    onClick={() => {
                      set('name', m.name)
                      set('displayName', m.displayName)
                      set('contextWindow', String(m.contextWindow ?? 128000))
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
              placeholder={form.name || t('settings.ai.modelDisplayNamePlaceholder', 'Leave empty to use Model Name')}
            />
          </div>
          <div className="space-y-1">
            <span className="flex items-center gap-1 font-medium">
              {t('settings.ai.modelContextWindow', 'Context Window (Tokens)')}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="size-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Min: 128000, Max: 1000000</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
            <Input 
              type="number"
              min="128000"
              max="1000000"
              step="1000"
              value={form.contextWindow} 
              onChange={(e) => set('contextWindow', e.target.value)} 
              onBlur={() => {
                let cw = Number(form.contextWindow)
                if (isNaN(cw) || cw < 128000) cw = 128000
                if (cw > 1000000) cw = 1000000
                set('contextWindow', String(cw))
              }}
              placeholder="e.g. 128000"
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
