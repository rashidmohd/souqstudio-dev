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
  primaryAction: { label: string; onClick: () => void; destructive?: boolean; loading?: boolean }
  secondaryAction?: { label: string; onClick: () => void } | undefined
  children?: React.ReactNode
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
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
        'w-full max-w-md rounded-card border-hairline border-border-subtle bg-surface p-0',
        'text-primary',
        // The default UA centring relies on margin auto; keep it explicit.
        'm-auto'
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
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="font-display text-heading text-primary">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="font-ui text-body text-secondary">
              {description}
            </p>
          ) : null}
        </div>

        {children}

        {/* Primary sits at the inline end. Logical, not right — this ships in
            Arabic and the order has to mirror with the text direction. */}
        <div className="flex justify-end gap-2">
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
