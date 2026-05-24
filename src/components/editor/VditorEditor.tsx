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
  const editorState = useEditorStore.getState().state
  const initialBodyRaw =
    editorState.kind === 'ready'
      ? (editorState as { body: string }).body
      : ''
  const docPath = editorState.kind === 'ready' ? (editorState as { path: string }).path : ''
  const initialBody = rewriteImagesToLocal(initialBodyRaw, docPath)

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
        useEditorStore.getState().setBody(rewriteImagesToRelative(value, docPath))
      },
      blur() {
        void useEditorStore.getState().flushSave()
      }
    })
    vditorRef.current = v
    return () => {
      try {
        v.destroy()
      } catch {
        /* Vditor may throw if its DOM element was already removed */
      }
      vditorRef.current = null
    }
    // We deliberately do NOT depend on `initialBody` — Vditor owns its own
    // editable buffer once instantiated. setBody flows the other direction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={elRef} className="h-full w-full" data-testid="vditor-host" />
}

function rewriteImagesToLocal(markdown: string, docPath: string): string {
  if (!docPath) return markdown
  const lastSlash = docPath.lastIndexOf('/')
  const dir = lastSlash === -1 ? '' : docPath.substring(0, lastSlash)
  const prefix = dir ? `${dir}/` : ''

  let result = markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, urlPart) => {
    const parts = urlPart.trim().split(/\s+/)
    const url = parts[0]
    const rest = parts.slice(1).join(' ')
    if (url.match(/^(https?|data|acornvo-local|file):/i)) return match
    const resolvedPath = url.startsWith('/') ? url.substring(1) : `${prefix}${url}`
    const newUrlPart = rest ? `acornvo-local://${resolvedPath} ${rest}` : `acornvo-local://${resolvedPath}`
    return `![${alt}](${newUrlPart})`
  })

  result = result.replace(/<img([^>]*)src="([^"]+)"([^>]*)>/g, (match, p1, url, p2) => {
    if (url.match(/^(https?|data|acornvo-local|file):/i)) return match
    const resolvedPath = url.startsWith('/') ? url.substring(1) : `${prefix}${url}`
    return `<img${p1}src="acornvo-local://${resolvedPath}"${p2}>`
  })

  return result
}

function rewriteImagesToRelative(markdown: string, docPath: string): string {
  if (!docPath) return markdown
  const lastSlash = docPath.lastIndexOf('/')
  const dir = lastSlash === -1 ? '' : docPath.substring(0, lastSlash)
  const prefix = dir ? `${dir}/` : ''

  let result = markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, urlPart) => {
    const parts = urlPart.trim().split(/\s+/)
    const url = parts[0]
    const rest = parts.slice(1).join(' ')
    if (url.startsWith('acornvo-local://')) {
      const resolvedPath = url.replace('acornvo-local://', '')
      let relUrl = resolvedPath
      if (prefix && resolvedPath.startsWith(prefix)) {
        relUrl = resolvedPath.substring(prefix.length)
      } else if (!resolvedPath.startsWith('/')) {
        relUrl = `/${resolvedPath}`
      }
      const newUrlPart = rest ? `${relUrl} ${rest}` : relUrl
      return `![${alt}](${newUrlPart})`
    }
    return match
  })

  result = result.replace(/<img([^>]*)src="([^"]+)"([^>]*)>/g, (match, p1, url, p2) => {
    if (url.startsWith('acornvo-local://')) {
      const resolvedPath = url.replace('acornvo-local://', '')
      let relUrl = resolvedPath
      if (prefix && resolvedPath.startsWith(prefix)) {
        relUrl = resolvedPath.substring(prefix.length)
      } else if (!resolvedPath.startsWith('/')) {
        relUrl = `/${resolvedPath}`
      }
      return `<img${p1}src="${relUrl}"${p2}>`
    }
    return match
  })

  return result
}
