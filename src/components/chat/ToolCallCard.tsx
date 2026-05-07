// src/components/chat/ToolCallCard.tsx
import type { JSX } from 'react'
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ChatMessage } from '@/stores/chat'

export function ToolCallCard({ m }: { m: ChatMessage }): JSX.Element {
  const [open, setOpen] = useState(false)
  const call = m.toolCalls?.[0]
  if (!call) return <></>
  return (
    <div data-testid={`msg-toolcall-${m.id}`} className="my-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1 text-left">
        <ChevronRight size={12} className={open ? 'rotate-90 transition' : 'transition'} />
        调用工具 <span className="font-medium">{call.name}</span>
      </button>
      {open && (
        <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-[11px]">
          {JSON.stringify(call.args, null, 2)}
        </pre>
      )}
    </div>
  )
}
