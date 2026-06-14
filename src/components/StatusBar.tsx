import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useGroveStore } from '@/stores/grove'
import { AcornLogo } from '@/components/AcornLogo'

interface StatusBarProps {
  reviewing?: number
  conflicts?: number
  indexing?: string | null
  totalDocs?: number
}

export function StatusBar({
  reviewing = 0,
  conflicts = 0,
  indexing = null,
  totalDocs = 0
}: StatusBarProps): JSX.Element {
  const { t } = useTranslation()
  const current = useGroveStore((s) => s.current)

  return (
    <div className="flex h-7 shrink-0 items-center gap-4 bg-[color:var(--color-paper-3)] px-4 font-mono text-xs text-[color:var(--color-ink-3)]">
      {indexing ? (
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-sky)]" />
          {t('status.indexing', '索引中 {{indexing}}', { indexing })}
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <AcornLogo size={14} className="shrink-0" />
          {current ? current.name : t('status.no_grove', '未选择果园')}
        </span>
      )}

      {reviewing > 0 && (
        <span className="flex items-center gap-1.5">
          {/* Sparkles placeholder */}
          <span className="text-xs text-[color:var(--color-acorn)]">✨</span>
          {t('status.reviewing', '理果中 {{reviewing}}', { reviewing })}
        </span>
      )}

      {conflicts > 0 && (
        <span className="flex items-center gap-1 text-[color:var(--color-berry)]">
          {/* Warn placeholder */}
          <span className="text-xs">⚠️</span>
          {t('status.conflicts', '{{count}} 冲突', { count: conflicts })}
        </span>
      )}

      <span className="flex-1" />

      <span>{t('status.docs', '{{count}} 篇文档', { count: totalDocs })}</span>
    </div>
  )
}
