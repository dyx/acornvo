# Phase-02 Project Picker & Grove — Plan 2/2 (Tasks 6.1–9.9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisite:** Plan 1 (Tasks 1.1–5.3) is merged. `ipc.project.*`, `ipc.on('bootstrap:ready', ...)`, `ipc.on('project:changed', ...)`, and `useGroveStore` exist and work.

**Goal:** Build the user-facing surface of the multi-grove flow — the Project Picker page, the TitleBar grove switcher, and the force-takeover dialog — then run the nine acceptance scenarios end-to-end.

**Architecture:** The renderer uses Tailwind 4 + shadcn/ui (added in Task 1 of this plan) for styling and primitives. `src/pages/ProjectPicker.tsx` mirrors the mockup at `docs/ui/src/project-picker.jsx`: left brand column + right recent-list column + two action buttons. `src/components/GroveSwitcher.tsx` renders a dropdown in the TitleBar (hidden on `/picker`). `src/components/TakeoverDialog.tsx` handles the `locked` case. Every action calls `useGroveStore` — no direct IPC from components.

**Tech Stack:** React 19, react-router-dom 7, Zustand 5, Tailwind 4, shadcn/ui (Radix primitives under the hood), Lucide icons, i18next.

---

## File Structure Map

| Path | Role |
|------|------|
| `postcss.config.js` | Tailwind 4 PostCSS pipeline |
| `src/index.css` | Tailwind base + design tokens (oklch palette from mockup) |
| `components.json` | shadcn/ui config |
| `src/lib/utils.ts` | `cn(...)` classnames helper used by shadcn |
| `src/components/ui/button.tsx` | shadcn Button |
| `src/components/ui/dialog.tsx` | shadcn Dialog |
| `src/components/ui/input.tsx` | shadcn Input |
| `src/components/ui/dropdown-menu.tsx` | shadcn DropdownMenu |
| `src/components/ui/toast.tsx` + `toaster.tsx` + `use-toast.ts` | shadcn Toast |
| `src/components/AcornLogo.tsx` | Brand SVG |
| `src/components/ProjectCard.tsx` | Recent-list card (normal / invalid / locked states) |
| `src/components/GroveSwitcher.tsx` | TitleBar dropdown |
| `src/components/TakeoverDialog.tsx` | Force-takeover modal |
| `src/components/TitleBar.tsx` | Wraps window title; slots GroveSwitcher |
| `src/pages/ProjectPicker.tsx` | Full two-column layout (replaces Plan 1 stub) |
| `src/i18n/locales/zh-CN.json` | `picker.*` / `switcher.*` / `takeover.*` keys |

---

## Conventions carried over from Plan 1

- Path aliases: `@/` → `src/`, `@shared/` → `shared/`.
- All IPC through `@/ipc/client` → never touch `window.api` directly.
- Commits tagged `feat(phase-02): ...` or `chore(phase-02): ...`.
- Each task ends with `npm run typecheck && npm run lint`; any failure blocks the task.

---

<!-- openspec-task: 6.1 -->
### Task 1: Set up Tailwind 4 + shadcn/ui foundation

**Files:**
- Modify: `package.json` (tailwind, @tailwindcss/postcss, postcss, autoprefixer, clsx, tailwind-merge, class-variance-authority, lucide-react, tailwindcss-animate, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @radix-ui/react-toast, @radix-ui/react-slot)
- Create: `postcss.config.js`
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Modify: `src/index.css`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install tailwindcss @tailwindcss/postcss postcss autoprefixer \
  clsx tailwind-merge class-variance-authority \
  tailwindcss-animate lucide-react \
  @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-toast @radix-ui/react-slot
```

Expected: exit 0. All packages resolve.

- [ ] **Step 2: Create `postcss.config.js`**

```javascript
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {}
  }
}
```

- [ ] **Step 3: Rewrite `src/index.css`**

```css
@import "tailwindcss";

@theme {
  /* oklch palette lifted from docs/ui/src/project-picker.jsx */
  --color-paper: oklch(0.99 0.005 80);
  --color-paper-2: oklch(0.97 0.008 75);
  --color-paper-3: oklch(0.95 0.012 70);
  --color-ink: oklch(0.26 0.015 45);
  --color-ink-2: oklch(0.42 0.018 45);
  --color-ink-3: oklch(0.58 0.015 50);
  --color-ink-4: oklch(0.72 0.01 55);
  --color-line: oklch(0.9 0.01 60);
  --color-line-2: oklch(0.85 0.015 60);
  --color-acorn: oklch(0.58 0.12 55);
  --color-acorn-2: oklch(0.5 0.13 50);
  --color-acorn-bg: oklch(0.95 0.035 65);
  --color-leaf: oklch(0.55 0.12 145);
  --color-leaf-bg: oklch(0.95 0.04 140);
  --color-berry: oklch(0.55 0.16 25);
  --color-berry-bg: oklch(0.94 0.03 25);
  --color-sky: oklch(0.6 0.1 220);
  --color-sky-bg: oklch(0.95 0.03 220);
  --font-serif: "Noto Serif SC", "Source Han Serif", ui-serif, serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

[data-theme="dark"] {
  --color-paper: oklch(0.2 0.015 60);
  --color-paper-2: oklch(0.22 0.018 60);
  --color-paper-3: oklch(0.25 0.02 60);
  --color-ink: oklch(0.92 0.005 70);
  --color-ink-2: oklch(0.78 0.008 70);
  --color-ink-3: oklch(0.6 0.01 70);
  --color-ink-4: oklch(0.48 0.01 70);
  --color-line: oklch(0.32 0.015 60);
  --color-line-2: oklch(0.4 0.018 60);
}

html,
body,
#root {
  height: 100%;
}

body {
  background-color: var(--color-paper);
  color: var(--color-ink);
  font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}

