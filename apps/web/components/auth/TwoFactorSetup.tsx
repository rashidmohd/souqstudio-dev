'use client'

import * as React from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OtpInput } from '@/components/auth/OtpInput'
import { BackupCodesPanel } from '@/components/auth/BackupCodesPanel'

const TOTP_LENGTH = 6

type Enrollment = {
  otpauthUri: string
  qrDataUri: string
  manualKey: string
}

type Props = {
  accountEmail: string
  onCancel: () => void | Promise<void>
  /** Called once two-factor is on and the codes have been acknowledged. */
  onComplete: () => void
  /**
   * "Cancel" where setup is optional. Where it is compulsory there is nowhere
   * to cancel to, so the forced screen passes "Log out" instead.
   */
  cancelLabel?: string
}

/**
 * E1-03 — turning two-factor on.
 *
 * Four steps in one component, following the pattern ResetPasswordForm already
 * sets. Nothing is switched on until the confirm step succeeds: abandoning
 * anywhere before that leaves an enrollment row to expire and nothing on the
 * account.
 */
export function TwoFactorSetup({
  accountEmail,
  onCancel,
  onComplete,
  cancelLabel = 'Cancel',
}: Props) {
  const [step, setStep] = React.useState<'password' | 'scan' | 'confirm' | 'codes'>('password')
  const [password, setPassword] = React.useState('')
  const [enrollment, setEnrollment] = React.useState<Enrollment | null>(null)
  const [code, setCode] = React.useState('')
  const [backupCodes, setBackupCodes] = React.useState<string[]>([])
  const [showManualKey, setShowManualKey] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function startEnrollment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/auth/2fa/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = await res.json()

      if (result.error) {
        setError(result.error.message)
        return
      }

      setEnrollment(result.data)
      // The password has done its job. Holding it in state past this point
      // serves nothing and keeps it in a heap snapshot.
      setPassword('')
      setStep('scan')
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmEnrollment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (code.length !== TOTP_LENGTH) {
      setError(`Enter the ${TOTP_LENGTH}-digit code from your authenticator app.`)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/auth/2fa/enroll/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const result = await res.json()

      if (result.error) {
        setError(result.error.message)
        setCode('')
        // The enrollment is spent; there is nothing left to confirm against.
        if (
          result.error.code === 'no_pending_enrollment' ||
          result.error.code === 'too_many_attempts'
        ) {
          setEnrollment(null)
          setStep('password')
        }
        return
      }

      setBackupCodes(result.data.backupCodes)
      setStep('codes')
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const errorBlock = error ? (
    <p
      role="alert"
      className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
    >
      {error}
    </p>
  ) : null

  if (step === 'codes') {
    return (
      <BackupCodesPanel
        codes={backupCodes}
        accountEmail={accountEmail}
        onDone={onComplete}
        doneLabel="Finish"
      />
    )
  }

  if (step === 'password') {
    return (
      <form onSubmit={startEnrollment} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-heading text-primary">
            Turn on two-factor authentication
          </h2>
          <p className="font-ui text-body text-secondary">
            Confirm your password to begin. You will need an authenticator app
            such as Google Authenticator or Authy.
          </p>
        </div>

        {errorBlock}

        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting}
          size="lg"
          autoFocus
        />

        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="lg" loading={submitting}>
            Continue
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={confirmEnrollment} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading text-primary">Scan the QR code</h2>
        <p className="font-ui text-body text-secondary">
          Open your authenticator app, add an account, and scan this. Then enter
          the {TOTP_LENGTH}-digit code it shows.
        </p>
      </div>

      {errorBlock}

      {enrollment ? (
        <div className="flex flex-col items-center gap-3">
          <Image
            src={enrollment.qrDataUri}
            alt="QR code for setting up two-factor authentication"
            width={200}
            height={200}
            // A data URL, already generated server-side — there is nothing for
            // the image optimizer to fetch or cache.
            unoptimized
            className="rounded-card border-hairline border-border-subtle bg-surface p-2"
          />

          {showManualKey ? (
            <div className="flex w-full flex-col gap-1">
              <p className="font-ui text-body-sm text-secondary">
                Enter this key in your app instead:
              </p>
              <p
                className="select-all break-all rounded-control bg-sunken px-3 py-2 font-figure text-data text-primary"
                data-figure
              >
                {enrollment.manualKey}
              </p>
            </div>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setShowManualKey(true)}>
              Cannot scan it?
            </Button>
          )}
        </div>
      ) : null}

      <OtpInput
        label="Authentication code"
        value={code}
        onChange={setCode}
        length={TOTP_LENGTH}
        error={error !== null}
        disabled={submitting}
        autoFocus
      />

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          Turn on two-factor
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
