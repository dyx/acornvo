// src/components/chat/UserBubble.tsx
import type { JSX } from 'react'
import type { ChatMessage } from '@/stores/chat'

export function UserBubble({ m }: { m: ChatMessage }): JSX.Element {
  return (
    <div data-testid={`msg-user-${m.id}`} className="my-2 flex justify-end">
      <div className="max-w-[80%] rounded-lg bg-primary/10 px-3 py-2 text-sm">
        <div className="whitespace-pre-wrap">{m.text}</div>
        {m.attachments && m.attachments.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {a.type === 'file' ? `@file:${a.title}` : `@clip:${a.title}`}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
