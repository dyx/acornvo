import { useSyncExternalStore } from 'react'
import type { ToastVariant } from '@/components/ui/toast'

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
