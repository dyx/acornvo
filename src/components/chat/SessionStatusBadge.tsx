import type { JSX } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { SessionState } from '@/stores/chat'

interface Props { slot: SessionState | undefined }

export function SessionStatusBadge({ slot }: Props): JSX.Element | null {
  if (!slot) return null
  if (slot.status === 'streaming') {
    return <span data-testid="badge-streaming" className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
  }
  if (slot.pendingApprovals.length > 0) {
    return <span data-testid="badge-approval" className="inline-block h-2 w-2 rounded-full bg-destructive" />
  }
  if (slot.status === 'error') {
    return <AlertTriangle data-testid="badge-error" size={12} className="text-yellow-500" />
  }
  return null
}
