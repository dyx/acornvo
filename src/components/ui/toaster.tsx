import type { JSX } from 'react'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport
} from './toast'
import { useToasts } from '@/hooks/use-toast'

export function Toaster(): JSX.Element {
  const toasts = useToasts()
  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, variant, open }) => (
        <Toast key={id} variant={variant} open={open}>
          <div className="grid gap-1">
            {title ? <ToastTitle>{title}</ToastTitle> : null}
            {description ? <ToastDescription>{description}</ToastDescription> : null}
          </div>
          <ToastClose variant={variant} />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
