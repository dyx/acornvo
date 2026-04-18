// Browser screen (拾果) — hero screen

function Browser({ onClip, onNav, onSwitchProject, projectName, statusProps }) {
  const [tabs, setTabs] = React.useState(BROWSER_TABS);
  const [activeId, setActiveId] = React.useState('t1');
  const [clipState, setClipState] = React.useState('idle'); // idle | extracting | success
  const [showDrawer, setShowDrawer] = React.useState(true);
  const [fallingAcorns, setFallingAcorns] = React.useState([]);
  const [address, setAddress] = React.useState('jiqizhixin.com/articles/attention-mechanism');

  const active = tabs.find(t => t.id === activeId);

  const handleClip = () => {
    if (clipState !== 'idle') return;
    setClipState('extracting');
    // animate falling acorns
    const acorns = Array.from({ length: 6 }, (_, i) => ({
      id: Date.now() + i,
      dx: (Math.random() - 0.5) * 80,
      rot: 360 + Math.random() * 360,
      delay: i * 0.1,
    }));
    setFallingAcorns(acorns);
    setTimeout(() => {
      setClipState('success');
      setTimeout(() => {
        setClipState('idle');
        setFallingAcorns([]);
        onClip && onClip();
      }, 2400);
    }, 1600);
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      <TitleBar title="拾果 · Browser" accent="var(--paper-2)"/>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <AppRail current="browser" onNav={onNav} projectName={projectName} onSwitchProject={onSwitchProject}/>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* tab strip */}
          <div style={{
            background: 'var(--paper-2)',
            borderBottom: '0.5px solid var(--line)',
            display: 'flex', alignItems: 'flex-end', padding: '6px 10px 0', gap: 2, flexShrink: 0,
          }}>
            {tabs.map(t => (
              <BrowserTab key={t.id} tab={t} active={t.id === activeId}
                onClick={() => setActiveId(t.id)}
                onClose={() => setTabs(tabs.filter(x => x.id !== t.id))}/>
            ))}
            <button title="新标签页" style={{
              width: 28, height: 28, marginLeft: 4, border: 'none', background: 'transparent',
              color: 'var(--ink-3)', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <I.Plus size={14}/>
            </button>
          </div>

          {/* toolbar */}
          <div style={{
            height: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
            background: 'var(--paper)', borderBottom: '0.5px solid var(--line)', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: 2 }}>
              <IconBtn><I.Back size={14}/></IconBtn>
              <IconBtn disabled><I.Fwd size={14}/></IconBtn>
              <IconBtn><I.Reload size={14}/></IconBtn>
            </div>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--paper-2)', border: '0.5px solid var(--line)',
              borderRadius: 8, padding: '6px 12px', height: 30,
            }}>
              <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-4)' }}>https://</span>
              <input value={address} onChange={e => setAddress(e.target.value)} style={{
                flex: 1, border: 'none', background: 'transparent', outline: 'none',
                fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--ink)',
              }}/>
              <span style={{ fontSize: 10, color: 'var(--leaf)', fontFamily: 'var(--font-mono)' }}>●安全</span>
            </div>

            {/* HERO CLIP BUTTON */}
            <ClipButton state={clipState} onClick={handleClip}/>

            <IconBtn onClick={() => setShowDrawer(!showDrawer)} active={showDrawer} title="标记">
              <I.Bookmark size={14}/>
            </IconBtn>
          </div>

          {/* main split */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
            <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
              <WebPageMock dimmed={clipState !== 'idle'}/>
              {/* overlay for extraction */}
              {clipState === 'extracting' && <ExtractionOverlay/>}
              {clipState === 'success' && <ClipSuccessToast/>}
              {/* falling acorns */}
              {fallingAcorns.map(a => (
                <div key={a.id} style={{
                  position: 'absolute', top: -20, right: 40, pointerEvents: 'none',
                  animation: `acornFall 1.6s ${a.delay}s ease-in forwards`,
                  '--dx': a.dx + 'px', '--rot': a.rot + 'deg',
                }}>
                  <AcornLogo size={14}/>
                </div>
              ))}
            </div>
            {showDrawer && <BookmarksDrawer onClose={() => setShowDrawer(false)}/>}
          </div>

          <StatusBar {...statusProps}/>
        </div>
      </div>
    </div>
  );
}

