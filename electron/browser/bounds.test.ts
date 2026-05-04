// electron/browser/bounds.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBounds, type BoundsDeps } from './bounds'

function makeView() {
  return { setBounds: vi.fn() } as any
}

describe('bounds', () => {
  let deps: BoundsDeps
  let getAttached: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getAttached = vi.fn(() => null)
    deps = { getAttachedView: getAttached as any }
  })

  it('setViewport stores rect; applyTo writes setBounds (rounded ints)', () => {
    const b = createBounds(deps)
    b.setViewport({ x: 10.4, y: 60.6, width: 800.5, height: 600.2 })

    const v = makeView()
    b.applyTo(v)
    expect(v.setBounds).toHaveBeenCalledWith({ x: 10, y: 61, width: 801, height: 600 })
  })

  it('setViewport re-applies to the currently attached view immediately', () => {
    const v = makeView()
    getAttached.mockReturnValue(v)
    const b = createBounds(deps)

    b.setViewport({ x: 0, y: 60, width: 800, height: 600 })

    expect(v.setBounds).toHaveBeenCalledWith({ x: 0, y: 60, width: 800, height: 600 })
  })

  it('applyTo before setViewport uses zeroed rect (safe default)', () => {
    const b = createBounds(deps)
    const v = makeView()
    b.applyTo(v)
    expect(v.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('clamps negative width/height to 0', () => {
    const b = createBounds(deps)
    b.setViewport({ x: 0, y: 0, width: -10, height: -5 })
    const v = makeView()
    b.applyTo(v)
    expect(v.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 0, height: 0 })
  })
})
