import type { JSX } from 'react'
import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'
import { ExternalLink } from 'lucide-react'
import changelogRaw from '../../../CHANGELOG.md?raw'
import { MessageProvider, MessagePrimitive } from '@assistant-ui/react'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'

export function AboutTab(): JSX.Element {
  const { t } = useTranslation()
  const [info, setInfo] = useState<{
    appVersion: string
    gitHash: string
    electron: string
    chrome: string
    node: string
    platform: string
    arch: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void ipc.app.runtimeInfo().then((d) => {
      if (!cancelled) setInfo(d)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const messageObj = useMemo(() => {
    const cleanText = changelogRaw.replace(/^#\s*(更新日志|Changelog)[^\n]*\n+/i, '')
    return {
      id: 'changelog',
      role: 'assistant',
      content: [{ type: 'text', text: cleanText }],
      status: { type: 'complete', reason: 'unknown' },
      createdAt: new Date()
    } as any
  }, [])

  return (
    <div data-testid="settings-tab-about" className="flex h-full flex-col">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h3 className="text-lg font-medium">{t('about.title')}</h3>
        <WebsiteLinkButton />
      </div>

      <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm mb-6 shrink-0">
        <dt>{t('about.version')}</dt>
        <dd data-testid="about-version">{info?.appVersion ?? '—'}</dd>

        <dt>{t('about.runtime')}</dt>
        <dd data-testid="about-runtime">
          Electron {info?.electron ?? '—'} &middot; Chrome {info?.chrome ?? '—'} &middot; Node{' '}
          {info?.node ?? '—'}
        </dd>

        <dt>{t('about.platform')}</dt>
        <dd data-testid="about-platform">{info ? `${info.platform} / ${info.arch}` : '—'}</dd>
      </dl>

      <div className="flex flex-col flex-1 min-h-0">
        <h4 className="text-base font-medium mb-4 shrink-0">{t('about.changelog')}</h4>
        <div
          className="rounded-md border bg-muted/30 p-4 text-sm flex-1 overflow-y-auto font-medium custom-scrollbar"
          style={{ fontFamily: 'var(--font-review)' }}
        >
          <MessageProvider message={messageObj} index={0}>
            <MessagePrimitive.Content
              components={{
                Text: (props) => <MarkdownText smooth {...(props as any)} />
              }}
            />
          </MessageProvider>
        </div>
      </div>
    </div>
  )
}

function WebsiteLinkButton(): JSX.Element {
  const { t } = useTranslation()

  return (
    <button
      data-testid="about-website"
      className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      onClick={() => {
        void ipc.shell.openExternal('https://github.com/dyx/acornvo')
      }}
    >
      <ExternalLink className="size-3.5" />
      {t('about.website')}
    </button>
  )
}
