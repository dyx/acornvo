// Library screen — file list with frontmatter

function Library({ onOpenFile, onNav, onSwitchProject, projectName, statusProps }) {
  const [sel, setSel] = React.useState(FILES[0].path);
  const [filter, setFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const current = FILES.find(f => f.path === sel) || FILES[0];

  const filtered = FILES.filter(f => {
    if (filter === 'inbox' && !f.category.startsWith('果篮')) return false;
    if (filter === 'tech' && !f.category.startsWith('技术')) return false;
    if (filter === 'product' && !f.category.startsWith('产品')) return false;
    if (filter === 'unreviewed' && f.status !== 'reviewing') return false;
    if (query && !f.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      <TitleBar title={`果仓 · ${projectName}`} accent="var(--paper-2)"/>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <AppRail current="library" onNav={onNav} projectName={projectName} onSwitchProject={onSwitchProject}/>

        {/* categories */}
        <div style={{ width: 200, background: 'var(--paper-2)', borderRight: '0.5px solid var(--line)', padding: '14px 0', flexShrink: 0, overflowY: 'auto' }}>
          <SectionLabel>视图</SectionLabel>
          <CatBtn label="全部" count={FILES.length} active={filter==='all'} onClick={() => setFilter('all')}/>
          <CatBtn label="果篮" count={2} active={filter==='inbox'} onClick={() => setFilter('inbox')}/>
          <CatBtn label="待理果" count={1} active={filter==='unreviewed'} onClick={() => setFilter('unreviewed')} dot="var(--acorn)"/>

          <SectionLabel>分类</SectionLabel>
          <CatBtn label="技术" count={3} active={filter==='tech'} onClick={() => setFilter('tech')} indent/>
          <CatBtn label="深度学习" count={3} indent={2}/>
          <CatBtn label="工具链" count={1} indent={2}/>
          <CatBtn label="产品" count={2} active={filter==='product'} onClick={() => setFilter('product')} indent/>
          <CatBtn label="随笔" count={1} indent/>

          <SectionLabel>标签</SectionLabel>
          <div style={{ padding: '2px 12px 12px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {['attention', 'transformer', '综述', 'LLM', '产品分析', '设计', 'electron'].map(t => (
              <span key={t} style={{
                fontSize: 10.5, padding: '2px 7px', borderRadius: 999,
                background: 'var(--paper-3)', border: '0.5px solid var(--line)',
                color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', cursor: 'pointer',
              }}>#{t}</span>
            ))}
          </div>
        </div>

        {/* file list */}
        <div style={{ width: 360, borderRight: '0.5px solid var(--line)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--line)', display: 'flex', gap: 8, alignItems: 'center', background: 'var(--paper-2)' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--paper)', border: '0.5px solid var(--line)', borderRadius: 7, padding: '5px 10px', height: 28 }}>
              <I.Search size={12} stroke="var(--ink-3)"/>
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="⌘P 跳转  ·  ⌘⇧F 全文" style={{
                flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: 'var(--ink)',
              }}/>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.map(f => (
              <FileRow key={f.path} file={f} active={sel === f.path} onClick={() => setSel(f.path)} onOpen={() => onOpenFile(f)}/>
            ))}
          </div>
          <div style={{ padding: '8px 14px', borderTop: '0.5px solid var(--line)', fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', background: 'var(--paper-2)' }}>
            {filtered.length} / {FILES.length} 篇
          </div>
        </div>

        {/* preview panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <FilePreview file={current} onOpen={() => onOpenFile(current)}/>
        </div>
      </div>
      <StatusBar {...statusProps}/>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{
    padding: '14px 14px 6px', fontSize: 10, fontWeight: 600, color: 'var(--ink-4)',
    textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)',
  }}>{children}</div>;
}
function CatBtn({ label, count, active, onClick, indent = 0, dot, mono }) {
  return (
    <button onClick={onClick} style={{
      width: 'calc(100% - 16px)', margin: '1px 8px', padding: `5px 10px 5px ${10 + indent * 12}px`,
      background: active ? 'var(--paper)' : 'transparent',
      border: '0.5px solid ' + (active ? 'var(--line-2)' : 'transparent'),
      borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
      fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontSize: mono ? 11 : 12.5,
      color: active ? 'var(--ink)' : 'var(--ink-2)', textAlign: 'left',
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: dot, flexShrink: 0 }}/>}
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>{count}</span>
    </button>
  );
}

function FileRow({ file, active, onClick, onOpen }) {
  return (
    <div onClick={onClick} onDoubleClick={onOpen} style={{
      padding: '10px 14px', borderBottom: '0.5px solid var(--line)', cursor: 'pointer',
      background: active ? 'var(--acorn-bg)' : 'transparent',
      borderLeft: active ? '2px solid var(--acorn)' : '2px solid transparent',
      paddingLeft: active ? 12 : 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span className="serif" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.title}
        </span>
        {file.status === 'reviewing' && <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--acorn)', animation: 'pulse 1.2s infinite', flexShrink: 0 }}/>}
      </div>
      <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-4)', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
        {file.rating && (
          <span style={{ display: 'flex', gap: 1 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} style={{ width: 6, height: 6, borderRadius: 1, background: i < file.rating ? 'var(--acorn)' : 'var(--paper-3)', border: '0.5px solid var(--line)' }}/>
            ))}
          </span>
        )}
        {!file.rating && <span style={{ color: 'var(--acorn-2)' }}>· 理果中</span>}
        <span>·</span>
        <span>{file.clipped}</span>
      </div>
    </div>
  );
}

function FilePreview({ file, onOpen }) {
  return (
    <div style={{ padding: '24px 32px', maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
        <span>{file.category}</span>
        <span>·</span>
        <span>{file.site}</span>
        <span>·</span>
        <span>{file.wordCount.toLocaleString()} 字</span>
      </div>
      <h1 className="serif" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.01em', margin: '0 0 16px' }}>
        {file.title}
      </h1>
      {file.rating && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 20 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <I.Star key={i} size={14} stroke={i < file.rating ? 'var(--acorn)' : 'var(--line-2)'} fill={i < file.rating ? 'var(--acorn)' : 'transparent'}/>
          ))}
        </div>
      )}
      {file.summary ? (
        <div style={{
          background: 'var(--paper-2)', border: '0.5px solid var(--line)', borderRadius: 10,
          padding: '16px 18px', marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--acorn-2)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            <I.Sparkles size={11} stroke="var(--acorn)"/> 理果 · Summary
          </div>
          <p className="serif" style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--ink-2)', margin: 0 }}>
            {file.summary}
          </p>
          {file.highlights && (
            <ul style={{ margin: '14px 0 0', padding: '0 0 0 20px', fontSize: 13, lineHeight: 1.7, color: 'var(--ink-2)', fontFamily: 'var(--font-serif)' }}>
              {file.highlights.map((h, i) => <li key={i} style={{ marginBottom: 4 }}>{h}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--acorn-bg)', border: '0.5px dashed var(--acorn)', borderRadius: 10, padding: 16, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 12, height: 12, border: '1.5px solid var(--acorn)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
          <span className="serif" style={{ fontSize: 13 }}>理果中 · DeepSeek 正在生成摘要</span>
        </div>
      )}
      {file.tags && file.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {file.tags.map(t => (
            <span key={t} style={{
              fontSize: 11, padding: '3px 9px', borderRadius: 999,
              background: 'var(--leaf-bg)', border: '0.5px solid var(--line)',
              color: 'var(--ink-2)', fontFamily: 'var(--font-mono)',
            }}>#{t}</span>
          ))}
        </div>
      )}
      <button onClick={onOpen} className="serif" style={{
        padding: '10px 18px', background: 'var(--acorn)', color: 'oklch(0.98 0.01 60)',
        border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-serif)',
      }}>
        <I.Edit size={12}/> 打开编辑器
      </button>
    </div>
  );
}

Object.assign(window, { Library });
