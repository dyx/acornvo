import { EventEmitter } from 'node:events'

export type IndexStateName = 'idle' | 'scanning' | 'ready' | 'watching' | 'error'

export interface IndexStatus {
  state: IndexStateName
  total: number
  scanned: number
  currentPath?: string
  error?: string
}

let _state: IndexStateName = 'idle'
let _total = 0
let _scanned = 0
let _currentPath: string | undefined
let _error: string | undefined

const emitter = new EventEmitter()

export function state(): IndexStatus {
  return {
    state: _state,
    total: _total,
    scanned: _scanned,
    ...(_currentPath !== undefined ? { currentPath: _currentPath } : {}),
    ...(_error !== undefined ? { error: _error } : {})
  }
}

export function onStateChange(handler: (s: IndexStatus) => void): () => void {
  emitter.on('stateChange', handler)
  return () => emitter.off('stateChange', handler)
}

function setState(next: IndexStateName, error?: string): void {
  if (next === _state) return
  _state = next
  _error = error
  emitter.emit('stateChange', state())
}

export const status = state  // alias

// --- test hooks ---
export function _resetForTest(): void {
  _state = 'idle'
  _total = 0
  _scanned = 0
  _currentPath = undefined
  _error = undefined
  emitter.removeAllListeners()
}
export function _setStateForTest(next: IndexStateName): void {
  setState(next)
}
