'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * One of a set of choices, as a card you press rather than a dot you aim at.
 *
 * **Local to the creation flow, deliberately, and this is the `BrandCard`
 * precedent rather than a new primitive.** The component inventory is explicit:
 * a composition of existing pieces that one screen needs stays with that screen,
 * and comes through the inventory only if a second screen wants it. This is used
 * twice — the kind step and the products step — and both are this wizard.
 *
 * It grew out of `SourceChoice`, which was local to `NewBookForm` and did the
 * same job for the two-way source choice that screen had.
 *
 * **A radio in substance.** The browser's own grouping is what makes arrow keys
 * move between them, and the `<label>` wrapping the input is what makes the
 * whole card a target at 44px on a phone rather than a 16px dot beside one. The
 * input is `sr-only` rather than `hidden` — hidden takes it out of the
 * accessibility tree and out of the tab order with it.
 */
type Props = {
  /** Shared by every card in one set. This is what groups them for the keyboard. */
  name: string
  checked: boolean
  onSelect: () => void
  title: string
  body: string
  /** 16px, `strokeWidth={1.75}`, and always decorative: the title is the label. */
  icon?: React.ReactNode
  /** A preview, a thumbnail, anything the choice is better shown than described. */
  children?: React.ReactNode
  disabled?: boolean
  /** Shown instead of `body` when disabled. A disabled control states its reason
   *  on the screen, never in a tooltip, which is unreachable on tablet. */
  disabledReason?: string
}

export function ChoiceCard({
  name,
  checked,
  onSelect,
  title,
  body,
  icon,
  children,
  disabled = false,
  disabledReason,
}: Props) {
  return (
    <label
      className={cn(
        'flex flex-1 cursor-pointer flex-col gap-2 rounded-card border-hairline p-3',
        'transition-colors duration-fast',
        checked ? 'border-border-focus bg-selected-bg' : 'border-border-subtle',
        disabled ? 'cursor-not-allowed opacity-disabled' : 'hover:bg-stone-100'
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="sr-only"
      />

      {children}

      <span className="flex items-start gap-2">
        {icon ? (
          <span aria-hidden="true" className="mt-px shrink-0 text-secondary">
            {icon}
          </span>
        ) : null}
        <span className="flex flex-col">
          <span className="font-ui text-body font-medium text-primary">{title}</span>
          <span className="font-ui text-body-sm text-muted">
            {disabled && disabledReason ? disabledReason : body}
          </span>
        </span>
      </span>
    </label>
  )
}
