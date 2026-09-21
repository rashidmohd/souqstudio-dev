'use client'

import * as React from 'react'
import { ChevronRight } from 'lucide-react'

/**
 * A foldable group of controls in the editor's settings rail.
 *
 * **Because the Layout tab outgrew the rail.** It holds eleven controls now —
 * the track counts, the offer card, the margin, the gap, and each band's preview
 * with a height and a width — and the two things an owner opens it for, "three
 * across" and "what is along the bottom", had drifted a scroll apart. Folding is
 * cheaper than another tab: a tab would ask them to know which of two screens
 * the header lives on, which is the question the tool rail already answers once.
 *
 * **Native `<details>`, which is the standing rule here** — `Dialog` is the
 * platform's `<dialog>` and `Select` a real `<select>`, because the platform
 * does modal, keyboard and assistive semantics better than a re-implementation
 * and for free. The marker is ours only because the browser default is a
 * disclosure triangle nobody styled.
 *
 * **Open or closed is remembered per browser, not per account.** It is a view
 * preference with no consequence: nothing renders differently, nobody else sees
 * it, and a column in the database for which panel somebody left folded would be
 * a migration to answer a question `localStorage` answers. Wrapped, because it
 * throws in a private window and returns nothing in a preview — the section
 * simply opens at its default there, which is the right answer.
 *
 * A feature component rather than a design-system primitive: it is a `<details>`
 * with a heading, not a new control, so it is not in the component inventory. If
 * a third screen wants one, that is when it earns promotion — the same rule
 * `BlockTile` was promoted under.
 */

type Props = {
  /** The section's name. Sentence case, as every heading here is. */
  title: string
  /**
   * What it says when folded — "3 across · 12 pages", "Ramadan band".
   *
   * **The point of folding rather than hiding.** A closed section that names
   * only itself makes an owner open all three to find where something lives; one
   * that says what it currently holds is often the only thing they needed.
   */
  summary?: React.ReactNode
  /** Open the first time this browser sees it. */
  defaultOpen?: boolean
  /** Where the preference is kept. Omitted means it is not remembered. */
  rememberAs?: string
  children: React.ReactNode
}

export function PanelSection({ title, summary, defaultOpen = true, rememberAs, children }: Props) {
  const [open, setOpen] = React.useState(defaultOpen)

  /**
   * Read the remembered state after mount, never during render.
   *
   * The server has no `localStorage`, so reading it in the initial state would
   * make the first client render disagree with the HTML that came down —
   * React's hydration mismatch, which resolves by throwing the markup away.
   * Starting at the default and correcting in an effect costs one frame.
   */
  React.useEffect(() => {
    if (rememberAs === undefined) return
    try {
      const stored = window.localStorage.getItem(`sq_panel_${rememberAs}`)
      if (stored === 'open' || stored === 'closed') setOpen(stored === 'open')
    } catch {
      // A private window, or site data blocked. The default stands.
    }
  }, [rememberAs])

  function remember(next: boolean) {
    setOpen(next)
    if (rememberAs === undefined) return
    try {
      window.localStorage.setItem(`sq_panel_${rememberAs}`, next ? 'open' : 'closed')
    } catch {
      // Not remembering is not a failure worth telling anybody about.
    }
  }

  return (
    <details open={open} onToggle={(event) => remember(event.currentTarget.open)}>
      {/*
        **A solid row rather than a line of text with a chevron.**

        The first build separated the sections with hairlines and left the
        headings bare, which made three faint labels floating in the rail: the
        thing an owner presses did not look like a thing, and the focus ring
        landed on a box narrower than the row it belonged to. A filled row at the
        full width of the rail says "press me" without a border around every
        section, and the fill is `sunken` — the surface tone the system already
        uses for a recessed strip. Separation by surface tone rather than by a
        box is the design system's own rule.

        **Both tones are `--sq-ui-*` rather than the stone ramp.** Dark mode
        redefines the UI surfaces and leaves the ramp where it is, so a raw
        `stone-200` hover would go light on a dark rail — the same trap
        `CLAUDE.md` records for `bg-blue`. A sunken row lifting to the surface
        tone reads as rising under the pointer, and it is right in both themes.

        `list-none` and the `::-webkit-details-marker` reset both: the first
        covers every engine honouring the modern property, the second is Safari,
        which still draws its own triangle without it.
      */}
      <summary
        className="flex cursor-pointer list-none items-center gap-2 rounded-control bg-sunken px-2 py-2 hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus [&::-webkit-details-marker]:hidden"
      >
        <ChevronRight
          className={`size-4 shrink-0 text-secondary transition-transform duration-fast ease-sq rtl:-scale-x-100 ${
            open ? 'rotate-90 rtl:-rotate-90' : ''
          }`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="font-ui text-eyebrow uppercase tracking-wide text-secondary">
          {title}
        </span>
        {/* Only when folded: open, the controls themselves say it, and a summary
            repeating them is a second answer to keep in step. */}
        {open || summary === undefined ? null : (
          <span className="ms-auto min-w-0 truncate font-ui text-body-sm text-muted">
            {summary}
          </span>
        )}
      </summary>

      {/* Inset from the row above it, so the controls read as belonging to the
          section rather than as the next thing down the rail. */}
      <div className="flex flex-col gap-3 px-1 pb-2 pt-3">{children}</div>
    </details>
  )
}
