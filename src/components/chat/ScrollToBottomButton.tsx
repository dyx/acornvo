import { useEffect, useState, type RefObject } from 'react'
import { ArrowDownIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function ScrollToBottomButton({
  containerRef,
  threshold = 80,
  className
}: {
  containerRef: RefObject<HTMLDivElement | null>
  threshold?: number
  className?: string
}) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handler = () => {
      // Use Math.ceil because el.scrollTop can be fractional
      const distance = el.scrollHeight - (Math.ceil(el.scrollTop) + el.clientHeight)
      setVisible(distance > threshold)
    }

    el.addEventListener('scroll', handler)
    handler()

    const observer = new MutationObserver(handler)
    observer.observe(el, { childList: true, subtree: true })

    return () => {
      el.removeEventListener('scroll', handler)
      observer.disconnect()
    }
  }, [containerRef, threshold])

  if (!visible) return null

  return (
    <Button
      variant="outline"
      size="icon"
      title={t('chat.message.newMessages')}
      onClick={() => {
        const el = containerRef.current
        if (!el) return
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      }}
      className={
        className ??
        'absolute right-4 bottom-4 z-10 rounded-full shadow-md bg-background hover:bg-muted border'
      }
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  )
}
