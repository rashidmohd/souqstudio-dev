'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { TwoFactorSetup } from '@/components/auth/TwoFactorSetup'

/**
 * E1-03 — the enrollment screen someone lands on because their organization
 * requires two-factor, rather than because they chose to set it up.
 *
 * No cancel. There is nowhere to cancel *to* — every dashboard route sends them
 * straight back here — and a button that returns you to the screen you are on
 * is worse than no button. Signing out is the honest escape, so that is what is
 * offered.
 */
export function ForcedTwoFactorSetup({
  accountEmail,
  canEnroll,
}: {
  accountEmail: string
  canEnroll: boolean
}) {
  const router = useRouter()

  return (
    <div className="flex flex-col gap-6 rounded-card border-hairline border-border-subtle bg-surface p-6">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-1 size-4 shrink-0 text-caution-fg" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-title text-primary">
            Your organization requires two-factor
          </h1>
          <p className="font-ui text-body text-secondary">
            Set it up to get back to your offer books. It takes about a minute and
            needs an authenticator app on your phone.
          </p>
        </div>
      </div>

      {canEnroll ? (
        <TwoFactorSetup
          accountEmail={accountEmail}
          // Finishing lands them where they were trying to go in the first place.
          onComplete={() => {
            router.push('/')
            router.refresh()
          }}
          onCancel={async () => {
            await fetch('/api/v1/auth/logout', { method: 'POST' })
            router.push('/login')
            router.refresh()
          }}
          cancelLabel="Log out"
        />
      ) : (
        <p className="font-ui text-body-sm text-muted">
          Your account signs in with Google and has no password, which two-factor
          setup needs. Ask your organization owner to help you set a password
          first.
        </p>
      )}
    </div>
  )
}
