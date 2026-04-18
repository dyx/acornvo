// 松语 Chat screen

function Chat({ onNav, onSwitchProject, projectName, statusProps }) {
  const [selected, setSelected] = React.useState('c1');
  const [messages, setMessages] = React.useState(CHAT_MESSAGES);
  const [input, setInput] = React.useState('');
  const [mentions, setMentions] = React.useState([]);
  const [showMention, setShowMention] = React.useState(false);
  const [streaming, setStreaming] = React.useState(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  const send = () => {
    if (!input.trim() && mentions.length === 0) return;
    const userMsg = { role: 'user', content: input || '基于这些文件整理一份笔记。', mentions: mentions.map(m => m.path) };
    setMessages([...messages, userMsg]);
    setInput(''); setMentions([]); setStreaming(true);
    setTimeout(() => {
      setMessages(ms => [...ms, {
        role: 'assistant',
        content: '好的，我先读取这几份文档，然后生成对比笔记。',
        toolCalls: [
          { name: 'read_file', args: { path: userMsg.mentions[0] || '技术/深度学习/注意力机制综述.md' }, status: 'running' },
        ],
        streaming: true,
      }]);
      setTimeout(() => setStreaming(false), 2400);
    }, 600);
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      <TitleBar title="松语 · Chat" accent="var(--paper-2)"/>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <AppRail current="chat" onNav={onNav} projectName={projectName} onSwitchProject={onSwitchProject}/>

        {/* history list */}
        <div style={{ width: 240, background: 'var(--paper-2)', borderRight: '0.5px solid var(--line)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--line)' }}>
            <button className="serif" style={{
              width: '100%', padding: '8px 10px', background: 'var(--paper)', border: '0.5px solid var(--line-2)',
              borderRadius: 7, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              color: 'var(--ink)', fontFamily: 'var(--font-serif)',
            }}>
              <I.Plus size={12}/> 新会话
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            {CHAT_HISTORY.map(c => (
              <button key={c.id} onClick={() => setSelected(c.id)} style={{
                width: 'calc(100% - 16px)', margin: '1px 8px', padding: '9px 10px', borderRadius: 7, border: 'none',
                background: selected === c.id ? 'var(--paper)' : 'transparent',
                borderLeft: selected === c.id ? '2px solid var(--acorn)' : '2px solid transparent',
                paddingLeft: selected === c.id ? 8 : 10,
                textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <div className="serif" style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 2, display: 'flex', gap: 6 }}>
                  <span>{c.updated}</span><span>·</span><span>{c.model}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* main chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 18px', borderBottom: '0.5px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <h2 className="serif" style={{ fontSize: 14, fontWeight: 500, margin: 0, flex: 1 }}>
              Transformer 与 RNN 对比综述
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--paper-2)', border: '0.5px solid var(--line)', borderRadius: 7, fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
              <I.Sparkles size={11} stroke="var(--acorn)"/> Claude Opus 4
            </div>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 0' }}>
            <div style={{ maxWidth: 740, margin: '0 auto' }}>
              {messages.map((m, i) => <Message key={i} message={m}/>)}
              {streaming && <StreamingIndicator/>}
              <div style={{ height: 20 }}/>
            </div>
          </div>

          {/* input */}
          <div style={{ padding: '12px 28px 18px', borderTop: '0.5px solid var(--line)', background: 'var(--paper-2)', flexShrink: 0 }}>
            <div style={{ maxWidth: 740, margin: '0 auto' }}>
              {mentions.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                  {mentions.map((m, i) => (
                    <span key={i} style={{
                      fontSize: 11, padding: '4px 9px', background: 'var(--acorn-bg)',
                      border: '0.5px solid var(--line)', borderRadius: 6, fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}>
                      <I.File size={10} stroke="var(--acorn-2)"/>
                      {m.title}
                      <I.X size={10} stroke="var(--ink-3)" style={{ cursor: 'pointer' }} onClick={() => setMentions(mentions.filter((_, j) => j !== i))}/>
                    </span>
                  ))}
                </div>
              )}
              <div style={{
                background: 'var(--paper)', border: '0.5px solid var(--line-2)', borderRadius: 12,
                padding: '10px 12px',
                position: 'relative',
              }}>
                {showMention && <MentionPopover onSelect={f => { setMentions([...mentions, f]); setShowMention(false); setInput(input.replace(/@$/, '')); }}/>}
                <textarea
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    setShowMention(e.target.value.endsWith('@'));
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
                  }}
                  placeholder="@ 引用文件，Cmd+Enter 发送。让松语基于本地笔记为你生成新文档…"
                  rows={2}
                  style={{
                    width: '100%', border: 'none', outline: 'none', background: 'transparent',
                    fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink)', resize: 'none',
                    fontFamily: 'var(--font-serif)',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <button onClick={() => setShowMention(!showMention)} style={{
                    width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent',
                    color: 'var(--ink-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }} title="引用文件">
                    <I.At size={14}/>
                  </button>
                  <span style={{ flex: 1 }}/>
                  <span style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
                    ⌘↵ 发送
                  </span>
                  <button onClick={send} style={{
                    padding: '6px 12px', background: 'var(--acorn)', color: 'oklch(0.98 0.01 60)',
                    border: 'none', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-serif)',
                  }}>
                    <I.Send size={11} stroke="oklch(0.98 0.01 60)"/> 发送
                  </button>
                </div>
              </div>
            </div>
          </div>

          <StatusBar {...statusProps}/>
        </div>
      </div>
    </div>
  );
}

function Message({ message }) {
  const isUser = message.role === 'user';
  return (
    <div style={{ marginBottom: 20, animation: 'fadeUp 0.3s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {isUser ? (
          <>
            <span style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--paper-3)', border: '0.5px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--ink-2)', fontWeight: 600 }}>你</span>
            <span>你</span>
          </>
        ) : (
          <>
            <span style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--acorn-bg)', border: '0.5px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AcornLogo size={12}/>
            </span>
            <span>松语</span>
          </>
        )}
      </div>

      {message.mentions && message.mentions.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {message.mentions.map((p, i) => (
            <span key={i} style={{
              fontSize: 11, padding: '3px 8px', background: 'var(--acorn-bg)', border: '0.5px solid var(--line)',
              borderRadius: 5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <I.File size={10} stroke="var(--acorn-2)"/> {p.split('/').pop()}
            </span>
          ))}
        </div>
      )}

      {message.toolCalls && message.toolCalls.map((tc, i) => <ToolCall key={i} tc={tc}/>)}

      <div className="serif" style={{
        fontSize: 14.5, lineHeight: 1.75, color: 'var(--ink)', whiteSpace: 'pre-wrap',
      }}>
        {message.content}
      </div>
    </div>
  );
}

function ToolCall({ tc }) {
  return (
    <div style={{
      margin: '6px 0 10px', padding: '8px 12px', background: 'var(--paper-2)',
      border: '0.5px solid var(--line)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11.5,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <I.Tool size={12} stroke="var(--ink-3)"/>
      <span style={{ color: 'var(--acorn-2)', fontWeight: 500 }}>{tc.name}</span>
      <span style={{ color: 'var(--ink-3)' }}>
        ({Object.entries(tc.args).map(([k, v]) => <span key={k}><span style={{ color: 'var(--ink-4)' }}>{k}:</span> "{String(v).slice(0, 40)}"</span>)})
      </span>
      <span style={{ flex: 1 }}/>
      {tc.status === 'running' ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--acorn-2)' }}>
          <div style={{ width: 8, height: 8, border: '1.2px solid var(--line-2)', borderTopColor: 'var(--acorn)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
          running
        </span>
      ) : (
        <>
          <I.Check size={11} stroke="var(--leaf)"/>
          <span style={{ color: 'var(--ink-3)' }}>{tc.result}</span>
        </>
      )}
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {[0, 1, 2].map(i => <span key={i} style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--acorn)', animation: `streamDot 1.2s ${i * 0.15}s infinite` }}/>)}
      </span>
      <span>松语思考中</span>
    </div>
  );
}

function MentionPopover({ onSelect }) {
  return (
    <div style={{
      position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
      background: 'var(--paper)', border: '0.5px solid var(--line-2)', borderRadius: 10,
      boxShadow: '0 12px 30px oklch(0 0 0 / 0.15)', padding: 6, zIndex: 10, maxHeight: 260, overflowY: 'auto',
    }}>
      <div style={{ padding: '6px 10px', fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        引用树林内文件
      </div>
      {FILES.slice(0, 6).map(f => (
        <button key={f.path} onClick={() => onSelect(f)} style={{
          width: '100%', padding: '7px 10px', borderRadius: 6, border: 'none', background: 'transparent',
          textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
        }} onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <I.File size={11} stroke="var(--acorn-2)"/>
          <span style={{ flex: 1, minWidth: 0 }}>
            <div className="serif" style={{ fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</div>
            <div style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</div>
          </span>
        </button>
      ))}
    </div>
  );
}

Object.assign(window, { Chat });
