import type { IpcClient, IpcContract } from '@shared/ipc-contract'

declare global {
  interface Window {
    api: IpcClient<IpcContract>
  }
}

export {}
