// src/components/chat/ToolResultCard.tsx
import type { JSX } from 'react'
import { useState } from 'react'
import { ChevronRight, Copy } from 'lucide-react'
import type { ChatMessage } from '@/stores/chat'

export function ToolResultCard({ m }: { m: ChatMessage }): JSX.Element {
  const [open, setOpen] = useState(false)
  const isLarge = m.text.length > 5000
  return (
    <div data-testid={`msg-toolresult-${m.id}`} className="my-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1 text-left">
        <ChevronRight size={12} className={open ? 'rotate-90 transition' : 'transition'} />
        result: <code className="text-muted-foreground">{m.text.slice(0, 80)}</code>
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          <pre className="overflow-x-auto rounded bg-background p-2 text-[11px]">{m.text}</pre>
          {isLarge && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(m.text)
              }}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
            >
              <Copy size={10} /> 复制全部
            </button>
          )}
        </div>
      )}
    </div>
  )
}
