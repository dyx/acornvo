// src/components/settings/GeneralTab.tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { i18n } from '@/i18n'
import type { Locale, Theme } from '@shared/settings-types'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { CheckCircle2Icon, RefreshCwIcon } from 'lucide-react'
import { ipc } from '@/ipc/client'
import { Progress } from '@/components/ui/progress'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type RebuildPhase = 'idle' | 'fts' | 'vector' | 'done'



function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const effective =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme
  document.documentElement.dataset.theme = effective
}

function applyFontScale(scale: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--font-scale', String(scale))
}

export function GeneralTab(): JSX.Element {
  const { t } = useTranslation()
  const general = useSettingsStore((s) => s.general)
  const setGeneral = useSettingsStore((s) => s.setGeneral)
  const appearance = useSettingsStore((s) => s.appearance)
  const setAppearance = useSettingsStore((s) => s.setAppearance)

  const [localScale, setLocalScale] = useState(appearance.fontScale)
  const [rebuildPhase, setRebuildPhase] = useState<RebuildPhase>('idle')
  const [ftsProgress, setFtsProgress] = useState({ done: 0, total: 0 })
  const [vectorRemaining, setVectorRemaining] = useState(0)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const handleRebuild = async () => {
    if (rebuildPhase !== 'idle' && rebuildPhase !== 'done') return
    setRebuildPhase('fts')
    setFtsProgress({ done: 0, total: 0 })
    try {
      await ipc.search.rebuild()
      setRebuildPhase('vector')
    } catch (err) {
      console.error(err)
      setRebuildPhase('idle')
    }
  }

  useEffect(() => {
    // Attempt to recover vector phase state on mount
    ipc.queue.health().then(health => {
      if (health.pending > 0 || health.running > 0) {
        setRebuildPhase((prev) => prev === 'idle' ? 'vector' : prev)
        setVectorRemaining(health.pending)
      }
    }).catch(() => {})

    const unsubProgress = ipc.on('index:rebuildProgress', (p) => {
      setRebuildPhase('fts')
      setFtsProgress({ done: p.done, total: p.total })
    })
    const unsubDone = ipc.on('index:rebuildDone', (p) => {
      setRebuildPhase('vector')
      setFtsProgress({ done: p.total, total: p.total })
    })
    return () => {
      unsubProgress()
      unsubDone()
    }
  }, [])

  useEffect(() => {
    let timer: number
    if (rebuildPhase === 'vector') {
      const checkHealth = async () => {
        try {
          const health = await ipc.queue.health()
          setVectorRemaining(health.pending)
          if (health.pending === 0 && health.running === 0) {
            setRebuildPhase('done')
            timer = window.setTimeout(() => setRebuildPhase('idle'), 3000)
          } else {
            timer = window.setTimeout(checkHealth, 1000)
          }
        } catch {
          // ignore
        }
      }
      void checkHealth()
    }
    return () => clearTimeout(timer)
  }, [rebuildPhase])

  useEffect(() => {
    setLocalScale(appearance.fontScale)
  }, [appearance.fontScale])

  useEffect(() => {
    applyFontScale(appearance.fontScale)
  }, [appearance.fontScale])

  return (
    <div data-testid="settings-tab-general" className="space-y-8">


      <div className="space-y-2">
        <span className="block text-sm font-medium">{t('settings.general.locale')}</span>
        <Select
          value={general.locale}
          onValueChange={(value) => {
            const next = value as Locale
            void setGeneral({ locale: next })
            void i18n.changeLanguage(next)
          }}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh-CN">中文（简体）</SelectItem>
            <SelectItem value="en-US">English</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-medium">{t('settings.general.defaultMenu')}</span>
        <Select
          value={general.defaultMenu || '/browser'}
          onValueChange={(value) => {
            const next = value as '/browser' | '/library' | '/chat'
            void setGeneral({ defaultMenu: next })
          }}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="/browser">{t('nav.browser')}</SelectItem>
            <SelectItem value="/library">{t('nav.library')}</SelectItem>
            <SelectItem value="/chat">{t('nav.chat')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-medium">{t('settings.appearance.theme')}</span>
        <div className="flex inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground w-64">
          {(['system', 'light', 'dark'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                applyTheme(value as Theme)
                void setAppearance({ theme: value as Theme })
              }}
              className={cn(
                'flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
                appearance.theme === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'hover:bg-background/50 hover:text-foreground'
              )}
            >
              {t(`settings.appearance.theme.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-medium">{t('settings.appearance.fontScale')}</span>
        <div className="flex items-center gap-4 w-64">
          <div className="relative flex-1 flex items-center h-5">
            {/* Mark at 1.0x (33.33% of track) */}
            <button
              type="button"
              aria-label="Reset to 1.0x"
              className="absolute left-[33.33%] z-0 h-3 w-1 -translate-x-1/2 rounded-full bg-[color:var(--color-line)] hover:bg-[color:var(--color-ink-3)] transition-colors cursor-pointer"
              title="1.0x"
              onClick={() => {
                setLocalScale(1.0)
                applyFontScale(1.0)
                void setAppearance({ fontScale: 1.0 })
              }}
            />
            <Slider
              min={0.8}
              max={1.4}
              step={0.1}
              value={[localScale]}
              className="z-10"
              onValueChange={([value]) => {
                setLocalScale(value)
              }}
              onValueCommit={([value]) => {
                applyFontScale(value)
                void setAppearance({ fontScale: value })
              }}
            />
          </div>
          <button
            type="button"
            title="Reset to 1.0x"
            className="text-sm text-muted-foreground w-8 text-right hover:text-foreground transition-colors cursor-pointer"
            onClick={() => {
              setLocalScale(1.0)
              applyFontScale(1.0)
              void setAppearance({ fontScale: 1.0 })
            }}
          >
            {localScale.toFixed(1)}x
          </button>
        </div>
      </div>

      <div className="pt-6 border-t border-border">
        <div className="space-y-2 mb-4">
          <span className="block text-sm font-medium">{t('settings.search.rebuildIndex')}</span>
          <p className="text-xs text-muted-foreground">
            {t('settings.search.rebuildIndexDesc')}
          </p>
        </div>

        {rebuildPhase !== 'idle' && (
          <div
            className={`rounded-lg border border-border bg-muted/30 transition-all duration-500 overflow-hidden ${
              rebuildPhase === 'done' ? 'opacity-0 h-0 p-0 mb-0 border-transparent' : 'opacity-100 h-[80px] p-4 mb-4'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">
                {rebuildPhase === 'fts' ? t('settings.search.rebuildFts') :
                 rebuildPhase === 'vector' ? t('settings.search.rebuildVector') :
                 t('settings.search.rebuildDone')}
              </span>
              {rebuildPhase === 'fts' && (
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {ftsProgress.done} / {ftsProgress.total}
                </span>
              )}
              {rebuildPhase === 'vector' && (
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {t('settings.search.remaining')}: {vectorRemaining}
                </span>
              )}
              {rebuildPhase === 'done' && (
                <CheckCircle2Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>

            {(rebuildPhase === 'fts' || rebuildPhase === 'vector') && (
              <Progress
                value={rebuildPhase === 'fts' && ftsProgress.total > 0 ? (ftsProgress.done / ftsProgress.total) * 100 : 100}
                className={`h-2 ${rebuildPhase === 'vector' ? 'animate-pulse' : ''}`}
              />
            )}
          </div>
        )}

        <Button 
          onClick={() => setIsConfirmOpen(true)} 
          disabled={rebuildPhase !== 'idle' && rebuildPhase !== 'done'} 
          className="gap-2" 
          variant="outline"
        >
          <RefreshCwIcon className={`w-4 h-4 ${rebuildPhase !== 'idle' && rebuildPhase !== 'done' ? 'animate-spin' : ''}`} />
          {rebuildPhase !== 'idle' && rebuildPhase !== 'done' ? t('settings.search.rebuilding') : t('settings.search.rebuildAction')}
        </Button>
        <ConfirmDialog
          open={isConfirmOpen}
          onOpenChange={setIsConfirmOpen}
          title={t('settings.search.rebuildAction', '重建索引')}
          description={t('settings.search.rebuildConfirmDesc', '确定要重新构建所有搜索索引吗？此操作可能会在后台消耗一定的系统资源。')}
          onConfirm={() => {
            setIsConfirmOpen(false)
            handleRebuild()
          }}
          destructive
        />
      </div>

    </div>
  )
}
