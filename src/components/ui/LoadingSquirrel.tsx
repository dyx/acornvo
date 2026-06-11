import type { JSX } from 'react'
import { Squirrel, Nut } from 'lucide-react'

interface LoadingSquirrelProps {
  className?: string
  scale?: number
}

export function LoadingSquirrel({ className = '', scale = 1 }: LoadingSquirrelProps): JSX.Element {
  return (
    <div 
      className={`flex items-center gap-1.5 opacity-60 transition-opacity duration-500 cursor-default pointer-events-none ${className}`}
      title="Loading..."
      style={scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: 'center' } : undefined}
    >
      <div className="animate-sisyphus-squirrel z-10 origin-bottom">
        <Squirrel size={28} strokeWidth={1.5} className="text-[color:var(--color-acorn)]" />
      </div>
      <div className="flex gap-1 mt-[6px] animate-sisyphus-move">
        <div className="animate-sisyphus-roll origin-center">
          <Nut size={20} strokeWidth={1.5} className="text-[color:var(--color-acorn-2)]" />
        </div>
        <div className="animate-sisyphus-roll origin-center">
          <Nut size={20} strokeWidth={1.5} className="text-[color:var(--color-acorn-2)]" />
        </div>
        <div className="animate-sisyphus-roll origin-center">
          <Nut size={20} strokeWidth={1.5} className="text-[color:var(--color-acorn-2)]" />
        </div>
      </div>
    </div>
  )
}
