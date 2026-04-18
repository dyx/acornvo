// MacOS window chrome — warm editorial variant

function TrafficLights({ onClose }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button onClick={onClose} aria-label="close" style={dotStyle('#ec6a5f', '#d64a3d')} />
      <div style={dotStyle('#f4bf50', '#d69e2a')} />
      <div style={dotStyle('#61c554', '#3ea23b')} />
    </div>
  );
}
const dotStyle = (bg, border) => ({
  width: 12, height: 12, borderRadius: '50%',
  background: bg, border: `0.5px solid ${border}`,
  padding: 0, cursor: 'pointer',
});

function MacFrame({ title, children, onClose }) {
  return (
    <div style={{
      width: '100%', height: '100%', maxWidth: 1440, maxHeight: 900,
      borderRadius: 12, overflow: 'hidden',
      background: 'var(--paper)',
      boxShadow: '0 0 0 0.5px oklch(0 0 0 / 0.3), 0 30px 80px oklch(0 0 0 / 0.25), 0 10px 30px oklch(0 0 0 / 0.1)',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {children}
    </div>
  );
}

// Title bar with traffic lights — overlayed at top-left of each screen
function TitleBar({ title, onClose, right, accent = 'var(--paper-2)', borderless }) {
  return (
    <div style={{
      height: 38, display: 'flex', alignItems: 'center', gap: 14,
      padding: '0 14px',
      background: accent,
      borderBottom: borderless ? 'none' : '0.5px solid var(--line)',
      flexShrink: 0,
      WebkitAppRegion: 'drag',
      position: 'relative',
    }}>
      <TrafficLights onClose={onClose}/>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 500, fontFamily: 'var(--font-serif)', letterSpacing: '0.02em' }}>
        {title}
      </div>
      <div style={{ minWidth: 52, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{right}</div>
    </div>
  );
}

// left rail — squirrel nav
function AppRail({ current, onNav, projectName, onSwitchProject }) {
  const items = [
    { id: 'browser', label: '拾果', sub: 'Clip', icon: <I.Globe size={18}/> },
    { id: 'library', label: '果仓', sub: 'Library', icon: <I.Library size={18}/> },
    { id: 'chat', label: '松语', sub: 'Chat', icon: <I.Chat size={18}/> },
  ];
  const bottom = [
    { id: 'settings', label: '设置', sub: 'Settings', icon: <I.Settings size={18}/> },
  ];
  return (
    <div style={{
      width: 72, background: 'var(--paper-2)',
      borderRight: '0.5px solid var(--line)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '12px 0', flexShrink: 0,
    }}>
      <button onClick={onSwitchProject} title={`${projectName} — 切换树林`} style={{
        width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--acorn-bg)', border: '0.5px solid var(--line-2)', borderRadius: 12, cursor: 'pointer', marginBottom: 12,
      }}>
        <AcornLogo size={24}/>
      </button>
      <div style={{ width: 28, height: 1, background: 'var(--line)', marginBottom: 10 }}/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {items.map(it => <RailBtn key={it.id} {...it} active={current === it.id} onClick={() => onNav(it.id)}/>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {bottom.map(it => <RailBtn key={it.id} {...it} active={current === it.id} onClick={() => onNav(it.id)}/>)}
      </div>
    </div>
  );
}
function RailBtn({ icon, label, sub, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 56, padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      background: active ? 'var(--acorn-bg)' : 'transparent',
      border: '0.5px solid ' + (active ? 'var(--line-2)' : 'transparent'),
      color: active ? 'var(--acorn-2)' : 'var(--ink-2)',
      borderRadius: 10, cursor: 'pointer',
      fontFamily: 'inherit', transition: 'background 0.15s',
    }}>
      {icon}
      <span style={{ fontSize: 11, fontFamily: 'var(--font-serif)', fontWeight: 500 }}>{label}</span>
    </button>
  );
}

// Status bar at bottom
function StatusBar({ reviewing, conflicts, todayCost, indexing }) {
  return (
    <div style={{
      height: 26, background: 'var(--paper-3)', borderTop: '0.5px solid var(--line)',
      display: 'flex', alignItems: 'center', gap: 14, padding: '0 14px',
      fontSize: 11, color: 'var(--ink-3)', flexShrink: 0, fontFamily: 'var(--font-mono)',
    }}>
      {indexing ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--sky)', animation: 'pulse 1.2s infinite' }}/>
          索引中 {indexing}
        </span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--leaf)' }}/>
          已同步
        </span>
      )}
      {reviewing > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <I.Sparkles size={11} stroke="var(--acorn)"/>
          理果中 {reviewing}
        </span>
      )}
      {conflicts > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--berry)' }}>
          <I.Warn size={11}/> {conflicts} 冲突
        </span>
      )}
      <span style={{ flex: 1 }}/>
      <span>今日 ${todayCost}</span>
      <span>·</span>
      <span>487 篇文档</span>
    </div>
  );
}

Object.assign(window, { MacFrame, TitleBar, AppRail, StatusBar, TrafficLights });
