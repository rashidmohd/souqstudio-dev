'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { OtpInput } from '@/components/auth/OtpInput'
import { CodeInput } from '@/components/auth/CodeInput'

const TOTP_LENGTH = 6

type Props = {
  /** Which account is being signed into. Null if the row vanished under us. */
  email: string | null
  next: string
  hasBackupCodes: boolean
}

/**
 * E1-03 — enter the second factor.
 *
 * Two modes rather than one clever field. The server is told which kind of code
 * this is instead of guessing from its shape: the formats are similar enough
 * that sniffing works right up until it does not, and the error message has to
 * be able to say *which* kind was wrong. Someone who pastes a backup code into
 * the authenticator field and gets a flat "that code is not right" will burn
 * the attempt cap on a code they had correct all along.
 */
export function TwoFactorChallenge({ email, next, hasBackupCodes }: Props) {
  const router = useRouter()
  const [method, setMethod] = React.useState<'totp' | 'backup'>('totp')
  const [code, setCode] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const totpRef = React.useRef<HTMLInputElement>(null)
  const backupRef = React.useRef<HTMLInputElement>(null)

  function switchTo(nextMethod: 'totp' | 'backup') {
    setMethod(nextMethod)
    setCode('')
    setError(null)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (method === 'totp' && code.length !== TOTP_LENGTH) {
      setError(`Enter the ${TOTP_LENGTH}-digit code from your authenticator app.`)
      totpRef.current?.focus()
      return
    }
    if (method === 'backup' && code.length === 0) {
      setError('Enter one of your backup codes.')
      backupRef.current?.focus()
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/auth/2fa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, code }),
      })
      const result = await res.json()

      if (result.error) {
        setError(result.error.message)
        // A rejected code is worth clearing — retyping over a wrong one is
        // worse than starting clean.
        setCode('')
        // The challenge or the account is finished; there is nothing to retry
        // on this screen.
        if (
          result.error.code === 'no_pending_challenge' ||
          result.error.code === 'too_many_attempts'
        ) {
          router.push('/login')
          router.refresh()
          return
        }
        const field = method === 'totp' ? totpRef : backupRef
        field.current?.focus()
        return
      }

      router.push(result.data?.redirectTo ?? next)
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function useDifferentAccount() {
    await fetch('/api/v1/auth/2fa/challenge', { method: 'DELETE' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6 rounded-card border-hairline border-border-subtle bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Two-factor authentication</h1>
        <p className="font-ui text-body text-secondary">
          {method === 'totp'
            ? 'Enter the code from your authenticator app.'
            : 'Enter one of the backup codes you saved. Each one works once.'}
          {email ? (
            <>
              {' '}
              Signing in as <span className="text-primary">{email}</span>.
            </>
          ) : null}
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {error ? (
          <p
            role="alert"
            className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
          >
            {error}
          </p>
        ) : null}

        {method === 'totp' ? (
          <OtpInput
            ref={totpRef}
            label="Authentication code"
            value={code}
            onChange={setCode}
            length={TOTP_LENGTH}
            error={error !== null}
            autoFocus
            disabled={submitting}
          />
        ) : (
          <CodeInput
            ref={backupRef}
            label="Backup code"
            value={code}
            onChange={setCode}
            hint="Looks like A7K2-M9PQ-R4XT. Letters and numbers."
            error={error !== null}
            autoFocus
            disabled={submitting}
          />
        )}

        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          Continue
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        {method === 'totp' ? (
          hasBackupCodes ? (
            <Button type="button" variant="ghost" onClick={() => switchTo('backup')}>
              Use a backup code instead
            </Button>
          ) : (
            // Saying so beats offering a route that cannot work. Someone with
            // no codes left and no phone needs their owner, not another button.
            <p className="font-ui text-body-sm text-muted">
              You have no backup codes left. If you cannot reach your
              authenticator app, ask your organization owner to reset two-factor
              for you.
            </p>
          )
        ) : (
          <Button type="button" variant="ghost" onClick={() => switchTo('totp')}>
            Use your authenticator app instead
          </Button>
        )}

        <Button type="button" variant="ghost" onClick={useDifferentAccount}>
          Use a different account
        </Button>
      </div>
    </div>
  )
}
