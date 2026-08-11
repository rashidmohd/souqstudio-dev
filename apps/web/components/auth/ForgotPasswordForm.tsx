'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * E1-02 — request a reset code.
 *
 * The screen never reveals whether the address has an account, matching the
 * endpoint. It always advances to the code screen, so an attacker learns
 * nothing from the UI either.
 */
export function ForgotPasswordForm() {
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const emailRef = React.useRef<HTMLInputElement>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email.trim() || !email.includes('@')) {
      setError('Enter the email address on your account.')
      emailRef.current?.focus()
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      // Always forward, whatever the answer was.
      router.push('/reset-password')
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-card border-hairline border-border-subtle bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Reset your password</h1>
        <p className="font-ui text-body text-secondary">
          Enter your email and we&apos;ll send you a code.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input
          size="lg"
          ref={emailRef}
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="owner@yourshop.ae"
          value={email}
          error={error ?? undefined}
          onChange={(e) => {
            setEmail(e.target.value)
            if (error) setError(null)
          }}
        />

        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          Send code
        </Button>
      </form>

      <p className="font-ui text-body-sm text-secondary">
        Remembered it?{' '}
        <Link href="/login" className="text-link underline-offset-2 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
