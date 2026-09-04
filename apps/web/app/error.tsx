'use client'

import * as React from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { illustrationSrc } from '@/lib/illustrations'

/**
 * The error boundary. Until now there was none, so an unhandled exception
 * produced Next.js's default screen — with a stack trace in development and a
 * blank apology in production, neither of which tells a shop owner what to do.
 *
 * **The raw error is never shown.** The design system's rule is that an error
 * says what happened and what to do, in one sentence, with no first person and
 * no raw exception strings. What is shown is the `digest` — the hash Next
 * attaches to a server error so it can be found in the logs. That gives support
 * something to search for without putting internals on screen.
 *
 * `reset()` re-renders the segment rather than reloading the page, so anything
 * held in a client store above the boundary survives the retry.
 *
 * **Not an `EmptyState`.** That component forbids an illustration on
 * `kind="error"`, deliberately — inside a screen, artwork above a failure
 * delays the decision the owner has to make. A full-page boundary is a
 * different surface: there is no task in progress to delay, and the drawing is
 * what stops the page reading as a crash.
 *
 * Errors thrown by the root layout itself are not caught here — that needs
 * `global-error.tsx`, which has to ship its own `<html>` and `<body>`. Not
 * written yet; see docs/E4-pending.md.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // Sentry is in the stack but not yet wired; until it is, the console is
    // the only place this is recoverable from in production.
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page px-4 py-12 text-center">
      <Image
        src={illustrationSrc('error-generic')}
        alt=""
        aria-hidden="true"
        width={280}
        height={180}
        unoptimized
        className="h-auto w-full max-w-xs"
      />

      <div className="flex max-w-sm flex-col gap-1">
        <h1 className="font-display text-title text-primary">That did not load</h1>
        <p className="font-ui text-body text-secondary">
          Something went wrong on our side. Nothing you saved has been lost —
          try again, and if it keeps happening the code below will help support
          find it.
        </p>
      </div>

      <div className="mt-2 flex flex-col items-center gap-2">
        <Button type="button" variant="primary" onClick={reset}>
          Try again
        </Button>

        {error.digest ? (
          <p className="font-ui text-body-sm text-muted">
            Reference <Figure value={error.digest} size="data-sm" />
          </p>
        ) : null}
      </div>
    </div>
  )
}
