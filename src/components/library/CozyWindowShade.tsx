import { useEffect, useRef, useState, useMemo } from 'react'
import type { JSX } from 'react'
import leavesVideo from '@/assets/leaves.mp4'

export interface CozyWindowShadeProps {
  active: boolean
}

// ----------------------------------------------------------------------
// 1) Sunny Overlay (Bamboo leaves video)
// ----------------------------------------------------------------------
function SunnyOverlay({ active }: { active: boolean }): JSX.Element | null {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        opacity: active ? 1 : 0,
        backgroundColor: 'var(--color-paper)',
        transition: 'opacity 0.8s cubic-bezier(0.23, 1, 0.32, 1)'
      }}
    >
      <video
        src={leavesVideo}
        autoPlay
        muted
        loop
        playsInline
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover', 
          mixBlendMode: 'multiply',
          opacity: 0.5
        }}
      />
    </div>
  )
}

// ----------------------------------------------------------------------
// 2) Moonlight Overlay (Canvas Stars & Moon)
// ----------------------------------------------------------------------
function MoonlightOverlay({ active }: { active: boolean }): JSX.Element | null {
  const moonCanvasRef = useRef<HTMLCanvasElement>(null)
  const starsCanvasRef = useRef<HTMLCanvasElement>(null)

  const starsState = useRef({
    raf: 0,
    lastTime: 0,
    stars: [] as any[]
  })

  // Render Moon (Runs once)
  useEffect(() => {
    const c = moonCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    const S = c.width
    const R = S / 2
    const cx = R,
      cy = R

    let seed = 42
    function srand() {
      seed = (seed * 16807 + 0) % 2147483647
      return (seed - 1) / 2147483646
    }

    ctx.clearRect(0, 0, S, S)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.clip()

    const base = ctx.createRadialGradient(cx * 0.72, cy * 0.68, R * 0.02, cx, cy, R)
    base.addColorStop(0, '#e2ddd2')
    base.addColorStop(0.3, '#d5d0c5')
    base.addColorStop(0.65, '#c0bbb0')
    base.addColorStop(1, '#aaa59a')
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)

    const maria = [
      { x: 0.36, y: 0.3, rx: 0.2, ry: 0.13, a: 0.1 },
      { x: 0.46, y: 0.54, rx: 0.15, ry: 0.11, a: 0.08 },
      { x: 0.56, y: 0.4, rx: 0.11, ry: 0.15, a: 0.07 },
      { x: 0.3, y: 0.62, rx: 0.13, ry: 0.1, a: 0.06 }
    ]
    maria.forEach((m) => {
      const g = ctx.createRadialGradient(
        m.x * S,
        m.y * S,
        0,
        m.x * S,
        m.y * S,
        Math.max(m.rx, m.ry) * S
      )
      g.addColorStop(0, `rgba(75, 72, 65, ${m.a})`)
      g.addColorStop(0.5, `rgba(80, 77, 70, ${m.a * 0.4})`)
      g.addColorStop(1, 'transparent')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(m.x * S, m.y * S, m.rx * S, m.ry * S, srand() * 0.4, 0, Math.PI * 2)
      ctx.fill()
    })

    const craters = [
      { x: 0.32, y: 0.28, r: 0.055 },
      { x: 0.52, y: 0.35, r: 0.035 },
      { x: 0.4, y: 0.56, r: 0.045 },
      { x: 0.6, y: 0.58, r: 0.03 }
    ]
    craters.forEach((cr) => {
      const px = cr.x * S,
        py = cr.y * S,
        pr = cr.r * S
      const shadow = ctx.createRadialGradient(px + pr * 0.12, py + pr * 0.12, pr * 0.2, px, py, pr)
      shadow.addColorStop(0, 'rgba(50, 45, 40, 0.10)')
      shadow.addColorStop(0.8, 'rgba(50, 45, 40, 0.05)')
      shadow.addColorStop(1, 'transparent')
      ctx.fillStyle = shadow
      ctx.beginPath()
      ctx.arc(px, py, pr, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(230, 225, 218, 0.06)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px - pr * 0.06, py - pr * 0.06, pr * 0.8, -Math.PI * 0.7, Math.PI * 0.15)
      ctx.stroke()
    })

    const terminator = ctx.createLinearGradient(cx * 0.5, 0, S, 0)
    terminator.addColorStop(0, 'transparent')
    terminator.addColorStop(0.55, 'transparent')
    terminator.addColorStop(0.8, 'rgba(12, 15, 28, 0.2)')
    terminator.addColorStop(1, 'rgba(5, 8, 18, 0.55)')
    ctx.fillStyle = terminator
    ctx.fillRect(0, 0, S, S)

    const es = ctx.createRadialGradient(cx + R * 0.65, cy, 0, cx + R * 0.65, cy, R * 0.5)
    es.addColorStop(0, 'rgba(100, 130, 180, 0.03)')
    es.addColorStop(1, 'transparent')
    ctx.fillStyle = es
    ctx.fillRect(0, 0, S, S)

    const limb = ctx.createRadialGradient(cx, cy, R * 0.65, cx, cy, R)
    limb.addColorStop(0, 'transparent')
    limb.addColorStop(0.85, 'rgba(25, 22, 18, 0.06)')
    limb.addColorStop(1, 'rgba(15, 12, 8, 0.18)')
    ctx.fillStyle = limb
    ctx.fillRect(0, 0, S, S)

    ctx.restore()
  }, [])

  // Render Stars (Animation Loop)
  useEffect(() => {
    const canvas = starsCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0,
      H = 0

    function resize() {
      if (!canvas || !canvas.parentElement) return
      const dpr = window.devicePixelRatio || 1
      W = canvas.parentElement.clientWidth
      H = canvas.parentElement.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(() => resize())
    if (canvas.parentElement) observer.observe(canvas.parentElement)

    const colors = [
      [200, 210, 230],
      [220, 215, 200],
      [170, 195, 240],
      [240, 225, 180],
      [230, 195, 175]
    ]

    const stars = []
    for (let i = 0; i < 150; i++) {
      const isBright = Math.random() < 0.12
      const c = colors[Math.floor(Math.random() * colors.length)]!
      stars.push({
        x: Math.random() * 100,
        y: Math.random() * 60,
        baseR: isBright ? 1.2 + Math.random() * 1.2 : 0.4 + Math.random() * 0.8,
        r: c[0],
        g: c[1],
        b: c[2],
        baseAlpha: isBright ? 0.5 + Math.random() * 0.3 : 0.15 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.8,
        flickerAmp: isBright ? 0.15 + Math.random() * 0.2 : 0.08 + Math.random() * 0.12,
        flashPhase: Math.random() * Math.PI * 2,
        flashSpeed: 0.05 + Math.random() * 0.1,
        isBright
      })
    }
    starsState.current.stars = stars

    function tick(time: number) {
      if (!active) {
        starsState.current.raf = requestAnimationFrame(tick)
        return
      }

      const t = time * 0.001
      starsState.current.lastTime = t

      ctx!.clearRect(0, 0, W, H)

      for (const s of starsState.current.stars) {
        const px = (s.x * W) / 100
        const py = (s.y * H) / 100

        const osc = Math.sin(s.phase + t * s.speed)
        const shimmer = Math.sin(s.phase * 3.7 + t * s.speed * 2.3) * 0.3
        const flash = Math.pow(Math.max(0, Math.sin(s.flashPhase + t * s.flashSpeed)), 12) * 0.4

        const alpha = Math.max(0.02, s.baseAlpha + (osc + shimmer) * s.flickerAmp + flash)
        const radius = s.baseR * (1 + flash * 0.5)

        ctx!.beginPath()
        ctx!.arc(px, py, radius, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(${s.r},${s.g},${s.b},${alpha})`
        ctx!.fill()

        if (s.isBright && alpha > 0.4) {
          const glow = ctx!.createRadialGradient(px, py, 0, px, py, radius * 3.5)
          glow.addColorStop(0, `rgba(${s.r},${s.g},${s.b},${alpha * 0.25})`)
          glow.addColorStop(1, 'transparent')
          ctx!.beginPath()
          ctx!.arc(px, py, radius * 3.5, 0, Math.PI * 2)
          ctx!.fillStyle = glow
          ctx!.fill()
        }
      }

      starsState.current.raf = requestAnimationFrame(tick)
    }

    starsState.current.raf = requestAnimationFrame(tick)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(starsState.current.raf)
    }
  }, [active])

  return (
    <>
      <style>{`
        @keyframes moonHaloPulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.06); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          opacity: active ? 1 : 0,
          backgroundColor: 'var(--color-paper)',
          transition: 'opacity 1s cubic-bezier(0.23, 1, 0.32, 1)'
        }}
      >
        {/* Light beam */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background:
              'radial-gradient(ellipse at 210px 45%, rgba(180, 200, 230, 0.035) 0%, rgba(160, 180, 215, 0.012) 35%, transparent 65%)'
          }}
        />

        {/* Stars */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <canvas ref={starsCanvasRef} style={{ width: '100%', height: '100%' }} />
        </div>

        {/* Moon and Halo */}
        <div
          style={{ 
            position: 'absolute', 
            top: '45%', 
            left: '210px', 
            transform: 'translate(-50%, -50%)',
            width: '90px', 
            height: '90px' 
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '-45px',
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(180, 200, 230, 0.08) 25%, rgba(160, 185, 225, 0.03) 50%, transparent 70%)',
              animation: 'moonHaloPulse 14s ease-in-out infinite'
            }}
          />
          <canvas
            ref={moonCanvasRef}
            width={480}
            height={480}
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              filter:
                'drop-shadow(0 0 12px rgba(200, 215, 235, 0.25)) drop-shadow(0 0 40px rgba(180, 200, 230, 0.10))',
              position: 'relative'
            }}
          />
        </div>
      </div>
    </>
  )
}

// ----------------------------------------------------------------------
// 3) Root CozyWindowShade Component
// ----------------------------------------------------------------------
export function CozyWindowShade({ active }: CozyWindowShadeProps): JSX.Element | null {
  const [isDark, setIsDark] = useState(() => document.documentElement.dataset.theme === 'dark')

  useEffect(() => {
    // Listen for dataset changes on HTML element
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.dataset.theme === 'dark')
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })
    return () => observer.disconnect()
  }, [])

  return (
    <>
      {/* Both components exist in DOM but fade their opacity. The stars animation pauses when active=false. */}
      <SunnyOverlay active={active && !isDark} />
      <MoonlightOverlay active={active && isDark} />
    </>
  )
}
