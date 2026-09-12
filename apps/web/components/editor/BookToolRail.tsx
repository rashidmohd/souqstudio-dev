'use client'

import * as React from 'react'
import {
  LayoutGrid,
  PaintBucket,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  ShoppingBasket,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * The offer book editor's tool rail. E6 — `docs/E6-create-flow.md` §12.
 *
 * **The same strip the card designer has, and deliberately so.** A shop owner
 * moving between designing a card and building a book should not have to learn
 * a second way to find things, and every application this product is modelled
 * on — Figma, Canva, Illustrator — puts a narrow vertical rail on the start
 * edge. `ToolRail` in the designer is the sibling; this matches its button
 * treatment, its dividers and its collapse toggle exactly.
 *
 * **It replaced a row of tabs, on the argument that tabs do not grow.** Four
 * fitted across the top of the pane. Eight will not, and this pane will keep
 * gaining things — export, sharing, seasonal scheduling — so a control that
 * caps out at the width of the pane is a control that has to be replaced later.
 * A rail grows down an edge that has room. That was the owner's call and it is
 * the right one; the tabs version is in the history if it is ever wanted back.
 *
 * **What it does *not* copy is the designer's meaning of "tool".** There, a
 * tool makes something — a rectangle, a text field — and the rail is a palette.
 * Nothing in an offer book is placed by hand: the artboard is engine output, and
 * the composition model is explicit that owners "do not place cards, draw slots,
 * or free-position anything". So a tool here selects *which settings the panel
 * is showing*. Same control, different noun, and the panel heading is what says
 * which.
 *
 * **Every button has a name.** An icon rail is fast for people who know it and
 * opaque for people who do not, and the difference is a tooltip: `title` for the
 * pointer, `aria-label` for the screen reader. The design system permits
 * icon-only controls in an editor toolbar on condition the same action is
 * reachable with a visible label elsewhere — the panel beside the rail carries
 * the active tool's name as its heading, which is that.
 */

export type BookTool = 'offers' | 'layout' | 'background' | 'pins'

type ToolSpec = {
  key: BookTool
  label: string
  icon: LucideIcon
}

/**
 * The four, in the order an owner reaches for them: what is in the book, how
 * the page is shaped, what the page looks like, and what is parked on one page.
 *
 * **Icons chosen for what they already mean**, not invented. A basket is the
 * things you are selling; a grid is the page; the paint bucket is the same glyph
 * the designer uses for a ground, which is the nearest thing this product has to
 * a convention for "background"; a pin is a pin, and `PinsPanel` already uses it.
 *
 * **Exported, because the panel heading reads from it.** One list naming the
 * tools, rather than a rail and a heading that can disagree about what the
 * background tool is called.
 */
export const BOOK_TOOLS: ToolSpec[] = [
  { key: 'offers', label: 'Offers', icon: ShoppingBasket },
  { key: 'layout', label: 'Layout', icon: LayoutGrid },
  { key: 'background', label: 'Background', icon: PaintBucket },
  { key: 'pins', label: 'Pins', icon: Pin },
]

export function labelForTool(tool: BookTool): string {
  return BOOK_TOOLS.find((spec) => spec.key === tool)?.label ?? ''
}

type Props = {
  tool: BookTool
  onSelect: (tool: BookTool) => void
  /** Whether the settings panel beside the rail is showing. */
  panelOpen: boolean
  onTogglePanel: () => void
}

export function BookToolRail({ tool, onSelect, panelOpen, onTogglePanel }: Props) {
  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label="Offer book tools"
      className="flex w-tool-rail shrink-0 flex-col items-center gap-1 border-e-hairline border-border-subtle py-2"
    >
      {BOOK_TOOLS.map((spec) => (
        <ToolButton
          key={spec.key}
          label={spec.label}
          icon={spec.icon}
          active={tool === spec.key}
          onClick={() => onSelect(spec.key)}
        />
      ))}

      {/*
        The panel toggle, last and below a divider — it is chrome rather than a
        tool, and grouping it with the four would say it selects something.

        **It lives on the rail because the rail is what survives the collapse.**
        A toggle inside the panel can only ever close it; the way back has to be
        somewhere still on screen. Same reasoning as the designer's layer toggle
        and the dashboard rail's own.
      */}
      <Divider />
      <ToolButton
        label={panelOpen ? 'Hide settings' : 'Show settings'}
        icon={panelOpen ? PanelLeftClose : PanelLeftOpen}
        active={!panelOpen}
        onClick={onTogglePanel}
      />
    </div>
  )
}

const Divider = () => <span className="my-1 h-px w-4 bg-border-subtle" aria-hidden="true" />

/**
 * One tool.
 *
 * `title` and `aria-label` carry the same string on purpose: the pointer gets
 * the native tooltip, the screen reader gets the name, and neither depends on a
 * tooltip component that would have to be built, positioned and dismissed.
 *
 * `aria-pressed` rather than `aria-selected`: this is a toolbar of toggles, not
 * a tablist. A tablist would owe a roving tabindex and arrow-key movement, and
 * would promise that each button reveals a panel *of the same kind* — which is
 * true here, but the collapse toggle sitting in the same strip is not a tab and
 * would have to be excluded from it. A toolbar describes what this is.
 */
function ToolButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  icon: LucideIcon
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={[
        'flex size-control-lg items-center justify-center rounded-control',
        active ? 'bg-selected-bg text-selected-fg' : 'text-secondary hover:bg-stone-100',
      ].join(' ')}
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}
