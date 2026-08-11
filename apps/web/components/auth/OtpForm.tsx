'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { OtpInput } from '@/components/auth/OtpInput'
import { formatCountdown } from '@/lib/wait'

const OTP_LENGTH = 6

type ResendOutcome = { error: string | null; retryAfterSeconds: number }

type Props = {
  /** Shown so they know which inbox to open. */
  sentTo: string | null
  submitLabel: string
  /** Returns an error message, or null on success. */
  onSubmit: (code: string) => Promise<string | null>
  /** Omitted where resending is not offered. */
  onResend?: (() => Promise<ResendOutcome>) | undefined
  /**
   * Seconds still to wait when the page loads, read from the server. Without
   * it a refresh would present a ready button that the server then refuses.
   */
  initialRetryAfterSeconds?: number
  children?: React.ReactNode
}

/**
 * Six-digit code entry, shared by email verification and password reset.
 *
 * One input rather than six boxes: six inputs need focus-shuffling, backspace
 * handling and paste-splitting to feel right, and they routinely defeat SMS and
 * password-manager autofill. One field with `one-time-code` autocomplete lets
 * the platform do it.
 */
export function OtpForm({
  sentTo,
  submitLabel,
  onSubmit,
  onResend,
  initialRetryAfterSeconds = 0,
  children,
}: Props) {
  const [code, setCode] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [resending, setResending] = React.useState(false)
  const [cooldown, setCooldown] = React.useState(initialRetryAfterSeconds)
  const codeRef = React.useRef<HTMLInputElement>(null)

  /**
   * Ticks the cooldown down to zero.
   *
   * The interval is cleared at zero rather than left running, and the server
   * remains the authority — this only decides what the button says. Editing the
   * countdown in devtools buys nothing; the endpoint still refuses.
   */
  React.useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => {
      setCooldown((remaining) => (remaining <= 1 ? 0 : remaining - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [cooldown])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)

    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code from your email.`)
      codeRef.current?.focus()
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const message = await onSubmit(code)
      if (message) {
        setError(message)
        // Clear only on a rejected code — retyping six digits over a wrong one
        // is worse than starting clean.
        setCode('')
        codeRef.current?.focus()
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (!onResend || cooldown > 0) return

    setResending(true)
    setError(null)
    try {
      const outcome = await onResend()
      // Trust the server's wait over the local clock in both directions — it is
      // the only one that decides.
      setCooldown(outcome.retryAfterSeconds)

      if (outcome.error) {
        setError(outcome.error)
        setNotice(null)
      } else {
        setNotice('A new code is on its way. The previous one no longer works.')
        setCode('')
        codeRef.current?.focus()
      }
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-card border-hairline border-border-subtle bg-surface p-6">
      {children}

      {sentTo ? (
        <p className="font-ui text-body text-secondary">
          We sent a {OTP_LENGTH}-digit code to <span className="text-primary">{sentTo}</span>.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {error ? (
          <p
            role="alert"
            className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="rounded-control bg-positive-bg px-3 py-2 font-ui text-body-sm text-positive-fg"
          >
            {notice}
          </p>
        ) : null}

        <OtpInput
          ref={codeRef}
          label="Verification code"
          value={code}
          onChange={setCode}
          length={OTP_LENGTH}
          error={error !== null}
          autoFocus
          disabled={submitting}
        />

        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          {submitLabel}
        </Button>
      </form>

      {onResend ? (
        <div className="flex items-center justify-between gap-4">
          <p className="font-ui text-body-sm text-secondary">
            {cooldown > 0 ? 'Check your spam folder too.' : 'No code in your inbox?'}
          </p>
          {/* Disabled only while genuinely on cooldown, and the remaining time
              is on the button itself — a disabled control whose reason is not
              on screen is a dead end. */}
          <Button
            type="button"
            variant="ghost"
            loading={resending}
            disabled={cooldown > 0}
            onClick={handleResend}
          >
            {cooldown > 0 ? `Send a new code in ${formatCountdown(cooldown)}` : 'Send a new code'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
