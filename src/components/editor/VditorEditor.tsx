import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/hooks/use-toast'
import { useEditorStore } from '@/stores/editor'
import Vditor from 'vditor'
import 'vditor/dist/index.css'

export function VditorEditor(): JSX.Element {
  const elRef = useRef<HTMLDivElement | null>(null)
  const vditorRef = useRef<Vditor | null>(null)
  const { t } = useTranslation()
  const { toast } = useToast()
  const initialBody = useEditorStore.getState().state.kind === 'ready'
    ? (useEditorStore.getState().state as { body: string }).body
    : ''

  useEffect(() => {
    if (!elRef.current) return
    const v = new Vditor(elRef.current, {
      mode: 'ir',
      cdn: '/vditor',
      value: initialBody,
      cache: { enable: false },
      counter: { enable: false },
      toolbarConfig: { pin: true },
      upload: {
        url: '',
        handler: () => {
          toast({ title: t('editor.paste_image_unsupported') })
          return ''
        }
      },
      input(value) {
        useEditorStore.getState().setBody(value)
      },
      blur() {
        void useEditorStore.getState().flushSave()
      }
    })
    vditorRef.current = v
    return () => {
      try { v.destroy() } catch { /* Vditor may throw if its DOM element was already removed */ }
      vditorRef.current = null
    }
    // We deliberately do NOT depend on `initialBody` — Vditor owns its own
    // editable buffer once instantiated. setBody flows the other direction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={elRef} className="h-full w-full" data-testid="vditor-host" />
}
