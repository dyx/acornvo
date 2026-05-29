import type { AnchorHTMLAttributes, MouseEvent, PropsWithChildren } from 'react'
import { ipc } from '@/ipc/client'

type Props = PropsWithChildren<AnchorHTMLAttributes<HTMLAnchorElement>> & {
  domNode?: unknown
  streamStatus?: unknown
}

export function ExternalLinkAnchor({
  href,
  children,
  domNode: _domNode,
  streamStatus: _streamStatus,
  ...rest
}: Props) {
  const handleClick = (ev: MouseEvent<HTMLAnchorElement>) => {
    if (!href || href.startsWith('#')) return
    ev.preventDefault()
    ipc.shell.openExternal(href)
  }
  return (
    <a {...rest} href={href} onClick={handleClick}>
      {children}
    </a>
  )
}
