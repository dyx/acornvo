import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/ui/toaster'
import { ipc } from '@/ipc/client'
import { toast } from '@/hooks/use-toast'

import '@fontsource/lora/400.css'
import '@fontsource/lora/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@fontsource/noto-sans-sc/700.css'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/600.css'
import './index.css'
import fontsConfig from '@/config/fonts.json'

function applyFontsConfig() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--font-editor-text', fontsConfig.editor.text.join(', '))
  root.style.setProperty('--font-editor-code', fontsConfig.editor.code.join(', '))
  root.style.setProperty('--font-chat-text', fontsConfig.chat.text.join(', '))
  root.style.setProperty('--font-ui-text', fontsConfig.ui.text.join(', '))
  root.style.setProperty('--font-review-text', fontsConfig.review.text.join(', '))
}
applyFontsConfig()

const container = document.getElementById('root')
if (!container) {
  throw new Error('root element not found in src/toast.html')
}

// Ensure theme is loaded from settings (minimal mock or just wait for IPC)
import { useSettingsStore } from '@/stores/settings'
import { installSettingsSubscriber } from '@/stores/settings'
import { installSettingsEffects } from '@/stores/settings-effects'

void (async () => {
  try {
    await useSettingsStore.getState().loadAll()
  } catch (err) {
    console.error('Failed to load settings on boot:', err)
  }

  installSettingsEffects()
  installSettingsSubscriber()

  // Listen to the ui:showToast event from the main process
  ipc.on('ui:showToast', (payload) => {
    toast(payload)
  })

  createRoot(container).render(
    <StrictMode>
      <Toaster />
    </StrictMode>
  )
})()
