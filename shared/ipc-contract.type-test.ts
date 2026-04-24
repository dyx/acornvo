/**
 * Compile-time-only contract assertions. This file is referenced by tsconfig
 * but never imported at runtime; TS errors here mean the contract drifted.
 */
import type {
  IpcClient,
  IpcContract,
  IpcChannelName,
  IpcResult,
  GroveSummary,
  OpenGroveResult,
  RecentItemDto
} from './ipc-contract'
import { IpcError } from './ipc-contract'

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
  ReturnType<IpcClient<IpcContract>['project']['listRecent']> extends Promise<RecentItemDto[]>
    ? true
    : false
>

type _OpenGroveReturn = Assert<
  ReturnType<IpcClient<IpcContract>['project']['openGrove']> extends Promise<OpenGroveResult>
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
