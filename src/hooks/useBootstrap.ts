import { useEffect, useState } from 'react'
import type { IpcEventContract } from '@shared/ipc-contract'
import { ipc } from '@/ipc/client'

export type BootstrapPayload = IpcEventContract['bootstrap:ready']

export function useBootstrap(): BootstrapPayload | null {
  const [payload, setPayload] = useState<BootstrapPayload | null>(null)

  useEffect(() => {
    let active = true
    ipc.app.getBootstrap().then((res) => {
      if (active && res) setPayload(res)
    })

    const unsub = ipc.on('bootstrap:ready', setPayload)
    return () => {
      active = false
      unsub()
    }
  }, [])

  return payload
}
