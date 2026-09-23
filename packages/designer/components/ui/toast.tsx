'use client'

import * as React from 'react'
import { create } from 'zustand'
import { AlertCircle, AlertTriangle, Check, Info } from 'lucide-react'
import { Button } from './button'
import { cn } from '../../lib/utils'

/**
 * Toast. Governed by the design skill → Components → Toasts and inline alerts,
 * and → Destructive actions, and by references/component-inventory.md, which
 * owns this signature.
 *
 * **The props are the inventory's, unchanged. What is new here is the mounting
 * mechanism**, which is the reason this component sat at `spec` from E2 to now:
 * the signature existed and there was no provider, portal or store to show one
 * through, so three screens shipped inline `role="alert"` banners instead and
 * `E2-pending.md` §3 recorded it as a deliberate compromise. The compromise it
 * forced is the expensive one — *"the design system prefers undo over confirm,
 * and undo lives in the toast that does not exist"* — so pausing and
 * reactivating a shop ask for confirmation of a reversible act, and removing an
 * offer could not be undone at all.
 *
 * **One imperative call, not a hook.** A toast is raised from an event handler
 * that has already decided what happened — after a fetch resolves, inside a
 * catch — and a hook would put a subscription in every component that ever
 * reports anything. `toast()` is callable from anywhere on the client;
 * `<Toaster />` mounts once in the dashboard layout and is the only subscriber.
 *
 * **Anchored bottom inline-start**, per the design system, so RTL places it on
 * the correct side with no second rule.
 */
export type ToastTone = 'default' | 'positive' | 'critical' | 'caution'

export type ToastProps = {
  /** Single line. Errors that need a decision belong in a dialog, not here. */
  message: string
  tone?: ToastTone
  /** Where Undo lives. */
  action?: { label: string; onClick: () => void }
}

/**
 * How long a toast stays.
 *
 * **A toast carrying an action is the action's whole window.** Once it goes the
 * owner has no way back, so an undoable removal gets long enough to notice the
 * card has gone, look at the message and decide — and hovering or focusing it
 * stops the clock, because someone reading it is someone still deciding.
 */
const DURATION = { plain: 5000, withAction: 10000 } as const

/** Three is the ceiling. A fourth is a screen reporting more than it should. */
const LIMIT = 3

type ToastEntry = ToastProps & { id: number }

type ToastState = {
  toasts: ToastEntry[]
  push: (toast: ToastProps) => void
  dismiss: (id: number) => void
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) =>
    set((state) => ({
      // Monotonic rather than random: two toasts raised in the same tick must
      // not collide on a key, and nothing here is persisted or addressable.
      toasts: [...state.toasts, { ...toast, id: nextId() }].slice(-LIMIT),
    })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((entry) => entry.id !== id) })),
}))

let counter = 0
function nextId() {
  counter += 1
  return counter
}

/** Raise a toast. Callable from any client component or handler. */
export function toast(props: ToastProps) {
  useToastStore.getState().push(props)
}

/**
 * The live region. Mounted once, in the dashboard layout.
 *
 * **The region is in the DOM before any message is**, which is what makes a
 * screen reader announce one: a container that appears at the same moment as
 * its content is frequently missed. It is `polite` because nothing raised here
 * is an emergency — an error that must interrupt is a dialog.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div
      // `pointer-events-none` on the region and `auto` on each toast: the strip
      // spans the viewport's corner and would otherwise swallow clicks on the
      // page underneath it between messages.
      className="pointer-events-none fixed bottom-4 start-4 z-50 flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((entry) => (
        <ToastItem key={entry.id} entry={entry} onDismiss={() => dismiss(entry.id)} />
      ))}
    </div>
  )
}

function ToastItem({ entry, onDismiss }: { entry: ToastEntry; onDismiss: () => void }) {
  const [shown, setShown] = React.useState(false)
  const [held, setHeld] = React.useState(false)

  // Two frames, not one: a node inserted and restyled in the same frame
  // transitions from nothing, so the browser needs to have painted the closed
  // state before the open one is set.
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  React.useEffect(() => {
    if (held) return
    const timer = setTimeout(
      onDismiss,
      entry.action === undefined ? DURATION.plain : DURATION.withAction
    )
    return () => clearTimeout(timer)
  }, [held, entry.action, onDismiss])

  const tone = entry.tone ?? 'default'
  const Icon = ICON[tone]

  return (
    <div
      className={cn(
        'pointer-events-auto flex min-h-control items-center gap-2 rounded-control',
        'border-hairline px-3 py-2 font-ui text-body-sm',
        // Opacity and transform only. Anything that moves a box's width or
        // height stutters on the tablets these shops actually use.
        'transition duration-base ease-sq',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
        TONE[tone]
      )}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <Icon className={cn('size-icon shrink-0', ICON_TONE[tone])} aria-hidden="true" strokeWidth={2} />
      {/* One line. `truncate` rather than wrapping: the inventory says single
          line, and a toast that grows to three pushes itself off its anchor. */}
      <span className="truncate text-primary">{entry.message}</span>
      {entry.action === undefined ? null : (
        <Button
          type="button"
          variant="ghost"
          className="shrink-0"
          onClick={() => {
            entry.action?.onClick()
            onDismiss()
          }}
        >
          {entry.action.label}
        </Button>
      )}
    </div>
  )
}

/** Surface tone and a hairline, never elevation — there are no shadows here. */
const TONE: Record<ToastTone, string> = {
  default: 'bg-surface border-border-strong',
  positive: 'bg-positive-bg border-positive-fg',
  critical: 'bg-critical-bg border-critical-fg',
  caution: 'bg-caution-bg border-caution-fg',
}

const ICON: Record<ToastTone, typeof Info> = {
  default: Info,
  positive: Check,
  critical: AlertCircle,
  caution: AlertTriangle,
}

const ICON_TONE: Record<ToastTone, string> = {
  default: 'text-muted',
  positive: 'text-positive-fg',
  critical: 'text-critical-fg',
  caution: 'text-caution-fg',
}

/**
 * The visual alone, with no store behind it.
 *
 * Exported because the inventory names `Toast` and a component in the inventory
 * has to be a thing you can render — a story, a test, a screen that wants one
 * inline. Every real caller should use `toast()`.
 */
export function Toast({ message, tone = 'default', action }: ToastProps) {
  return (
    <ToastItem
      entry={{ id: 0, message, tone, ...(action === undefined ? {} : { action }) }}
      onDismiss={() => undefined}
    />
  )
}
