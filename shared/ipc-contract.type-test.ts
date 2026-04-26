/**
 * Compile-time-only contract assertions. This file is referenced by tsconfig
 * but never imported at runtime; TS errors here mean the contract drifted.
 */
import type {
  IpcClient,
  IpcContract,
  IpcChannelName,
  IpcResult
} from './ipc-contract'
import { IpcError } from './ipc-contract'
import type { GroveSummary, OpenGroveOutcome, RecentItemView } from './grove'

type Assert<T extends true> = T

type _EchoIsString = Assert<
  ReturnType<IpcClient<IpcContract>['ping']['echo']> extends Promise<string> ? true : false
>

type _LogIsVoid = Assert<
  ReturnType<IpcClient<IpcContract>['log']['info']> extends Promise<void> ? true : false
>

type _Channel = Assert<IpcChannelName<'ping', 'echo'> extends 'ping.echo' ? true : false>

type _ResultOk = Assert<Extract<IpcResult<number>, { ok: true }>['data'] extends number ? true : false>

// Ensure IpcError constructs from either a code string or a shape
const _e1: IpcError = new IpcError('E_INTERNAL', 'boom')
const _e2: IpcError = new IpcError({ code: 'E_NOT_FOUND', message: 'nope' })

// Suppress unused-variable warnings
export const _types = { _e1, _e2 } as const
export type _Exports = _EchoIsString | _LogIsVoid | _Channel | _ResultOk

type _ListRecentReturn = Assert<
  ReturnType<IpcClient<IpcContract>['project']['listRecent']> extends Promise<RecentItemView[]>
    ? true
    : false
>

type _OpenGroveReturn = Assert<
  ReturnType<IpcClient<IpcContract>['project']['openGrove']> extends Promise<OpenGroveOutcome>
    ? true
    : false
>

type _GetCurrentReturn = Assert<
  ReturnType<IpcClient<IpcContract>['project']['getCurrent']> extends Promise<GroveSummary | null>
    ? true
    : false
>

export type _ProjectExports =
  | _ListRecentReturn
  | _OpenGroveReturn
  | _GetCurrentReturn

import type { IpcEventApi, IpcEventChannel } from './ipc-contract'

type _EventChannelUnion = Assert<
  IpcEventChannel extends 'project:changed' | 'bootstrap:ready' | 'db:rebuilding' | 'db:rebuilt' ? true : false
>

declare const _eventApi: IpcEventApi
const _unsub = _eventApi.on('project:changed', (payload) => {
  // payload is GroveSummary | null — accessing .id on non-null is allowed only after narrowing
  if (payload) {
    const _id: string = payload.id
    void _id
  }
})
void _unsub

export type _EventExports = _EventChannelUnion
