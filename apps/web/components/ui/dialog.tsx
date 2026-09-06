'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Dialog. Governed by the design skill → Components → Dialogs and → Destructive
 * actions, and by references/component-inventory.md, which owns this signature.
 *
 * Exactly one primary action and one optional secondary — the shape of the
 * props is what prevents a third. There is no `illustration` prop and there
 * will not be one: an illustration delays a decision the user has already
 * committed to.
 *
 * **Prefer undo over confirm.** This is for the genuinely irreversible. For
 * anything reversible, do it and offer an Undo in a toast.
 *
 * Built on `<dialog>` rather than a portal and a hand-rolled focus trap. The
 * platform already does the modal work — focus containment, inert background,
 * Escape — and does it more correctly than a reimplementation will.
 */
type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string | undefined
  /**
   * `default` is confirm width — one question and two buttons, which is what a
   * dialog is mostly for. `lg` is for the few that carry a *form*: at confirm
   * width a ten-field form becomes a narrow column taller than the viewport,
   * which is the shape E5-04's "add a product" had.
   *
   * Deliberately two values and not a free width. A dialog wide enough to need
   * a third is a screen.
   */
  size?: 'default' | 'lg' | undefined
  primaryAction: { label: string; onClick: () => void; destructive?: boolean; loading?: boolean }
  secondaryAction?: { label: string; onClick: () => void } | undefined
  children?: React.ReactNode
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = 'default',
  primaryAction,
  secondaryAction,
  children,
}: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const titleId = React.useId()
  const descriptionId = React.useId()

  React.useEffect(() => {
    const element = ref.current
    if (!element) return

    // showModal() is what makes the rest of the page inert and returns focus to
    // the trigger on close. Calling it twice throws, hence the open check.
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Escape fires `cancel`; the backdrop click fires `close` via the handler
      // below. Both route through onOpenChange so the parent stays the source
      // of truth for whether this is open.
      onCancel={(event) => {
        event.preventDefault()
        onOpenChange(false)
      }}
      onClose={() => onOpenChange(false)}
      onClick={(event) => {
        // A click landing on the dialog element itself is the backdrop — the
        // content sits in the inner div and stops there.
        if (event.target === ref.current) onOpenChange(false)
      }}
      className={cn(
        'w-full rounded-card border-hairline border-border-subtle bg-surface p-0',
        'text-primary',
        size === 'lg' ? 'max-w-2xl' : 'max-w-md',
        // The default UA centring relies on margin auto; keep it explicit.
        'm-auto',
        // **The body scrolls, not the dialog.** The UA stylesheet already caps a
        // dialog's height to the viewport and sets `overflow: auto`, so a tall
        // form did stay on screen — but the whole element scrolled, taking the
        // title and the buttons with it. An owner filling in a long form lost
        // both the heading telling them what they were doing and the way out.
        //
        // `open:flex` rather than `flex`, because the UA hides a dialog with
        // `display: none` until it has the `open` attribute; an unconditional
        // display would make every mounted dialog visible.
        'overflow-hidden open:flex open:flex-col'
      )}
      /*
       * `::backdrop` is deliberately left unstyled. The design system has no
       * scrim token — the only dark surface it defines is
       * --sq-ui-canvas-surround, which is the editor artboard surround and
       * opaque, so it is the wrong thing here. An alpha modifier on a token
       * (`bg-stone-900/40`) does not work either: these colours are bare
       * `var()` values without the `<alpha-value>` placeholder, so Tailwind
       * cannot compose opacity onto them.
       *
       * Inventing a raw rgba here would violate the no-raw-colour rule for
       * the sake of a default the browser already provides sensibly. Raised as
       * a gap instead — see the note in component-inventory.md.
       */
    >
      {/* **The inline padding is on each part, not on this container**, so the
          scroll area below can run the full width of the dialog. Padding here
          instead would end the scroll box 24px in from the edge and put the
          scrollbar hard against the fields, with the gap on the wrong side of
          it — and a focus ring on an input would clip against the same edge. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 py-6">
        <div className="flex shrink-0 flex-col gap-1 px-6">
          <h2 id={titleId} className="font-display text-heading text-primary">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="font-ui text-body text-secondary">
              {description}
            </p>
          ) : null}
        </div>

        {/* Wrapped only when there is something to wrap: an empty scroll box
            between the header and the buttons would double the gap on every
            confirm dialog, which is most of them. */}
        {children ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6">{children}</div>
        ) : null}

        {/* Primary sits at the inline end. Logical, not right — this ships in
            Arabic and the order has to mirror with the text direction. */}
        <div className="flex shrink-0 justify-end gap-2">
          {secondaryAction ? (
            <Button type="button" variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          ) : null}
          <Button
            type="button"
            // Danger solid is valid here and nowhere else.
            variant={primaryAction.destructive ? 'danger-solid' : 'primary'}
            loading={primaryAction.loading ?? false}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
