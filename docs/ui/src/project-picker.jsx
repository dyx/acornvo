// Project Picker screen

function ProjectPicker({ onOpen }) {
  const [hovered, setHovered] = React.useState(null)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: `
        radial-gradient(ellipse at 20% 10%, oklch(0.93 0.03 55 / 0.8) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 90%, oklch(0.93 0.025 130 / 0.6) 0%, transparent 50%),
        var(--paper)
      `
      }}
    >
      <TitleBar title="Acornvo" borderless accent="transparent" />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* left: brand */}
        <div
          style={{
            width: 420,
            padding: '48px 56px 56px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRight: '0.5px solid var(--line)',
            background: 'linear-gradient(180deg, transparent 0%, oklch(0.94 0.02 60 / 0.5) 100%)'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <AcornLogo size={36} />
              <div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    fontFamily: 'var(--font-mono)'
                  }}
                >
                  Acornvo · v1.0
                </div>
                <div
                  className="serif"
                  style={{
                    fontSize: 26,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.1
                  }}
                >
                  松言果语
                </div>
              </div>
            </div>
            <p
              className="serif"
              style={{
                fontSize: 15,
                lineHeight: 1.7,
                color: 'var(--ink-2)',
                margin: '28px 0 0',
                maxWidth: 300
              }}
            >
              像松鼠一样<span style={{ color: 'var(--acorn-2)' }}>拾果 · 理果 · 松语</span>——
              把散落的阅读整理成属于你的知识森林。
            </p>
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 36,
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: 'var(--ink-3)'
              }}
            >
              <Chip>本地优先</Chip>
              <Chip>Obsidian 兼容</Chip>
              <Chip>AI 结构化</Chip>
            </div>
          </div>
          <div
            style={{
              fontSize: 10.5,
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-4)',
              lineHeight: 1.7
            }}
          >
            {/* sketched path illustration */}
            <svg
              width="280"
              height="100"
              viewBox="0 0 280 100"
              style={{ marginBottom: 12, opacity: 0.5 }}
            >
              <path
                d="M10 80 Q60 40, 100 60 T190 40 T270 20"
                fill="none"
                stroke="var(--acorn-2)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <circle cx="10" cy="80" r="3" fill="var(--acorn)" />
              <circle cx="100" cy="60" r="3" fill="var(--acorn)" />
              <circle cx="190" cy="40" r="3" fill="var(--acorn)" />
              <circle cx="270" cy="20" r="4" fill="var(--leaf)" />
              <text x="10" y="95" fill="var(--ink-3)" fontSize="9" fontFamily="var(--font-mono)">
                网页
              </text>
              <text x="85" y="75" fill="var(--ink-3)" fontSize="9" fontFamily="var(--font-mono)">
                拾果
              </text>
              <text x="175" y="55" fill="var(--ink-3)" fontSize="9" fontFamily="var(--font-mono)">
                理果
              </text>
              <text x="252" y="15" fill="var(--ink-3)" fontSize="9" fontFamily="var(--font-mono)">
                松语
              </text>
            </svg>
            <div>~/.acornvo · macOS 14.0</div>
          </div>
        </div>

        {/* right: project list */}
        <div style={{ flex: 1, padding: '48px 56px', overflowY: 'auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 24
            }}
          >
            <h2
              className="serif"
              style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}
            >
              选择一片树林
            </h2>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              最近打开 · {PROJECTS.length}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PROJECTS.map((p, i) => (
              <ProjectCard
                key={p.id}
                p={p}
                hovered={hovered === p.id}
                onHover={() => setHovered(p.id)}
                onLeave={() => setHovered(null)}
                onOpen={() => onOpen(p)}
                index={i}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button
              className="serif"
              onClick={() => onOpen(PROJECTS[0])}
              style={{
                flex: 1,
                padding: '14px 18px',
                borderRadius: 10,
                background: 'var(--acorn)',
                color: 'oklch(0.98 0.01 60)',
                border: 'none',
                fontFamily: 'var(--font-serif)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 1px 2px oklch(0 0 0 / 0.1), inset 0 1px 0 oklch(1 0 0 / 0.15)'
              }}
            >
              <I.Plus size={14} /> 新建树林
            </button>
            <button
              className="serif"
              style={{
                flex: 1,
                padding: '14px 18px',
                borderRadius: 10,
                background: 'var(--paper)',
                color: 'var(--ink)',
                border: '0.5px solid var(--line-2)',
                fontFamily: 'var(--font-serif)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <I.Folder size={14} /> 打开已有目录
            </button>
          </div>

          <p
            style={{
              fontSize: 11,
              color: 'var(--ink-4)',
              marginTop: 28,
              lineHeight: 1.7,
              fontFamily: 'var(--font-mono)'
            }}
          >
            提示：树林根目录下的 .acornvo/ 存放索引与历史，真实数据源永远是本地 markdown 文件。
            可从任意 Obsidian vault 直接打开。
          </p>
        </div>
      </div>
    </div>
  )
}

function Chip({ children }) {
  return (
    <span
      style={{
        padding: '3px 8px',
        borderRadius: 999,
        background: 'var(--paper-3)',
        border: '0.5px solid var(--line)',
        color: 'var(--ink-3)'
      }}
    >
      {children}
    </span>
  )
}

function ProjectCard({ p, hovered, onHover, onLeave, onOpen, index }) {
  const color = {
    acorn: ['var(--acorn)', 'var(--acorn-bg)'],
    leaf: ['var(--leaf)', 'var(--leaf-bg)'],
    berry: ['var(--berry)', 'oklch(0.94 0.03 25)'],
    sky: ['var(--sky)', 'var(--sky-bg)']
  }[p.color]

  return (
    <button
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        background: hovered ? 'var(--paper)' : 'transparent',
        border: '0.5px solid ' + (hovered ? 'var(--line-2)' : 'var(--line)'),
        borderRadius: 12,
        cursor: 'pointer',
        animation: `fadeUp 0.3s ${(i) => index * 0.05}s both`,
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'var(--ink)',
        transition: 'border 0.15s, background 0.15s, transform 0.15s',
        transform: hovered ? 'translateX(2px)' : 'none'
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: color[1],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '0.5px solid var(--line)'
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: 3, background: color[0] }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="serif" style={{ fontSize: 15.5, fontWeight: 500 }}>
            {p.name}
          </span>
          {p.pinned && (
            <span style={{ fontSize: 10, color: 'var(--acorn-2)', fontFamily: 'var(--font-mono)' }}>
              ·pinned
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-mono)',
            marginTop: 3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {p.path}
        </div>
      </div>
      <div
        style={{
          textAlign: 'right',
          fontSize: 11,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-mono)'
        }}
      >
        <div style={{ fontSize: 13, color: 'var(--ink-2)', fontFamily: 'var(--font-serif)' }}>
          {p.files} <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>篇</span>
        </div>
        <div style={{ marginTop: 3 }}>{p.lastOpened}</div>
      </div>
      <I.Arrow
        size={14}
        stroke="var(--ink-3)"
        style={{ opacity: hovered ? 1 : 0.3, transition: 'opacity 0.15s' }}
      />
    </button>
  )
}

Object.assign(window, { ProjectPicker })
