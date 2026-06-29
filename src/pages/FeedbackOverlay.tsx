import React, { useState } from 'react'
import { MessageSquare, X } from 'lucide-react'

export function FeedbackOverlay({ targetName }: { targetName: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'idle' | 'selecting'>('idle')
  const [feedbackList, setFeedbackList] = useState<{ element: string; comment: string }[]>([])
  const [currentComment, setCurrentComment] = useState('')
  const [currentElement, setCurrentElement] = useState('')
  const [overall, setOverall] = useState('')

  const handleDocumentClick = (e: MouseEvent) => {
    if (mode === 'selecting' && isOpen) {
      e.preventDefault()
      e.stopPropagation()

      const target = e.target as HTMLElement
      let variant = ''
      let curr = target
      while (curr && curr !== document.body) {
        if (curr.getAttribute('data-variant')) {
          variant = `Variant ${curr.getAttribute('data-variant')}`
          break
        }
        curr = curr.parentElement as HTMLElement
      }

      const elDesc = `${target.tagName.toLowerCase()}${target.className ? '.' + target.className.split(' ')[0] : ''}`
      setCurrentElement(`${variant ? variant + ' - ' : ''}${elDesc}`)
      setMode('idle')
    }
  }

  React.useEffect(() => {
    if (mode === 'selecting') {
      document.body.style.cursor = 'crosshair'
      document.addEventListener('click', handleDocumentClick, { capture: true })
    } else {
      document.body.style.cursor = ''
    }
    return () => document.removeEventListener('click', handleDocumentClick, { capture: true })
  }, [mode, isOpen])

  const addComment = () => {
    if (currentComment && currentElement) {
      setFeedbackList([...feedbackList, { element: currentElement, comment: currentComment }])
      setCurrentComment('')
      setCurrentElement('')
    }
  }

  const generateMarkdown = () => {
    let md = `## Design Lab Feedback\n\n**Target:** ${targetName}\n**Comments:** ${feedbackList.length}\n\n`
    feedbackList.forEach((f, i) => {
      md += `### Item ${i + 1}\n- **Element:** \`${f.element}\`\n- **Comment:** ${f.comment}\n\n`
    })
    md += `### Overall Direction\n${overall}\n`
    navigator.clipboard.writeText(md)
    alert('Feedback copied to clipboard! Please paste it into the AI chat.')
  }

  return (
    <>
      <button
        className="fixed bottom-6 right-6 p-4 bg-primary text-primary-foreground rounded-full shadow-lg hover:opacity-90 flex items-center gap-2 z-50"
        onClick={() => setIsOpen(true)}
      >
        <MessageSquare className="size-5" />
        <span className="font-medium">Add Feedback</span>
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 bg-card border rounded-xl shadow-2xl z-50 p-6 flex flex-col gap-4 text-foreground">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Design Feedback</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase">
                Point & Click
              </label>
              <button
                onClick={() => setMode('selecting')}
                className={`w-full p-2 border border-dashed rounded text-sm transition-colors ${mode === 'selecting' ? 'bg-primary/20 border-primary text-primary' : 'hover:bg-muted'}`}
              >
                {mode === 'selecting'
                  ? 'Click any element on the page...'
                  : '+ Select element to comment'}
              </button>

              {currentElement && (
                <div className="p-3 bg-muted rounded-md space-y-2">
                  <div className="text-xs font-mono text-muted-foreground truncate">
                    {currentElement}
                  </div>
                  <textarea
                    value={currentComment}
                    onChange={(e) => setCurrentComment(e.target.value)}
                    placeholder="What should change?"
                    className="w-full bg-background border p-2 rounded text-sm min-h-[60px]"
                  />
                  <button
                    onClick={addComment}
                    className="bg-primary text-primary-foreground px-3 py-1 text-sm rounded w-full"
                  >
                    Save Comment
                  </button>
                </div>
              )}
            </div>

            {feedbackList.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase">
                  Saved Comments ({feedbackList.length})
                </label>
                <div className="max-h-[100px] overflow-y-auto space-y-2">
                  {feedbackList.map((f, i) => (
                    <div key={i} className="text-xs p-2 bg-muted rounded">
                      <span className="font-mono text-muted-foreground mr-2">{f.element}</span>
                      {f.comment}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase">
                Overall Direction
              </label>
              <textarea
                value={overall}
                onChange={(e) => setOverall(e.target.value)}
                placeholder="Which variant wins? Any general thoughts?"
                className="w-full bg-background border p-2 rounded text-sm min-h-[80px]"
              />
            </div>

            <button
              onClick={generateMarkdown}
              disabled={!overall}
              className="w-full bg-primary text-primary-foreground font-medium p-3 rounded mt-2 disabled:opacity-50"
            >
              Submit & Copy Feedback
            </button>
          </div>
        </div>
      )}
    </>
  )
}
