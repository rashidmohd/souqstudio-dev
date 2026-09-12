'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Tabs. Governed by the design skill → Components → Tabs, and specified in
 * `references/component-inventory.md` long before anything built it.
 *
 * **Underline, and there is nothing to choose.** No `variant` prop: pill tabs
 * and boxed tabs do not exist in this system, so a prop offering them would be
 * a prop with one legal value. 2px `--sq-ui-border-focus` under the active
 * label, a hairline rule under the row, active label `--sq-ui-text-primary` and
 * the rest `--sq-ui-text-secondary`.
 *
 * **RTL needs nothing special and that is the point.** The underline is a border
 * on the label, so it follows the label; the row is a flex row, so its order
 * reverses with the layout. A design that drew the underline as a positioned
 * element would need a second implementation for Arabic.
 *
 * ## Keyboard
 *
 * A tablist is not a row of buttons, and the difference is the thing most
 * implementations get wrong. WAI-ARIA's pattern is a **roving tabindex**: the
 * row is one tab stop, and arrows move between the tabs inside it. Making each
 * tab its own tab stop means someone keyboarding through a screen with four
 * tabs takes four presses to get past them, and gets no arrow keys either.
 *
 * Home and End jump to the ends. Selection follows focus, which is right when
 * switching is instant and wrong when it is expensive — every panel this
 * switches is already rendered client-side.
 */
export type TabItem = { value: string; label: string }

type Props = {
  items: TabItem[]
  value: string
  onValueChange: (value: string) => void
  /** Names the row for a screen reader. A tablist with no name is a list of
   *  words whose purpose is only visible on screen. */
  label: string
  className?: string
}

export function Tabs({ items, value, onValueChange, label, className }: Props) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  function move(from: number, delta: number) {
    if (items.length === 0) return
    // Wraps, which is what the pattern specifies: End then Right returns to the
    // first tab rather than stopping dead.
    const next = items[(from + delta + items.length) % items.length]
    if (next === undefined) return
    onValueChange(next.value)
    refs.current[next.value]?.focus()
  }

  function jump(to: 'first' | 'last') {
    const next = to === 'first' ? items[0] : items[items.length - 1]
    if (next === undefined) return
    onValueChange(next.value)
    refs.current[next.value]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'flex items-stretch gap-4 overflow-x-auto border-b-hairline border-border-subtle',
        className
      )}
    >
      {items.map((item, index) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[item.value] = node
            }}
            type="button"
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={active}
            aria-controls={`panel-${item.value}`}
            // The roving part. Only the active tab is in the document's tab
            // order; the arrows reach the rest.
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => {
              // Logical, not physical: in an Arabic layout the visually-left
              // arrow should move the way the layout runs. `ArrowRight` means
              // "towards the end" here and the row itself is already mirrored,
              // so the two agree without a direction prop.
              if (event.key === 'ArrowRight') return move(index, 1)
              if (event.key === 'ArrowLeft') return move(index, -1)
              if (event.key === 'Home') {
                event.preventDefault()
                return jump('first')
              }
              if (event.key === 'End') {
                event.preventDefault()
                return jump('last')
              }
            }}
            className={cn(
              'min-h-control whitespace-nowrap border-b-2 px-1 font-ui text-body transition-colors duration-fast',
              active
                ? 'border-border-focus text-primary'
                : 'border-transparent text-secondary hover:text-primary'
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The panel a tab controls.
 *
 * Paired with the tab through `aria-labelledby`, so a screen reader announces
 * which tab this belongs to rather than reading an unnamed region. `tabIndex={0}`
 * because the panel scrolls: a scrollable region that cannot be focused cannot
 * be scrolled from the keyboard.
 */
export function TabPanel({
  value,
  active,
  children,
  className,
}: {
  value: string
  active: boolean
  children: React.ReactNode
  className?: string
}) {
  // `hidden` rather than unmounting. A panel that unmounts loses whatever the
  // owner had half-done in it — a gradient mid-edit, a pin form partly filled —
  // and switching tabs is not an action that should discard work.
  return (
    <div
      role="tabpanel"
      id={`panel-${value}`}
      aria-labelledby={`tab-${value}`}
      hidden={!active}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  )
}
