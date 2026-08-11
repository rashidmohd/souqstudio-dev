'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GoogleButton, AuthDivider } from '@/components/auth/GoogleButton'

/**
 * E1-02 login.
 *
 * Form rules from the design skill: validate on blur, re-validate on change once
 * a field has errored, never disable submit to enforce validation, preserve
 * everything typed when the server rejects it, and move focus to the first error.
 */

// `| undefined` is explicit for exactOptionalPropertyTypes — clearing a field's
// error means assigning undefined, not omitting the key.
type Errors = { email?: string | undefined; password?: string | undefined }

export function LoginForm({ next, showGoogle }: { next: string; showGoogle: boolean }) {
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [rememberMe, setRememberMe] = React.useState(false)
  const [errors, setErrors] = React.useState<Errors>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const emailRef = React.useRef<HTMLInputElement>(null)
  const passwordRef = React.useRef<HTMLInputElement>(null)

  function validate(): Errors {
    const found: Errors = {}
    if (!email.trim()) found.email = 'Enter your email address.'
    else if (!email.includes('@')) found.email = 'That does not look like an email address.'
    if (!password) found.password = 'Enter your password.'
    return found
  }

  /** Only re-validate a field that has already errored, so typing clears it. */
  function revalidate(field: keyof Errors) {
    if (!errors[field]) return
    setErrors((prev) => ({ ...prev, [field]: validate()[field] }))
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const found = validate()
    setErrors(found)
    if (found.email || found.password) {
      // Move focus to the first problem rather than leaving them to hunt.
      const firstBad = found.email ? emailRef : passwordRef
      firstBad.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      })
      const result = await res.json()

      if (result.error) {
        // Nothing is cleared — they keep what they typed.
        setFormError(result.error.message)
        passwordRef.current?.focus()
        return
      }

      // Two-factor is on: the password was only half of it. Carry `next`
      // across the challenge so finishing it still lands where they meant to
      // go — the redirect the server hands back does not know about it.
      if (result.data?.twoFactorRequired) {
        router.push(`/login/2fa?next=${encodeURIComponent(next)}`)
        router.refresh()
        return
      }

      // An unverified owner is sent to verification regardless of where they
      // were originally headed — finishing it is the only thing they can do.
      router.push(result.data?.redirectTo ?? next)
      router.refresh()
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-card border-hairline border-border-subtle bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Welcome back</h1>
        <p className="font-ui text-body text-secondary">Log in to your offer books.</p>
      </div>

      {showGoogle ? (
        <div className="flex flex-col gap-4">
          <GoogleButton label="Continue with Google" />
          <AuthDivider />
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? (
          // Errors needing no decision stay inline. role=alert so it is announced.
          <p
            role="alert"
            className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
          >
            {formError}
          </p>
        ) : null}

        <Input
          size="lg"
          ref={emailRef}
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="owner@yourshop.ae"
          value={email}
          error={errors.email}
          onChange={(e) => {
            setEmail(e.target.value)
            revalidate('email')
          }}
          onBlur={() => setErrors((prev) => ({ ...prev, email: validate().email }))}
        />

        <Input
          size="lg"
          ref={passwordRef}
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          error={errors.password}
          onChange={(e) => {
            setPassword(e.target.value)
            revalidate('password')
          }}
          onBlur={() => setErrors((prev) => ({ ...prev, password: validate().password }))}
        />

        <div className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 font-ui text-body-sm text-secondary">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="size-4 rounded-chip border border-border-strong"
            />
            Keep me logged in
          </label>
          <Link
            href="/forgot-password"
            className="font-ui text-body-sm text-link underline-offset-2 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {/* Never disabled to enforce validation — a dead button with no
            explanation is a dead end. It submits, then shows what is wrong. */}
        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          Log in
        </Button>
      </form>

      <p className="font-ui text-body-sm text-secondary">
        New to SouqStudio?{' '}
        <Link href="/signup" className="text-link underline-offset-2 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}
