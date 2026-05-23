// electron/browser/manager.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createManager, type ManagerDeps } from './manager'

function makeView(label: string) {
  return {
    __label: label,
    webContents: { destroy: vi.fn(), isDestroyed: () => false, close: vi.fn() }
  } as any
}

function makeDeps(): ManagerDeps & {
  contentView: {
    addChildView: ReturnType<typeof vi.fn>
    removeChildView: ReturnType<typeof vi.fn>
    children: any[]
  }
} {
  const children: any[] = []
  const contentView = {
    children,
    addChildView: vi.fn((v: any) => {
      children.push(v)
    }),
    removeChildView: vi.fn((v: any) => {
      const i = children.indexOf(v)
      if (i !== -1) children.splice(i, 1)
    })
  }
  return {
    contentView,
    getContentView: () => contentView as any,
    applyBoundsToView: vi.fn(),
    nowMs: () => 1000
  }
}

describe('manager', () => {
  let deps: ReturnType<typeof makeDeps>

  beforeEach(() => {
    deps = makeDeps()
  })

  it('register adds a tab; attach makes it the only child', () => {
    const m = createManager(deps)
    const v = makeView('a')
    m.register('t1', v)

    expect(m.has('t1')).toBe(true)
    expect(deps.contentView.children).toHaveLength(0) // register does not attach

    m.attach('t1')

    expect(deps.contentView.addChildView).toHaveBeenCalledWith(v)
    expect(deps.contentView.children).toEqual([v])
    expect(deps.applyBoundsToView).toHaveBeenCalledWith(v)
  })

  it('attach detaches the previously attached view first', () => {
    const m = createManager(deps)
    const v1 = makeView('a')
    const v2 = makeView('b')
    m.register('t1', v1)
    m.register('t2', v2)

    m.attach('t1')
    m.attach('t2')

    expect(deps.contentView.children).toEqual([v2])
    expect(deps.contentView.removeChildView).toHaveBeenCalledWith(v1)
  })

  it('destroy removes from registry and detaches if currently attached', () => {
    const m = createManager(deps)
    const v = makeView('a')
    m.register('t1', v)
    m.attach('t1')

    m.destroy('t1')

    expect(m.has('t1')).toBe(false)
    expect(deps.contentView.removeChildView).toHaveBeenCalledWith(v)
    expect(v.webContents.close).toHaveBeenCalled()
  })

  it('destroy on non-attached tab does not call removeChildView', () => {
    const m = createManager(deps)
    const v1 = makeView('a')
    const v2 = makeView('b')
    m.register('t1', v1)
    m.register('t2', v2)
    m.attach('t1')

    m.destroy('t2')

    expect(deps.contentView.removeChildView).not.toHaveBeenCalledWith(v2)
    expect(v2.webContents.close).toHaveBeenCalled()
  })

  it('attach updates lastActiveAt; pickLruTabId returns the oldest', () => {
    let now = 1000
    deps.nowMs = () => now
    const m = createManager(deps)
    m.register('t1', makeView('a'))
    m.register('t2', makeView('b'))
    m.register('t3', makeView('c'))

    now = 100
    m.attach('t1')
    now = 300
    m.attach('t2')
    now = 200
    m.attach('t3') // out of order

    expect(m.pickLruTabId()).toBe('t1')
  })
})
