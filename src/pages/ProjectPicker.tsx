import { useEffect, useMemo, useState, type JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LockInfo } from '@shared/grove'
import { useGroveStore } from '@/stores/grove'
import { ipc } from '@/ipc/client'
import { useBootstrap } from '@/hooks/useBootstrap'

import { ProjectCard } from '@/components/ProjectCard'
import { TakeoverDialog } from '@/components/TakeoverDialog'
import { Button } from '@/components/ui/button'
import { Plus, FolderOpen } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

import { CozyWindowShade } from '@/components/library/CozyWindowShade'

export function ProjectPicker(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const bootstrap = useBootstrap()
  const { current, recent, loadRecent, openGroveById, removeFromRecent, openExisting } = useGroveStore()

  // Locked-from-bootstrap highlight (first item cannot be auto-opened).
  const [lockedFromBootstrap, setLockedFromBootstrap] = useState<{
    path: string
    holder: LockInfo
  } | null>(null)

  const [takeover, setTakeover] = useState<{ path: string; holder: LockInfo } | null>(null)
  const [takeoverPending, setTakeoverPending] = useState(false)

  useEffect(() => {
    if (bootstrap) {
      // seed recent from bootstrap payload so the list is visible immediately
      useGroveStore.setState({ recent: bootstrap.recent })
      if (bootstrap.locked) setLockedFromBootstrap(bootstrap.locked)
    }
    void loadRecent()
  }, [bootstrap, loadRecent])

  useEffect(() => {
    const onOpen = async (): Promise<void> => {
      const path = await ipc.project.selectDirectory('open')
      if (!path) return
      const res = await openExisting(path)
      if (res.status === 'opened') {
        navigate('/library')
      } else if (res.status === 'locked') {
        requestTakeover(path, res.holder)
      } else {
        toast({ title: t('common.error'), description: res.message, variant: 'destructive' })
      }
      await loadRecent()
    }
    const listener = (): void => {
      void onOpen()
    }
    window.addEventListener('acorn:picker:open', listener)
    return () => window.removeEventListener('acorn:picker:open', listener)
  }, [loadRecent, navigate, openExisting, t])

  const hasRecent = recent.length > 0

  const items = useMemo(() => recent, [recent])

  async function handleOpen(id: string): Promise<void> {
    const res = await openGroveById(id)
    if (res.status === 'opened') {
      navigate('/library')
    } else if (res.status === 'error') {
      toast({ title: t('common.error'), description: res.message, variant: 'destructive' })
    }
  }

  function requestTakeover(path: string, holder: LockInfo): void {
    setTakeover({ path, holder })
  }

  async function confirmTakeover(): Promise<void> {
    if (!takeover) return
    setTakeoverPending(true)
    const res = await openExisting(takeover.path, { force: true })
    setTakeoverPending(false)
    if (res.status === 'opened') {
      setLockedFromBootstrap(null)
      setTakeover(null)
      navigate('/library')
    } else if (res.status === 'error') {
      setTakeover(null)
      toast({
        title: t('takeover.title'),
        description: t('takeover.error', { message: res.message }),
        variant: 'destructive'
      })
    } else {
      // Still locked — refresh holder, keep the dialog open
      setTakeover({ path: takeover.path, holder: res.holder })
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-[color:var(--color-paper)] relative">
      <CozyWindowShade active={true} />
      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Left brand column */}
        <aside
          className="relative flex w-[420px] shrink-0 flex-col justify-between px-14 py-12"
        >
          {/* Custom vertical line matching AppRail height */}
          <div
            className="absolute right-0 top-[40px] bottom-3 w-[1px] pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, transparent, var(--color-line) 15%, var(--color-line) 85%, transparent)'
            }}
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-5 mb-10">
              <span className="text-[50px] leading-none select-none shrink-0" style={{ transform: 'translateY(4px)' }}>🌰</span>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 font-review text-[13px] uppercase tracking-[0.25em] text-[color:var(--color-ink-3)] pl-[2px]">
                  <span>Acornvo</span>
                  <span className="size-[3px] rounded-full bg-[color:var(--color-ink-4)]" />
                  <span>v1.0</span>
                </div>
                <h1 className="font-review text-[44px] font-medium leading-none tracking-tight text-[color:var(--color-ink)]">
                  松言果语
                </h1>
              </div>
            </div>

            <p className="font-review max-w-[340px] text-[18px] leading-[2.2] text-[color:var(--color-ink-2)]">
              {t('picker.subtitle')}
            </p>
          </div>
        </aside>

        {/* Right list + actions column */}
        <section className="flex-1 flex flex-col overflow-hidden px-14 py-12 relative">
          <div className="flex-none mb-6 flex items-baseline justify-between">
            <h2 className="serif m-0 text-2xl font-semibold tracking-tight">
              {t('picker.title')}
            </h2>
          </div>

          <div className="flex-initial overflow-y-auto min-h-0 pr-2 -mr-2 pb-6">
            {hasRecent ? (
              <div className="flex flex-col gap-3">
                {items.map((item, i) => {
                  const locked =
                    lockedFromBootstrap && lockedFromBootstrap.path === item.path
                      ? lockedFromBootstrap.holder
                      : undefined
                  return (
                    <ProjectCard
                      key={item.id}
                      item={item}
                      index={i}
                      locked={locked}
                      isActive={current?.id === item.id}
                      onOpen={() => void handleOpen(item.id)}
                      onRemove={() => void removeFromRecent(item.id)}
                      onTakeover={locked ? () => requestTakeover(item.path, locked) : undefined}
                    />
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[color:var(--color-line-2)] px-6 py-10 text-center text-[color:var(--color-ink-3)]">
                {t('picker.empty')}
              </div>
            )}
          </div>

          <div className="flex-none pt-4">
            <div className="flex gap-3">
              <Button
                className="flex-1"
                size="lg"
                data-testid="picker-new"
                onClick={() => {
                  const ev = new CustomEvent('acorn:picker:new')
                  window.dispatchEvent(ev)
                }}
              >
                <Plus className="h-4 w-4" />
                {t('picker.new')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                size="lg"
                data-testid="picker-open"
                onClick={() => {
                  const ev = new CustomEvent('acorn:picker:open')
                  window.dispatchEvent(ev)
                }}
              >
                <FolderOpen className="h-4 w-4" />
                {t('picker.open')}
              </Button>
            </div>
            <p className="mt-7 font-mono text-xs leading-[1.7] text-[color:var(--color-ink-4)]">
              {t('picker.hint')}
            </p>
          </div>
        </section>
      </div>
      {takeover ? (
        <TakeoverDialog
          open={!!takeover}
          onOpenChange={(o) => {
            if (!o) setTakeover(null)
          }}
          grovePath={takeover.path}
          holder={takeover.holder}
          onConfirm={() => void confirmTakeover()}
          pending={takeoverPending}
        />
      ) : null}
    </div>
  )
}