function BrowserTab({ tab, active, onClick, onClose }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px 12px',
      background: active ? 'var(--paper)' : 'transparent',
      border: active ? '0.5px solid var(--line)' : '0.5px solid transparent',
      borderBottom: active ? '0.5px solid var(--paper)' : '0.5px solid transparent',
      borderRadius: '8px 8px 0 0', cursor: 'pointer',
      maxWidth: 240, minWidth: 140, height: 30,
      marginBottom: -0.5, position: 'relative', zIndex: active ? 2 : 1,
    }}>
      <span style={{
        width: 14, height: 14, borderRadius: 3, background: 'var(--paper-3)', border: '0.5px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: 'var(--ink-3)', fontWeight: 600, flexShrink: 0,
      }}>{tab.favicon}</span>
      <span style={{ flex: 1, fontSize: 11.5, color: active ? 'var(--ink)' : 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {tab.title}
      </span>
      <button onClick={e => { e.stopPropagation(); onClose(); }} style={{
        width: 16, height: 16, borderRadius: 4, border: 'none', background: 'transparent',
        color: 'var(--ink-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}><I.X size={11}/></button>
    </div>
  );
}

function IconBtn({ children, onClick, active, disabled, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      width: 30, height: 30, borderRadius: 7, border: 'none',
      background: active ? 'var(--paper-3)' : 'transparent',
      color: disabled ? 'var(--ink-4)' : 'var(--ink-2)',
      cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: disabled ? 0.4 : 1,
    }}>{children}</button>
  );
}

// The signature clip button — the star of the show
function ClipButton({ state, onClick }) {
  return (
    <button onClick={onClick} disabled={state !== 'idle'} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: 32,
      background: state === 'success' ? 'var(--leaf)' : 'var(--acorn)',
      color: 'oklch(0.98 0.01 60)', border: 'none', borderRadius: 8,
      fontFamily: 'var(--font-serif)', fontSize: 13, fontWeight: 500, cursor: state !== 'idle' ? 'default' : 'pointer',
      boxShadow: '0 1px 2px oklch(0 0 0 / 0.12), inset 0 1px 0 oklch(1 0 0 / 0.18)',
      transition: 'background 0.3s',
      position: 'relative', overflow: 'hidden',
    }}>
      {state === 'idle' && <>
        <AcornLogo size={14} color="oklch(0.98 0.01 60)"/>
        <span>拾果</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.7, marginLeft: 2 }}>⌘⇧C</span>
      </>}
      {state === 'extracting' && <>
        <div style={{ width: 12, height: 12, border: '1.5px solid oklch(1 0 0 / 0.3)', borderTopColor: 'oklch(0.98 0.01 60)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        <span>提取正文中…</span>
      </>}
      {state === 'success' && <>
        <I.Check size={14} stroke="oklch(0.98 0.01 60)"/>
        <span>已拾果 · 理果中</span>
      </>}
    </button>
  );
}

function ExtractionOverlay() {
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'oklch(0.22 0.012 60 / 0.02)',
    }}>
      {/* scanning line */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 120,
        background: 'linear-gradient(180deg, transparent 0%, oklch(0.6 0.1 50 / 0.15) 50%, transparent 100%)',
        animation: 'scanDown 1.6s ease-in-out forwards',
        top: 0,
      }}/>
      {/* reading a chunk */}
      <div style={{
        position: 'absolute', top: 24, right: 24, padding: '10px 14px',
        background: 'var(--paper)', border: '0.5px solid var(--line-2)', borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 4px 20px oklch(0 0 0 / 0.1)',
      }}>
        <div style={{ width: 14, height: 14, border: '1.5px solid var(--line-2)', borderTopColor: 'var(--acorn)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        <div style={{ fontSize: 11.5 }}>
          <div style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)', fontWeight: 500 }}>Readability 抽取正文</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>→ Turndown → markdown · 下载图片</div>
        </div>
      </div>
      <style>{`
        @keyframes scanDown { 0% { top: -120px; } 100% { top: 100%; } }
      `}</style>
    </div>
  );
}

function ClipSuccessToast() {
  return (
    <div style={{
      position: 'absolute', top: 24, right: 24, padding: '14px 16px',
      background: 'var(--paper)', border: '0.5px solid var(--line-2)', borderRadius: 10,
      display: 'flex', alignItems: 'flex-start', gap: 12, maxWidth: 340,
      boxShadow: '0 8px 30px oklch(0 0 0 / 0.15)',
      animation: 'fadeUp 0.3s ease-out',
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--leaf-bg)', border: '0.5px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <I.Check size={14} stroke="var(--leaf)"/>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>已归档到 果篮/</div>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.5 }}>
          20260417-attention-mechanism.md · 8,432 字
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: 'var(--acorn-2)' }}>
          <I.Sparkles size={11} stroke="var(--acorn)"/>
          <span style={{ fontFamily: 'var(--font-serif)' }}>正在理果…</span>
          <span style={{ display: 'inline-flex', gap: 2, marginLeft: 2 }}>
            {[0, 1, 2].map(i => <span key={i} style={{ width: 3, height: 3, borderRadius: 2, background: 'var(--acorn)', animation: `streamDot 1.2s ${i * 0.15}s infinite` }}/>)}
          </span>
        </div>
      </div>
    </div>
  );
}

