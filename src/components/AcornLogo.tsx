import { useId, type JSX, type CSSProperties } from 'react'

export type AcornLogoProps = {
  size?: number
  className?: string
  style?: CSSProperties
  theme?: 'default' | 'mono'
}

export function AcornLogo({
  size = 28,
  className,
  style,
  theme = 'default'
}: AcornLogoProps): JSX.Element {
  const color = theme === 'mono' ? 'currentColor' : 'var(--color-acorn)'
  const width = size * (100 / 120)
  const height = size
  const maskId = `circuit-mask-${useId()}`

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 120"
      aria-label="Acornvo"
      role="img"
      className={className}
      style={style}
    >
      <defs>
        <mask id={maskId}>
          <rect width="100" height="120" fill="white" />
          <g fill="none" stroke="black" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 38 65 L 38 80 L 50 80 L 55 65 L 68 65" />
            <path d="M 55 65 L 55 55" />
            <path d="M 38 80 L 55 55" />
            <path d="M 50 80 L 50 115" />
            <path d="M 38 65 C 25 65, 20 60, 18 51" />
            <path d="M 68 65 C 78 65, 82 60, 82 51" />
          </g>
          <circle cx="38" cy="65" r="8" fill="black" />
          <circle cx="55" cy="55" r="8" fill="black" />
          <circle cx="55" cy="65" r="8" fill="black" />
          <circle cx="68" cy="65" r="8" fill="black" />
          <circle cx="38" cy="80" r="8" fill="black" />
          <circle cx="50" cy="80" r="8" fill="black" />
        </mask>
      </defs>

      {/* Outlines */}
      <g fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 48 12 C 48 4, 55 0, 57 4 C 55 7, 53 9, 52 12" />
        <path d="M 15 44 C 15 8, 85 8, 85 44" />
        <path d="M 10 45 Q 50 42 90 45 Q 95 47.5 90 50 Q 50 55 10 50 Q 5 47.5 10 45 Z" />
        <path d="M 15 51 C 15 90, 35 115, 50 115 C 65 115, 85 90, 85 51" />
      </g>

      {/* Inner Details */}
      <g fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 28 25 L 38 38 L 50 38 L 62 38 L 72 25" />
        <path d="M 28 25 L 50 38 L 72 25" />
        <path d="M 28 25 L 18 35" />
        <path d="M 72 25 L 82 35" />
        <path d="M 28 25 L 35 15 L 50 12 L 65 15 L 72 25" />
        <path d="M 50 38 L 50 12" />
        <path d="M 38 38 L 35 44" />
        <path d="M 50 38 L 50 42" />
        <path d="M 62 38 L 65 44" />
        <path d="M 38 38 L 15 44" />
        <path d="M 62 38 L 85 44" />

        <g mask={`url(#${maskId})`}>
          <path d="M 22 52 C 22 85, 42 115, 50 115" />
          <path d="M 29 53 C 29 80, 45 115, 50 115" />
          <path d="M 36 54 C 36 75, 47 115, 50 115" />
          <path d="M 43 54.5 C 43 70, 49 115, 50 115" />
          
          <path d="M 78 52 C 78 85, 58 115, 50 115" />
          <path d="M 71 53 C 71 80, 55 115, 50 115" />
          <path d="M 64 54 C 64 75, 53 115, 50 115" />
          <path d="M 57 54.5 C 57 70, 51 115, 50 115" />
        </g>

        <path d="M 38 65 L 38 80 L 50 80 L 55 65 L 68 65" />
        <path d="M 55 65 L 55 55" />
        <path d="M 38 80 L 55 55" />
        <path d="M 50 80 L 50 115" />
        <path d="M 38 65 C 25 65, 20 60, 18 51" />
        <path d="M 68 65 C 78 65, 82 60, 82 51" />
      </g>

      {/* Nodes */}
      <circle cx="28" cy="25" r="2.5" fill={color} />
      <circle cx="38" cy="38" r="2.5" fill={color} />
      <circle cx="50" cy="38" r="2.5" fill={color} />
      <circle cx="62" cy="38" r="2.5" fill={color} />
      <circle cx="72" cy="25" r="2.5" fill={color} />

      <circle cx="38" cy="65" r="2.5" fill={color} />
      <circle cx="55" cy="55" r="2.5" fill={color} />
      <circle cx="55" cy="65" r="2.5" fill={color} />
      <circle cx="68" cy="65" r="2.5" fill={color} />
      <circle cx="38" cy="80" r="2.5" fill={color} />
      <circle cx="50" cy="80" r="2.5" fill={color} />
    </svg>
  )
}
