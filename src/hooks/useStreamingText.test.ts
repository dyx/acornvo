// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStreamingText } from './useStreamingText'
import { useChatStore } from '@/stores/chat'

describe('useStreamingText', () => {
  let rafCb: FrameRequestCallback | null = null

  beforeEach(() => {
    rafCb = null
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCb = cb
      return 1
    })
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [],
          streamingBuffer: '',
          flushedLength: 0,
          pendingApprovals: [],
          pendingAttachments: [],
          pendingPromptText: '',
          status: 'idle',
          error: null
        }
      },
      sessionsLoading: false,
      sessionsError: null
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('flushes appended buffer chunks to ref node text on rAF', () => {
    const node = document.createElement('pre')
    document.body.appendChild(node)

    const { result } = renderHook(() => useStreamingText('s1', { current: node }))
    expect(result.current).toBe(0)

    // First rAF tick — loop was scheduled by useEffect
    act(() => {
      rafCb?.(performance.now())
    })
    // Second rAF tick — loop scheduled itself again from the mock
    act(() => {
      rafCb?.(performance.now())
    })

    // Now push streaming text
    act(() => {
      useChatStore.setState((s) => ({
        bySession: {
          ...s.bySession,
          s1: { ...s.bySession.s1, streamingBuffer: 'Hello', status: 'streaming' }
        }
      }))
    })

    act(() => {
      rafCb?.(performance.now())
    })
    expect(node.textContent).toBe('Hello')
  })

  it('resets DOM text when buffer empties (after done)', () => {
    const node = document.createElement('pre')
    node.textContent = 'leftover'
    document.body.appendChild(node)

    const { rerender } = renderHook(() => useStreamingText('s1', { current: node }))

    // Tick the rAF loop
    act(() => {
      rafCb?.(performance.now())
    })
    act(() => {
      rafCb?.(performance.now())
    })

    act(() => {
      useChatStore.setState((s) => ({
        bySession: {
          ...s.bySession,
          s1: { ...s.bySession.s1, streamingBuffer: '', flushedLength: 0, status: 'idle' }
        }
      }))
    })
    rerender()
    act(() => {
      rafCb?.(performance.now())
    })
    expect(node.textContent).toBe('')
  })
})
