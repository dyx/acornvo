// Main app — routing, state, tweaks wiring

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  accent: 'acorn',
  density: 'cozy',
  lang: 'zh'
} /*EDITMODE-END*/

function App() {
  const saved = JSON.parse(localStorage.getItem('acornvo:state') || '{}')
  const [screen, setScreen] = React.useState(saved.screen || 'picker')
  const [project, setProject] = React.useState(saved.project || null)
  const [currentFile, setCurrentFile] = React.useState(null)
  const [reviewing, setReviewing] = React.useState(1)
  const [tweaks, setTweaks] = React.useState(TWEAK_DEFAULTS)
  const [showTweaks, setShowTweaks] = React.useState(false)

  React.useEffect(() => {
    localStorage.setItem('acornvo:state', JSON.stringify({ screen, project }))
  }, [screen, project])

  // tweak mode wiring
  React.useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') setShowTweaks(true)
      if (e.data?.type === '__deactivate_edit_mode') setShowTweaks(false)
    }
    window.addEventListener('message', handler)
    window.parent.postMessage({ type: '__edit_mode_available' }, '*')
    return () => window.removeEventListener('message', handler)
  }, [])

  // persist tweaks
  React.useEffect(() => {
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: tweaks }, '*')
    // apply accent
    const accentMap = {
      acorn: { c: 'oklch(0.5 0.09 48)', c2: 'oklch(0.42 0.1 44)', bg: 'oklch(0.94 0.03 55)' },
      leaf: { c: 'oklch(0.5 0.08 135)', c2: 'oklch(0.42 0.09 132)', bg: 'oklch(0.94 0.025 130)' },
      berry: { c: 'oklch(0.5 0.14 25)', c2: 'oklch(0.42 0.15 22)', bg: 'oklch(0.94 0.03 25)' },
      sky: { c: 'oklch(0.55 0.06 230)', c2: 'oklch(0.45 0.07 230)', bg: 'oklch(0.93 0.02 230)' }
    }
    const a = accentMap[tweaks.accent] || accentMap.acorn
    document.documentElement.style.setProperty('--acorn', a.c)
    document.documentElement.style.setProperty('--acorn-2', a.c2)
    document.documentElement.style.setProperty('--acorn-bg', a.bg)
  }, [tweaks])

  const statusProps = { reviewing, conflicts: 0, todayCost: '0.09', indexing: null }

  const openProject = (p) => {
    setProject(p)
    setScreen('browser')
  }
  const nav = (s) => setScreen(s)
  const openFile = (f) => {
    setCurrentFile(f)
    setScreen('editor')
  }
  const switchProject = () => setScreen('picker')

  const commonProps = {
    onNav: nav,
    onSwitchProject: switchProject,
    projectName: project?.name || '我的知识库',
    statusProps
  }

  return (
    <div
      data-screen-label={screen}
      style={{
        width: '100%',
        height: '100%',
        maxWidth: 1440,
        maxHeight: 920,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow:
          '0 0 0 0.5px oklch(0 0 0 / 0.3), 0 30px 80px oklch(0 0 0 / 0.3), 0 10px 30px oklch(0 0 0 / 0.12)'
      }}
    >
      {screen === 'picker' && <ProjectPicker onOpen={openProject} />}
      {screen === 'browser' && (
        <Browser {...commonProps} onClip={() => setReviewing((r) => r + 1)} />
      )}
      {screen === 'library' && <Library {...commonProps} onOpenFile={openFile} />}
      {screen === 'editor' && (
        <Editor {...commonProps} file={currentFile} onBack={() => setScreen('library')} />
      )}
      {screen === 'chat' && <Chat {...commonProps} />}
      {screen === 'settings' && <Settings {...commonProps} />}
      {showTweaks && <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} />}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
