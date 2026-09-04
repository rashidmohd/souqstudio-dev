'use client'

import * as React from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { illustrationSrc, type IllustrationKey } from '@/lib/illustrations'
import { cn } from '@/lib/utils'

/**
 * EmptyState. Governed by the design skill → States, and by
 * references/component-inventory.md, which owns this signature.
 *
 * `kind` is required and has no default. Empty, zero-results and error are
 * three different screens saying three different things, and collapsing them is
 * the most common mistake in this area — the type refuses to let it happen.
 *
 * An illustration is only ever valid on `empty`. On zero-results it decorates a
 * search that failed; on an error it delays a decision.
 *
 * **Deviation from the inventory, stated rather than slipped in:** `action`
 * accepts `disabled` and `disabledReason`. E1-05 needs the offer books empty
 * state before the editor exists, and the two alternatives were both worse —
 * a CTA that navigates to a 404, or an empty state with no action at all. The
 * design system already requires that a disabled control show its reason on
 * screen; this makes that the only way to express one.
 */
type EmptyStateBase = {
  /** Names the space. Never "Nothing here yet." */
  title: string
  body: string
  action: {
    label: string
    onClick?: (() => void) | undefined
    disabled?: boolean | undefined
    /** Required when disabled — a dead button with no reason is a dead end. */
    disabledReason?: string | undefined
  }
  /** kind === 'error': whether retrying keeps what they typed. */
  retryPreservesInput?: boolean | undefined
  className?: string
}

/**
 * The illustration rule is in the type, not a runtime warning.
 *
 * `illustration` is reachable only on `empty`; on the other two the compiler
 * refuses it. Same idiom as Button, where `iconOnly` demands an `aria-label` —
 * the design system's rules are worth more enforced than documented.
 */
type EmptyStateProps = EmptyStateBase &
  (
    | { kind: 'empty'; illustration?: IllustrationKey | undefined }
    | { kind: 'zero-results' | 'error'; illustration?: never }
  )

export function EmptyState({
  kind,
  title,
  body,
  action,
  illustration,
  retryPreservesInput,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border-hairline border-border-subtle bg-surface px-6 py-12 text-center',
        className
      )}
    >
      {illustration ? (
        // Decoration: the title and body carry the meaning, so it is hidden
        // from assistive tech rather than given invented alt text.
        // `unoptimized` because the optimizer does nothing useful for a local
        // SVG, and `priority` is deliberately absent — an empty state is never
        // the largest contentful paint on a screen that matters.
        <Image
          src={illustrationSrc(illustration)}
          alt=""
          aria-hidden="true"
          width={280}
          height={180}
          unoptimized
          className="h-auto w-full max-w-xs"
        />
      ) : null}

      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="font-display text-heading text-primary">{title}</h2>
        <p className="font-ui text-body text-secondary">{body}</p>
      </div>

      <Button
        type="button"
        variant="primary"
        size="lg"
        disabled={action.disabled ?? false}
        {...(action.onClick ? { onClick: action.onClick } : {})}
      >
        {action.label}
      </Button>

      {action.disabled && action.disabledReason ? (
        <p className="font-ui text-body-sm text-muted">{action.disabledReason}</p>
      ) : null}

      {kind === 'error' && retryPreservesInput ? (
        <p className="font-ui text-body-sm text-muted">Nothing you entered has been lost.</p>
      ) : null}
    </div>
  )
}
