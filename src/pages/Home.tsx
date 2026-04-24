import { useState, type JSX } from 'react'
import { ipc } from '@/ipc/client'
import { useHomeStore } from '@/stores/home'

export function Home(): JSX.Element {
  const { lastPingResult, lastPingError, setPingResult, setPingError } =
    useHomeStore()
  const [inFlight, setInFlight] = useState(false)

  async function onPing(): Promise<void> {
    setInFlight(true)
    try {
      const result = await ipc.ping.echo('hi')
      setPingResult(result)
    } catch (err) {
      setPingError(err instanceof Error ? err.message : String(err))
    } finally {
      setInFlight(false)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Hello Acornvo</h1>
      <button type="button" onClick={() => void onPing()} disabled={inFlight}>
        {inFlight ? 'pinging…' : 'ping'}
      </button>
      {lastPingResult !== null && (
        <p data-testid="ping-result">result: {lastPingResult}</p>
      )}
      {lastPingError !== null && (
        <p data-testid="ping-error" style={{ color: 'crimson' }}>
          error: {lastPingError}
        </p>
      )}
    </div>
  )
}
