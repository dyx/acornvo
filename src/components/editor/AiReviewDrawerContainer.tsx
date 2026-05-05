import { useState } from 'react';
import { useEditorStore } from '@/stores/editor';
import { ipc } from '@/ipc/client';
import { AiReviewDrawer } from './AiReviewDrawer';

interface Props {
  clipId: number | null;
  onClose: () => void;
}

export function AiReviewDrawerContainer({ clipId, onClose }: Props) {
  const fm = useEditorStore((s) =>
    s.state.kind === 'ready' ? s.state.frontmatter : null
  );

  const acceptAiReview = useEditorStore((s) => s.acceptAiReview);
  const applyAiSuggestedTitle = useEditorStore((s) => s.applyAiSuggestedTitle);
  const mergeAiTags = useEditorStore((s) => s.mergeAiTags);
  const rejectAiReview = useEditorStore((s) => s.rejectAiReview);
  const setAiRerunInflight = useEditorStore((s) => s.setAiRerunInflight);

  if (!fm) return null;

  return (
    <AiReviewDrawer
      frontmatter={fm}
      clipId={clipId}
      onAcceptAll={() => { acceptAiReview(); onClose(); }}
      onUseTitle={() => applyAiSuggestedTitle()}
      onMergeTags={() => mergeAiTags()}
      onReject={() => { rejectAiReview(); onClose(); }}
      onRerun={async () => {
        if (clipId === null) return;
        try {
          setAiRerunInflight(true);
          await ipc.ai.reviewClip(clipId, { force: true });
        } catch {
          setAiRerunInflight(false);
        }
      }}
      onClose={onClose}
    />
  );
}

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
