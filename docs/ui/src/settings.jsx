// Settings screen

function Settings({ onNav, onSwitchProject, projectName, statusProps }) {
  const [tab, setTab] = React.useState('models');
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      <TitleBar title="设置 · Settings" accent="var(--paper-2)"/>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <AppRail current="settings" onNav={onNav} projectName={projectName} onSwitchProject={onSwitchProject}/>

        <div style={{ width: 200, background: 'var(--paper-2)', borderRight: '0.5px solid var(--line)', padding: '14px 0', flexShrink: 0 }}>
          {[
            { id: 'general', label: '通用', en: 'General' },
            { id: 'models', label: '模型', en: 'Models' },
            { id: 'clipper', label: '拾果', en: 'Clipper' },
            { id: 'reviewer', label: '理果', en: 'Reviewer' },
            { id: 'usage', label: '用量', en: 'Usage' },
            { id: 'about', label: '关于', en: 'About' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              width: 'calc(100% - 16px)', margin: '1px 8px', padding: '8px 12px', borderRadius: 7, border: 'none',
              background: tab === t.id ? 'var(--paper)' : 'transparent',
              borderLeft: tab === t.id ? '2px solid var(--acorn)' : '2px solid transparent',
              paddingLeft: tab === t.id ? 10 : 12,
              textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'baseline', gap: 6,
            }}>
              <span className="serif" style={{ fontSize: 13, color: 'var(--ink)' }}>{t.label}</span>
              <span style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>{t.en}</span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px 60px' }}>
          <div style={{ maxWidth: 640 }}>
            {tab === 'models' && <ModelsTab/>}
            {tab === 'usage' && <UsageTab/>}
            {tab === 'general' && <GeneralTab/>}
            {tab === 'clipper' && <ClipperTab/>}
            {tab === 'reviewer' && <ReviewerTab/>}
            {tab === 'about' && <AboutTab/>}
          </div>
        </div>
      </div>
      <StatusBar {...statusProps}/>
    </div>
  );
}

function TabHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 className="serif" style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
      {sub && <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '4px 0 0', fontFamily: 'var(--font-mono)' }}>{sub}</p>}
    </div>
  );
}

