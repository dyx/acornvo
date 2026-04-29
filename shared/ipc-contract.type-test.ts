/**
 * Compile-time-only contract assertions. This file is referenced by tsconfig
 * but never imported at runtime; TS errors here mean the contract drifted.
 */
import type {
  IpcClient,
  IpcContract,
  IpcChannelName,
  IpcResult,
  IndexStateName,
  IndexStatusView
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

// Index namespace compile-time assertions (phase-05)
type _IndexStateName = Assert<
  IndexStateName extends 'idle' | 'scanning' | 'ready' | 'watching' | 'error' ? true : false
>

type _IndexStatusReturn = Assert<
  ReturnType<IpcClient<IpcContract>['index']['status']> extends Promise<IndexStatusView> ? true : false
>

type _IndexStartScanVoid = Assert<
  ReturnType<IpcClient<IpcContract>['index']['startScan']> extends Promise<void> ? true : false
>

type _IndexCancelScanVoid = Assert<
  ReturnType<IpcClient<IpcContract>['index']['cancelScan']> extends Promise<void> ? true : false
>

export type _IndexExports =
  | _IndexStateName
  | _IndexStatusReturn
  | _IndexStartScanVoid
  | _IndexCancelScanVoid

import type { IpcEventApi, IpcEventChannel } from './ipc-contract'

type _EventChannelUnion = Assert<
  IpcEventChannel extends
    | 'project:changed'
    | 'bootstrap:ready'
    | 'db:rebuilding'
    | 'db:rebuilt'
    | 'index:progress'
    | 'index:done'
    | 'index:error'
    | 'index:stateChange'
    | 'index:fileChanged'
    | 'index:fileDeleted'
    | 'index:fileRenamed'
    | 'index:rebuildProgress'
    | 'index:rebuildDone'
    ? true
    : false
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

// Index event channel type assertions (phase-05)
declare const _eventApi2: IpcEventApi
const _unsub2 = _eventApi2.on('index:progress', (payload) => {
  const _scanned: number = payload.scanned
  const _total: number = payload.total
  void _scanned; void _total
})
void _unsub2

const _unsub3 = _eventApi2.on('index:done', (payload) => {
  // payload is Record<string, never> (empty object)
  void payload
})
void _unsub3

const _unsub4 = _eventApi2.on('index:error', (payload) => {
  const _message: string = payload.message
  void _message
})
void _unsub4

const _unsub5 = _eventApi2.on('index:stateChange', (payload) => {
  const _state: IndexStateName = payload.state
  void _state
})
void _unsub5

const _unsub6 = _eventApi2.on('index:fileChanged', (payload) => {
  const _path: string = payload.path
  const _contentHash: string = payload.contentHash
  const _mtime: number = payload.mtime
  void _path; void _contentHash; void _mtime
})
void _unsub6

const _unsub7 = _eventApi2.on('index:fileDeleted', (payload) => {
  const _path: string = payload.path
  void _path
})
void _unsub7

const _unsub8 = _eventApi2.on('index:fileRenamed', (payload) => {
  const _oldPath: string = payload.oldPath
  const _newPath: string = payload.newPath
  void _oldPath; void _newPath
})
void _unsub8

export type _EventExports = _EventChannelUnion
