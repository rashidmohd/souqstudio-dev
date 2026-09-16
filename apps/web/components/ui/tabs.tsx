'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Tabs. Governed by the design skill → Components → Tabs, and by
 * `references/component-inventory.md`, which owns this signature.
 *
 * **Built once, removed, and now built again for a different job.** The offer
 * book editor shipped a tab row over its settings pane on 12 September and it
 * came straight back out, because *tabs do not grow*: four fitted the pane and
 * eight would not, and that pane keeps gaining things. The inventory's own
 * conclusion was that this is an argument against tabs for a **set that grows**,
 * not against tabs — "a settings screen with three fixed sections is a good fit".
 *
 * The brand kit is that case. Its sections are the facets of a brand kit — logo,
 * colours, type, character — which is a list that changed once in six months and
 * got *shorter* when the block library moved to the main nav. If it starts
 * growing again, this is the wrong control and `BookToolRail` is the precedent
 * for what replaces it.
 *
 * **The two things the inventory says a builder gets wrong**, both handled here:
 *
 * - **A tablist is not a row of buttons.** It carries a roving tabindex: the row
 *   is one tab stop, arrows move between tabs inside it, Home and End jump to
 *   the ends. Each tab being its own tab stop means four presses to get past a
 *   four-tab row and no arrow keys at all.
 * - **Panels hide, they do not unmount.** That is the caller's job — see
 *   `TabPanel` below — because switching tabs must not discard half-finished
 *   work. The brand kit's colours section holds unsaved edits, and losing them
 *   to a tab press would be the worst bug this screen could have.
 */

export type TabItem = { value: string; label: string }

type TabsProps = {
  items: TabItem[]
  value: string
  onValueChange: (value: string) => void
  /**
   * Names the row for a screen reader. A tablist with no accessible name is a
   * row of words whose purpose is visible only on screen.
   */
  label: string
  className?: string | undefined
}

export function Tabs({ items, value, onValueChange, label, className }: TabsProps) {
  const refs = React.useRef(new Map<string, HTMLButtonElement>())

  function move(to: number) {
    const next = items[(to + items.length) % items.length]
    if (next === undefined) return
    onValueChange(next.value)
    // Focus follows selection, which is the automatic-activation pattern and
    // what the underline is already implying.
    refs.current.get(next.value)?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        move(index + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        move(index - 1)
        break
      case 'Home':
        event.preventDefault()
        move(0)
        break
      case 'End':
        event.preventDefault()
        move(items.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      /**
       * Scrolls rather than wraps. A tab row broken over two lines stops reading
       * as one control — the same thing the magic block dialog's kind picker
       * does with its segments.
       */
      className={cn(
        '-mx-1 flex gap-4 overflow-x-auto border-b border-border-subtle px-1',
        className
      )}
    >
      {items.map((item, index) => {
        const selected = item.value === value

        return (
          <button
            key={item.value}
            ref={(node) => {
              if (node) refs.current.set(item.value, node)
              else refs.current.delete(item.value)
            }}
            type="button"
            role="tab"
            id={tabId(item.value)}
            aria-selected={selected}
            aria-controls={panelId(item.value)}
            // The roving tabindex. Exactly one tab in the row is reachable by
            // Tab; the arrows do the rest.
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'shrink-0 whitespace-nowrap border-b-2 pb-2 pt-1 font-ui text-label',
              'transition-colors duration-fast ease-sq',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
              selected
                ? 'border-action-primary text-primary'
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
 * One panel. **Hidden with `hidden`, never unmounted.**
 *
 * The `hidden` attribute rather than a conditional render, so the panel's own
 * state — a half-typed palette name, an upload in progress — survives a tab
 * press. `[hidden]` is already `display: none !important` in the reset.
 */
export function TabPanel({
  value,
  active,
  children,
}: {
  value: string
  active: string
  children: React.ReactNode
}) {
  const selected = value === active

  return (
    <div
      role="tabpanel"
      id={panelId(value)}
      aria-labelledby={tabId(value)}
      hidden={!selected}
      // A panel is focusable so that Tab from the row lands in its content
      // rather than skipping past it.
      tabIndex={selected ? 0 : -1}
      className="flex flex-col gap-4 focus-visible:outline-none"
    >
      {children}
    </div>
  )
}

const tabId = (value: string) => `tab-${value}`
const panelId = (value: string) => `panel-${value}`
