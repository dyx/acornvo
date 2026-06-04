// src/components/settings/AiTab.tsx
import type { JSX } from 'react'
import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { useProvidersStore } from '@/stores/providers'
import type { AiProvider, AiModel } from '@shared/settings-types'
import { ProviderDialog } from './ProviderDialog'
import { ModelDialog } from './ModelDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Settings2Icon, BrainCircuitIcon, PlusIcon, PencilIcon, TrashIcon, WalletIcon, Loader2Icon, RefreshCwIcon, AlertCircleIcon } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

function ProviderBalance({ providerId, type }: { providerId: string, type: AiProvider['type'] }) {
  const { t } = useTranslation()
  const checkBalance = useProvidersStore((s) => s.checkBalance)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [balance, setBalance] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [lastCheckTime, setLastCheckTime] = useState<number>(0)

  // Only openrouter and deepseek are natively supported right now
  if (type !== 'deepseek' && type !== 'openrouter') return null

  async function fetchBalance() {
    const now = Date.now()
    if (now - lastCheckTime < 2000) return
    setLastCheckTime(now)
    setStatus('loading')
    try {
      const res = await checkBalance(providerId)
      if (res.ok && res.balance) {
        setBalance(res.balance)
        setStatus('success')
      } else {
        setErrorMsg(res.message || 'Error')
        setStatus('error')
      }
    } catch (err: any) {
      setErrorMsg(err.message || String(err))
      setStatus('error')
    }
  }

  return (
    <div className="flex items-center text-sm mr-2 text-muted-foreground">
      {status === 'idle' && (
        <button
          onClick={fetchBalance}
          className="flex items-center hover:text-foreground transition-colors group"
          title={t('settings.ai.checkBalance', 'Check Balance')}
        >
          <WalletIcon className="h-4 w-4 mr-1.5 group-hover:text-primary transition-colors" />
          <span className="text-xs font-medium">{t('settings.ai.checkBalance', 'Check Balance')}</span>
        </button>
      )}
      {status === 'loading' && (
        <div className="flex items-center text-muted-foreground">
          <Loader2Icon className="h-4 w-4 mr-1.5 animate-spin" />
          <span className="text-xs">{t('common.loading', 'Loading...')}</span>
        </div>
      )}
      {status === 'success' && (
        <div className="flex items-center text-foreground font-medium bg-muted/50 px-2 py-1 rounded-md">
          <WalletIcon className="h-3.5 w-3.5 mr-1.5 text-primary" />
          <span className="text-xs">{balance}</span>
          <button
            onClick={fetchBalance}
            className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
            title={t('settings.ai.refreshBalance', 'Refresh Balance')}
          >
            <RefreshCwIcon className="h-3 w-3" />
          </button>
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center text-destructive">
          <AlertCircleIcon className="h-4 w-4 mr-1.5" />
          <span className="text-xs max-w-[120px] truncate" title={errorMsg || ''}>
            {t('settings.ai.balanceError', 'Check failed')}
          </span>
          <button
            onClick={fetchBalance}
            className="ml-1.5 hover:opacity-80 transition-opacity"
            title={t('settings.ai.refreshBalance', 'Refresh')}
          >
            <RefreshCwIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

interface AiTabProps {
  keychainAvailable: boolean
}

export function AiTab({ keychainAvailable }: AiTabProps): JSX.Element {
  const { t } = useTranslation()
  const providers = useProvidersStore((s) => s.providers)
  const models = useProvidersStore((s) => s.models)
  const refresh = useProvidersStore((s) => s.refresh)
  const removeProvider = useProvidersStore((s) => s.removeProvider)
  const updateModel = useProvidersStore((s) => s.updateModel)
  const removeModel = useProvidersStore((s) => s.removeModel)

  const ai = useSettingsStore((s) => s.ai)
  const setAi = useSettingsStore((s) => s.setAi)

  const [dialogProvider, setDialogProvider] = useState<AiProvider | null | 'new'>(null)
  const [providerToDelete, setProviderToDelete] = useState<AiProvider | null>(null)

  const [dialogModel, setDialogModel] = useState<
    AiModel | null | { isNew: true; providerId: string }
  >(null)
  const [modelToDelete, setModelToDelete] = useState<AiModel | null>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const enabledModels = useMemo(() => models.filter((m) => m.enabled), [models])

  const [panel, setPanel] = useState<'providers' | 'defaults'>('providers')

  const groupedModels = useMemo(() => {
    const groups: { providerName: string; models: AiModel[] }[] = []
    for (const provider of providers) {
      const pModels = enabledModels.filter((m) => m.providerId === provider.id)
      if (pModels.length > 0) {
        groups.push({ providerName: provider.name, models: pModels })
      }
    }
    return groups
  }, [enabledModels, providers])

  return (
    <div data-testid="settings-tab-ai" className="h-full flex flex-col">
      {!keychainAvailable && (
        <div
          role="alert"
          className="rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4"
        >
          {t(
            'settings.secret.unavailable',
            'Keychain is unavailable, secrets cannot be saved securely.'
          )}
        </div>
      )}



      <div role="tablist" className="flex gap-2 border-b">
        <button
          role="tab"
          aria-selected={panel === 'providers'}
          className={`px-3 py-2 text-sm ${panel === 'providers' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'}`}
          onClick={() => setPanel('providers')}
        >
          <div className="flex items-center">
            {t('settings.ai.providersTab', '供应商')}
          </div>
        </button>
        <button
          role="tab"
          aria-selected={panel === 'defaults'}
          className={`px-3 py-2 text-sm ${panel === 'defaults' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'}`}
          onClick={() => setPanel('defaults')}
        >
          <div className="flex items-center">
            {t('settings.ai.defaultModelsTab', '默认模型')}
          </div>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 outline-none">
        {panel === 'providers' && (
          <div className="flex-1">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium">{t('settings.ai.providersTab', '供应商')}</h3>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
                onClick={() => setDialogProvider('new')}
                disabled={!keychainAvailable}
              >
                <PlusIcon className="mr-1.5 h-4 w-4" />
                {t('settings.ai.addProvider', '添加供应商')}
              </button>
            </div>

            {providers.length === 0 ? (
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  {t('settings.ai.emptyProviders', '暂无供应商')}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {providers.map((p) => {
                  const providerModels = models.filter((m) => m.providerId === p.id)
                  return (
                    <div key={p.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between bg-muted/40 px-4 py-3 border-b">
                        <div className="flex flex-col">
                          <span className="font-medium text-base text-card-foreground flex items-center gap-2">
                            {p.name}
                            <span className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                              {p.type}
                            </span>
                          </span>
                          {p.baseUrl && (
                            <span className="text-xs text-muted-foreground mt-0.5">{p.baseUrl}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm">
                          <ProviderBalance providerId={p.id} type={p.type} />
                          <div className="w-px h-4 bg-border mx-1"></div>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => setDialogProvider(p)}
                            title={t('settings.ai.editProvider', '编辑供应商')}
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setProviderToDelete(p)}
                            title={t('settings.ai.deleteProvider', '删除供应商')}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            {t('settings.ai.models', '模型')}
                          </h4>
                          <button
                            type="button"
                            className="inline-flex items-center text-xs font-medium text-primary hover:underline"
                            onClick={() => setDialogModel({ isNew: true, providerId: p.id })}
                          >
                            <PlusIcon className="mr-1 h-3 w-3" />
                            {t('settings.ai.addModel', '添加模型')}
                          </button>
                        </div>

                        {providerModels.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2 text-center bg-muted/20 rounded-md border border-dashed border-border/50">
                            {t('settings.ai.emptyModels', '该供应商下暂无模型')}
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {providerModels.map((m) => (
                              <li
                                key={m.id}
                                className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/40 group border border-transparent hover:border-border/50 transition-colors"
                              >
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm font-medium truncate text-foreground flex items-center gap-2">
                                    {m.displayName}
                                    {!m.enabled && (
                                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                                        {t('settings.ai.disabled', '已禁用')}
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-xs text-muted-foreground truncate">
                                    {m.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="flex items-center gap-2 mr-2">
                                    <Switch
                                      checked={m.enabled}
                                      onCheckedChange={(checked) =>
                                        updateModel(m.id, { enabled: checked })
                                      }
                                      className="scale-75 data-[state=checked]:bg-primary"
                                      title={t('settings.ai.toggleModel', '切换模型状态')}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={() => setDialogModel(m)}
                                    title={t('settings.ai.editModel', '编辑模型')}
                                  >
                                    <PencilIcon className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => setModelToDelete(m)}
                                    title={t('settings.ai.deleteModel', '删除模型')}
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {panel === 'defaults' && (
          <div className="max-w-4xl space-y-8">
            <div>
              <h3 className="text-lg font-medium mb-4">
                {t('settings.ai.defaultModelsTab', '默认模型配置')}
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  {t('settings.ai.defaultChatModel', '松语')}
                </label>
                <Select
                  value={ai.defaultChatModelId ?? undefined}
                  onValueChange={(val) => setAi({ defaultChatModelId: val })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('settings.ai.selectModel', '选择模型')} />
                  </SelectTrigger>
                  <SelectContent>
                    {groupedModels.length === 0 ? (
                      <SelectItem value="none" disabled>
                        {t('settings.ai.noEnabledModels', '没有可用的模型')}
                      </SelectItem>
                    ) : (
                      groupedModels.map((group) => (
                        <SelectGroup key={group.providerName}>
                          <SelectLabel>{group.providerName}</SelectLabel>
                          {group.models.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.displayName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  {t('settings.ai.defaultReviewerModel', '理果')}
                </label>
                <Select
                  value={ai.defaultReviewerModelId ?? undefined}
                  onValueChange={(val) => setAi({ defaultReviewerModelId: val })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('settings.ai.selectModel', '选择模型')} />
                  </SelectTrigger>
                  <SelectContent>
                    {groupedModels.length === 0 ? (
                      <SelectItem value="none" disabled>
                        {t('settings.ai.noEnabledModels', '没有可用的模型')}
                      </SelectItem>
                    ) : (
                      groupedModels.map((group) => (
                        <SelectGroup key={group.providerName}>
                          <SelectLabel>{group.providerName}</SelectLabel>
                          {group.models.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.displayName}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </div>

      {dialogProvider !== null && (
        <ProviderDialog
          provider={dialogProvider === 'new' ? null : dialogProvider}
          onClose={() => setDialogProvider(null)}
        />
      )}

      {dialogModel !== null && (
        <ModelDialog
          model={!('isNew' in dialogModel) ? dialogModel : null}
          providerId={'isNew' in dialogModel ? dialogModel.providerId : dialogModel.providerId}
          onClose={() => setDialogModel(null)}
        />
      )}

      <ConfirmDialog
        open={providerToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setProviderToDelete(null)
        }}
        title={
          providerToDelete
            ? t('settings.ai.confirmDeleteProvider', {
                name: providerToDelete.name,
                defaultValue: `确定删除供应商 ${providerToDelete.name}？`
              })
            : ''
        }
        description={t('settings.ai.confirmDeleteProviderDesc', {
          defaultValue: '这将会同时删除该供应商下的所有模型配置。'
        })}
        cancelText={t('common.cancel')}
        confirmText={t('common.confirm')}
        destructive
        onConfirm={() => {
          if (providerToDelete) {
            void removeProvider(providerToDelete.id)
            setProviderToDelete(null)
          }
        }}
      />

      <ConfirmDialog
        open={modelToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setModelToDelete(null)
        }}
        title={
          modelToDelete
            ? t('settings.ai.confirmDeleteModel', {
                name: modelToDelete.displayName,
                defaultValue: `确定删除模型 ${modelToDelete.displayName}？`
              })
            : ''
        }
        cancelText={t('common.cancel')}
        confirmText={t('common.confirm')}
        destructive
        onConfirm={() => {
          if (modelToDelete) {
            void removeModel(modelToDelete.id)
            setModelToDelete(null)
          }
        }}
      />
    </div>
  )
}
