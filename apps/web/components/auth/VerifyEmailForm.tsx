'use client'

import { useRouter } from 'next/navigation'
import { OtpForm } from '@/components/auth/OtpForm'

export function VerifyEmailForm({
  sentTo,
  accountEmail,
  initialRetryAfterSeconds,
}: {
  /** Address a code is currently outstanding for, or null if none in this browser. */
  sentTo: string | null
  accountEmail: string
  initialRetryAfterSeconds: number
}) {
  const router = useRouter()

  return (
    <OtpForm
      sentTo={sentTo}
      initialRetryAfterSeconds={initialRetryAfterSeconds}
      submitLabel="Verify email"
      onSubmit={async (code) => {
        const res = await fetch('/api/v1/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
        const result = await res.json()
        if (result.error) return result.error.message

        router.push('/onboarding')
        router.refresh()
        return null
      }}
      onResend={async () => {
        const res = await fetch('/api/v1/auth/resend-verification', { method: 'POST' })
        const result = await res.json()
        // Retry-After is set by the 429; on success the next wait comes from
        // the same header, so the button starts counting immediately.
        const header = Number(res.headers.get('Retry-After') ?? 0)
        return {
          error: result.error ? result.error.message : null,
          retryAfterSeconds: Number.isFinite(header) ? header : 0,
        }
      }}
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">
          {sentTo ? 'Check your email' : 'Verify your email'}
        </h1>
        <p className="font-ui text-body text-secondary">
          {sentTo ? (
            'Verify your address to finish setting up your shop.'
          ) : (
            <>
              Send a code to <span className="text-primary">{accountEmail}</span> to finish
              setting up your shop.
            </>
          )}
        </p>
      </div>
    </OtpForm>
  )
}
