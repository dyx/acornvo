import type { IpcClient, IpcContract, IpcEventApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    api: IpcClient<IpcContract> & Pick<IpcEventApi, 'on'>
  }
}

export {}
