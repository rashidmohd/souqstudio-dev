'use client'

import Image from 'next/image'
import { Button } from '@/components/ui/button'

/**
 * Google sign-in. E1-01 and E1-02 — the one federated provider in scope.
 * SSO/SAML is Enterprise and explicitly out of scope, so there is no generic
 * "sign in with SSO" here.
 *
 * `secondary`, not `primary`: the screen already has one primary action, and
 * two competing fills would ask the owner to choose before they have read
 * either. The design system allows exactly one primary per region.
 *
 * The mark is an asset rather than inline paths because Google's brand colours
 * are fixed hex values, which component code may not carry.
 */
export function GoogleButton({ label }: { label: string }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="w-full"
      onClick={() => {
        // Full navigation, not fetch: OAuth is a redirect handshake with Google.
        window.location.href = '/api/v1/auth/google'
      }}
    >
      <Image src="/icons/google.svg" alt="" width={18} height={18} aria-hidden="true" />
      {label}
    </Button>
  )
}

/** "or" rule between the federated and password paths. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border-subtle" />
      <span className="font-ui text-body-sm text-muted">or</span>
      <span className="h-px flex-1 bg-border-subtle" />
    </div>
  )
}
