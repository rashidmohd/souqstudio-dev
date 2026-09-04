import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { illustrationSrc } from '@/lib/illustrations'

export const metadata: Metadata = { title: 'Page not found · SouqStudio' }

/**
 * 404. The first SouqStudio-shaped page for a URL that does not resolve.
 *
 * Until now there was none, so a mistyped or stale link produced Next.js's
 * default screen — unbranded, in English only, and with no way back into the
 * product. A shop owner who lands there cannot tell whether they broke
 * something or we did.
 *
 * **Not an `EmptyState`.** That component is for a place inside the product
 * that has no content yet; this is a place that does not exist. Reusing it
 * would mean passing `kind="empty"`, which would be a lie about which of the
 * three states this is — the distinction the type exists to protect.
 *
 * No rail: this renders outside `(dashboard)`, and it has to work for someone
 * who is not signed in. One way out, home, which the middleware will redirect
 * to login if the session has gone.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page px-4 py-12 text-center">
      <Image
        src={illustrationSrc('error-not-found')}
        alt=""
        aria-hidden="true"
        width={280}
        height={180}
        unoptimized
        className="h-auto w-full max-w-xs"
      />

      <div className="flex max-w-sm flex-col gap-1">
        <h1 className="font-display text-title text-primary">This page has moved on</h1>
        <p className="font-ui text-body text-secondary">
          The link you followed does not lead anywhere. It may have been changed
          or removed since you saved it.
        </p>
      </div>

      <Link
        href="/"
        className="mt-2 inline-flex min-h-control items-center rounded-pill bg-action-primary px-4 font-ui text-body font-medium text-action-primary-fg transition-colors duration-fast ease-sq hover:bg-action-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        Back to your offer books
      </Link>
    </div>
  )
}
