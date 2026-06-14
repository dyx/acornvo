import type { JSX } from 'react'

export type AcornLogoProps = {
  size?: number
  className?: string
  style?: React.CSSProperties
  theme?: 'default' | 'mono'
}

export function AcornLogo({
  size = 28,
  className,
  style,
  theme = 'default'
}: AcornLogoProps): JSX.Element {
  const cap = theme === 'mono' ? 'currentColor' : 'var(--color-acorn-2)'
  const body = theme === 'mono' ? 'currentColor' : 'var(--color-acorn)'
  const highlight = theme === 'mono' ? 'currentColor' : 'var(--color-acorn-bg)'
  // The actual artwork bounds are roughly X: 5 to 23 (width 18) and Y: 1 to 23 (height 22)
  const width = size * (18 / 22)
  const height = size

  return (
    <svg
      width={width}
      height={height}
      viewBox="5 1 18 22"
      aria-label="Acornvo"
      role="img"
      className={className}
      style={style}
    >
      <path d="M5 10 Q5 6 9 6 L19 6 Q23 6 23 10 L23 11 L5 11 Z" fill={cap} />
      <path d="M6 11 L22 11 Q22 21 14 23 Q6 21 6 11 Z" fill={body} />
      <path d="M9 14 Q14 17 19 14" stroke={highlight} strokeWidth="1" fill="none" opacity="0.6" />
      <line x1="14" y1="2" x2="14" y2="6" stroke={cap} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
