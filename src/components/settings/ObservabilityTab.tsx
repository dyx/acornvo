import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ipc } from '@/ipc/client'
import { useSettingsStore } from '@/stores/settings'

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
        <button
          data-testid="obs-export-diagnostic"
          disabled={exporting}
          className="rounded border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          onClick={() => { void onExport() }}
        >
          {exporting ? t('obs.export.diagnosticBusy') : t('obs.export.diagnostic')}
        </button>
        <TelemetryToggle />
      </footer>
    </div>
  )
}

// --- AI Panel ---

interface AiPanelData {
  totals: { requests: number; tokens: number; costUSD: number }
  byProfile: { profileId: string; requests: number; tokens: number }[]
  byTool: { tool: string; count: number }[]
  byDay: { day: string; tokens: number }[]
}

function ObservabilityAiPanel(): JSX.Element {
  const { t } = useTranslation()
  const [windowSel, setWindowSel] = useState<Window>('24h')
  const [data, setData] = useState<AiPanelData | null>(null)

  useEffect(() => {
    let cancelled = false
    const sinceDays = windowToDays(windowSel)
    async function fetchData() {
      const [summary, list] = await Promise.all([
        ipc.ai['usage.summary']({ sinceDays }),
        ipc.ai['usage.list']({ limit: 500, offset: 0 })
      ])
      if (cancelled) return

      // Map byProvider to byProfile array
      const byProfile = Object.entries(summary.byProvider).map(([profileId, v]) => ({
        profileId: profileId === 'unknown' ? t('obs.ai.unknownProfile') : profileId,
        requests: v.calls,
        tokens: v.tokens
      }))

      // Aggregate by model (proxy for tool)
      const toolMap = new Map<string, number>()
      for (const item of list.items) {
        const model = item.model ?? t('obs.ai.unknownModel')
        toolMap.set(model, (toolMap.get(model) ?? 0) + 1)
      }
      const byTool = Array.from(toolMap.entries())
        .map(([tool, count]) => ({ tool, count }))
        .sort((a, b) => b.count - a.count)

      // Aggregate by day from createdAt
      const dayMap = new Map<string, number>()
      for (const item of list.items) {
        const day = item.createdAt.slice(0, 10)
        const tokens = (item.promptTokens ?? 0) + (item.completionTokens ?? 0)
        dayMap.set(day, (dayMap.get(day) ?? 0) + tokens)
      }
      const byDay = Array.from(dayMap.entries())
        .map(([day, tokens]) => ({ day, tokens }))
        .sort((a, b) => a.day.localeCompare(b.day))

      // Estimate cost: $2/1M tokens (GPT-4 level)
      const costUSD = (summary.totalTokens / 1_000_000) * 2

      setData({
        totals: { requests: summary.totalCalls, tokens: summary.totalTokens, costUSD },
        byProfile,
        byTool,
        byDay
      })
    }
    void fetchData()
    return () => { cancelled = true }
  }, [windowSel, t])

  return (
    <div data-testid="obs-panel-ai" className="space-y-4">
      <div className="flex gap-2 text-sm">
        {(['24h', '7d', '30d'] as Window[]).map((w) => (
          <button
            key={w}
            data-testid={`obs-ai-window-${w}`}
            aria-pressed={w === windowSel}
            className={`rounded border px-2 py-1 ${w === windowSel ? 'bg-accent' : ''}`}
            onClick={() => setWindowSel(w)}
          >
            {t(`obs.window.${w}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <NumberCard testId="obs-ai-total-requests" label={t('obs.ai.totalRequests')} value={data?.totals.requests ?? 0} />
        <NumberCard testId="obs-ai-total-tokens" label={t('obs.ai.totalTokens')} value={data?.totals.tokens ?? 0} />
        <NumberCard testId="obs-ai-cost" label={t('obs.ai.estimatedCost')} value={`$${(data?.totals.costUSD ?? 0).toFixed(2)}`} />
      </div>

      <ProfileBars data={data?.byProfile ?? []} />
      <ToolList data={data?.byTool ?? []} />
      <DayLine data={data?.byDay ?? []} />
    </div>
  )
}

function NumberCard({ testId, label, value }: { testId: string; label: string; value: number | string }): JSX.Element {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div data-testid={testId} className="text-xl font-semibold">{value}</div>
    </div>
  )
}

function ProfileBars({ data }: { data: { profileId: string; requests: number; tokens: number }[] }): JSX.Element {
  const max = Math.max(1, ...data.map((d) => d.tokens))
  return (
    <ul data-testid="obs-ai-profile-bars" className="space-y-1">
      {data.map((d) => (
        <li key={d.profileId} className="flex items-center gap-2 text-sm">
          <span className="w-32 truncate">{d.profileId}</span>
          <div className="h-2 flex-1 rounded bg-muted">
            <div className="h-2 rounded bg-primary" style={{ width: `${(d.tokens / max) * 100}%` }} />
          </div>
          <span className="w-16 text-right tabular-nums">{d.tokens}</span>
        </li>
      ))}
    </ul>
  )
}

function ToolList({ data }: { data: { tool: string; count: number }[] }): JSX.Element {
  return (
    <ul data-testid="obs-ai-tools" className="space-y-1 text-sm">
      {data.map((d) => (
        <li key={d.tool} className="flex justify-between border-b py-1">
          <span>{d.tool}</span>
          <span className="tabular-nums">{d.count}</span>
        </li>
      ))}
    </ul>
  )
}

function DayLine({ data }: { data: { day: string; tokens: number }[] }): JSX.Element {
  if (data.length === 0) return <div data-testid="obs-ai-line-empty" />
  const max = Math.max(1, ...data.map((d) => d.tokens))
  const w = 320
  const h = 60
  const step = data.length > 1 ? w / (data.length - 1) : 0
  const path = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - (d.tokens / max) * h}`)
    .join(' ')
  return (
    <svg data-testid="obs-ai-line" width={w} height={h} className="text-primary">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
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
      if (!cancelled) { setHealth(h); setRecent(r) }
    }
    void tick()
    const id = setInterval(() => { void tick() }, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return (
    <div data-testid="obs-panel-queue" className="space-y-4">
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">{t('obs.queue.pending')}</div>
          <div data-testid="obs-queue-pending" className="text-xl font-semibold">{health.pending}</div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">{t('obs.queue.running')}</div>
          <div data-testid="obs-queue-running" className="text-xl font-semibold">{health.running}</div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs text-muted-foreground">{t('obs.queue.failed')}</div>
          <div data-testid="obs-queue-failed" className="text-xl font-semibold">{health.failed}</div>
        </div>
      </div>

      <ul className="space-y-1 text-sm">
        {recent.failed.slice(0, 20).map((f) => (
          <li key={f.id} className="flex items-center gap-2 border-b py-1">
            <span className="w-32 truncate">{f.kind}</span>
            <span className="flex-1 truncate text-muted-foreground">{f.last_error}</span>
            <button data-testid={`obs-queue-retry-${f.id}`} className="rounded border px-2 py-0.5"
              onClick={() => { void ipc.queue.retry(f.id) }}>{t('obs.queue.retry')}</button>
            <button data-testid={`obs-queue-discard-${f.id}`} className="rounded border px-2 py-0.5"
              onClick={() => { void ipc.queue.discard(f.id) }}>{t('obs.queue.discard')}</button>
          </li>
        ))}
      </ul>

      <ul data-testid="obs-queue-opslog" className="space-y-1 text-xs text-muted-foreground">
        {recent.opsLog.slice(0, 20).map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="tabular-nums">{r.ts}</span><span>{r.area}</span>
            <span className="flex-1 truncate">{r.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// --- Perf Panel ---

const PERF_AREAS = ['search.query', 'agent.step', 'clipper.save', 'clipper.ai-review', 'indexer.scan', 'indexer.update', 'project.open'] as const

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
  const [rows, setRows] = useState<{ area: string; count: number; p50: number; p95: number; successRate: number }[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all(
      PERF_AREAS.map((a) => ipc.perf.aggregates(a, 86400_000).then((agg) => ({ area: a, ...agg })))
    ).then((r) => {
      if (!cancelled) setRows(r)
    })
    return () => { cancelled = true }
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
            <tr key={r.area} data-testid={`obs-perf-row-${r.area}`}
              data-threshold={over ? 'over' : 'ok'}
              className={over ? 'text-red-600' : ''}>
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
    <label className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
      <input data-testid="obs-telemetry-toggle" type="checkbox"
        checked={telemetry.enabled}
        onChange={(e) => { void setTelemetry({ enabled: e.target.checked }) }} />
      <span>
        <strong className="block text-foreground">{t('telemetry.enable')}</strong>
        <span>{t('telemetry.description')}</span>
      </span>
    </label>
  )
}
