import { useState } from 'react'
import { AiReviewDialogContainer } from './AiReviewDialogContainer'

export function useAiDialog(clipId: number | null) {
  const [open, setOpen] = useState(false)
  const dialog = <AiReviewDialogContainer open={open} clipId={clipId} onClose={() => setOpen(false)} />
  return { dialog, openDialog: () => setOpen(true) }
}