function ModelsTab() {
  return (
    <>
      <TabHeader title="模型预设" sub="API Keys via Electron safeStorage · Keychain / DPAPI / libsecret"/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ModelCard name="DeepSeek" role="理果默认" model="deepseek-chat" url="api.deepseek.com" status="连通" color="var(--leaf)"/>
        <ModelCard name="Claude Opus 4" role="松语默认" model="anthropic/claude-opus-4" url="openrouter.ai/api/v1" status="连通" color="var(--leaf)"/>
        <ModelCard name="GPT-4o" role="" model="gpt-4o" url="api.openai.com" status="未测试" color="var(--ink-4)"/>
        <button style={{
          padding: '12px', background: 'transparent', border: '0.5px dashed var(--line-2)',
          borderRadius: 10, color: 'var(--ink-3)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          fontFamily: 'var(--font-serif)',
        }}>
          <I.Plus size={13}/> 新增预设
        </button>
      </div>
      <div style={{ marginTop: 24, padding: 14, background: 'var(--sky-bg)', border: '0.5px solid var(--line)', borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <I.Warn size={14} stroke="var(--sky)" style={{ marginTop: 2 }}/>
        <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--ink-2)' }}>
          API Keys 经 <span className="mono" style={{ color: 'var(--ink)' }}>safeStorage</span> 加密存入 <span className="mono" style={{ color: 'var(--ink)' }}>~/.acornvo/secrets.enc</span>。
          机器绑定，换电脑需重新填写。
        </div>
      </div>
    </>
  );
}

function ModelCard({ name, role, model, url, status, color }) {
  return (
    <div style={{ padding: '14px 16px', background: 'var(--paper-2)', border: '0.5px solid var(--line)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--paper)', border: '0.5px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <I.Sparkles size={16} stroke="var(--acorn)"/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="serif" style={{ fontSize: 14, fontWeight: 500 }}>{name}</span>
          {role && <span style={{ fontSize: 10.5, padding: '1px 7px', background: 'var(--acorn-bg)', borderRadius: 999, color: 'var(--acorn-2)', fontFamily: 'var(--font-mono)' }}>{role}</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
          {model} · {url}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color, fontFamily: 'var(--font-mono)' }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: color }}/>
        {status}
      </div>
      <button style={{ padding: '4px 8px', fontSize: 11, background: 'transparent', border: '0.5px solid var(--line-2)', borderRadius: 6, color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>测试</button>
    </div>
  );
}

function UsageTab() {
  const max = Math.max(...USAGE_DAILY.map(d => d.cost));
  const total = USAGE_DAILY.reduce((s, d) => s + d.cost, 0);
  return (
    <>
      <TabHeader title="AI 用量" sub="按日/月/模型聚合 · 无预算上限"/>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <Stat label="本周累计" value={`$${total.toFixed(2)}`} sub="52 次调用"/>
        <Stat label="理果" value="52" sub="次" color="var(--acorn)"/>
        <Stat label="松语" value="20" sub="次" color="var(--leaf)"/>
        <Stat label="总 tokens" value="284k" sub="in + out"/>
      </div>

      <div style={{ padding: 18, background: 'var(--paper-2)', border: '0.5px solid var(--line)', borderRadius: 10, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>近 7 天</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120 }}>
          {USAGE_DAILY.map(d => (
            <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>${d.cost.toFixed(2)}</div>
              <div style={{ width: '100%', height: `${(d.cost / max) * 80}px`, background: 'linear-gradient(180deg, var(--acorn) 0%, var(--acorn-2) 100%)', borderRadius: '3px 3px 0 0' }}/>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-4)' }}>{d.day}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', marginBottom: 10 }}>最近调用</div>
      <div style={{ border: '0.5px solid var(--line)', borderRadius: 10, background: 'var(--paper-2)', overflow: 'hidden' }}>
        {[
          { time: '10:32', model: 'deepseek-chat', purpose: 'review', tokens: '2,100', cost: '0.0008', file: '注意力机制综述.md' },
          { time: '10:28', model: 'claude-opus-4', purpose: 'chat', tokens: '8,432', cost: '0.0540', file: '对比笔记会话' },
          { time: '09:52', model: 'deepseek-chat', purpose: 'review', tokens: '1,820', cost: '0.0006', file: 'RLHF 原理.md' },
        ].map((u, i) => (
          <div key={i} style={{
            padding: '9px 14px', display: 'grid', gridTemplateColumns: '60px 1fr 80px 80px 70px', gap: 10,
            fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)',
            borderBottom: i < 2 ? '0.5px solid var(--line)' : 'none', alignItems: 'center',
          }}>
            <span style={{ color: 'var(--ink-3)' }}>{u.time}</span>
            <span style={{ color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.file}</span>
            <span style={{ color: 'var(--acorn-2)' }}>{u.purpose}</span>
            <span>{u.tokens} tok</span>
            <span style={{ textAlign: 'right' }}>${u.cost}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, padding: '14px 16px', background: 'var(--paper-2)', border: '0.5px solid var(--line)', borderRadius: 10 }}>
      <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
      <div className="serif" style={{ fontSize: 22, fontWeight: 600, color: color || 'var(--ink)', letterSpacing: '-0.01em' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function GeneralTab() {
  return (
    <>
      <TabHeader title="通用" sub="主题、语言、编辑器、更新"/>
      <Row label="主题" desc="外观模式"><Segmented options={['浅色', '深色', '跟随系统']} active={0}/></Row>
      <Row label="语言" desc="界面文案"><Segmented options={['简体中文', 'English']} active={0}/></Row>
      <Row label="编辑器默认模式" desc="Vditor 三种模式之一"><Segmented options={['IR', 'SV', 'WYSIWYG']} active={0}/></Row>
      <Row label="Autosave 延迟" desc="停止输入后多久写盘"><span className="mono" style={{ fontSize: 12, color: 'var(--ink)' }}>2000 ms</span></Row>
      <Row label="自动更新" desc="后台下载 · stable 通道"><Toggle on/></Row>
    </>
  );
}

function ClipperTab() {
  return (
    <>
      <TabHeader title="拾果" sub="网页 → markdown 的采集策略"/>
      <Row label="下载图片到本地" desc="写入 assets/<slug>/ 并重写引用"><Toggle on/></Row>
      <Row label="采集后立即理果" desc="推入后台队列"><Toggle on/></Row>
      <Row label="伪装 Chrome UA" desc="规避部分站点的 Electron 嗅探"><Toggle/></Row>
      <Row label="正文过短兜底" desc="少于 200 字时弹选区模式"><Toggle on/></Row>
    </>
  );
}

function ReviewerTab() {
  return (
    <>
      <TabHeader title="理果" sub="AI 结构化抽取的提示与约束"/>
      <Row label="摘要语言" desc="跟随原文 / 强制中/英"><Segmented options={['跟随原文', '中文', 'English']} active={0}/></Row>
      <Row label="摘要字数" desc="建议值"><span className="mono" style={{ fontSize: 12, color: 'var(--ink)' }}>150 字</span></Row>
      <Row label="截断阈值" desc="超长正文取前 N tokens"><span className="mono" style={{ fontSize: 12, color: 'var(--ink)' }}>12,000 tokens</span></Row>
      <Row label="并发数" desc="队列同时跑几条"><span className="mono" style={{ fontSize: 12, color: 'var(--ink)' }}>2</span></Row>
      <Row label="历史版本保留" desc="per-file"><span className="mono" style={{ fontSize: 12, color: 'var(--ink)' }}>5 版 · 30 天</span></Row>
    </>
  );
}

function AboutTab() {
  return (
    <>
      <TabHeader title="关于"/>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 0 28px' }}>
        <AcornLogo size={56}/>
        <div>
          <div className="serif" style={{ fontSize: 24, fontWeight: 600 }}>松言果语 Acornvo</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
            v1.0.0 · Electron 32 · darwin-arm64
          </div>
        </div>
      </div>
      <p className="serif" style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--ink-2)', maxWidth: 480 }}>
        一款本地优先的个人知识管理桌面应用。隐喻松鼠「拾果 · 理果 · 松语」的采集整理过程：浏览器拾取网页、AI 结构化加工、基于本地知识库对话生成。
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        {['检查更新', '打开日志目录', '发行说明'].map(b => (
          <button key={b} className="serif" style={{
            padding: '8px 14px', background: 'var(--paper)', border: '0.5px solid var(--line-2)', borderRadius: 7,
            fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-serif)',
          }}>{b}</button>
        ))}
      </div>
    </>
  );
}

function Row({ label, desc, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '0.5px solid var(--line)' }}>
      <div style={{ flex: 1 }}>
        <div className="serif" style={{ fontSize: 13.5, color: 'var(--ink)' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{desc}</div>
      </div>
      {children}
    </div>
  );
}
function Segmented({ options, active }) {
  const [a, setA] = React.useState(active);
  return (
    <div style={{ display: 'flex', background: 'var(--paper-2)', border: '0.5px solid var(--line)', borderRadius: 7, padding: 2 }}>
      {options.map((o, i) => (
        <button key={o} onClick={() => setA(i)} style={{
          padding: '4px 12px', fontSize: 11.5, borderRadius: 5, border: 'none',
          background: a === i ? 'var(--paper)' : 'transparent',
          color: a === i ? 'var(--ink)' : 'var(--ink-3)',
          fontFamily: 'inherit', cursor: 'pointer',
        }}>{o}</button>
      ))}
    </div>
  );
}
function Toggle({ on: initOn }) {
  const [on, setOn] = React.useState(!!initOn);
  return (
    <button onClick={() => setOn(!on)} style={{
      width: 34, height: 20, borderRadius: 999, border: 'none', padding: 2,
      background: on ? 'var(--acorn)' : 'var(--paper-3)',
      border: '0.5px solid var(--line-2)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start',
      transition: 'background 0.15s, justify-content 0.15s',
    }}>
      <span style={{ width: 14, height: 14, borderRadius: 999, background: 'white', boxShadow: '0 1px 2px oklch(0 0 0 / 0.2)' }}/>
    </button>
  );
}

Object.assign(window, { Settings });
