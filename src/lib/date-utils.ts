export type SessionGroup = 'today' | 'thisWeek' | 'earlier'

export function groupSession(updatedAt: number): SessionGroup {
  const now = new Date()
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  // ISO week: Monday is the first day. Day-of-week 0=Sun..6=Sat.
  const dayOfWeek = now.getDay() // 0..6, 0=Sun
  const daysSinceMonday = (dayOfWeek + 6) % 7
  const mondayStart = today0 - daysSinceMonday * 24 * 60 * 60 * 1000
  if (updatedAt >= today0) return 'today'
  if (updatedAt >= mondayStart) return 'thisWeek'
  return 'earlier'
}
