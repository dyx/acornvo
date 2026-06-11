import { useSyncExternalStore } from 'react'
import type { ToastVariant } from '@/components/ui/toast'
import { ipc } from '@/ipc/client'

type ToastItem = {
  id: number
  title?: string
  description?: string
  variant?: ToastVariant
  open: boolean
}

let counter = 0
let items: ToastItem[] = []
const listeners = new Set<() => void>()
function emit(): void {
  for (const l of listeners) l()
}

export function toast(input: Omit<ToastItem, 'id' | 'open'>): void {
  // If not running in the toast window, forward to main process
  if (typeof window !== 'undefined' && !window.location.pathname.includes('toast')) {
    const safeInput = { ...input, variant: input.variant ?? undefined }
    if (ipc.ui?.showToast) {
      ipc.ui.showToast(safeInput).catch(console.error)
    } else {
      console.warn('ipc.ui.showToast is not available', safeInput)
    }
    return
  }

  // Deduplicate: If there is already an open toast with the same title and description, ignore it.
  const isDuplicate = items.some(
    (t) => t.open && t.title === input.title && t.description === input.description
  )
  if (isDuplicate) {
    return
  }

  const id = ++counter
  items = [...items, { ...input, id, open: true }]
  emit()
  setTimeout(() => {
    items = items.map((t) => (t.id === id ? { ...t, open: false } : t))
    emit()
  }, 4000)
  setTimeout(() => {
    items = items.filter((t) => t.id !== id)
    emit()
  }, 5000)
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    () => items,
    () => items
  )
}

export function useToast(): { toast: typeof toast } {
  return { toast }
}
