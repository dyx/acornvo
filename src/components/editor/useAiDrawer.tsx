import { useState } from 'react';
import { AiReviewDrawerContainer } from './AiReviewDrawerContainer';

export function useAiDrawer(clipId: number | null) {
  const [open, setOpen] = useState(false);
  const drawer = open ? (
    <AiReviewDrawerContainer
      clipId={clipId}
      onClose={() => setOpen(false)}
    />
  ) : null;
  return { drawer, openDrawer: () => setOpen(true) };
}
