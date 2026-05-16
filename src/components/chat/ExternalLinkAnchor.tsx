import type { AnchorHTMLAttributes, MouseEvent, PropsWithChildren } from 'react'
import { ipc } from '@/ipc/client'

type Props = PropsWithChildren<AnchorHTMLAttributes<HTMLAnchorElement>>

export function ExternalLinkAnchor({ href, children, ...rest }: Props) {
  const handleClick = (ev: MouseEvent<HTMLAnchorElement>) => {
    if (!href || href.startsWith('#')) return
    ev.preventDefault()
    ipc.file.openExternal(href)
  }
  return (
    <a {...rest} href={href} onClick={handleClick}>
      {children}
    </a>
  )
}
