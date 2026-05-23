import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore, type PendingApproval } from '@/stores/chat'
import { JsonArgsEditor } from './JsonArgsEditor'
import { FrontmatterDiff } from './FrontmatterDiff'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'

type Props = {
  open: boolean
  onClose: () => void
  approval: PendingApproval
  callId: string
}

type FrontmatterArgs = { before?: unknown; after?: unknown }

export function ApprovalDrawer({ open, onClose, approval, callId }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const approveTool = useChatStore((s) => s.approveTool)

  const [editedArgs, setEditedArgs] = useState<unknown>(approval.args)
  const [jsonValid, setJsonValid] = useState(true)

  const [prevCallId, setPrevCallId] = useState(callId)
  if (callId !== prevCallId) {
    setPrevCallId(callId)
    setEditedArgs(approval.args)
    setJsonValid(true)
  }

  const isFrontmatter = approval.toolName === 'update_frontmatter'

  const handleSubmit = async () => {
    if (!jsonValid) {
      toast({ title: t('chat.approval.invalidJson'), variant: 'destructive' })
      return
    }
    if (!activeSessionId) return
    try {
      await approveTool(activeSessionId, callId, editedArgs)
      onClose()
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    }
  }

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <span>{approval.toolName}</span>
            <Badge
              variant="outline"
              className="text-orange-500 border-orange-500 bg-orange-50 dark:bg-orange-950"
            >
              {t('chat.approval.pendingTag')}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-6">
          {approval.reason && (
            <div>
              <h4 className="font-semibold text-sm mb-1">{t('chat.approval.reason')}</h4>
              <p className="text-sm text-muted-foreground">{approval.reason}</p>
            </div>
          )}

          <div>
            {isFrontmatter ? (
              <FrontmatterDiff
                before={(approval.args as FrontmatterArgs)?.before}
                after={(approval.args as FrontmatterArgs)?.after}
              />
            ) : (
              <JsonArgsEditor
                initialArgs={approval.args}
                onChange={(_text, valid, parsed) => {
                  setJsonValid(valid)
                  if (valid) setEditedArgs(parsed)
                }}
              />
            )}
          </div>
        </div>

        <SheetFooter className="mt-8">
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit}>{t('chat.approval.submit')}</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
