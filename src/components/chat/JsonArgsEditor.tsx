import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Textarea } from '@/components/ui/textarea'

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

  useEffect(() => {
    try {
      const parsed = JSON.parse(text)
      onChange(text, true, parsed)
    } catch {
      onChange(text, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-[200px]">
      <Textarea
        data-testid="json-args-textarea"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
        className="font-mono text-xs min-h-[200px] flex-1 resize-y bg-muted/50"
      />
      {error && (
        <span data-testid="json-args-error" className="text-destructive text-xs">
          {t('chat.approval.invalidJson')}: {error}
        </span>
      )}
    </div>
  )
}