.serif {
  font-family: var(--font-serif);
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-up {
  animation: fade-up 0.3s ease-out both;
}
```

- [ ] **Step 4: Create `src/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 5: Create `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "hooks": "@/hooks",
    "lib": "@/lib"
  }
}
```

- [ ] **Step 6: Verify build pipeline**

Run:
```bash
npm run typecheck
npm run dev
```
Expected: dev window opens; no Tailwind/PostCSS error in console; existing Placeholder renders.

Kill dev server.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json postcss.config.js components.json src/index.css src/lib/utils.ts
git commit -m "chore(phase-02): install Tailwind 4 + shadcn/ui foundation"
```

---

<!-- openspec-task: 6.1 -->
### Task 2: Add shadcn primitives (Button, Dialog, Input, DropdownMenu, Toast)

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/ui/toast.tsx`
- Create: `src/components/ui/toaster.tsx`
- Create: `src/hooks/use-toast.ts`

- [ ] **Step 1: Button**

```tsx
// src/components/ui/button.tsx
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-acorn)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-[color:var(--color-acorn)] text-[color:var(--color-paper)] shadow-sm hover:brightness-105',
        outline:
          'bg-[color:var(--color-paper)] text-[color:var(--color-ink)] border border-[color:var(--color-line-2)] hover:bg-[color:var(--color-paper-2)]',
        ghost:
          'text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-2)]',
        destructive:
          'bg-[color:var(--color-berry)] text-[color:var(--color-paper)] hover:brightness-105'
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        lg: 'h-11 px-5 text-base',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { buttonVariants }
```

- [ ] **Step 2: Dialog**

```tsx
// src/components/ui/dialog.tsx
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-[color:var(--color-line-2)] bg-[color:var(--color-paper)] p-6 shadow-lg',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 opacity-60 transition-opacity hover:opacity-100">
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1.5 text-left', className)} {...props} />
)
export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex justify-end gap-2 pt-2', className)} {...props} />
)
export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('serif text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-[color:var(--color-ink-3)]', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName
```

- [ ] **Step 3: Input**

```tsx
// src/components/ui/input.tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-10 w-full rounded-md border border-[color:var(--color-line-2)] bg-[color:var(--color-paper)] px-3 py-2 text-sm text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-acorn)] disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'
```

- [ ] **Step 4: DropdownMenu**

```tsx
// src/components/ui/dropdown-menu.tsx
import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuGroup = DropdownMenuPrimitive.Group

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-48 overflow-hidden rounded-md border border-[color:var(--color-line-2)] bg-[color:var(--color-paper)] p-1 shadow-md',
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm text-[color:var(--color-ink)] outline-none data-[highlighted]:bg-[color:var(--color-paper-2)]',
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-[color:var(--color-line)]', className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName
```

- [ ] **Step 5: Toast + Toaster + useToast**

```tsx
// src/components/ui/toast.tsx
import * as React from 'react'
import * as ToastPrimitives from '@radix-ui/react-toast'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const ToastProvider = ToastPrimitives.Provider

export const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      'fixed bottom-0 right-0 z-[100] m-4 flex max-h-screen w-96 flex-col gap-2 outline-none',
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  'pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-md border p-4 pr-8 shadow-md transition-all data-[state=open]:animate-in data-[state=closed]:animate-out',
  {
    variants: {
      variant: {
        default:
          'border-[color:var(--color-line-2)] bg-[color:var(--color-paper)] text-[color:var(--color-ink)]',
        destructive:
          'border-[color:var(--color-berry)] bg-[color:var(--color-berry-bg)] text-[color:var(--color-ink)]'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

export const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => (
  <ToastPrimitives.Root
    ref={ref}
    className={cn(toastVariants({ variant }), className)}
    {...props}
  />
))
Toast.displayName = ToastPrimitives.Root.displayName

export const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    toast-close=""
    className={cn('absolute right-2 top-2 rounded-md p-1 opacity-60 hover:opacity-100', className)}
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

export const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn('text-sm font-medium', className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

export const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('text-sm text-[color:var(--color-ink-3)]', className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

export type ToastVariant = VariantProps<typeof toastVariants>['variant']
```

```tsx
// src/hooks/use-toast.ts
import { useSyncExternalStore } from 'react'
import type { ToastVariant } from '@/components/ui/toast'

type ToastItem = {
  id: number
  title?: string
  description?: string
  variant?: ToastVariant
  open: boolean
}

let counter = 0
let items: ToastItem[] = []
const listeners = new Set<() => void>()
function emit(): void {
  for (const l of listeners) l()
}

export function toast(input: Omit<ToastItem, 'id' | 'open'>): void {
  const id = ++counter
  items = [...items, { ...input, id, open: true }]
  emit()
  setTimeout(() => {
    items = items.map((t) => (t.id === id ? { ...t, open: false } : t))
    emit()
  }, 4000)
  setTimeout(() => {
    items = items.filter((t) => t.id !== id)
    emit()
  }, 5000)
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    () => items,
    () => items
  )
}
```

```tsx
// src/components/ui/toaster.tsx
import type { JSX } from 'react'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport
} from './toast'
import { useToasts } from '@/hooks/use-toast'

export function Toaster(): JSX.Element {
  const toasts = useToasts()
  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, variant, open }) => (
        <Toast key={id} variant={variant} open={open}>
          <div className="grid gap-1">
            {title ? <ToastTitle>{title}</ToastTitle> : null}
            {description ? <ToastDescription>{description}</ToastDescription> : null}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
```

- [ ] **Step 6: Mount `<Toaster />` at app root**

In `src/App.tsx`, add `<Toaster />` as a sibling of `<Routes>`:

```tsx
import { Toaster } from '@/components/ui/toaster'

export function App(): JSX.Element {
  return (
    <>
      <Routes>
        {/* ... existing routes ... */}
      </Routes>
      <Toaster />
    </>
  )
}
```

- [ ] **Step 7: Typecheck**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui src/hooks/use-toast.ts src/App.tsx
git commit -m "feat(phase-02): shadcn primitives (Button, Dialog, Input, DropdownMenu, Toast)"
```

---

<!-- openspec-task: 6.2 -->
### Task 3: `AcornLogo` SVG component

**Files:**
- Create: `src/components/AcornLogo.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { JSX } from 'react'

export type AcornLogoProps = {
  size?: number
  className?: string
  theme?: 'default' | 'mono'
}

export function AcornLogo({ size = 28, className, theme = 'default' }: AcornLogoProps): JSX.Element {
  const cap = theme === 'mono' ? 'currentColor' : 'var(--color-acorn-2)'
  const body = theme === 'mono' ? 'currentColor' : 'var(--color-acorn)'
  const highlight = theme === 'mono' ? 'currentColor' : 'var(--color-acorn-bg)'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      aria-label="Acornvo"
      role="img"
      className={className}
    >
      <path
        d="M5 10 Q5 6 9 6 L19 6 Q23 6 23 10 L23 11 L5 11 Z"
        fill={cap}
      />
      <path
        d="M6 11 L22 11 Q22 21 14 23 Q6 21 6 11 Z"
        fill={body}
      />
      <path d="M9 14 Q14 17 19 14" stroke={highlight} strokeWidth="1" fill="none" opacity="0.6" />
      <line x1="14" y1="2" x2="14" y2="6" stroke={cap} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/AcornLogo.tsx
git commit -m "feat(phase-02): AcornLogo SVG component"
```

---

<!-- openspec-task: 6.7 -->
### Task 4: i18n keys for Picker / Switcher / Takeover

**Files:**
- Modify: `src/i18n/locales/zh-CN.json`

- [ ] **Step 1: Add keys**

Replace the file body with:

```json
{
  "app": {
    "title": "Acornvo",
    "greeting": "你好，Acornvo"
  },
  "common": {
    "loading": "加载中…",
    "error": "发生错误",
    "cancel": "取消",
    "confirm": "确定",
    "remove": "移除",
    "open": "打开"
  },
  "nav": {
    "home": "首页",
    "picker": "项目选择",
    "library": "理果",
    "editor": "编辑器",
    "browser": "拾果",
    "chat": "松语",
    "settings": "设置"
  },
  "picker": {
    "title": "选择一片树林",
    "subtitle": "像松鼠一样拾果·理果·松语——把散落的阅读整理成属于你的知识森林。",
    "recentLabel": "最近打开",
    "recentCount": "最近打开 · {{count}}",
    "empty": "还没有任何树林。新建一片，或打开一个已有的目录。",
    "new": "新建树林",
    "open": "打开已有目录",
    "hint": "提示：树林根目录下的 .acornvo/ 存放索引与历史，真实数据源永远是本地 markdown 文件。可从任意 Obsidian vault 直接打开。",
    "invalid": "路径已失效",
    "locked": "被占用",
    "takeover": "接管",
    "files": "{{count}} 篇",
    "newDialog": {
      "title": "新建树林",
      "description": "将在所选父目录下创建一个新文件夹作为树林根目录。",
      "parentLabel": "父目录",
      "nameLabel": "树林名称",
      "namePlaceholder": "例如：我的知识林",
      "create": "创建",
      "chooseParent": "选择父目录…",
      "errorInvalidName": "名称不能包含 / \\ : * ? \" < > |",
      "errorDuplicate": "该目录下已存在同名文件或文件夹",
      "errorPermission": "父目录没有写入权限"
    }
  },
  "switcher": {
    "ariaLabel": "切换树林",
    "new": "新建树林…",
    "open": "打开已有目录…",
    "noGrove": "未选择树林"
  },
  "takeover": {
    "title": "树林已被占用",
    "description": "这棵树林正在被另一个 Acornvo 实例使用。",
    "held": "PID {{pid}} · {{hostname}} · {{startedAt}}",
    "force": "强制接管",
    "warning": "接管后原窗口可能在保存时报错。",
    "error": "接管失败：{{message}}"
  }
}
```

- [ ] **Step 2: Verify i18n still loads**

Run:
```bash
npm run typecheck
npm run dev
```
Expected: app loads; no `MISSING_TRANSLATION` warning for the new keys (they just aren't referenced yet). Kill dev server.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/zh-CN.json
git commit -m "feat(phase-02): i18n keys for picker/switcher/takeover"
```

---

<!-- openspec-task: 6.3 -->
### Task 5: `ProjectCard` component with normal / invalid / locked states

**Files:**
- Create: `src/components/ProjectCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { JSX } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RecentItemView, GroveColor } from '@shared/grove'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const colorMap: Record<GroveColor, { dot: string; bg: string }> = {
  acorn: { dot: 'var(--color-acorn)', bg: 'var(--color-acorn-bg)' },
  leaf: { dot: 'var(--color-leaf)', bg: 'var(--color-leaf-bg)' },
  berry: { dot: 'var(--color-berry)', bg: 'var(--color-berry-bg)' },
  sky: { dot: 'var(--color-sky)', bg: 'var(--color-sky-bg)' }
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  return d.toISOString().slice(0, 10)
}

export type ProjectCardProps = {
  item: RecentItemView
  /** When truthy, this card is locked by another process — renders a "takeover" button. */
  locked?: { pid: number; hostname: string; started_at: string }
  onOpen: () => void
  onRemove: () => void
  onTakeover?: () => void
  /** Stagger index for fade-up animation. */
  index?: number
}

export function ProjectCard({
  item,
  locked,
  onOpen,
  onRemove,
  onTakeover,
  index = 0
}: ProjectCardProps): JSX.Element {
  const { t } = useTranslation()
  const invalid = !item.valid
  const { dot, bg } = colorMap[item.color]
  const disabled = invalid

  return (
    <div
      className={cn(
        'animate-fade-up group flex items-center gap-3.5 rounded-xl border p-3.5 transition-all',
        invalid
          ? 'opacity-60 border-[color:var(--color-line)]'
          : 'border-[color:var(--color-line)] hover:border-[color:var(--color-line-2)] hover:bg-[color:var(--color-paper)] hover:translate-x-0.5'
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="flex flex-1 items-center gap-3.5 bg-transparent text-left min-w-0"
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[color:var(--color-line)]"
          style={{ background: bg }}
        >
          <div className="h-3 w-3 rounded-[3px]" style={{ background: dot }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="serif text-[15.5px] font-medium text-[color:var(--color-ink)]">
              {item.name}
            </span>
            {item.pinned ? (
              <span className="text-[10px] font-mono text-[color:var(--color-acorn-2)]">
                ·pinned
              </span>
            ) : null}
            {invalid ? (
              <span className="text-[10px] font-mono text-[color:var(--color-berry)]">
                · {t('picker.invalid')}
              </span>
            ) : null}
            {locked ? (
              <span className="text-[10px] font-mono text-[color:var(--color-berry)]">
                · {t('picker.locked')}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-[color:var(--color-ink-3)]">
            {item.path}
          </div>
        </div>
        <div className="shrink-0 text-right font-mono text-[11px] text-[color:var(--color-ink-3)]">
          <div className="serif text-[13px] text-[color:var(--color-ink-2)]">
            {t('picker.files', { count: item.files_count })}
          </div>
          <div className="mt-0.5">{formatRelative(item.last_opened_at)}</div>
        </div>
        <ArrowRight
          size={14}
          className="shrink-0 text-[color:var(--color-ink-3)] opacity-30 transition-opacity group-hover:opacity-100"
        />
      </button>

      {invalid ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('common.remove')}
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}

      {locked && onTakeover ? (
        <Button variant="outline" size="sm" onClick={onTakeover}>
          {t('picker.takeover')}
        </Button>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProjectCard.tsx
git commit -m "feat(phase-02): ProjectCard with normal/invalid/locked states"
```

---

<!-- openspec-task: 6.1 -->
### Task 6: `ProjectPicker` two-column layout skeleton

**Files:**
- Modify: `src/pages/ProjectPicker.tsx` (replace Plan 1 stub with full page)

- [ ] **Step 1: Write the page**

```tsx
import { useEffect, useMemo, useState, type JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LockInfo } from '@shared/grove'
import { useGroveStore } from '@/stores/grove'
import { useBootstrap } from '@/hooks/useBootstrap'
import { AcornLogo } from '@/components/AcornLogo'
import { ProjectCard } from '@/components/ProjectCard'
import { Button } from '@/components/ui/button'
import { Plus, FolderOpen } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export function ProjectPicker(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const bootstrap = useBootstrap()
  const { recent, loadRecent, openGroveById, removeFromRecent, openExisting } = useGroveStore()

  // Locked-from-bootstrap highlight (first item cannot be auto-opened).
  const [lockedFromBootstrap, setLockedFromBootstrap] = useState<{
    path: string
    holder: LockInfo
  } | null>(null)

  useEffect(() => {
    if (bootstrap) {
      // seed recent from bootstrap payload so the list is visible immediately
      useGroveStore.setState({ recent: bootstrap.recent })
      if (bootstrap.locked) setLockedFromBootstrap(bootstrap.locked)
    }
    void loadRecent()
  }, [bootstrap, loadRecent])

  const hasRecent = recent.length > 0

  const items = useMemo(() => recent, [recent])

  async function handleOpen(id: string): Promise<void> {
    const res = await openGroveById(id)
    if (res.status === 'opened') {
      navigate('/library')
    } else if (res.status === 'error') {
      toast({ title: t('common.error'), description: res.message, variant: 'destructive' })
    }
  }

  async function handleTakeover(path: string): Promise<void> {
    const res = await openExisting(path, { force: true })
    if (res.status === 'opened') {
      setLockedFromBootstrap(null)
      navigate('/library')
    } else if (res.status === 'error') {
      toast({
        title: t('takeover.title'),
        description: t('takeover.error', { message: res.message }),
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-[color:var(--color-paper)]">
      <div className="flex flex-1 overflow-hidden">
        {/* Left brand column */}
        <aside
          className="flex w-[420px] shrink-0 flex-col justify-between border-r border-[color:var(--color-line)] px-14 py-12"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, oklch(0.94 0.02 60 / 0.5) 100%)'
          }}
        >
          <div>
            <div className="mb-6 flex items-center gap-2.5">
              <AcornLogo size={36} />
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--color-ink-3)]">
                  Acornvo · v1.0
                </div>
                <div className="serif text-[26px] font-semibold leading-none tracking-tight">
                  松言果语
                </div>
              </div>
            </div>
            <p className="serif mt-7 max-w-[300px] text-[15px] leading-[1.7] text-[color:var(--color-ink-2)]">
              {t('picker.subtitle')}
            </p>
          </div>
          <div className="mt-9 font-mono text-[10.5px] leading-[1.7] text-[color:var(--color-ink-4)]">
            ~/.acornvo
          </div>
        </aside>

        {/* Right list + actions column */}
        <section className="flex-1 overflow-y-auto px-14 py-12">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="serif m-0 text-[22px] font-semibold tracking-tight">
              {t('picker.title')}
            </h2>
            <div className="font-mono text-[11px] text-[color:var(--color-ink-3)]">
              {t('picker.recentCount', { count: recent.length })}
            </div>
          </div>

          {hasRecent ? (
            <div className="flex flex-col gap-2.5">
              {items.map((item, i) => {
                const locked =
                  lockedFromBootstrap && lockedFromBootstrap.path === item.path
                    ? lockedFromBootstrap.holder
                    : undefined
                return (
                  <ProjectCard
                    key={item.id}
                    item={item}
                    index={i}
                    locked={locked}
                    onOpen={() => void handleOpen(item.id)}
                    onRemove={() => void removeFromRecent(item.id)}
                    onTakeover={locked ? () => void handleTakeover(item.path) : undefined}
                  />
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[color:var(--color-line-2)] px-6 py-10 text-center text-[color:var(--color-ink-3)]">
              {t('picker.empty')}
            </div>
          )}

          <div className="mt-6 flex gap-2.5">
            <Button
              className="flex-1"
              size="lg"
              data-testid="picker-new"
              // Task 7 wires this to the new-grove dialog
              onClick={() => {
                const ev = new CustomEvent('acorn:picker:new')
                window.dispatchEvent(ev)
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('picker.new')}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              size="lg"
              data-testid="picker-open"
              onClick={() => {
                const ev = new CustomEvent('acorn:picker:open')
                window.dispatchEvent(ev)
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('picker.open')}
            </Button>
          </div>

          <p className="mt-7 font-mono text-[11px] leading-[1.7] text-[color:var(--color-ink-4)]">
            {t('picker.hint')}
          </p>
        </section>
      </div>
    </div>
  )
}
```

Note: the two CustomEvents above are placeholders — Tasks 7 and 8 replace the `onClick` bodies with real handlers. The event-bus indirection avoids churn on the main JSX block.

- [ ] **Step 2: Wire `/picker` route**

In `src/App.tsx` replace `<Route path="/picker" element={<Placeholder name="picker (plan 2 UI)" />} />` with:

```tsx
import { ProjectPicker } from './pages/ProjectPicker'
// ...
<Route path="/picker" element={<ProjectPicker />} />
```

- [ ] **Step 3: Smoke-test**

Run:
```bash
npm run dev
```
Expected: window opens at `/picker` showing empty-state message, two action buttons (not wired yet — clicking emits CustomEvent but nothing responds). Left brand column renders with AcornLogo and subtitle.

Kill dev server.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ProjectPicker.tsx src/App.tsx
git commit -m "feat(phase-02): ProjectPicker two-column layout + empty state"
```

---

<!-- openspec-task: 6.4 -->
### Task 7: "New grove" flow — directory picker + naming dialog

**Files:**
- Create: `src/components/NewGroveDialog.tsx`
- Modify: `src/pages/ProjectPicker.tsx` (replace `acorn:picker:new` CustomEvent with real handler + render dialog)

- [ ] **Step 1: Write `NewGroveDialog`**

```tsx
import { useState, useEffect, type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { IpcError } from '@shared/ipc-contract'
import { useGroveStore } from '@/stores/grove'
import { ipc } from '@/ipc/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export type NewGroveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (grovePath: string) => void
}

export function NewGroveDialog({ open, onOpenChange, onCreated }: NewGroveDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [parentDir, setParentDir] = useState<string>('')
  const [name, setName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const createGrove = useGroveStore((s) => s.createGrove)

  useEffect(() => {
    if (!open) {
      setParentDir('')
      setName('')
      setError(null)
      setBusy(false)
    }
  }, [open])

  async function chooseParent(): Promise<void> {
    const p = await ipc.project.selectDirectory('createParent')
    if (p) setParentDir(p)
  }

  async function submit(): Promise<void> {
    setError(null)
    if (!parentDir) {
      setError(t('picker.newDialog.chooseParent'))
      return
    }
    setBusy(true)
    try {
      const g = await createGrove(parentDir, name.trim())
      onCreated(g.path)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof IpcError) {
        if (err.code === 'E_INVALID_ARGS') setError(t('picker.newDialog.errorInvalidName'))
        else if (err.code === 'E_EXISTS') setError(t('picker.newDialog.errorDuplicate'))
        else if (err.code === 'E_PERMISSION') setError(t('picker.newDialog.errorPermission'))
        else setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('picker.newDialog.title')}</DialogTitle>
          <DialogDescription>{t('picker.newDialog.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[color:var(--color-ink-3)]">
              {t('picker.newDialog.parentLabel')}
            </label>
            <div className="flex gap-2">
              <Input
                value={parentDir}
                onChange={(e) => setParentDir(e.target.value)}
                placeholder="/Users/..."
                readOnly
              />
              <Button variant="outline" onClick={() => void chooseParent()}>
                {t('picker.newDialog.chooseParent')}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[color:var(--color-ink-3)]">
              {t('picker.newDialog.nameLabel')}
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('picker.newDialog.namePlaceholder')}
            />
          </div>
          {error ? (
            <p className="text-sm text-[color:var(--color-berry)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !name.trim() || !parentDir}>
            {t('picker.newDialog.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Wire the dialog in `ProjectPicker.tsx`**

Add state and handler:

```tsx
import { NewGroveDialog } from '@/components/NewGroveDialog'

// inside ProjectPicker():
const [newOpen, setNewOpen] = useState(false)

useEffect(() => {
  const onNew = (): void => setNewOpen(true)
  window.addEventListener('acorn:picker:new', onNew)
  return () => window.removeEventListener('acorn:picker:new', onNew)
}, [])
```

Render the dialog at the end of the component:

```tsx
<NewGroveDialog
  open={newOpen}
  onOpenChange={setNewOpen}
  onCreated={() => navigate('/library')}
/>
```

- [ ] **Step 3: Smoke-test**

Run:
```bash
npm run dev
```
Click `新建树林` → dialog opens. Click `选择父目录…` → native dialog opens (cancel for now). Type a name → `创建` should still be disabled until a parent is chosen. Choose a parent (e.g. `~/Desktop`) → `创建` enables. Click `创建` → dialog closes, window navigates to `/library` placeholder.

Check filesystem:
```bash
ls ~/Desktop/<the-name-you-typed>/.acornvo/
```
Expected: `project.json`, `.nosync`, `.icloud` exist; `inbox/` and `assets/` exist at the grove root.

Clean up:
```bash
rm -rf ~/Desktop/<the-name-you-typed>
```

Kill dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/NewGroveDialog.tsx src/pages/ProjectPicker.tsx
git commit -m "feat(phase-02): new grove flow — parent picker + naming dialog"
```

---

<!-- openspec-task: 6.5 -->
### Task 8: "Open existing directory" flow

**Files:**
- Modify: `src/pages/ProjectPicker.tsx` (wire `acorn:picker:open` handler)

- [ ] **Step 1: Add handler**

Inside `ProjectPicker()`:

```tsx
useEffect(() => {
  const onOpen = async (): Promise<void> => {
    const path = await ipc.project.selectDirectory('open')
    if (!path) return
    const res = await openExisting(path)
    if (res.status === 'opened') {
      navigate('/library')
    } else if (res.status === 'locked') {
      setLockedFromBootstrap({ path, holder: res.holder })
      toast({ title: t('picker.locked'), description: path })
    } else {
      toast({ title: t('common.error'), description: res.message, variant: 'destructive' })
    }
    await loadRecent()
  }
  const listener = (): void => {
    void onOpen()
  }
  window.addEventListener('acorn:picker:open', listener)
  return () => window.removeEventListener('acorn:picker:open', listener)
}, [loadRecent, navigate, openExisting, t])
```

(Add `ipc` import if not yet present.)

- [ ] **Step 2: Smoke-test**

Run:
```bash
npm run dev
```

1. Click `打开已有目录` → native dialog.
2. Pick any directory (even an Obsidian vault — create one by doing `mkdir -p ~/Desktop/vault-test/.obsidian` first).
3. Window navigates to `/library`. Check:
   ```bash
   ls ~/Desktop/vault-test/.acornvo/
   ```
   Expected: `project.json`, `.nosync`, `.icloud`, and the existing `.obsidian/` is untouched.

Clean up:
```bash
rm -rf ~/Desktop/vault-test
```

Kill dev server.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProjectPicker.tsx
git commit -m "feat(phase-02): open-existing flow with Obsidian vault auto-init"
```

---

<!-- openspec-task: 6.6 -->
### Task 9: Confirm navigation to `/library` on every success path

**Files:**
- Modify: `src/pages/ProjectPicker.tsx` (audit all success paths)
- Modify: `src/pages/Placeholder.tsx` (brief enhancement to verify navigation)

- [ ] **Step 1: Audit `ProjectPicker.tsx`**

Confirm each success branch calls `navigate('/library')`:
- `handleOpen` on `status === 'opened'`
- `handleTakeover` on `status === 'opened'`
- `NewGroveDialog` `onCreated` → already navigates
- `acorn:picker:open` listener on `status === 'opened'`

If any branch is missing, add the call. No code change needed if already present — this task is a deliberate audit checkpoint.

- [ ] **Step 2: Improve `Placeholder` so the library page shows the current grove**

Replace `src/pages/Placeholder.tsx`:

```tsx
import type { JSX } from 'react'
import { useGroveStore } from '@/stores/grove'

export function Placeholder({ name }: { name: string }): JSX.Element {
  const current = useGroveStore((s) => s.current)
  return (
    <div className="p-6">
      <h1 className="serif text-xl font-semibold">{name} (placeholder)</h1>
      {current ? (
        <pre className="mt-4 whitespace-pre-wrap font-mono text-xs text-[color:var(--color-ink-3)]">
          {JSON.stringify(current, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-[color:var(--color-ink-3)]">未打开任何树林</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Smoke-test**

Run `npm run dev`, click a recent grove card or create one — `/library` should display the grove's JSON summary. Kill dev server.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ProjectPicker.tsx src/pages/Placeholder.tsx
git commit -m "feat(phase-02): audit navigate('/library') on all picker success paths"
```

---

<!-- openspec-task: 7.1 -->
### Task 10: `GroveSwitcher` trigger button

**Files:**
- Create: `src/components/GroveSwitcher.tsx`

- [ ] **Step 1: Write the minimal trigger**

```tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import type { GroveColor } from '@shared/grove'
import { useGroveStore } from '@/stores/grove'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const dotColor: Record<GroveColor, string> = {
  acorn: 'var(--color-acorn)',
  leaf: 'var(--color-leaf)',
  berry: 'var(--color-berry)',
  sky: 'var(--color-sky)'
}

export function GroveSwitcher({ className }: { className?: string }): JSX.Element | null {
  const { t } = useTranslation()
  const current = useGroveStore((s) => s.current)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('switcher.ariaLabel')}
          className={cn(
            'inline-flex items-center gap-2 rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-2.5 py-1 text-sm text-[color:var(--color-ink)] hover:bg-[color:var(--color-paper-2)]',
            className
          )}
        >
          {current ? (
            <>
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: dotColor[current.color] }}
              />
              <span className="serif">{current.name}</span>
            </>
          ) : (
            <span className="text-[color:var(--color-ink-3)]">{t('switcher.noGrove')}</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-[color:var(--color-ink-3)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {/* Populated in Task 11 */}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/GroveSwitcher.tsx
git commit -m "feat(phase-02): GroveSwitcher trigger button"
```

---

<!-- openspec-task: 7.2 -->
### Task 11: `GroveSwitcher` dropdown content (recent 5 + actions)

**Files:**
- Modify: `src/components/GroveSwitcher.tsx`

- [ ] **Step 1: Fill in `DropdownMenuContent`**

Add imports:

```tsx
import { useEffect } from 'react'
import { Plus, FolderOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ipc } from '@/ipc/client'
import { toast } from '@/hooks/use-toast'
import {
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
```

Replace the empty `DropdownMenuContent` body with:

```tsx
<DropdownMenuContent align="start">
  {recentFive.map((item) => (
    <DropdownMenuItem
      key={item.id}
      disabled={!item.valid}
      onSelect={(e) => {
        e.preventDefault()
        void handleSwitch(item.id)
      }}
    >
      <span
        className="h-2 w-2 rounded-sm"
        style={{ background: dotColor[item.color] }}
      />
      <span className="flex-1 truncate">{item.name}</span>
      {!item.valid ? (
        <span className="font-mono text-[10px] text-[color:var(--color-berry)]">
          {t('picker.invalid')}
        </span>
      ) : null}
    </DropdownMenuItem>
  ))}
  {recentFive.length > 0 ? <DropdownMenuSeparator /> : null}
  <DropdownMenuItem
    onSelect={(e) => {
      e.preventDefault()
      void handleNew()
    }}
  >
    <Plus className="h-3.5 w-3.5" />
    {t('switcher.new')}
  </DropdownMenuItem>
  <DropdownMenuItem
    onSelect={(e) => {
      e.preventDefault()
      void handleOpen()
    }}
  >
    <FolderOpen className="h-3.5 w-3.5" />
    {t('switcher.open')}
  </DropdownMenuItem>
</DropdownMenuContent>
```

Add supporting state/handlers inside `GroveSwitcher`:

```tsx
const recent = useGroveStore((s) => s.recent)
const loadRecent = useGroveStore((s) => s.loadRecent)
const switchTo = useGroveStore((s) => s.switchTo)
const openExisting = useGroveStore((s) => s.openExisting)
const navigate = useNavigate()

useEffect(() => {
  void loadRecent()
}, [loadRecent])

const recentFive = recent.slice(0, 5)

async function handleSwitch(id: string): Promise<void> {
  const res = await switchTo(id)
  if (res.status === 'opened') {
    navigate('/library')
  } else if (res.status === 'locked') {
    toast({ title: t('picker.locked'), description: res.holder.hostname })
  } else {
    toast({ title: t('common.error'), description: res.message, variant: 'destructive' })
  }
}

async function handleNew(): Promise<void> {
  // Delegate to the Picker: navigate there and fire the custom event
  navigate('/picker')
  setTimeout(() => window.dispatchEvent(new CustomEvent('acorn:picker:new')), 0)
}

async function handleOpen(): Promise<void> {
  const path = await ipc.project.selectDirectory('open')
  if (!path) return
  const res = await openExisting(path)
  if (res.status === 'opened') {
    navigate('/library')
  } else if (res.status === 'locked') {
    toast({ title: t('picker.locked'), description: path })
  } else {
    toast({ title: t('common.error'), description: res.message, variant: 'destructive' })
  }
  await loadRecent()
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/GroveSwitcher.tsx
git commit -m "feat(phase-02): GroveSwitcher dropdown items — recent 5 + new/open"
```

---

<!-- openspec-task: 7.3 -->
### Task 12: Route guard — hide GroveSwitcher on `/picker`

**Files:**
- Modify: `src/components/GroveSwitcher.tsx`

- [ ] **Step 1: Return `null` when on Picker**

At the top of `GroveSwitcher()`:

```tsx
import { useLocation } from 'react-router-dom'

const location = useLocation()
if (location.pathname === '/picker') return null
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/GroveSwitcher.tsx
git commit -m "feat(phase-02): hide GroveSwitcher on /picker route"
```

---

<!-- openspec-task: 7.4 -->
### Task 13: `TitleBar` component hosting `GroveSwitcher`

**Files:**
- Create: `src/components/TitleBar.tsx`
- Modify: `src/App.tsx` (mount TitleBar above Routes, except when full-bleed routes need it hidden — here all routes share it)

- [ ] **Step 1: Write `TitleBar`**

```tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { GroveSwitcher } from './GroveSwitcher'

export function TitleBar(): JSX.Element {
  const { t } = useTranslation()
  return (
    <header
      className="flex h-10 shrink-0 items-center justify-between border-b border-[color:var(--color-line)] px-3"
      data-testid="titlebar"
    >
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[color:var(--color-ink-3)]">
        {t('app.title')}
      </div>
      <GroveSwitcher />
    </header>
  )
}
```

- [ ] **Step 2: Mount in `App.tsx`**

Replace `App.tsx`:

```tsx
import type { JSX } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Placeholder } from './pages/Placeholder'
import { ProjectPicker } from './pages/ProjectPicker'
import { useBootstrap } from './hooks/useBootstrap'
import { Toaster } from '@/components/ui/toaster'
import { TitleBar } from '@/components/TitleBar'

function BootstrapGate(): JSX.Element {
  const payload = useBootstrap()
  if (!payload) return <Placeholder name="loading" />
  return <Navigate to={payload.initialRoute} replace />
}

export function App(): JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<BootstrapGate />} />
          <Route path="/picker" element={<ProjectPicker />} />
          <Route path="/library" element={<Placeholder name="library" />} />
          <Route path="/editor/:path" element={<Placeholder name="editor" />} />
          <Route path="/browser" element={<Placeholder name="browser" />} />
          <Route path="/chat" element={<Placeholder name="chat" />} />
          <Route path="/settings" element={<Placeholder name="settings" />} />
        </Routes>
      </main>
      <Toaster />
    </div>
  )
}
```

- [ ] **Step 3: Smoke-test**

Run `npm run dev`. On `/picker`, the TitleBar shows the app name but no switcher. After opening or creating a grove, you land on `/library`; now the TitleBar shows the GroveSwitcher with a coloured dot and the grove name. Clicking it opens the dropdown listing the recent 5 items plus the two actions.

Kill dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/TitleBar.tsx src/App.tsx
git commit -m "feat(phase-02): TitleBar with GroveSwitcher slot"
```

---

<!-- openspec-task: 8.1 -->
### Task 14: `TakeoverDialog` — render holder info

**Files:**
- Create: `src/components/TakeoverDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { LockInfo } from '@shared/grove'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export type TakeoverDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  grovePath: string
  holder: LockInfo
  onConfirm: () => void
  pending?: boolean
}

export function TakeoverDialog({
  open,
  onOpenChange,
  grovePath,
  holder,
  onConfirm,
  pending
}: TakeoverDialogProps): JSX.Element {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('takeover.title')}</DialogTitle>
          <DialogDescription>{t('takeover.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 font-mono text-xs text-[color:var(--color-ink-3)]">
          <div className="truncate">{grovePath}</div>
          <div>
            {t('takeover.held', {
              pid: holder.pid,
              hostname: holder.hostname,
              startedAt: holder.started_at
            })}
          </div>
        </div>
        <p className="text-sm text-[color:var(--color-ink-2)]">{t('takeover.warning')}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {t('takeover.force')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/TakeoverDialog.tsx
git commit -m "feat(phase-02): TakeoverDialog showing lock holder info"
```

---

<!-- openspec-task: 8.2 -->
### Task 15: Wire TakeoverDialog into Picker (cancel / force takeover)

**Files:**
- Modify: `src/pages/ProjectPicker.tsx`

- [ ] **Step 1: Replace the inline "takeover" button flow with the dialog**

Add state and import:

```tsx
import { TakeoverDialog } from '@/components/TakeoverDialog'

const [takeover, setTakeover] = useState<{ path: string; holder: LockInfo } | null>(null)
const [takeoverPending, setTakeoverPending] = useState(false)
```

Change `handleTakeover` to open the dialog first:

```tsx
function requestTakeover(path: string, holder: LockInfo): void {
  setTakeover({ path, holder })
}

async function confirmTakeover(): Promise<void> {
  if (!takeover) return
  setTakeoverPending(true)
  const res = await openExisting(takeover.path, { force: true })
  setTakeoverPending(false)
  if (res.status === 'opened') {
    setLockedFromBootstrap(null)
    setTakeover(null)
    navigate('/library')
  } else if (res.status === 'error') {
    setTakeover(null)
    toast({
      title: t('takeover.title'),
      description: t('takeover.error', { message: res.message }),
      variant: 'destructive'
    })
  } else {
    // Still locked? Keep dialog open and update holder
    setTakeover({ path: takeover.path, holder: res.holder })
  }
}
```

Update the `ProjectCard` usage to call `requestTakeover` instead of `handleTakeover`:

```tsx
onTakeover={locked ? () => requestTakeover(item.path, locked) : undefined}
```

Also in the `acorn:picker:open` listener, when the result is `'locked'`:

```tsx
} else if (res.status === 'locked') {
  requestTakeover(path, res.holder)
}
```

Render the dialog at the bottom of the component (after `<NewGroveDialog ... />`):

```tsx
{takeover ? (
  <TakeoverDialog
    open={!!takeover}
    onOpenChange={(o) => {
      if (!o) setTakeover(null)
    }}
    grovePath={takeover.path}
    holder={takeover.holder}
    onConfirm={() => void confirmTakeover()}
    pending={takeoverPending}
  />
) : null}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProjectPicker.tsx
git commit -m "feat(phase-02): TakeoverDialog integrated into Picker with cancel/force"
```

---

<!-- openspec-task: 8.3 -->
### Task 16: Success navigation + toast on takeover failure (audit)

**Files:**
- None — verification-only task

- [ ] **Step 1: Verify behaviour**

Read `confirmTakeover` added in Task 15 and confirm:
- Success → `setTakeover(null)` + `navigate('/library')` ✓
- Error → toast with variant `destructive` ✓
- Still-locked → dialog remains open with refreshed holder ✓

If any branch is missing, add it now.

- [ ] **Step 2: Manual smoke-test**

In one Terminal tab, start two dev instances:

```bash
# Tab A
npm run dev
# Open or create a grove at ~/Desktop/two-lock-test
```

Leave Tab A's Electron window running. In Tab B:

```bash
# Tab B — launch a second Electron instance with the same codebase
ELECTRON_RENDERER_URL=http://localhost:5173 npx electron out/main/main.js
```

(Or simply run `npm run dev` in Tab B — electron-vite picks a free port; both processes will hit the same grove when you open it.)

In Tab B's window, try to open the same `~/Desktop/two-lock-test` → the Picker should mark the item as locked, and clicking its `接管` button opens the `TakeoverDialog`. Clicking `强制接管` should:
- Navigate Tab B to `/library` with the grove
- Tab A keeps its window but its next write will log an error — expected and accepted per the design doc.

Kill both dev servers and clean up:
```bash
rm -rf ~/Desktop/two-lock-test
```

- [ ] **Step 3: Commit (no changes, or a follow-up if audit found gaps)**

If the audit produced no changes, skip the commit for this task. Otherwise:

```bash
git add src/pages/ProjectPicker.tsx
git commit -m "fix(phase-02): takeover dialog branch audit adjustments"
```

---

<!-- openspec-task: 9.1 -->
### Task 17: Acceptance 9.1 — Fresh launch shows empty Picker

**Files:** None (smoke-only)

- [ ] **Step 1: Wipe user state**

```bash
rm -f ~/.acornvo/recent-projects.json
```

- [ ] **Step 2: Launch**

```bash
npm run dev
```

Expected:
- Window opens directly on `/picker`.
- Right column shows the empty-state card (`还没有任何树林…`).
- Both action buttons visible; no errors in devtools console.

Kill dev server.

- [ ] **Step 3: Mark OpenSpec task complete**

Edit `openspec/changes/phase-02-project-picker-grove/tasks.md` — change `- [ ] 9.1 ...` to `- [x] 9.1 ...`. Commit together with the rest at the end of Task 25.

---

<!-- openspec-task: 9.2 -->
### Task 18: Acceptance 9.2 — New grove creates correct directory structure

- [ ] **Step 1: Run app + create a grove**

```bash
npm run dev
```
Click `新建树林` → pick `~/Desktop` as parent → name it `test-grove-9.2` → click `创建`.

- [ ] **Step 2: Assert directory layout**

```bash
ls -la ~/Desktop/test-grove-9.2 ~/Desktop/test-grove-9.2/.acornvo
```

Expected output contains:
- `~/Desktop/test-grove-9.2/.acornvo/project.json` (valid JSON, schema matches `ProjectJsonSchema`)
- `~/Desktop/test-grove-9.2/.acornvo/.nosync`
- `~/Desktop/test-grove-9.2/.acornvo/.icloud`
- `~/Desktop/test-grove-9.2/inbox/` (directory)
- `~/Desktop/test-grove-9.2/assets/` (directory)

Run:
```bash
node -e 'const s = JSON.parse(require("fs").readFileSync(require("os").homedir() + "/Desktop/test-grove-9.2/.acornvo/project.json", "utf8")); console.log(s.id.length === 36, s.name === "test-grove-9.2", s.schema_version === 1)'
```
Expected: `true true true`.

Clean up:
```bash
rm -rf ~/Desktop/test-grove-9.2
```

Kill dev server and tick task 9.2 in `tasks.md`.

---

<!-- openspec-task: 9.3 -->
### Task 19: Acceptance 9.3 — Restart auto-opens most recent grove

- [ ] **Step 1: Seed a grove + quit cleanly**

```bash
npm run dev
```
Create `~/Desktop/test-grove-9.3`. Close the window (Cmd+Q on macOS).

- [ ] **Step 2: Launch again**

```bash
npm run dev
```

Expected:
- Window opens directly on `/library` (not `/picker`).
- TitleBar shows `test-grove-9.3` with its colour dot.
- Logs in `~/.acornvo/logs/main-<date>.log` contain a `grove opened` line.

Kill dev server + clean up:
```bash
rm -rf ~/Desktop/test-grove-9.3
rm ~/.acornvo/recent-projects.json
```

Tick 9.3 in `tasks.md`.

---

<!-- openspec-task: 9.4 -->
### Task 20: Acceptance 9.4 — Second instance triggers takeover

- [ ] **Step 1: Seed a grove**

```bash
npm run dev
```
Create `~/Desktop/test-grove-9.4`. **Do not** quit — leave the window running.

- [ ] **Step 2: Launch a second instance**

In a new terminal:

```bash
npm run build  # only once; creates out/
ELECTRON_RENDERER_URL= npx electron out/main/main.js &
```

(If running `npm run dev` twice, electron-vite will reject the second instance by default because of a single-instance lock. Build + run from `out/` sidesteps that and mirrors packaged behaviour.)

The second window opens and auto-tries to open `test-grove-9.4` (from recent). Because the first instance holds the lock:
- Second window lands on `/picker` with `test-grove-9.4` marked as 被占用 + `接管` button.
- Clicking `接管` opens `TakeoverDialog` showing the first instance's pid + hostname.
- Click `强制接管` → second window navigates to `/library` with the grove.

Verify:
```bash
cat ~/Desktop/test-grove-9.4/.acornvo/.lock
```
Expected: the `pid` matches the second instance's process (not the first).

Check first instance: if you click any action that would write (none in this phase — the first instance is now zombie-safe). Per design, further IPC writes may fail; acceptable.

Kill both instances + clean up:
```bash
rm -rf ~/Desktop/test-grove-9.4
rm ~/.acornvo/recent-projects.json
```

Tick 9.4.

---

<!-- openspec-task: 9.5 -->
### Task 21: Acceptance 9.5 — Moved directory → invalid + remove

- [ ] **Step 1: Seed a grove, quit, then move it**

```bash
npm run dev
```
Create `~/Desktop/test-grove-9.5`. Close app. Then:

```bash
mv ~/Desktop/test-grove-9.5 ~/Desktop/test-grove-9.5-moved
```

- [ ] **Step 2: Launch again**

```bash
npm run dev
```

Expected:
- Window opens on `/picker` (auto-open failed — directory gone).
- The recent-list card for `test-grove-9.5` is greyed out, shows `路径已失效`, and has a `×` remove button.

- [ ] **Step 3: Click the `×` button**

Expected:
- Card disappears from the list.
- `cat ~/.acornvo/recent-projects.json` shows the item gone.

Clean up:
```bash
rm -rf ~/Desktop/test-grove-9.5-moved
rm ~/.acornvo/recent-projects.json
```

Tick 9.5.

---

<!-- openspec-task: 9.6 -->
### Task 22: Acceptance 9.6 — Obsidian vault auto-init

- [ ] **Step 1: Prepare a fake Obsidian vault**

```bash
mkdir -p ~/Desktop/obsidian-vault/.obsidian
echo "# hello" > ~/Desktop/obsidian-vault/readme.md
```

- [ ] **Step 2: Open via app**

```bash
npm run dev
```
Click `打开已有目录`, pick `~/Desktop/obsidian-vault`.

Expected:
- Window navigates to `/library`.
- `ls -la ~/Desktop/obsidian-vault/.acornvo` shows `project.json`, `.nosync`, `.icloud`.
- `ls ~/Desktop/obsidian-vault/.obsidian` still contains whatever was there (empty dir is fine).
- `readme.md` unchanged.

Clean up:
```bash
rm -rf ~/Desktop/obsidian-vault
rm ~/.acornvo/recent-projects.json
```

Tick 9.6.

---

<!-- openspec-task: 9.7 -->
### Task 23: Acceptance 9.7 — iCloud path → sync_warning + log

- [ ] **Step 1: Create a grove under iCloud**

```bash
mkdir -p ~/Library/Mobile\ Documents/com~apple~CloudDocs/acornvo-sync-test
```

```bash
npm run dev
```
Click `打开已有目录`, pick the directory above.

Expected:
- `project.json` contains `"sync_warning": "iCloud"`:
  ```bash
  cat "$HOME/Library/Mobile Documents/com~apple~CloudDocs/acornvo-sync-test/.acornvo/project.json" | grep sync_warning
  ```
- `~/.acornvo/logs/main-<date>.log` contains a line with `grove on cloud-sync path` and `"provider":"iCloud"`.

Clean up:
```bash
rm -rf "$HOME/Library/Mobile Documents/com~apple~CloudDocs/acornvo-sync-test"
rm ~/.acornvo/recent-projects.json
```

Tick 9.7.

(Non-macOS hosts: skip this task and mark it `- [x] 9.7 skipped: no iCloud on platform` with a comment.)

---

<!-- openspec-task: 9.8 -->
### Task 24: Acceptance 9.8 — Switcher menu + `project:changed`

- [ ] **Step 1: Seed two groves**

```bash
npm run dev
```
Create `~/Desktop/grove-A` and `~/Desktop/grove-B` one after another (after creating A, use the TitleBar GroveSwitcher → `新建树林…` to create B; it should return to Picker, create, then go back to `/library`).

- [ ] **Step 2: Switch via TitleBar**

From `/library` showing `grove-B`:
- Open GroveSwitcher dropdown → click `grove-A` → window stays on `/library`, TitleBar title changes to `grove-A`.
- Devtools console:
  ```javascript
  window.api.on('project:changed', (p) => console.log('changed →', p?.name ?? 'null'))
  ```
  Then switch back to `grove-B` — one `changed → grove-B` line should print.

Clean up:
```bash
rm -rf ~/Desktop/grove-A ~/Desktop/grove-B
rm ~/.acornvo/recent-projects.json
```

Tick 9.8.

---

<!-- openspec-task: 9.9 -->
### Task 25: Acceptance 9.9 — `openspec validate --strict` passes + final commit

**Files:**
- Modify: `openspec/changes/phase-02-project-picker-grove/tasks.md` (tick all 9.x boxes)

- [ ] **Step 1: Run the validator**

```bash
openspec validate phase-02-project-picker-grove --strict
```

Expected: exit 0. No `ERROR` or `WARNING` lines.

If the validator complains:
- Missing capability coverage → go back to the task that implements it, add the missing piece.
- Unreachable scenarios → trace through manually; if a scenario cannot be tested in this phase, document the reason in a follow-up change proposal rather than patching the spec.

- [ ] **Step 2: Tick all acceptance boxes in `tasks.md`**

Flip every `- [ ] 9.X ...` to `- [x] 9.X ...` in `openspec/changes/phase-02-project-picker-grove/tasks.md`. Leave the earlier tick marks from Tasks 17–24 intact.

- [ ] **Step 3: Final typecheck, lint, and dev smoke**

```bash
npm run typecheck && npm run lint
npm run dev  # manual: Picker, TitleBar, switch, quit — everything reachable
```

Kill dev server.

- [ ] **Step 4: Commit**

```bash
git add openspec/changes/phase-02-project-picker-grove/tasks.md
git commit -m "chore(phase-02): all acceptance scenarios pass; openspec validate strict OK"
```

---

## Self-Review Checklist

Run this after every task in Plan 2 is checked off and before declaring the change ready to archive:

1. **Spec coverage — grove-management:**
   - [x] 新建树林 — Task 7 (`NewGroveDialog` → `createGrove`) ← covers 3 scenarios
   - [x] 打开已有目录 — Task 8 + Task 22 (Obsidian)
   - [x] `.acornvo/` 初始化幂等 — Plan 1 Task 9 + Plan 2 Task 22
   - [x] 实例锁 — Plan 1 Tasks 8+11, Plan 2 Tasks 14+15+20
   - [x] 最近打开列表 — Plan 1 Tasks 7+14, Plan 2 Tasks 6+21
   - [x] 同步目录告警 — Plan 1 Task 9 + Plan 2 Task 23
   - [x] 切换树林广播 — Plan 1 Task 12 + Plan 2 Task 24

2. **Spec coverage — app-bootstrap:** Plan 1 Tasks 20–23. This plan adds no new bootstrap behaviour.

3. **Spec coverage — app-shell:**
   - [x] TitleBar switcher — Tasks 10–13
   - [x] Hide on `/picker` — Task 12

4. **Placeholder scan:** no `TODO`, `later`, `handle edge cases`, or `similar to` strings in the plan.

5. **Type consistency:**
   - `GroveSummary`, `LockInfo`, `RecentItemView` used uniformly.
   - Component names used consistently: `ProjectCard`, `GroveSwitcher`, `TakeoverDialog`, `NewGroveDialog`, `TitleBar`.
   - i18n keys referenced in components all live in `zh-CN.json`.

6. **Commit count:** 23–25 commits (depending on whether Task 16's audit found gaps). `git log --oneline main..HEAD` should read as a linear, user-readable story.

If any box is unchecked, fix the gap before archiving the change.
