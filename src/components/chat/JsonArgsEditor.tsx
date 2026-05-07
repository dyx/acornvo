import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface JsonArgsEditorProps {
  initialArgs: unknown
  onChange: (text: string, valid: boolean, parsed?: unknown) => void
}

export function JsonArgsEditor({ initialArgs, onChange }: JsonArgsEditorProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(() => JSON.stringify(initialArgs, null, 2))
  const [error, setError] = useState<string | null>(null)

  const handleChange = useCallback(
    (value: string) => {
      setText(value)
      try {
        const parsed = JSON.parse(value)
        setError(null)
        onChange(value, true, parsed)
      } catch (e) {
        const msg = e instanceof SyntaxError ? e.message : String(e)
        setError(msg)
        onChange(value, false)
      }
    },
    [onChange]
  )

  // Notify parent of initial state
  useEffect(() => {
    try {
      const parsed = JSON.parse(text)
      onChange(text, true, parsed)
    } catch {
      onChange(text, false)
    }
    // Run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <textarea
        data-testid="json-args-textarea"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        className="flex-1 min-h-0 w-full resize-none rounded-md border border-border bg-muted p-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        spellCheck={false}
      />
      {error && (
        <p data-testid="json-args-error" className="text-xs text-destructive mt-1">
          {t('chat.approval.invalidJson')}: {error}
        </p>
      )}
    </div>
  )
}
