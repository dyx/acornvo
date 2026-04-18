// Editor screen with 理果 frontmatter panel

function Editor({ file, onNav, onSwitchProject, projectName, onBack, statusProps }) {
  const [showHistory, setShowHistory] = React.useState(false);
  const [mode, setMode] = React.useState('ir'); // ir | sv | wysiwyg
  const f = file || FILES[0];

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      <TitleBar title={f.title} accent="var(--paper-2)"/>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <AppRail current="library" onNav={onNav} projectName={projectName} onSwitchProject={onSwitchProject}/>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* editor toolbar */}
          <div style={{
            height: 44, borderBottom: '0.5px solid var(--line)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0,
          }}>
            <button onClick={onBack} style={{
              padding: '5px 10px', background: 'transparent', border: 'none', color: 'var(--ink-2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, borderRadius: 6,
            }}>
              <I.Back size={12}/> 果仓
            </button>
            <span style={{ width: 1, height: 16, background: 'var(--line)' }}/>
            <div style={{ display: 'flex', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
              <span style={{ color: 'var(--ink-4)' }}>{f.path.split('/').slice(0, -1).join(' / ')} / </span>
              <span style={{ color: 'var(--ink-2)' }}>{f.path.split('/').pop()}</span>
            </div>
            <span style={{ flex: 1 }}/>
            <div style={{ display: 'flex', gap: 2, background: 'var(--paper-2)', border: '0.5px solid var(--line)', borderRadius: 7, padding: 2 }}>
              {['ir', 'sv', 'wysiwyg'].map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  padding: '3px 10px', fontSize: 11, borderRadius: 5, border: 'none',
                  background: mode === m ? 'var(--paper)' : 'transparent',
                  color: mode === m ? 'var(--ink)' : 'var(--ink-3)',
                  fontFamily: 'var(--font-mono)', cursor: 'pointer',
                }}>{m.toUpperCase()}</button>
              ))}
            </div>
            <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--leaf)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--leaf)' }}/>
              已保存 · 2s 前
            </span>
            <button className="serif" style={{
              padding: '5px 12px', background: 'var(--acorn)', color: 'oklch(0.98 0.01 60)', border: 'none', borderRadius: 7,
              fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-serif)',
            }}>
              <I.Sparkles size={11} stroke="oklch(0.98 0.01 60)"/> 重新理果
            </button>
          </div>

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* markdown editor */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '40px 56px 80px', background: 'var(--paper)' }}>
              <div style={{ maxWidth: 680, margin: '0 auto' }}>
                <MarkdownContent/>
              </div>
            </div>

            {/* frontmatter sidebar */}
            <FrontmatterPanel file={f} onToggleHistory={() => setShowHistory(!showHistory)} showHistory={showHistory}/>
          </div>

          <StatusBar {...statusProps}/>
        </div>
      </div>
    </div>
  );
}

function MarkdownContent() {
  return (
    <div style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)', lineHeight: 1.8 }}>
      {/* frontmatter block */}
      <div style={{
        background: 'var(--paper-2)', border: '0.5px solid var(--line)', borderRadius: 8,
        padding: '12px 16px', marginBottom: 28, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-3)',
        lineHeight: 1.75,
      }}>
        <div style={{ color: 'var(--ink-4)', marginBottom: 4 }}>---</div>
        <div><span style={{ color: 'var(--acorn-2)' }}>title:</span> 深度学习中的注意力机制：从 Seq2Seq 到 Transformer</div>
        <div><span style={{ color: 'var(--acorn-2)' }}>url:</span> https://jiqizhixin.com/articles/attention-mechanism</div>
        <div><span style={{ color: 'var(--acorn-2)' }}>rating:</span> <span style={{ color: 'var(--leaf)' }}>5</span></div>
        <div><span style={{ color: 'var(--acorn-2)' }}>category:</span> 技术/深度学习</div>
        <div><span style={{ color: 'var(--acorn-2)' }}>tags:</span> [attention, transformer, 综述]</div>
        <div style={{ color: 'var(--ink-4)' }}>---</div>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.25, margin: '0 0 8px', letterSpacing: '-0.01em' }}>深度学习中的注意力机制：从 Seq2Seq 到 Transformer</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 24 }}><em>作者：机器之心编译组 · 发布于 2026-03-15</em></p>
      <p style={{ fontSize: 16, marginBottom: 18 }}>注意力机制（Attention Mechanism）已经成为现代深度学习架构的基石。本文系统梳理它的演进脉络。</p>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '28px 0 12px' }}>缘起：Seq2Seq 的瓶颈</h2>
      <p style={{ fontSize: 16, marginBottom: 18 }}>2014 年，Sutskever 等人提出的 Seq2Seq 模型用两个 RNN 分别做编码与解码。该架构有一个根本缺陷：所有输入信息被压缩进一个固定长度的上下文向量，长序列上丢失严重。</p>
      <blockquote style={{ borderLeft: '2px solid var(--acorn)', margin: '0 0 18px', padding: '2px 0 2px 18px', fontStyle: 'italic', color: 'var(--ink-2)' }}>"固定长度向量是神经机器翻译性能的瓶颈。" —— Bahdanau, 2014</blockquote>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '28px 0 12px' }}>Bahdanau Attention</h2>
      <p style={{ fontSize: 16, marginBottom: 18 }}>同年 Bahdanau 提出的加性注意力打破了这个瓶颈。解码器不再只看一个向量，而是对编码器所有时刻的隐状态做加权求和，权重由一个小型前馈网络计算。</p>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '28px 0 12px' }}>自注意力与 Transformer</h2>
      <p style={{ fontSize: 16, marginBottom: 18 }}>2017 年 Vaswani 等人的《Attention is All You Need》把注意力机制推到极致——完全抛弃 RNN，仅用自注意力堆叠构建编码器与解码器。</p>
      <p style={{ fontSize: 16, marginBottom: 18 }}>关键创新包括 <strong>Multi-Head Attention</strong>、<strong>Position Encoding</strong> 与 <strong>Residual + LayerNorm</strong>。</p>
    </div>
  );
}

