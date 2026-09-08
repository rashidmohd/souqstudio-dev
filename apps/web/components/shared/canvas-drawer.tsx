'use client'

import * as React from 'react'
import { Layers, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The side panes of a canvas application, below the width they fit at.
 *
 * **The design system is explicit: side panels overlay the canvas, never
 * compress it.** Both canvases were doing a third thing, which is worse than
 * either — the panes were `w-full` in a `flex-col` under `lg`, so they *stacked*
 * and pushed the artboard off the bottom of the page. On a narrow window the
 * thing the screen exists to show was not on it, which is the same symptom as
 * the `lg:w-72` bug that `check:classes` was written for, arriving by a
 * different route.
 *
 * It is one component because `docs/E7-pending.md` §7 makes canvas parity a hard
 * rule: the designer and the offer book editor are the same shell with different
 * panes, and a drawer that behaved one way in one of them would be exactly the
 * divergence that rule exists to prevent. If one moves, both move.
 *
 * **No scrim, deliberately.** The system defines no scrim token — see the note
 * in `ui/dialog.tsx` — and inventing an rgba here to dim a canvas would break
 * the no-raw-colour rule for decoration. The pane is opaque and hairline-bordered
 * like every other surface, and the click-catcher behind it is transparent: it
 * closes the drawer without pretending to be a colour.
 */

export type DrawerSide = 'start' | 'end'

/**
 * Which pane is open, and only one is.
 *
 * Two open drawers on a 700px window is the whole canvas covered, which is the
 * bug this replaced. Opening one closes the other.
 */
export function useCanvasDrawer() {
  const [open, setOpen] = React.useState<DrawerSide | null>(null)

  return {
    open,
    close: React.useCallback(() => setOpen(null), []),
    toggle: React.useCallback(
      (side: DrawerSide) => setOpen((current) => (current === side ? null : side)),
      []
    ),
  }
}

/**
 * The two buttons that open them, and they exist only below `lg`.
 *
 * **Neither glyph is directional.** A panel-left icon is wrong in Arabic and
 * mirroring it is a second thing to get wrong; what these buttons actually name
 * is *layers* and *properties*, which read the same in both directions.
 */
export function CanvasDrawerToggles({
  open,
  onToggle,
  startLabel,
  endLabel,
}: {
  open: DrawerSide | null
  onToggle: (side: DrawerSide) => void
  startLabel: string
  endLabel: string
}) {
  return (
    <div className="flex items-center gap-2 border-b-hairline border-border-subtle bg-surface px-4 py-2 lg:hidden">
      <Button
        type="button"
        variant={open === 'start' ? 'secondary' : 'ghost'}
        aria-expanded={open === 'start'}
        onClick={() => onToggle('start')}
      >
        <Layers className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {startLabel}
      </Button>
      <Button
        type="button"
        variant={open === 'end' ? 'secondary' : 'ghost'}
        aria-expanded={open === 'end'}
        onClick={() => onToggle('end')}
      >
        <SlidersHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {endLabel}
      </Button>
    </div>
  )
}

/**
 * One pane: an overlay drawer below `lg`, a column in the row from `lg` up.
 *
 * The parent row has to be `relative` — the drawer is positioned against it
 * rather than the viewport, so it covers the canvas and not the header above it.
 *
 * **Toggled with `hidden`, not a transform.** Tailwind's translate utilities are
 * physical, so `-translate-x-full` slides an Arabic drawer the wrong way and the
 * fix is a second set of `rtl:` classes on every pane. A drawer that appears is
 * one rule; a drawer that slides correctly in both directions is four, and the
 * animation is not what the owner was missing.
 */
export function CanvasDrawer({
  side,
  open,
  onClose,
  className,
  children,
}: {
  side: DrawerSide
  open: boolean
  onClose: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close this panel"
          onClick={onClose}
          className="absolute inset-0 z-20 lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          'shrink-0 overflow-auto bg-surface',
          // Below lg: over the canvas, against the start or end edge, and as
          // wide as the pane wants unless the window is narrower than that.
          'absolute inset-y-0 z-30 max-w-full',
          open ? 'flex' : 'hidden',
          side === 'start'
            ? 'start-0 w-pane-start border-e-hairline border-border-subtle'
            : 'end-0 w-pane-end border-s-hairline border-border-subtle',
          // From lg: back in the flow, and the row lays the three out.
          'lg:static lg:z-auto lg:flex lg:max-w-none',
          side === 'start'
            ? 'lg:order-first lg:w-pane-start lg:border-e-hairline'
            : 'lg:w-pane-end lg:border-s-hairline',
          className
        )}
      >
        {children}
      </aside>
    </>
  )
}
