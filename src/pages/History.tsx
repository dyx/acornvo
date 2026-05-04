import type { JSX } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { HistoryLayout } from '@/components/history/HistoryLayout'

const VALID_TABS = ['trash', 'conflicts', 'ops'] as const

export default function History(): JSX.Element {
  const { tab } = useParams<{ tab: string }>()
  if (!tab || !VALID_TABS.includes(tab as (typeof VALID_TABS)[number])) {
    return <Navigate to="/history/trash" replace />
  }
  return <HistoryLayout tab={tab as (typeof VALID_TABS)[number]} />
}
