import type { JSX } from 'react'

type Props = { name: string }

export function Placeholder({ name }: Props): JSX.Element {
  return (
    <div style={{ padding: 24 }}>
      <h2>{name}</h2>
      <p>This route is a placeholder. It will be implemented in a later phase.</p>
    </div>
  )
}
