import { useEditorStore } from '@/stores/editor'
import { ipc } from '@/ipc/client'
import { AiReviewDialog } from './AiReviewDialog'

interface Props {
  open: boolean
  clipId: number | null
  onClose: () => void
}

export function AiReviewDialogContainer({ open, clipId, onClose }: Props) {
  const fm = useEditorStore((s) => (s.state.kind === 'ready' ? s.state.frontmatter : null))

  const acceptAiReview = useEditorStore((s) => s.acceptAiReview)
  const applyAiSuggestedTitle = useEditorStore((s) => s.applyAiSuggestedTitle)
  const mergeAiTags = useEditorStore((s) => s.mergeAiTags)
  const rejectAiReview = useEditorStore((s) => s.rejectAiReview)
  const setAiRerunInflight = useEditorStore((s) => s.setAiRerunInflight)
  const flushSave = useEditorStore((s) => s.flushSave)

  if (!fm) return null

  return (
    <AiReviewDialog
      open={open}
      frontmatter={fm}
      clipId={clipId}
      onAcceptAll={async () => {
        acceptAiReview()
        await flushSave()
        onClose()
      }}
      onUseTitle={async () => {
        applyAiSuggestedTitle()
        await flushSave()
      }}
      onMergeTags={async () => {
        mergeAiTags()
        await flushSave()
      }}
      onReject={async () => {
        rejectAiReview()
        await flushSave()
        onClose()
      }}
      onRerun={async () => {
        if (clipId === null) return
        try {
          setAiRerunInflight(true)
          await ipc.ai.reviewClip(clipId, { force: true })
        } catch {
          setAiRerunInflight(false)
        }
      }}
      onClose={onClose}
    />
  )
}