function FrontmatterPanel({ file, onToggleHistory, showHistory }) {
  return (
    <div style={{
      width: 320, background: 'var(--paper-2)', borderLeft: '0.5px solid var(--line)',
      overflowY: 'auto', flexShrink: 0,
    }}>
      {/* reviewed banner */}
      <div style={{
        padding: '14px 16px', background: 'linear-gradient(135deg, var(--acorn-bg) 0%, var(--leaf-bg) 100%)',
        borderBottom: '0.5px solid var(--line)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--acorn-2)', marginBottom: 6 }}>
          <I.Sparkles size={11} stroke="var(--acorn)"/> 理果 · v2
          <span style={{ flex: 1 }}/>
          <button onClick={onToggleHistory} style={{ fontSize: 10, color: 'var(--ink-3)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
            历史 →
          </button>
        </div>
        <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
          deepseek-chat · 2026-04-17 10:32
        </div>
      </div>

      {showHistory && (
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--line)', background: 'var(--paper)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>Frontmatter 历史</div>
          {[
            { v: 2, model: 'deepseek-chat', at: '10:32 今日', current: true },
            { v: 1, model: 'deepseek-chat', at: '昨天 22:14' },
          ].map(h => (
            <div key={h.v} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
              background: h.current ? 'var(--acorn-bg)' : 'transparent', marginBottom: 4,
              fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)',
            }}>
              <span style={{ fontWeight: 600 }}>v{h.v}</span>
              <span style={{ flex: 1 }}>{h.model}</span>
              <span style={{ color: 'var(--ink-3)' }}>{h.at}</span>
            </div>
          ))}
        </div>
      )}

      <Field label="评分">
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <I.Star key={i} size={16} stroke={i < (file.rating || 0) ? 'var(--acorn)' : 'var(--line-2)'} fill={i < (file.rating || 0) ? 'var(--acorn)' : 'transparent'} style={{ cursor: 'pointer' }}/>
          ))}
        </div>
      </Field>

      <Field label="分类">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', padding: '5px 8px', background: 'var(--paper)', border: '0.5px solid var(--line)', borderRadius: 6 }}>
          {file.category || '—'}
        </div>
      </Field>

      <Field label="标签">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(file.tags || []).map(t => (
            <span key={t} style={{
              fontSize: 11, padding: '3px 8px 3px 7px', borderRadius: 999,
              background: 'var(--leaf-bg)', border: '0.5px solid var(--line)', color: 'var(--ink-2)',
              fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              #{t}
              <I.X size={9} stroke="var(--ink-4)" style={{ cursor: 'pointer' }}/>
            </span>
          ))}
          <button style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 999,
            background: 'transparent', border: '0.5px dashed var(--line-2)', color: 'var(--ink-3)',
            fontFamily: 'var(--font-mono)', cursor: 'pointer',
          }}>+</button>
        </div>
      </Field>

      <Field label="摘要">
        <p className="serif" style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--ink-2)', margin: 0 }}>
          {file.summary || '—'}
        </p>
      </Field>

      {file.highlights && (
        <Field label="要点">
          <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink-2)', fontFamily: 'var(--font-serif)' }}>
            {file.highlights.map((h, i) => <li key={i} style={{ marginBottom: 4 }}>{h}</li>)}
          </ul>
        </Field>
      )}

      <Field label="来源">
        <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', lineHeight: 1.7 }}>
          <div><span style={{ color: 'var(--ink-4)' }}>site</span>  {file.site}</div>
          <div><span style={{ color: 'var(--ink-4)' }}>clip</span>  {file.clipped}</div>
          <div><span style={{ color: 'var(--ink-4)' }}>review</span>  {file.reviewed}</div>
        </div>
      </Field>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--line)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

Object.assign(window, { Editor });
