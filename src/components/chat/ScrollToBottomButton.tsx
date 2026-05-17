import { useEffect, useState, type RefObject } from 'react'
import { Button } from 'antd'
import { ArrowDownOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

export function ScrollToBottomButton({
  containerRef,
  threshold = 80
}: {
  containerRef: RefObject<HTMLDivElement | null>
  threshold?: number
}) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const scroller = el.querySelector('[data-testid="bubble-list-scroller"]') as HTMLElement | null
    const target = scroller ?? el
    const handler = () => {
      const distance = target.scrollHeight - (target.scrollTop + target.clientHeight)
      setVisible(distance > threshold)
    }
    target.addEventListener('scroll', handler)
    handler()
    return () => target.removeEventListener('scroll', handler)
  }, [containerRef, threshold])

  if (!visible) return null

  return (
    <Button
      type="primary"
      shape="round"
      icon={<ArrowDownOutlined />}
      onClick={() => {
        const el = containerRef.current
        if (!el) return
        const scroller =
          (el.querySelector('[data-testid="bubble-list-scroller"]') as HTMLElement) ?? el
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
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
