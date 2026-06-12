import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'

import { Button } from '@/components/ui/button'
import { HeatGraph } from '@/components/assistant-ui/heat-graph'
import { Activity } from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/date-utils'

type Panel = 'ai' | 'queue'
type Window = '24h' | '7d' | '30d'

function windowToDays(w: Window): number {
  return w === '24h' ? 1 : w === '7d' ? 7 : 30
}

export function ObservabilityTab(): JSX.Element {
  const { t } = useTranslation()
  const [panel, setPanel] = useState<Panel>('ai')
  const [exporting, setExporting] = useState(false)

  async function onExport(): Promise<void> {
    setExporting(true)
    try {
      await ipc.ops.exportDiagnostic()
    } finally {
      setExporting(false)
    }
  }

  return (
    <div data-testid="settings-tab-observability" className="flex h-full flex-col">


      <div role="tablist" className="flex gap-2 border-b">
        {(['ai', 'queue'] as Panel[]).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={panel === p}
            data-testid={`obs-tab-${p}`}
            className={`px-3 py-2 text-sm ${panel === p ? 'border-b-2 border-primary' : ''}`}
            onClick={() => setPanel(p)}
          >
            {t(`obs.tabs.${p}`)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        {panel === 'ai' && <ObservabilityAiPanel />}
        {panel === 'queue' && <ObservabilityQueuePanel />}

      </div>

      <footer className="mt-4 border-t pt-4">
        <Button
          data-testid="obs-export-diagnostic"
          disabled={exporting}
          variant="outline"
          onClick={() => {
            void onExport()
          }}
        >
          {exporting ? t('obs.export.diagnosticBusy') : t('obs.export.diagnostic')}
        </Button>

      </footer>
    </div>
  )
}

// --- AI Panel ---

interface AiPanelData {
  totals: { requests: number; tokens: number }
  byProfile: { profileId: string; requests: number; tokens: number }[]
  byGrove: { groveId: string; requests: number; tokens: number }[]
  byTool: { tool: string; count: number }[]
  heatGraphData: { date: Date; count: number }[]
}


function ObservabilityAiPanel(): JSX.Element {
  const { t } = useTranslation()
  const [windowSel, setWindowSel] = useState<Window>('24h')
  const [data, setData] = useState<AiPanelData | null>(null)

  useEffect(() => {
    let cancelled = false
    const sinceDays = windowToDays(windowSel)
    async function fetchData() {
      const [summary, list, models, recentProjects] = await Promise.all([
        ipc.ai['usage.summary']({ sinceDays }),
        ipc.ai['usage.list']({ limit: 2000, offset: 0 }),
        ipc.settings.aiModelsList(),
        ipc.project.listRecent()
      ])
      if (cancelled) return


      const modelNameMap = new Map(models.map((m: any) => [m.id, m.displayName]))
      const groveNameMap = new Map(recentProjects.map((g: any) => [g.id, g.name]))

      const byProfile = Object.entries(summary.byProvider).map(([modelId, v]) => ({
        profileId: modelId === 'unknown' ? t('obs.ai.unknownProfile') : (modelNameMap.get(modelId) || modelId),
        requests: v.calls,
        tokens: v.tokens
      }))

      const byGrove = Object.entries((summary as any).byGrove ?? {}).map(
        ([groveId, v]: [string, any]) => ({
          groveId: groveId === 'unknown' ? t('obs.ai.unknownGrove', 'Unknown Project') : (groveNameMap.get(groveId) || groveId),
          requests: v.calls,
          tokens: v.tokens
        })
      )

      const cutoff = new Date(Date.now() - sinceDays * 86400000).toISOString()
      const windowItems = list.items.filter((item: any) => item.createdAt >= cutoff)
      
      const toolMap = new Map<string, number>()
      for (const item of windowItems) {
        const model = item.modelId ? (modelNameMap.get(item.modelId) || item.modelId) : t('obs.ai.unknownModel')
        toolMap.set(model, (toolMap.get(model) ?? 0) + 1)
      }
      const byTool = Array.from(toolMap.entries())
        .map(([tool, count]) => ({ tool, count }))
        .sort((a, b) => b.count - a.count)

      const dayMap = new Map<string, number>()
      for (const item of list.items) {
        const day = formatDate(item.createdAt)
        const tokens = (item.promptTokens ?? 0) + (item.completionTokens ?? 0)
        dayMap.set(day, (dayMap.get(day) ?? 0) + tokens)
      }
      const heatGraphData = Array.from(dayMap.entries())
        .map(([day, tokens]) => ({ date: new Date(day), count: tokens }))
        .sort((a, b) => a.date.getTime() - b.date.getTime())

      setData({
        totals: { requests: summary.totalCalls, tokens: summary.totalTokens },
        byProfile,
        byGrove,
        byTool,
        heatGraphData
      })
    }
    void fetchData()
    return () => {
      cancelled = true
    }
  }, [windowSel, t])

  const totals = data?.totals || { requests: 0, tokens: 0 };
  const heatGraphData = data?.heatGraphData || [];
  const byTool = data?.byTool || [];
  const byProject = data?.byGrove || [];
  const totalRequests = totals.requests || 1;
  const byToolWithPercentage = byTool.map(item => ({
    ...item,
    percentage: Math.round((item.count / totalRequests) * 100)
  }));

  return (
    <div data-testid="obs-panel-ai" className="space-y-6">
      <div className="flex items-center mb-4">
        <div className="flex bg-muted/30 p-1 rounded-lg backdrop-blur-md border border-white/10 shadow-sm">
          {(['24h', '7d', '30d'] as Window[]).map((w) => (
            <button
              key={w}
              data-testid={`obs-ai-window-${w}`}
              aria-pressed={w === windowSel}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-300 ${
                w === windowSel 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setWindowSel(w)}
            >
              {t(`obs.window.${w}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full flex flex-col gap-6 font-sans text-sm">
        {/* Top: Full-Width Heatgraph */}
        <div className="rounded-xl bg-card border shadow-sm p-4 md:p-5 w-full">
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            {t('obs.ai.activityTimeline')}
          </h2>
          <div className="flex justify-between items-end mb-8">
            <div>
              <div className="text-4xl font-light tracking-tight">{totals.requests.toLocaleString()}</div>
              <div className="text-muted-foreground mt-1">{t('obs.ai.totalRequests')}</div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-light tracking-tight text-primary">
                {totals.tokens >= 1000 ? (totals.tokens / 1000).toFixed(1) + 'k' : totals.tokens}
              </div>
              <div className="text-muted-foreground mt-1">{t('obs.ai.totalTokens')}</div>
            </div>
          </div>
          <div className="overflow-x-auto pb-2 custom-scrollbar">
            {heatGraphData.length > 0 ? (
              <HeatGraph 
                data={heatGraphData} 
                start={new Date(Date.now() - 254 * 86400000)}
                end={new Date()}
              />
            ) : (
              <div className="h-[120px] w-full animate-pulse bg-muted/50 rounded-md" />
            )}
          </div>
        </div>

        {/* Bottom: Split Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {/* Models */}
          <div className="rounded-xl bg-card border shadow-sm p-5">
            <h3 className="font-medium mb-4 flex items-center justify-between">
              {t('obs.ai.models')}
              <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{byTool.length} {t('obs.ai.active')}</span>
            </h3>
            <div className="space-y-4">
              {byToolWithPercentage.length === 0 && <div className="text-xs text-muted-foreground italic">{t('obs.ai.noData')}</div>}
              {byToolWithPercentage.map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium truncate pr-2" title={item.tool}>{item.tool}</span>
                    <span className="text-muted-foreground">{item.percentage}%</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${item.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Projects */}
          <div className="rounded-xl bg-card border shadow-sm p-5">
            <h3 className="font-medium mb-4 flex items-center justify-between">
              {t('obs.ai.topProjects')}
              <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t('obs.ai.byTokens')}</span>
            </h3>
            <div className="space-y-3">
              {byProject.length === 0 && <div className="text-xs text-muted-foreground italic">{t('obs.ai.noData')}</div>}
              {byProject.sort((a, b) => b.tokens - a.tokens).slice(0, 10).map((proj, i) => (
                <div key={i} className="flex justify-between items-center group" title={proj.groveId}>
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center text-xs font-medium shrink-0">
                      {i + 1}
                    </div>
                    <span className="truncate text-sm">{proj.groveId}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground shrink-0 ml-2">
                    {proj.tokens >= 1000 ? (proj.tokens / 1000).toFixed(1) + 'k' : proj.tokens}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Replaced by Variant D layout in ObservabilityAiPanel

// --- Queue Panel ---

function ObservabilityQueuePanel(): JSX.Element {
  const { t } = useTranslation()
  const [health, setHealth] = useState({ pending: 0, running: 0, failed: 0 })
  const [recent, setRecent] = useState<{
    failed: { id: string; kind: string; last_error: string; updated_at: string }[]
    opsLog: { ts: string; area: string; message: string }[]
  }>({ failed: [], opsLog: [] })

  useEffect(() => {
    let cancelled = false
    async function tick() {
      const [h, r] = await Promise.all([ipc.queue.health(), ipc.queue.recent()])
      if (!cancelled) {
        setHealth(h)
        setRecent(r)
      }
    }
    void tick()
    const id = setInterval(() => {
      void tick()
    }, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <div data-testid="obs-panel-queue" className="space-y-4">
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">{t('obs.queue.pending')}</div>
          <div data-testid="obs-queue-pending" className="text-xl font-semibold">
            {health.pending}
          </div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">{t('obs.queue.running')}</div>
          <div data-testid="obs-queue-running" className="text-xl font-semibold">
            {health.running}
          </div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">{t('obs.queue.failed')}</div>
          <div data-testid="obs-queue-failed" className="text-xl font-semibold">
            {health.failed}
          </div>
        </div>
      </div>

      <ul className="space-y-1 text-sm">
        {recent.failed.slice(0, 20).map((f) => (
          <li key={f.id} className="flex items-center gap-2 border-b py-1">
            <span className="w-32 truncate">{f.kind}</span>
            <span className="flex-1 truncate text-muted-foreground">{f.last_error}</span>
            <Button
              data-testid={`obs-queue-retry-${f.id}`}
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                void ipc.queue.retry(f.id)
              }}
            >
              {t('obs.queue.retry')}
            </Button>
            <Button
              data-testid={`obs-queue-discard-${f.id}`}
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => {
                void ipc.queue.discard(f.id)
              }}
            >
              {t('obs.queue.discard')}
            </Button>
          </li>
        ))}
      </ul>

      <ul data-testid="obs-queue-opslog" className="space-y-1 text-xs text-muted-foreground">
        {recent.opsLog.slice(0, 20).map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="tabular-nums">{formatDateTime(r.ts)}</span>
            <span>{r.area}</span>
            <span className="flex-1 truncate">{r.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