function WebPageMock({ dimmed }) {
  return (
    <div style={{
      padding: '32px 48px 60px', maxWidth: 760, margin: '0 auto',
      fontFamily: 'Georgia, serif', color: 'var(--ink)',
      transition: 'opacity 0.3s', opacity: dimmed ? 0.55 : 1,
    }}>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 8, display: 'flex', gap: 12 }}>
        <span>机器之心</span><span>·</span><span>2026-03-15</span><span>·</span><span>14 分钟阅读</span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, margin: '4px 0 24px', letterSpacing: '-0.01em' }}>
        深度学习中的注意力机制：从 Seq2Seq 到 Transformer
      </h1>

      <div style={{ height: 180, background: 'var(--paper-3)', border: '0.5px solid var(--line)', borderRadius: 6, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
        [ hero image · attention visualization ]
      </div>

      <p style={{ fontSize: 16, lineHeight: 1.75, color: 'var(--ink-2)', marginBottom: 18 }}>
        注意力机制（<em>Attention Mechanism</em>）已经成为现代深度学习架构的基石。从最初用于改进神经机器翻译的编解码瓶颈，到如今成为
        Transformer 的核心组件，注意力机制的演进贯穿了近十年深度学习的发展脉络。本文将系统梳理它从诞生到成为主流的关键节点。
      </p>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '32px 0 12px', letterSpacing: '-0.005em' }}>缘起：Seq2Seq 的瓶颈</h2>
      <p style={{ fontSize: 16, lineHeight: 1.75, color: 'var(--ink-2)', marginBottom: 18 }}>
        2014 年，Sutskever 等人提出的 Seq2Seq 模型用两个 RNN 分别做编码与解码。该架构有一个根本缺陷：所有输入信息被压缩进一个固定长度的上下文向量——长序列上丢失严重。
      </p>
      <blockquote style={{ borderLeft: '2px solid var(--acorn)', margin: '0 0 18px', padding: '4px 0 4px 20px', fontStyle: 'italic', color: 'var(--ink-2)', fontSize: 16, lineHeight: 1.75 }}>
        "固定长度向量是神经机器翻译性能的瓶颈。" —— Bahdanau, 2014
      </blockquote>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '32px 0 12px', letterSpacing: '-0.005em' }}>Bahdanau Attention</h2>
      <p style={{ fontSize: 16, lineHeight: 1.75, color: 'var(--ink-2)', marginBottom: 18 }}>
        同年 Bahdanau 提出的加性注意力打破了这个瓶颈。解码器不再只看一个向量，而是对编码器所有时刻的隐状态做加权求和，权重由一个小型前馈网络计算。这一设计让模型可以"回头看"原文的任意位置。
      </p>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '32px 0 12px', letterSpacing: '-0.005em' }}>自注意力与 Transformer</h2>
      <p style={{ fontSize: 16, lineHeight: 1.75, color: 'var(--ink-2)', marginBottom: 18 }}>
        2017 年 Vaswani 等人的《Attention is All You Need》把注意力机制推到极致——完全抛弃 RNN，仅用自注意力堆叠构建编码器与解码器。这是深度学习近十年最具影响力的工作之一。
      </p>
    </div>
  );
}

function BookmarksDrawer({ onClose }) {
  return (
    <div style={{
      width: 280, background: 'var(--paper-2)', borderLeft: '0.5px solid var(--line)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="serif" style={{ fontSize: 13, fontWeight: 500 }}>标记</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <IconBtn><I.Plus size={12}/></IconBtn>
          <IconBtn onClick={onClose}><I.X size={12}/></IconBtn>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {BOOKMARKS.map((b, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
            borderRadius: 6, cursor: 'pointer',
          }} onMouseEnter={e => e.currentTarget.style.background = 'var(--paper)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{
              width: 20, height: 20, borderRadius: 4, background: 'var(--paper-3)', border: '0.5px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: 'var(--ink-2)', fontWeight: 600, flexShrink: 0,
            }}>{b.favicon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{b.site}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: 12, borderTop: '0.5px solid var(--line)', fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
        {BOOKMARKS.length} 条 · ⌘D 添加当前页
      </div>
    </div>
  );
}

Object.assign(window, { Browser });
