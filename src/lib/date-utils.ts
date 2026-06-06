import { format, formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

export type SessionGroup = 'today' | 'yesterday' | 'thisWeek' | 'earlier'

export function groupSession(updatedAt: number): SessionGroup {
  const now = new Date()
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday0 = today0 - 24 * 60 * 60 * 1000
  // ISO week: Monday is the first day. Day-of-week 0=Sun..6=Sat.
  const dayOfWeek = now.getDay() // 0..6, 0=Sun
  const daysSinceMonday = (dayOfWeek + 6) % 7
  const mondayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday).getTime()
  
  if (updatedAt >= today0) return 'today'
  if (updatedAt >= yesterday0) return 'yesterday'
  if (updatedAt >= mondayStart) return 'thisWeek'
  return 'earlier'
}

/**
 * Format timestamp as a short chat bubble time (e.g., 14:30)
 */
export function formatChatTime(ts: number | string | Date): string {
  return format(new Date(ts), 'HH:mm')
}

/**
 * Format timestamp as absolute date and time (e.g., 2026-06-06 14:30:00)
 */
export function formatDateTime(ts: number | string | Date): string {
  return format(new Date(ts), 'yyyy-MM-dd HH:mm:ss')
}

/**
 * Format timestamp as absolute date only (e.g., 2026-06-06)
 */
export function formatDate(ts: number | string | Date): string {
  return format(new Date(ts), 'yyyy-MM-dd')
}

/**
 * Format timestamp as a relative string (e.g., "5 分钟前")
 */
export function formatRelativeTime(ts: number | string | Date): string {
  return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: zhCN })
}
