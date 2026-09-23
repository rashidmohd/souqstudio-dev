'use client'

import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * Textarea. Governed by the design skill → Components → Inputs, and by
 * `references/component-inventory.md`, which owns this signature.
 *
 * **The same shape as `Input`, deliberately.** Required `label`, hint below,
 * error superseding the hint and turning the border critical, `aria-invalid` and
 * `aria-describedby` wired the same way. A multi-line field that styled itself
 * differently would read as a different kind of control for no reason.
 *
 * **Plain text, and not a rich text editor.** The two fields that wanted this —
 * a shop's description and, later, anything else feeding a prompt — are read by
 * a model, not rendered. Markup in them is either stripped before the prompt, in
 * which case the owner's formatting was theatre, or it is not, in which case
 * `<strong>` ends up inside an instruction to a model. A rich text editor earns
 * its place where something actually renders the formatting; nothing here does.
 *
 * `maxLength` gets a live counter, because a field that silently stops accepting
 * characters reads as broken.
 */
type TextareaProps = {
  label: string
  hint?: string | undefined
  /** Renders below the field and turns the border critical. Never colour alone. */
  error?: string | undefined
  required?: boolean | undefined
  /** Visible lines before it scrolls. Four is a paragraph; the default. */
  rows?: number | undefined
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'>

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, required = false, rows = 4, className, id, ...props }, ref) => {
    const generatedId = React.useId()
    const fieldId = id ?? generatedId
    const hintId = `${fieldId}-hint`
    const errorId = `${fieldId}-error`
    const countId = `${fieldId}-count`

    /**
     * The counter reads the controlled value when there is one and falls back to
     * the uncontrolled default. It is display only — nothing here owns the value.
     */
    const value = typeof props.value === 'string' ? props.value : undefined
    const max = props.maxLength

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId} className="font-ui text-label font-medium text-primary">
          {label}
          {required ? (
            <span className="text-critical-fg" aria-hidden="true">
              {' *'}
            </span>
          ) : null}
        </label>

        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            cn(hint && hintId, error && errorId, max !== undefined && countId) || undefined
          }
          className={cn(
            'w-full rounded-control bg-input px-3 py-2',
            'font-ui text-body text-primary',
            'border border-border-strong',
            'placeholder:text-muted',
            'transition-colors duration-fast ease-sq',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
            'disabled:opacity-disabled',
            // Vertical only: a field that can be dragged wider than its column
            // breaks the form's grid, and nothing here wants that.
            'resize-y',
            error && 'border-critical-fg',
            className
          )}
          {...props}
        />

        {max === undefined || value === undefined ? null : (
          <p id={countId} className="font-ui text-body-sm text-muted">
            <span data-figure>{value.trim().length}</span> of <span data-figure>{max}</span>
          </p>
        )}

        {error ? (
          <p id={errorId} className="font-ui text-body-sm text-critical-fg">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="font-ui text-body-sm text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
