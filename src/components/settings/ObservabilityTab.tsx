import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'
import { useSettingsStore } from '@/stores/settings'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { HeatGraph } from '@/components/assistant-ui/heat-graph'
import { Activity, BarChart2, Hash, Cpu, Layers, Zap } from 'lucide-react'

type Panel = 'ai' | 'queue' | 'perf'
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
      <h3 className="text-lg font-medium">{t('obs.title')}</h3>

      <div role="tablist" className="mt-4 flex gap-2 border-b">
        {(['ai', 'queue', 'perf'] as Panel[]).map((p) => (
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
        {panel === 'perf' && <ObservabilityPerfPanel />}
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
        <TelemetryToggle />
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
      const [summary, list, profiles, recentProjects] = await Promise.all([
        ipc.ai['usage.summary']({ sinceDays }),
        ipc.ai['usage.list']({ limit: 2000, offset: 0 }),
        ipc.settings.aiProfilesList(),
        ipc.project.listRecent()
      ])
      if (cancelled) return

      const profileNameMap = new Map(profiles.map((p: any) => [p.id, p.name]))
      const groveNameMap = new Map(recentProjects.map((g: any) => [g.id, g.name]))

      const byProfile = Object.entries(summary.byProvider).map(([profileId, v]) => ({
        profileId: profileId === 'unknown' ? t('obs.ai.unknownProfile') : (profileNameMap.get(profileId) || profileId),
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
        const model = item.model || t('obs.ai.unknownModel')
        toolMap.set(model, (toolMap.get(model) ?? 0) + 1)
      }
      const byTool = Array.from(toolMap.entries())
        .map(([tool, count]) => ({ tool, count }))
        .sort((a, b) => b.count - a.count)

      const dayMap = new Map<string, number>()
      for (const item of list.items) {
        const day = item.createdAt.slice(0, 10)
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

  return (
    <div data-testid="obs-panel-ai" className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Activity className="size-4" /> {t('obs.ai.globalActivity')}
        </h4>
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

      <div className="grid grid-cols-2 gap-4">
        <NumberCard
          testId="obs-ai-total-requests"
          label={t('obs.ai.totalRequests')}
          value={data?.totals.requests ?? 0}
          icon={<Hash className="size-4 opacity-50" />}
          trend="+12%"
        />
        <NumberCard
          testId="obs-ai-total-tokens"
          label={t('obs.ai.totalTokens')}
          value={(data?.totals.tokens ?? 0).toLocaleString()}
          icon={<Cpu className="size-4 opacity-50" />}
          trend="+5%" 
        />
      </div>

      <div className="rounded-xl border bg-card text-card-foreground p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <BarChart2 className="size-4 text-blue-500" />
            {t('obs.ai.tokenUsageHistory')}
          </h4>
          <span className="text-xs text-muted-foreground">{t('obs.ai.last6Months')}</span>
        </div>
        <div className="flex overflow-x-auto pb-4 custom-scrollbar">
          {data?.heatGraphData ? (
            <HeatGraph data={data.heatGraphData} />
          ) : (
            <div className="h-[90px] w-full animate-pulse bg-muted/50 rounded-md" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4 rounded-xl border bg-card text-card-foreground p-5 shadow-sm">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Layers className="size-4 text-purple-500" />
            {t('obs.ai.byProfile')}
          </h4>
          <ProfileBars data={data?.byProfile ?? []} />
        </div>
        <div className="space-y-4 rounded-xl border bg-card text-card-foreground p-5 shadow-sm">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="size-4 text-green-500" />
            {t('obs.ai.byProject')}
          </h4>
          <GroveBars data={data?.byGrove ?? []} />
        </div>
      </div>

      <div className="rounded-xl border bg-card text-card-foreground p-5 shadow-sm">
         <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
           <Zap className="size-4 text-yellow-500" />
           {t('obs.ai.modelUsage')}
         </h4>
         <ToolList data={data?.byTool ?? []} />
      </div>
    </div>
  )
}

function NumberCard({
  testId,
  label,
  value,
  icon,
  trend
}: {
  testId: string
  label: string
  value: number | string
  icon?: JSX.Element
  trend?: string
}): JSX.Element {
  return (
    <div className="rounded-lg border bg-card text-card-foreground p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {icon} {label}
        </div>
        {trend && (
          <div className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
            {trend}
          </div>
        )}
      </div>
      <div data-testid={testId} className="text-2xl font-semibold tracking-tight">
        {value}
      </div>
    </div>
  )
}

function ProfileBars({
  data
}: {
  data: { profileId: string; requests: number; tokens: number }[]
}) {
  const { t } = useTranslation();
  if (data.length === 0) return <div className="text-sm text-muted-foreground italic">{t("obs.ai.noData")}</div>
  const maxReq = Math.max(...data.map((d) => d.requests))
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.profileId} className="group relative">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium truncate pr-2">{d.profileId}</span>
            <span className="text-muted-foreground">{d.requests}</span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${(d.requests / maxReq) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function GroveBars({ data }: { data: { groveId: string; requests: number; tokens: number }[] }) {
  const { t } = useTranslation();
  if (data.length === 0) return <div className="text-sm text-muted-foreground italic">{t("obs.ai.noData")}</div>
  const maxReq = Math.max(...data.map((d) => d.requests))
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.groveId} className="group relative">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium truncate pr-2">{d.groveId}</span>
            <span className="text-muted-foreground">{d.requests}</span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${(d.requests / maxReq) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ToolList({ data }: { data: { tool: string; count: number }[] }): JSX.Element {
  const { t } = useTranslation();
  if (data.length === 0) return <div className="text-sm text-muted-foreground italic">{t("obs.ai.noModelsUsed")}</div>
  return (
    <div data-testid="obs-ai-tools" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {data.map((d, i) => (
        <div key={d.tool} className="flex items-center justify-between p-2 rounded-md bg-muted/50 border border-transparent transition-colors hover:bg-muted">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex size-5 items-center justify-center rounded bg-primary/10 text-[10px] font-medium text-primary">
              {i + 1}
            </div>
            <span className="text-sm font-medium truncate">{d.tool}</span>
          </div>
          <span className="text-xs font-medium tabular-nums text-muted-foreground bg-background px-2 py-0.5 rounded shadow-sm border border-border/50">
            {d.count}
          </span>
        </div>
      ))}
    </div>
  )
}

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
            <span className="tabular-nums">{r.ts}</span>
            <span>{r.area}</span>
            <span className="flex-1 truncate">{r.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// --- Perf Panel ---

const PERF_AREAS = [
  'search.query',
  'agent.step',
  'clipper.save',
  'clipper.ai-review',
  'indexer.scan',
  'indexer.update',
  'project.open'
] as const

const THRESHOLDS_MS: Record<string, number> = {
  'search.query': 500,
  'agent.step': 30_000,
  'clipper.save': 10_000,
  'clipper.ai-review': 30_000,
  'indexer.scan': 5_000,
  'indexer.update': 1_000,
  'project.open': 5_000
}

function ObservabilityPerfPanel(): JSX.Element {
  const { t } = useTranslation()
  const [rows, setRows] = useState<
    { area: string; count: number; p50: number; p95: number; successRate: number }[]
  >([])

  useEffect(() => {
    let cancelled = false
    Promise.all(
      PERF_AREAS.map((a) => ipc.perf.aggregates(a, 86400_000).then((agg) => ({ area: a, ...agg })))
    ).then((r) => {
      if (!cancelled) setRows(r)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <table data-testid="obs-panel-perf" className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th>{t('obs.perf.area')}</th>
          <th className="text-right">{t('obs.perf.count')}</th>
          <th className="text-right">{t('obs.perf.p50')}</th>
          <th className="text-right">{t('obs.perf.p95')}</th>
          <th className="text-right">{t('obs.perf.successRate')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const over = r.p95 > (THRESHOLDS_MS[r.area] ?? 999_999)
          return (
            <tr
              key={r.area}
              data-testid={`obs-perf-row-${r.area}`}
              data-threshold={over ? 'over' : 'ok'}
              className={over ? 'text-red-600' : ''}
            >
              <td>{r.area}</td>
              <td className="text-right tabular-nums">{r.count}</td>
              <td className="text-right tabular-nums">{r.p50}</td>
              <td className="text-right tabular-nums">{r.p95}</td>
              <td className="text-right tabular-nums">{(r.successRate * 100).toFixed(0)}%</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// --- Telemetry Toggle ---

function TelemetryToggle(): JSX.Element {
  const { t } = useTranslation()
  const telemetry = useSettingsStore((s) => s.telemetry)
  const setTelemetry = useSettingsStore((s) => s.setTelemetry)
  return (
    <div className="mt-4 flex items-start space-x-3 text-xs text-muted-foreground">
      <Switch
        id="obs-telemetry-toggle"
        data-testid="obs-telemetry-toggle"
        checked={telemetry.enabled}
        onCheckedChange={(checked) => {
          void setTelemetry({ enabled: checked })
        }}
      />
      <label htmlFor="obs-telemetry-toggle" className="cursor-pointer space-y-1">
        <strong className="block text-foreground">{t('telemetry.enable')}</strong>
        <span className="block">{t('telemetry.description')}</span>
      </label>
    </div>
  )
}
