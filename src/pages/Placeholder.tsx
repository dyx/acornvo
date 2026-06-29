import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useGroveStore } from '@/stores/grove'

export function Placeholder({ name }: { name: string }): JSX.Element {
  const { t } = useTranslation()
  const current = useGroveStore((s) => s.current)
  return (
    <div className="p-6">
      <h1 className="serif text-xl font-semibold">{name} (placeholder)</h1>
      {current ? (
        <pre className="mt-4 whitespace-pre-wrap font-mono text-xs text-[color:var(--color-ink-3)]">
          {JSON.stringify(current, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-[color:var(--color-ink-3)]">
          {t('placeholder.no_grove', '未打开任何树林')}
        </p>
      )}
    </div>
  )
}
