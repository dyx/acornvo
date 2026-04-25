import { useEffect, useMemo, useState, type JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LockInfo } from '@shared/grove'
import { useGroveStore } from '@/stores/grove'
import { ipc } from '@/ipc/client'
import { useBootstrap } from '@/hooks/useBootstrap'
import { AcornLogo } from '@/components/AcornLogo'
import { ProjectCard } from '@/components/ProjectCard'
import { NewGroveDialog } from '@/components/NewGroveDialog'
import { Button } from '@/components/ui/button'
import { Plus, FolderOpen } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export function ProjectPicker(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const bootstrap = useBootstrap()
  const { recent, loadRecent, openGroveById, removeFromRecent, openExisting } = useGroveStore()

  // Locked-from-bootstrap highlight (first item cannot be auto-opened).
  const [lockedFromBootstrap, setLockedFromBootstrap] = useState<{
    path: string
    holder: LockInfo
  } | null>(null)

  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    if (bootstrap) {
      // seed recent from bootstrap payload so the list is visible immediately
      useGroveStore.setState({ recent: bootstrap.recent })
      if (bootstrap.locked) setLockedFromBootstrap(bootstrap.locked)
    }
    void loadRecent()
  }, [bootstrap, loadRecent])

  useEffect(() => {
    const onNew = (): void => setNewOpen(true)
    window.addEventListener('acorn:picker:new', onNew)
    return () => window.removeEventListener('acorn:picker:new', onNew)
  }, [])

  useEffect(() => {
    const onOpen = async (): Promise<void> => {
      const path = await ipc.project.selectDirectory('open')
      if (!path) return
      const res = await openExisting(path)
      if (res.status === 'opened') {
        navigate('/library')
      } else if (res.status === 'locked') {
        setLockedFromBootstrap({ path, holder: res.holder })
        toast({ title: t('picker.locked'), description: path })
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

  async function handleTakeover(path: string): Promise<void> {
    const res = await openExisting(path, { force: true })
    if (res.status === 'opened') {
      setLockedFromBootstrap(null)
      navigate('/library')
    } else if (res.status === 'error') {
      toast({
        title: t('takeover.title'),
        description: t('takeover.error', { message: res.message }),
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-[color:var(--color-paper)]">
      <div className="flex flex-1 overflow-hidden">
        {/* Left brand column */}
        <aside
          className="flex w-[420px] shrink-0 flex-col justify-between border-r border-[color:var(--color-line)] px-14 py-12"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, oklch(0.94 0.02 60 / 0.5) 100%)'
          }}
        >
          <div>
            <div className="mb-6 flex items-center gap-2.5">
              <AcornLogo size={36} />
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--color-ink-3)]">
                  Acornvo · v1.0
                </div>
                <div className="serif text-[26px] font-semibold leading-none tracking-tight">
                  松言果语
                </div>
              </div>
            </div>
            <p className="serif mt-7 max-w-[300px] text-[15px] leading-[1.7] text-[color:var(--color-ink-2)]">
              {t('picker.subtitle')}
            </p>
          </div>
          <div className="mt-9 font-mono text-[10.5px] leading-[1.7] text-[color:var(--color-ink-4)]">
            ~/.acornvo
          </div>
        </aside>

        {/* Right list + actions column */}
        <section className="flex-1 overflow-y-auto px-14 py-12">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="serif m-0 text-[22px] font-semibold tracking-tight">
              {t('picker.title')}
            </h2>
            <div className="font-mono text-[11px] text-[color:var(--color-ink-3)]">
              {t('picker.recentCount', { count: recent.length })}
            </div>
          </div>

          {hasRecent ? (
            <div className="flex flex-col gap-2.5">
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
                    onOpen={() => void handleOpen(item.id)}
                    onRemove={() => void removeFromRecent(item.id)}
                    onTakeover={locked ? () => void handleTakeover(item.path) : undefined}
                  />
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[color:var(--color-line-2)] px-6 py-10 text-center text-[color:var(--color-ink-3)]">
              {t('picker.empty')}
            </div>
          )}

          <div className="mt-6 flex gap-2.5">
            <Button
              className="flex-1"
              size="lg"
              data-testid="picker-new"
              // Task 7 wires this to the new-grove dialog
              onClick={() => {
                const ev = new CustomEvent('acorn:picker:new')
                window.dispatchEvent(ev)
              }}
            >
              <Plus className="h-3.5 w-3.5" />
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
              <FolderOpen className="h-3.5 w-3.5" />
              {t('picker.open')}
            </Button>
          </div>

          <p className="mt-7 font-mono text-[11px] leading-[1.7] text-[color:var(--color-ink-4)]">
            {t('picker.hint')}
          </p>
        </section>
      </div>
      <NewGroveDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={() => navigate('/library')}
      />
    </div>
  )
}
