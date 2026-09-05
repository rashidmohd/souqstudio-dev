'use client'

import * as React from 'react'
import Image from 'next/image'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { illustrationSrc, type IllustrationKey } from '@/lib/illustrations'
import { cn } from '@/lib/utils'

/**
 * FileDropzone. Governed by the design skill → Components, and by
 * references/component-inventory.md, which owns this signature.
 *
 * A bordered area that takes one file, by drop or by button. It replaces the
 * bare `<input type="file">` that E5-04 and E5-06 were shipping — an unstyled
 * native control is the one widget in the product that looks like no other, and
 * on a phone it reads as broken rather than as plain.
 *
 * **The button is not decoration around the drop target; it is the only way in
 * that works for everyone.** Dragging has no keyboard equivalent and no
 * touchscreen equivalent, so a dropzone whose only affordance is the drop is
 * unusable with a keyboard and unusable on the device most of these owners
 * actually hold. The input stays in the DOM, `sr-only`, and the button clicks
 * it — the same arrangement `LogoField` already uses, kept identical on purpose
 * so the two do not drift.
 *
 * **One file.** Every caller wants one — a logo, a packshot, a price list — and
 * a drop of five with four silently discarded is worse than a drop of five that
 * says so.
 */
type FileDropzoneProps = {
  /** Names what goes here. Rendered as the zone's heading, not a placeholder. */
  label: string
  /** Passed to the input's `accept`, and used to filter a drop. */
  accept: string
  onFile: (file: File) => void
  /** What is acceptable — formats, size limits. Always say this before the drop. */
  hint?: string | undefined
  error?: string | undefined
  /** Disables both paths and puts the button in its loading state. */
  busy?: boolean | undefined
  disabled?: boolean | undefined
  /** Defaults to "Choose a file". */
  buttonLabel?: string | undefined
  /**
   * Only valid where the zone is a first-run prompt with nothing in progress —
   * the same test the design system applies to `EmptyState`, where artwork is
   * permitted on `empty` and refused on zero-results and error. A dropzone
   * sitting in a form the owner is halfway through does not get one.
   */
  illustration?: IllustrationKey | undefined
  /** A preview of what has been chosen, rendered inside the zone. */
  children?: React.ReactNode
}

export function FileDropzone({
  label,
  accept,
  onFile,
  hint,
  error,
  busy = false,
  disabled = false,
  buttonLabel = 'Choose a file',
  illustration,
  children,
}: FileDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)

  /**
   * Drag events bubble, so moving the cursor from the zone onto the button
   * inside it fires `dragleave` on the zone. Counting enter and leave instead
   * of setting a boolean is what stops the highlight flickering off every time
   * the pointer crosses a child — the classic bug in every hand-rolled
   * dropzone, and invisible until someone drags slowly.
   */
  const depth = React.useRef(0)

  const inert = busy || disabled
  const hintId = React.useId()
  const errorId = React.useId()

  function accepts(file: File): boolean {
    // The `accept` attribute is advisory on a drop — the browser enforces it in
    // the picker and not at all here — so the same list is applied by hand.
    // A wrong file type caught now is a clear message; caught by the server it
    // is a round trip and a stranger one.
    const patterns = accept.split(',').map((entry) => entry.trim().toLowerCase())
    if (patterns.length === 0) return true

    return patterns.some((pattern) => {
      if (pattern.startsWith('.')) return file.name.toLowerCase().endsWith(pattern)
      if (pattern.endsWith('/*')) return file.type.startsWith(pattern.slice(0, -1))
      // Some browsers hand over an empty `type` for a .csv. Falling back to the
      // extension is what stops a valid file being refused on one machine and
      // accepted on another.
      return file.type.toLowerCase() === pattern
    })
  }

  function take(file: File | undefined) {
    if (!file || inert) return
    if (accepts(file)) onFile(file)
  }

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault()
        depth.current += 1
        if (!inert) setDragging(true)
      }}
      onDragOver={(event) => {
        // Without this the browser navigates away to the dropped file and the
        // owner loses the page they were on. The single most important line here.
        event.preventDefault()
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        depth.current -= 1
        if (depth.current <= 0) {
          depth.current = 0
          setDragging(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        depth.current = 0
        setDragging(false)
        take(event.dataTransfer.files[0])
      }}
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border border-dashed p-6 text-center',
        'transition-colors duration-fast ease-sq',
        dragging
          ? 'border-border-focus bg-selected-bg'
          : 'border-border-strong bg-surface',
        error && !dragging && 'border-critical-fg',
        inert && 'opacity-disabled'
      )}
    >
      {illustration ? (
        <Image
          src={illustrationSrc(illustration)}
          alt=""
          aria-hidden="true"
          width={220}
          height={150}
          unoptimized
          className="h-auto w-full max-w-xs"
        />
      ) : null}

      {children}

      <div className="flex flex-col gap-1">
        <p className="font-display text-heading text-primary">{label}</p>
        {/* The drop is announced as the secondary path, because it is: the
            button below is what a keyboard or a phone will use. */}
        <p className="font-ui text-body text-secondary">
          Drop it here, or choose it from your device.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={inert}
        aria-describedby={cn(hint && hintId, error && errorId) || undefined}
        aria-invalid={error ? true : undefined}
        className="sr-only"
        onChange={(event) => {
          take(event.target.files?.[0])
          // Reset so choosing the same file twice still fires a change — the
          // owner who fixed the file and picked it again expects it to work.
          event.target.value = ''
        }}
      />

      <Button
        type="button"
        variant="primary"
        size="lg"
        loading={busy}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" aria-hidden="true" />
        {buttonLabel}
      </Button>

      {error ? (
        <p id={errorId} role="alert" className="font-ui text-body-sm text-critical-fg">
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
