// src/components/chat/AssistantMarkdown.tsx
import type { JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '@/stores/chat'
import { ipc } from '@/ipc/client'

export function AssistantMarkdown({ m }: { m: ChatMessage }): JSX.Element {
  return (
    <div data-testid={`msg-assistant-${m.id}`} className="my-2 max-w-full text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault()
                  if (href) void ipc.shell.openExternal(href)
                }}
                className="text-primary underline"
              >
                {children}
              </a>
            )
          },
          pre({ children }) {
            return <pre className="my-2 rounded bg-muted p-2 font-mono text-xs">{children}</pre>
          },
          code({ className, children }) {
            return (
              <code className={`${className ?? ''} rounded bg-muted px-1 font-mono text-xs`}>
                {children}
              </code>
            )
          },
          table({ children }) {
            return <table className="my-2 border-collapse text-xs">{children}</table>
          },
          th({ children }) {
            return <th className="border border-border bg-muted px-2 py-1">{children}</th>
          },
          td({ children }) {
            return <td className="border border-border px-2 py-1">{children}</td>
          }
        }}
      >
        {m.text}
      </ReactMarkdown>
    </div>
  )
}
