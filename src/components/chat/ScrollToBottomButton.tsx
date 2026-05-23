import { useEffect, useRef, useState, type RefObject } from 'react'
import { ArrowDownIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/**
 * Since we are no longer using antd-x, the container itself is scrollable.
 */
function isScrollable(el: HTMLElement): boolean {
  const s = getComputedStyle(el)
  return (
    (s.overflow === 'auto' || s.overflowY === 'auto' ||
     s.overflow === 'scroll' || s.overflowY === 'scroll') &&
    el.scrollHeight > el.clientHeight
  )
}

function findScroller(root: HTMLElement): HTMLElement | null {
  if (isScrollable(root)) return root
  for (const child of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (isScrollable(child)) return child
  }
  return null
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

    if (scroller) {
      scroller.addEventListener('scroll', handler)
      handler()
    }

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
      variant="secondary"
      size="sm"
      onClick={() => {
        const el = scrollerRef.current
        if (!el) return
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      }}
      className="absolute right-4 bottom-4 z-10 rounded-full shadow-md bg-background border"
    >
      <ArrowDownIcon className="size-4 mr-2" />
      {t('chat.message.newMessages')}
    </Button>
  )
}
