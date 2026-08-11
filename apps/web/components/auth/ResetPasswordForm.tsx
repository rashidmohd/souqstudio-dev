'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OtpInput } from '@/components/auth/OtpInput'

const MIN_PASSWORD_LENGTH = 10

/**
 * E1-02 password reset, in two steps: confirm the code, then choose a password.
 *
 * One screen asking for both was doing two unrelated things at once — reading a
 * code off a phone and inventing a password — and the design system asks for one
 * decision per screen in this flow.
 *
 * The code is checked on step one but **not spent**; /reset-password redeems it
 * with the password. Abandoning at step two therefore costs nothing, where
 * spending it early would push the owner into the resend cooldown for changing
 * their mind.
 */
export function ResetPasswordForm({ sentTo }: { sentTo: string | null }) {
  const router = useRouter()
  const [step, setStep] = React.useState<'code' | 'password'>('code')
  const [code, setCode] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [passwordError, setPasswordError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const codeRef = React.useRef<HTMLInputElement>(null)
  const passwordRef = React.useRef<HTMLInputElement>(null)

  // Focus the password field as step two appears, so the flow does not stall on
  // a screen the owner has to click into first.
  React.useEffect(() => {
    if (step === 'password') passwordRef.current?.focus()
  }, [step])

  async function onCodeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (code.length !== 6) {
      setError('Enter the 6-digit code from your email.')
      codeRef.current?.focus()
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/auth/verify-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error.message)
        setCode('')
        codeRef.current?.focus()
        return
      }
      setStep('password')
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function onPasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      passwordRef.current?.focus()
      return
    }

    setSubmitting(true)
    setPasswordError(null)
    setError(null)
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, password }),
      })
      const result = await res.json()
      if (result.error) {
        // A code that died between the two steps — expired, or replaced by a
        // newer one. Send them back rather than leaving them on a screen whose
        // submit can no longer succeed.
        setStep('code')
        setCode('')
        setError(result.error.message)
        return
      }

      // Deliberately not auto-logged-in: typing the new password once confirms
      // it reached the password manager.
      router.push('/login')
      router.refresh()
    } catch {
      setPasswordError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-card border-hairline border-border-subtle bg-surface p-6">
      {step === 'code' ? (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-title text-primary">Enter your code</h1>
            <p className="font-ui text-body text-secondary">
              {sentTo ? (
                <>
                  We sent a 6-digit code to <span className="text-primary">{sentTo}</span>.
                </>
              ) : (
                <>Enter the 6-digit code from your email.</>
              )}
            </p>
          </div>

          <form onSubmit={onCodeSubmit} noValidate className="flex flex-col gap-4">
            {error ? (
              <p
                role="alert"
                className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
              >
                {error}
              </p>
            ) : null}

            <OtpInput
              ref={codeRef}
              label="Verification code"
              value={code}
              onChange={setCode}
              error={error !== null}
              autoFocus
              disabled={submitting}
            />

            <Button type="submit" variant="primary" size="lg" loading={submitting}>
              Continue
            </Button>
          </form>

          <p className="font-ui text-body-sm text-secondary">
            No code?{' '}
            <Link
              href="/forgot-password"
              className="text-link underline-offset-2 hover:underline"
            >
              Send another
            </Link>
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-title text-primary">Choose a new password</h1>
            <p className="font-ui text-body text-secondary">
              Your code is confirmed. Setting a new password signs you out everywhere else.
            </p>
          </div>

          <form onSubmit={onPasswordSubmit} noValidate className="flex flex-col gap-4">
            <Input
              size="lg"
              ref={passwordRef}
              label="New password"
              type="password"
              autoComplete="new-password"
              hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
              value={password}
              error={passwordError ?? undefined}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError(null)
              }}
            />

            <Button type="submit" variant="primary" size="lg" loading={submitting}>
              Set new password
            </Button>
          </form>

          {/* A way back, because the code screen is where a mistyped code gets
              fixed. Ghost, so it does not compete with the primary action. */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setStep('code')
              setPasswordError(null)
            }}
          >
            Back
          </Button>
        </>
      )}
    </div>
  )
}
