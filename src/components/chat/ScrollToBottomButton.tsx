import { useEffect, useRef, useState, type RefObject } from 'react'
import { Button } from 'antd'
import { ArrowDownOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

/**
 * Find the actual scrollable element rendered inside antd-x Bubble.List.
 * The outer container div is `display:flex` and does NOT scroll.
 * We look for the inner element that carries `overflow: auto`.
 */
function findScroller(root: HTMLElement): HTMLElement | null {
  // 1. Try known antd-x class names
  const byClass =
    root.querySelector<HTMLElement>('.ant-bubble-list') ??
    root.querySelector<HTMLElement>('[class*="bubble-list"]')
  if (byClass && isScrollable(byClass)) return byClass

  // 2. Fall back to any child with overflow:auto that actually overflows
  for (const child of Array.from(root.querySelectorAll<HTMLElement>('div'))) {
    if (isScrollable(child)) return child
  }

  return null
}

function isScrollable(el: HTMLElement): boolean {
  const s = getComputedStyle(el)
  return (
    (s.overflow === 'auto' || s.overflowY === 'auto' ||
     s.overflow === 'scroll' || s.overflowY === 'scroll') &&
    el.scrollHeight > el.clientHeight
  )
}

export function ScrollToBottomButton({
  containerRef,
  threshold = 80
}: {
  containerRef: RefObject<HTMLDivElement | null>
  threshold?: number
}) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const scrollerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const root = containerRef.current
    if (!root) return

    let scroller = findScroller(root)
    scrollerRef.current = scroller

    const handler = () => {
      const el = scrollerRef.current
      if (!el) return
      const distance = el.scrollHeight - (el.scrollTop + el.clientHeight)
      setVisible(distance > threshold)
    }

    // If the scroller is found immediately, attach the listener
    if (scroller) {
      scroller.addEventListener('scroll', handler)
      handler()
    }

    // Observe DOM mutations to catch late-rendered Bubble.List content.
    // antd-x renders its scrollable container asynchronously.
    const observer = new MutationObserver(() => {
      const found = findScroller(root)
      if (found && found !== scrollerRef.current) {
        scrollerRef.current?.removeEventListener('scroll', handler)
        scrollerRef.current = found
        found.addEventListener('scroll', handler)
        handler()
      }
    })
    observer.observe(root, { childList: true, subtree: true })

    return () => {
      scrollerRef.current?.removeEventListener('scroll', handler)
      observer.disconnect()
    }
  }, [containerRef, threshold])

  if (!visible) return null

  return (
    <Button
      type="primary"
      shape="round"
      icon={<ArrowDownOutlined />}
      onClick={() => {
        const el = scrollerRef.current
        if (!el) return
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      }}
      style={{
        position: 'absolute',
        right: 16,
        bottom: 16,
        zIndex: 2
      }}
    >
      {t('chat.message.newMessages')}
    </Button>
  )
}
