import { type JSX, useState, useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/stores/chat'

export function ShortcutsDialog(): JSX.Element {
  const { t } = useTranslation()
  const showShortcutsBump = useChatStore((s) => s.showShortcutsBump)
  const [open, setOpen] = useState(false)
  const lastBumpRef = useRef(showShortcutsBump)

  useEffect(() => {
    if (showShortcutsBump !== lastBumpRef.current) {
      lastBumpRef.current = showShortcutsBump
      setOpen(true)
    }
  }, [showShortcutsBump])

  const shortcuts = [
    { label: t('chat.shortcuts.send'), keys: ['Cmd', 'Enter'] },
    { label: t('chat.shortcuts.newSession'), keys: ['Cmd', 'N'] },
    { label: t('chat.shortcuts.focusInput'), keys: ['Cmd', 'K'] },
    { label: t('chat.shortcuts.showHelp'), keys: ['Cmd', '/'] },
    { label: t('chat.shortcuts.stopStream'), keys: ['Esc'] }
  ]

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm" />
        <Dialog.Content
          role="dialog"
          className="fixed left-1/2 top-1/3 z-50 w-[360px] -translate-x-1/2 rounded border border-border bg-popover p-4 text-sm shadow"
        >
          <Dialog.Title className="text-base font-medium">{t('chat.shortcuts.title')}</Dialog.Title>
          <div className="mt-3 space-y-1.5">
            {shortcuts.map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="inline-flex gap-1">
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
