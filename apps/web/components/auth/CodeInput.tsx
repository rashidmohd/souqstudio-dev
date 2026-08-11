'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Alphanumeric recovery-code entry. E1-03 backup codes.
 *
 * A sibling of OtpInput, not a mode of it. OtpInput strips every non-digit on
 * the way in, which is right for a six-digit code from an email and fatal for
 * `A7K2-M9PQ-R4XT`. Widening it with an `alphabet` prop would mean changing a
 * built primitive that the verify-email and reset-password flows already
 * depend on, to serve a control with different ergonomics — one wide field
 * rather than six boxes, because twelve boxes is a wall.
 *
 * It normalizes as you type rather than at submit, so what is on screen is
 * exactly what will be checked. Crockford transcription is applied here for the
 * same reason it is applied on the server: someone reading a printout will type
 * I for 1 and O for 0, and that is our ambiguity to absorb, not theirs.
 *
 * The normalization deliberately mirrors normalizeBackupCode in
 * lib/backup-codes.ts. It is duplicated rather than imported because that
 * module is server-side; if the alphabet ever changes, both move together.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const GROUP_SIZE = 4

function normalize(input: string): string {
  return input
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .split('')
    .filter((character) => ALPHABET.includes(character))
    .join('')
}

function group(value: string): string {
  return (value.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g')) ?? []).join('-')
}

type CodeInputProps = {
  label: string
  /** The bare code, no hyphens. Grouping is presentation only. */
  value: string
  onChange: (value: string) => void
  length?: number | undefined
  hint?: string | undefined
  error?: boolean | undefined
  autoFocus?: boolean | undefined
  disabled?: boolean | undefined
}

export const CodeInput = React.forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
  { label, value, onChange, length = 12, hint, error = false, autoFocus = false, disabled = false },
  ref
) {
  const id = React.useId()
  const hintId = `${id}-hint`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-ui text-label font-medium text-primary">
        {label}
      </label>

      <input
        ref={ref}
        id={id}
        // Shown grouped, held bare. Typing a hyphen is a no-op rather than an
        // error, because the printout has hyphens in it.
        value={group(value)}
        onChange={(event) => onChange(normalize(event.target.value).slice(0, length))}
        inputMode="text"
        // Not `one-time-code`: that hint makes the platform offer the SMS or
        // email code, which is the other field on this screen.
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={error || undefined}
        aria-describedby={hint ? hintId : undefined}
        className={cn(
          'h-control-lg w-full rounded-control bg-input px-3',
          // Mono and tabular so every character sits on the same grid — a
          // recovery code is read one glyph at a time off a printed page.
          'font-figure text-data text-primary tabular-nums',
          'border border-border-strong',
          'transition-colors duration-fast ease-sq',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
          'disabled:opacity-disabled',
          error && 'border-critical-fg'
        )}
      />

      {hint ? (
        <p id={hintId} className="font-ui text-body-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
})
