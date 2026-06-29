import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/hooks/use-toast'
import { useEditorStore } from '@/stores/editor'
import { LoadingSquirrel } from '@/components/ui/LoadingSquirrel'
import Vditor from 'vditor'
import 'vditor/dist/index.css'

interface VditorEditorProps {
  isPreviewMode?: boolean
}

export function VditorEditor({ isPreviewMode = false }: VditorEditorProps): JSX.Element {
  const [isReady, setIsReady] = useState(false)
  const elRef = useRef<HTMLDivElement | null>(null)
  const vditorRef = useRef<Vditor | null>(null)
  const { t } = useTranslation()
  const { toast } = useToast()
  const editorState = useEditorStore.getState().state
  const initialBodyRaw = editorState.kind === 'ready' ? (editorState as { body: string }).body : ''
  const docPath = editorState.kind === 'ready' ? (editorState as { path: string }).path : ''
  const initialBody = rewriteImagesToLocal(initialBodyRaw, docPath)

  useEffect(() => {
    if (!vditorRef.current) return
    const vditorInternal = (vditorRef.current as any).vditor
    if (!vditorInternal) return

    if (isPreviewMode) {
      vditorInternal.preview.element.style.display = 'block'
      if (vditorInternal.currentMode === 'sv') {
        vditorInternal.sv.element.style.display = 'none'
      } else {
        vditorInternal[vditorInternal.currentMode].element.parentElement.style.display = 'none'
      }
      vditorInternal.preview.render(vditorInternal)
    } else {
      if (vditorInternal.currentMode === 'sv') {
        vditorInternal.sv.element.style.display = 'block'
      } else {
        vditorInternal[vditorInternal.currentMode].element.parentElement.style.display = 'block'
      }
      vditorInternal.preview.element.style.display = 'none'
    }
  }, [isPreviewMode])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isPreviewMode) return
      if (e.key.toLowerCase() === 'a' && (e.metaKey || e.ctrlKey)) {
        if (!vditorRef.current) return
        const vditorInternal = (vditorRef.current as any).vditor
        if (!vditorInternal) return

        const previewElement = vditorInternal.preview?.element
        if (!previewElement) return

        const contentElement = previewElement.querySelector('.vditor-reset') || previewElement

        e.preventDefault()
        const range = document.createRange()
        range.selectNodeContents(contentElement)
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPreviewMode])

  useEffect(() => {
    if (!elRef.current) return
    let v: Vditor | null = null
    const isDark = document.documentElement.dataset.theme === 'dark'

    // Defer initialization to allow the route transition (like NavLink active state) to paint first
    const timer = setTimeout(() => {
      v = new Vditor(elRef.current!, {
        mode: 'ir',
        cdn: './vditor',
        theme: isDark ? 'dark' : 'classic',
        preview: {
          mode: 'editor',
          actions: [],
          theme: {
            current: isDark ? 'dark' : 'classic',
            path: './vditor/dist/css/content-theme'
          }
        },
        value: initialBody,
        cache: { enable: false },
        counter: { enable: false },
        toolbarConfig: { hide: true, pin: true },
        toolbar: [
          'headings',
          'bold',
          'italic',
          'strike',
          'link',
          '|',
          'list',
          'ordered-list',
          'check',
          'outdent',
          'indent',
          '|',
          'quote',
          'line',
          'code',
          'inline-code',
          'insert-before',
          'insert-after',
          '|',
          'upload',
          'table',
          '|',
          'undo',
          'redo',
          '|',
          {
            name: 'mode-wysiwyg',
            tip: t('editor.vditor.mode_wysiwyg', '所见即所得'),
            tipPosition: 's',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>',
            click(_event: Event, vditor: any) {
              vditor.toolbar.elements['edit-mode']
                ?.querySelector('button[data-mode="wysiwyg"]')
                ?.click()
            }
          },
          {
            name: 'mode-ir',
            tip: t('editor.vditor.mode_ir', '即时渲染'),
            tipPosition: 's',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 9h18"></path><path d="M9 21V9"></path></svg>',
            click(_event: Event, vditor: any) {
              vditor.toolbar.elements['edit-mode']?.querySelector('button[data-mode="ir"]')?.click()
            }
          },
          {
            name: 'mode-sv',
            tip: t('editor.vditor.mode_sv', '分屏预览'),
            tipPosition: 's',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line></svg>',
            click(_event: Event, vditor: any) {
              vditor.toolbar.elements['edit-mode']?.querySelector('button[data-mode="sv"]')?.click()
            }
          },
          { name: 'edit-mode', className: 'hidden' },
          'fullscreen',
          'preview'
        ],
        upload: {
          url: '',
          handler: (files: File[]) => {
            void (async () => {
              const editorState = useEditorStore.getState().state
              if (editorState.kind !== 'ready') return
              const currentDocPath = (editorState as { path: string }).path
              if (!currentDocPath) return

              const lastSlash = currentDocPath.lastIndexOf('/')
              const dir = lastSlash === -1 ? '' : currentDocPath.substring(0, lastSlash)
              const prefix = dir ? `${dir}/` : ''

              const filenameWithExt = currentDocPath.substring(lastSlash + 1)
              const dot = filenameWithExt.lastIndexOf('.md')
              const docName = dot > 0 ? filenameWithExt.substring(0, dot) : filenameWithExt

              for (const file of files) {
                try {
                  const ext = file.name.split('.').pop() || 'png'
                  const timestamp = Date.now()
                  const relImagePath = `${prefix}.assets/${docName}/${timestamp}.${ext}`

                  const buf = await file.arrayBuffer()
                  const uint8 = new Uint8Array(buf)

                  await window.api.file.writeBinary(relImagePath, uint8)

                  const insertText = `![${file.name}](acornvo-local://${relImagePath})\n`
                  if (v) {
                    v.insertValue(insertText)
                  }
                } catch (err) {
                  console.error('Failed to save image locally:', err)
                  toast({ title: 'Failed to save image locally' })
                }
              }
            })()
            return 'handled'
          }
        },
        after() {
          useEditorStore.getState().setBody(v!.getValue())
          if (isPreviewMode) {
            const vditorInternal = (v as any).vditor
            vditorInternal.preview.element.style.display = 'block'
            if (vditorInternal.currentMode === 'sv') {
              vditorInternal.sv.element.style.display = 'none'
            } else {
              vditorInternal[vditorInternal.currentMode].element.parentElement.style.display =
                'none'
            }
            vditorInternal.preview.render(vditorInternal)
          }
          // Vditor is initialized, but its async markdown parsing and DOM painting take ~100ms.
          // We delay the removal of the loading screen to prevent the white screen flash.
          setTimeout(() => {
            setIsReady(true)
          }, 1000)
        },
        input(value) {
          useEditorStore.getState().setBody(rewriteImagesToRelative(value, docPath))
        },
        blur() {
          void useEditorStore.getState().flushSave()
        }
      })
      vditorRef.current = v
    }, 16) // ~1 frame delay

    const observer = new MutationObserver(() => {
      const dark = document.documentElement.dataset.theme === 'dark'
      if (vditorRef.current) {
        vditorRef.current.setTheme(dark ? 'dark' : 'classic', dark ? 'dark' : 'classic', 'native')
      }
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })

    return () => {
      clearTimeout(timer)
      observer.disconnect()
      try {
        v?.destroy()
      } catch {
        /* Vditor may throw if its DOM element was already removed */
      }
      vditorRef.current = null
    }
  }, [])

  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state) => {
      if (state.state.kind === 'ready' && vditorRef.current) {
        const currentVditorValue = vditorRef.current.getValue()
        const newLocalBody = rewriteImagesToLocal(state.state.body, state.state.path)

        const normalize = (s: string) => s.replace(/\r\n/g, '\n')

        if (normalize(currentVditorValue) !== normalize(newLocalBody)) {
          vditorRef.current.setValue(newLocalBody)
          // Ensure preview updates if we're in preview mode
          if (isPreviewMode) {
            const vditorInternal = (vditorRef.current as any).vditor
            if (vditorInternal && vditorInternal.preview) {
              vditorInternal.preview.render(vditorInternal)
            }
          }
        }
      }
    })
    return () => unsubscribe()
  }, [isPreviewMode])

  return (
    <div className="flex flex-col h-full w-full relative">
      {!isReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[color:var(--color-paper)]">
          <LoadingSquirrel scale={1.2} />
        </div>
      )}
      <div
        ref={elRef}
        className="flex-1 w-full !border-none [&_.vditor-toolbar]:!hidden [&_.vditor]:!bg-transparent [&_.vditor-ir]:!bg-transparent [&_.vditor-wysiwyg]:!bg-transparent [&_.vditor-preview]:!bg-transparent [&_.vditor-reset]:!bg-transparent [&_.vditor-sv]:!bg-transparent [&_.vditor-textarea]:!bg-transparent"
        data-testid="vditor-host"
      />
    </div>
  )
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
    const newUrlPart = rest
      ? `acornvo-local://${resolvedPath} ${rest}`
      : `acornvo-local://${resolvedPath}`
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
