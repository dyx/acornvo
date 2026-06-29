import { useState, useEffect, type JSX } from 'react'
import { Squirrel, Nut, TreePine, MessageCircle } from 'lucide-react'

interface HomeSquirrelAnimationProps {
  className?: string
}

export function HomeSquirrelAnimation({ className = '' }: HomeSquirrelAnimationProps): JSX.Element {
  const [scene, setScene] = useState(0)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [isHidden, setIsHidden] = useState(false)

  useEffect(() => {
    let fadeTimer: ReturnType<typeof setTimeout>
    let hideTimer: ReturnType<typeof setTimeout>
    let switchTimer: ReturnType<typeof setTimeout>

    // Custom durations for each scene to cut EXACTLY when the action finishes
    const durations = [
      3400, // Scene 1: Squirrel lands after jumping at 75% of 4.5s = ~3.37s
      3850, // Scene 2: Squirrel lands after placing at 85% of 4.5s = ~3.82s
      4000 // Scene 3: Bubbles disappear at 85% of 4.5s = ~3.82s
    ]

    fadeTimer = setTimeout(() => {
      // 1. Start fading out
      setIsFadingOut(true)

      // 2. Wait 500ms for fade out to complete
      hideTimer = setTimeout(() => {
        setIsHidden(true)
        setIsFadingOut(false)

        // 3. Keep it completely empty for a random beat (1s - 3s) before the next scene pops in
        const randomGap = Math.floor(Math.random() * 2000) + 1000
        switchTimer = setTimeout(() => {
          setScene((s) => (s + 1) % 3)
          setIsHidden(false)
        }, randomGap)
      }, 500)
    }, durations[scene])

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
      clearTimeout(switchTimer)
    }
  }, [scene])

  return (
    <div
      className={`relative h-48 w-full flex items-end opacity-40 cursor-default pointer-events-none select-none ${className}`}
    >
      <style>{`
        /* Scene 1 Physics */
        @keyframes physics-jump-left {
          0%, 15% { transform: translate(0, 0) scaleY(1); animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1); }
          20% { transform: translate(0, 0) scaleY(0.7); animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1); }
          40% { transform: translate(50px, -70px) scaleY(1.05); animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19); }
          60% { transform: translate(0, 0) scaleY(0.85); animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1); }
          70% { transform: translate(0, -20px) scaleY(1); animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19); }
          75%, 100% { transform: translate(0, 0) scaleY(1); }
        }

        @keyframes physics-nut-fall-left {
          0%, 35% { transform: translate(0, 0) rotate(0deg); }
          38% { transform: translate(0, 0) rotate(-20deg); }
          42% { transform: translate(0, 0) rotate(20deg); }
          45% { transform: translate(0, 0) rotate(-10deg); animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19); }
          60% { transform: translate(-20px, 90px) rotate(120deg); animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1); }
          70% { transform: translate(-25px, 70px) rotate(140deg); animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19); }
          75%, 100% { transform: translate(-30px, 90px) rotate(160deg); }
        }

        @keyframes physics-tree-shake-left {
          0%, 38% { transform: skewX(0deg); }
          42% { transform: skewX(3deg); }
          46% { transform: skewX(-3deg); }
          50% { transform: skewX(1deg); }
          54%, 100% { transform: skewX(0deg); }
        }

        /* Scene 2 Physics */
        @keyframes physics-place-squirrel {
          0%, 15% { transform: translate(0, 0) rotate(0deg); animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1); }
          35% { transform: translate(7px, -20px) rotate(5deg); animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19); }
          50% { transform: translate(14px, 0) rotate(0deg); }
          65% { transform: translate(14px, 0) rotate(0deg); animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1); }
          75% { transform: translate(7px, -16px) rotate(-5deg); animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19); }
          85%, 100% { transform: translate(0, 0) rotate(0deg); }
        }

        @keyframes physics-place-nut {
          0%, 15% { transform: translate(0, 0) rotate(0deg); opacity: 1; animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1); }
          35% { transform: translate(16px, -20px) rotate(15deg); opacity: 1; animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19); }
          50%, 85% { transform: translate(39px, 0) rotate(0deg); opacity: 1; }
          90% { transform: translate(39px, 0) rotate(0deg); opacity: 0; }
          95% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
          100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
        }

        /* Scene 3 Physics */
        @keyframes physics-breath {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.05) scaleX(0.98); }
        }

        @keyframes physics-bubble-1 {
          0%, 10% { transform: scale(0) translateY(20px); opacity: 0; }
          15% { transform: scale(1.2) translateY(-4px); opacity: 1; animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1); }
          20% { transform: scale(0.95) translateY(2px); }
          25%, 80% { transform: scale(1) translateY(0); opacity: 1; }
          85%, 100% { transform: scale(0.8) translateY(10px); opacity: 0; }
        }

        @keyframes physics-bubble-2 {
          0%, 35% { transform: scale(0) translateY(20px); opacity: 0; }
          40% { transform: scale(1.2) translateY(-4px); opacity: 1; animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1); }
          45% { transform: scale(0.95) translateY(2px); }
          50%, 80% { transform: scale(1) translateY(0); opacity: 1; }
          85%, 100% { transform: scale(0.8) translateY(10px); opacity: 0; }
        }

        @keyframes physics-wiggle {
          0%, 35%, 55%, 100% { transform: rotate(0deg) translateY(0); }
          40% { transform: rotate(-15deg) translateY(-16px); animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1); }
          45% { transform: rotate(10deg) translateY(-4px); animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19); }
          50% { transform: rotate(-5deg) translateY(-2px); }
        }

        /* Utility classes to apply animation */
        .anim-jump-left { animation: physics-jump-left 4.5s infinite; }
        .anim-nut-fall-left { animation: physics-nut-fall-left 4.5s infinite; }
        .anim-tree-shake-left { animation: physics-tree-shake-left 4.5s infinite; }

        .anim-place-squirrel { animation: physics-place-squirrel 4.5s infinite; }
        .anim-place-nut { animation: physics-place-nut 4.5s infinite; }

        .anim-breath { animation: physics-breath 2s ease-in-out infinite; }
        .anim-bubble-1 { animation: physics-bubble-1 4.5s infinite; opacity: 0; }
        .anim-bubble-2 { animation: physics-bubble-2 4.5s infinite; opacity: 0; }
        .anim-wiggle { animation: physics-wiggle 4.5s infinite; }
      `}</style>

      {/* Scene 1: 拾果 (Picking nuts) */}
      <div
        className={`absolute inset-0 flex items-end justify-center ${!isHidden && scene === 0 ? 'block' : 'hidden'} ${isFadingOut ? 'opacity-0 transition-opacity duration-500 ease-out' : 'opacity-100'}`}
      >
        <div className="relative w-[160px] h-[144px]">
          {/* Squirrel */}
          <div className="absolute bottom-0 left-0 z-30">
            <div className="anim-jump-left origin-bottom">
              <Squirrel size={56} strokeWidth={1} className="text-[color:var(--color-acorn)]" />
            </div>
          </div>

          {/* Falling Nut */}
          <div className="absolute top-14 left-[80px] z-20">
            <div className="anim-nut-fall-left origin-center">
              <Nut size={16} strokeWidth={1.5} className="text-[color:var(--color-acorn-2)]" />
            </div>
          </div>

          {/* Tree */}
          <div className="absolute bottom-0 left-[32px] z-10">
            <div className="anim-tree-shake-left origin-bottom">
              <TreePine
                size={144}
                strokeWidth={0.75}
                className="text-[color:var(--color-acorn)] opacity-80"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Scene 2: 理果 (Organizing nuts) */}
      <div
        className={`absolute inset-0 flex items-end justify-center ${!isHidden && scene === 1 ? 'block' : 'hidden'} ${isFadingOut ? 'opacity-0 transition-opacity duration-500 ease-out' : 'opacity-100'}`}
      >
        <div className="relative w-[160px] h-[144px]">
          {/* Squirrel */}
          <div className="absolute bottom-0 left-0 z-20">
            <div className="anim-place-squirrel origin-bottom">
              <Squirrel size={56} strokeWidth={1} className="text-[color:var(--color-acorn)]" />
            </div>
          </div>

          {/* Moving Nut - Starts in Squirrel's arms! */}
          <div className="absolute bottom-[36px] left-[36px] z-30">
            <div className="anim-place-nut origin-center">
              <Nut
                size={16}
                strokeWidth={1.5}
                className="text-[color:var(--color-acorn-2)] fill-[color:var(--color-paper)]"
              />
            </div>
          </div>

          {/* Pyramid */}
          <div className="absolute bottom-0 left-[60px] z-10 w-[46px] h-[30px]">
            {/* Base layer */}
            <Nut
              className="absolute bottom-0 left-0 text-[color:var(--color-acorn-2)] fill-[color:var(--color-paper)]"
              size={16}
              strokeWidth={1.5}
            />
            <Nut
              className="absolute bottom-0 left-[15px] text-[color:var(--color-acorn-2)] fill-[color:var(--color-paper)]"
              size={16}
              strokeWidth={1.5}
            />
            <Nut
              className="absolute bottom-0 left-[30px] text-[color:var(--color-acorn-2)] fill-[color:var(--color-paper)]"
              size={16}
              strokeWidth={1.5}
            />
            {/* Middle layer */}
            <Nut
              className="absolute bottom-[18px] left-[7.5px] text-[color:var(--color-acorn-2)] fill-[color:var(--color-paper)]"
              size={16}
              strokeWidth={1.5}
            />
            <Nut
              className="absolute bottom-[18px] left-[22.5px] text-[color:var(--color-acorn-2)] fill-[color:var(--color-paper)]"
              size={16}
              strokeWidth={1.5}
            />
          </div>
        </div>
      </div>

      {/* Scene 3: 松语 (Talking) */}
      <div
        className={`absolute inset-0 flex items-end justify-center ${!isHidden && scene === 2 ? 'block' : 'hidden'} ${isFadingOut ? 'opacity-0 transition-opacity duration-500 ease-out' : 'opacity-100'}`}
      >
        <div className="relative w-[160px] h-[144px]">
          {/* Squirrel */}
          <div className="absolute bottom-0 left-0 z-20">
            <div className="anim-breath origin-bottom">
              <Squirrel size={56} strokeWidth={1} className="text-[color:var(--color-acorn)]" />
            </div>
          </div>

          {/* Squirrel Bubble */}
          <div className="absolute bottom-[56px] left-[36px] z-30">
            <div className="anim-bubble-1 origin-bottom-left">
              <MessageCircle
                size={32}
                strokeWidth={2}
                className="text-[color:var(--color-ink-3)] fill-[color:var(--color-paper)]"
              />
            </div>
          </div>

          {/* Nut */}
          <div className="absolute bottom-0 left-[96px] z-20">
            <div className="anim-wiggle origin-bottom">
              <Nut size={20} strokeWidth={1.5} className="text-[color:var(--color-acorn-2)]" />
            </div>
          </div>

          {/* Nut Bubble */}
          <div className="absolute bottom-[20px] left-[110px] z-30">
            <div className="anim-bubble-2 origin-bottom-left">
              <MessageCircle
                size={24}
                strokeWidth={2}
                className="text-[color:var(--color-ink-3)] fill-[color:var(--color-paper)]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
