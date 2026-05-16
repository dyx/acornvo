import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Typography } from 'antd'

const { TextArea } = Input

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, flex: 1 }}>
      <TextArea
        data-testid="json-args-textarea"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        autoSize={{ minRows: 8, maxRows: 24 }}
        spellCheck={false}
        style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 12 }}
      />
      {error && (
        <Typography.Text data-testid="json-args-error" type="danger" style={{ fontSize: 12 }}>
          {t('chat.approval.invalidJson')}: {error}
        </Typography.Text>
      )}
    </div>
  )
}
