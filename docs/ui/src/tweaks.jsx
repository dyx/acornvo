// Tweaks panel

function TweaksPanel({ tweaks, setTweaks }) {
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, width: 260,
      background: 'var(--paper)', border: '0.5px solid var(--line-2)', borderRadius: 12,
      boxShadow: '0 12px 40px oklch(0 0 0 / 0.2)', padding: 14, zIndex: 1000,
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <I.Sparkles size={13} stroke="var(--acorn)"/>
        <span className="serif" style={{ fontSize: 13, fontWeight: 600 }}>Tweaks</span>
      </div>
      <TweakRow label="密度">
        <div style={{ display: 'flex', background: 'var(--paper-2)', border: '0.5px solid var(--line)', borderRadius: 6, padding: 1 }}>
          {['舒适', '紧凑'].map((d, i) => (
            <button key={d} onClick={() => setTweaks({ ...tweaks, density: i === 0 ? 'cozy' : 'compact' })} style={{
              padding: '3px 8px', fontSize: 10.5, border: 'none', borderRadius: 4,
              background: (tweaks.density === 'cozy' && i === 0) || (tweaks.density === 'compact' && i === 1) ? 'var(--paper)' : 'transparent',
              color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit',
            }}>{d}</button>
          ))}
        </div>
      </TweakRow>
      <TweakRow label="强调色">
        <div style={{ display: 'flex', gap: 5 }}>
          {[
            { id: 'acorn', c: 'var(--acorn)' },
            { id: 'leaf', c: 'var(--leaf)' },
            { id: 'berry', c: 'var(--berry)' },
            { id: 'sky', c: 'var(--sky)' },
          ].map(c => (
            <button key={c.id} onClick={() => setTweaks({ ...tweaks, accent: c.id })} style={{
              width: 20, height: 20, borderRadius: '50%', border: '0.5px solid var(--line-2)',
              background: c.c, cursor: 'pointer', padding: 0,
              outline: tweaks.accent === c.id ? '2px solid var(--ink)' : 'none',
              outlineOffset: 2,
            }}/>
          ))}
        </div>
      </TweakRow>
      <TweakRow label="语言">
        <div style={{ display: 'flex', background: 'var(--paper-2)', border: '0.5px solid var(--line)', borderRadius: 6, padding: 1 }}>
          {['中', 'EN'].map((d, i) => (
            <button key={d} onClick={() => setTweaks({ ...tweaks, lang: i === 0 ? 'zh' : 'en' })} style={{
              padding: '3px 10px', fontSize: 10.5, border: 'none', borderRadius: 4,
              background: (tweaks.lang === 'zh' && i === 0) || (tweaks.lang === 'en' && i === 1) ? 'var(--paper)' : 'transparent',
              color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
            }}>{d}</button>
          ))}
        </div>
      </TweakRow>
      <div style={{ fontSize: 9.5, color: 'var(--ink-4)', marginTop: 10, fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
        Toggle Tweaks from toolbar to hide.
      </div>
    </div>
  );
}
function TweakRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid var(--line)' }}>
      <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{label}</span>
      {children}
    </div>
  );
}

Object.assign(window, { TweaksPanel });
