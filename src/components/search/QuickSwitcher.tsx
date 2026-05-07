import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSearchStore } from '@/stores/search'

export function QuickSwitcher(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const open = useSearchStore((s) => s.quickSwitcher.openState)
  const q = useSearchStore((s) => s.quickSwitcher.q)
  const items = useSearchStore((s) => s.quickSwitcher.items)
  const selectedIndex = useSearchStore((s) => s.quickSwitcher.selectedIndex)
  const close = useSearchStore((s) => s.quickSwitcher.close)
  const onPick = useSearchStore((s) => s.quickSwitcher.onPick)
  const scheduleQuery = useSearchStore((s) => s.quickSwitcher.scheduleQuery)
  const moveSelection = useSearchStore((s) => s.quickSwitcher.moveSelection)
  const setSelectedIndex = useSearchStore((s) => s.quickSwitcher.setSelectedIndex)
  const pushRecent = useSearchStore((s) => s.quickSwitcher.pushRecent)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(id)
    }
    return undefined
  }, [open])

  function pickItem(item: { path: string; title?: string | null }): void {
    const curOnPick = useSearchStore.getState().quickSwitcher.onPick
    pushRecent(item.path)
    if (curOnPick) {
      const fs = items.find((i) => i.path === item.path) ?? { path: item.path, title: item.title ?? null, clipped_at: null }
      curOnPick(fs)
    } else {
      navigate('/editor/' + encodeURIComponent(item.path))
    }
    close()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    const mod = e.metaKey || e.ctrlKey
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveSelection(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveSelection(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = items[selectedIndex]
      if (!target) return
      if (mod) {
        pushRecent(target.path)
        navigate('/library?focus=' + encodeURIComponent(target.path))
        close()
      } else {
        pickItem(target)
      }
    }
  }

  const recent = useSearchStore((s) => s.quickSwitcher.recent)

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) close() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm"
          aria-hidden="true"
        />
        <Dialog.Content
          onKeyDown={handleKeyDown}
          className="fixed left-1/2 top-[15vh] z-50 -translate-x-1/2 w-[600px] max-w-[90vw] rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <Dialog.Title className="sr-only">QuickSwitcher</Dialog.Title>
          <Dialog.Description className="sr-only">{t('search.placeholder_quick')}</Dialog.Description>
          <div className="border-b border-border p-3">
            <input
              ref={inputRef}
              type="text"
              role="textbox"
              value={q}
              onChange={(e) => scheduleQuery(e.target.value)}
              placeholder={t('search.placeholder_quick')}
              className="w-full bg-transparent outline-none text-base"
              aria-label={t('search.placeholder_quick')}
            />
          </div>
          <ul className="max-h-[480px] overflow-y-auto" role="listbox" aria-label="results">
            {q.length === 0 && items.length === 0 ? (
              <>
                <li className="px-3 py-1 text-xs text-muted-foreground uppercase tracking-wide">
                  {t('search.recent')}
                </li>
                {recent.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-muted-foreground">{t('search.no_results')}</li>
                ) : (
                  recent.map((p, i) => (
                    <li
                      key={p}
                      role="option"
                      aria-selected={i === selectedIndex ? 'true' : 'false'}
                      className={
                        'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ' +
                        (i === selectedIndex ? 'bg-accent text-accent-foreground border-l-2 border-primary' : '')
                      }
                      onMouseEnter={() => setSelectedIndex(i)}
                      onClick={() => pickItem({ path: p })}
                    >
                      <span className="truncate">{p}</span>
                    </li>
                  ))
                )}
              </>
            ) : items.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">{t('search.no_results')}</li>
            ) : (
              items.map((it, i) => (
                <li
                  key={it.path}
                  role="option"
                  aria-selected={i === selectedIndex ? 'true' : 'false'}
                  className={
                    'flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer ' +
                    (i === selectedIndex ? 'bg-accent text-accent-foreground border-l-2 border-primary' : '')
                  }
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => pickItem(it)}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{it.title ?? it.path}</span>
                    <span className="text-xs text-muted-foreground truncate">{it.path}</span>
                  </div>
                  {it.clipped_at ? (
                    <span className="text-xs text-muted-foreground shrink-0">{it.clipped_at}</span>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
