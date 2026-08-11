'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { TwoFactorSetup } from '@/components/auth/TwoFactorSetup'
import { BackupCodesPanel } from '@/components/auth/BackupCodesPanel'
import { ReauthFields, EMPTY_REAUTH, type ReauthValue } from '@/components/auth/ReauthFields'

const LOW_WATERMARK = 3

type Teammate = {
  id: string
  email: string
  name: string | null
  twoFactorEnabled: boolean
}

type Props = {
  accountEmail: string
  enabled: boolean
  enabledAt: string | null
  backupCodesRemaining: number
  canEnroll: boolean
  isOwner: boolean
  orgRequired: boolean
  orgRequiredSince: string | null
  teammates: Teammate[]
}

/** Every action here needs the same proof, so they share one dialog shape. */
type PendingAction =
  | { kind: 'disable' }
  | { kind: 'regenerate' }
  | { kind: 'policy'; required: boolean }
  | { kind: 'reset'; teammate: Teammate }

export function TwoFactorSettings({
  accountEmail,
  enabled,
  enabledAt,
  backupCodesRemaining,
  canEnroll,
  isOwner,
  orgRequired,
  orgRequiredSince,
  teammates,
}: Props) {
  const router = useRouter()
  const [setupOpen, setSetupOpen] = React.useState(false)
  const [pending, setPending] = React.useState<PendingAction | null>(null)
  const [reauth, setReauth] = React.useState<ReauthValue>(EMPTY_REAUTH)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [freshCodes, setFreshCodes] = React.useState<string[] | null>(null)

  function closeDialog() {
    setPending(null)
    setReauth(EMPTY_REAUTH)
    setError(null)
  }

  async function submitPending() {
    if (!pending) return

    const request = {
      disable: { url: '/api/v1/auth/2fa/disable', method: 'POST', body: reauth },
      regenerate: { url: '/api/v1/auth/2fa/backup-codes', method: 'POST', body: reauth },
      policy: {
        url: '/api/v1/auth/2fa/org-policy',
        method: 'PATCH',
        body: { ...reauth, required: pending.kind === 'policy' && pending.required },
      },
      reset: {
        url: '/api/v1/auth/2fa/reset',
        method: 'POST',
        body: { ...reauth, userId: pending.kind === 'reset' ? pending.teammate.id : '' },
      },
    }[pending.kind]

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(request.url, {
        method: request.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.body),
      })
      const result = await res.json()

      if (result.error) {
        setError(result.error.message)
        return
      }

      // Regenerating is the one action whose result must be shown before the
      // page reloads — the codes exist in this response and nowhere else.
      if (pending.kind === 'regenerate') {
        setFreshCodes(result.data.backupCodes)
        setPending(null)
        setReauth(EMPTY_REAUTH)
        return
      }

      closeDialog()
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (freshCodes) {
    return (
      <Card>
        <BackupCodesPanel
          codes={freshCodes}
          accountEmail={accountEmail}
          onDone={() => {
            setFreshCodes(null)
            router.refresh()
          }}
        />
      </Card>
    )
  }

  if (setupOpen) {
    return (
      <Card>
        <TwoFactorSetup
          accountEmail={accountEmail}
          onCancel={() => setSetupOpen(false)}
          onComplete={() => {
            setSetupOpen(false)
            router.refresh()
          }}
        />
      </Card>
    )
  }

  const dialogTitle = {
    disable: 'Turn off two-factor authentication',
    regenerate: 'Generate new backup codes',
    policy: 'Change the organization policy',
    reset: 'Reset two-factor for a teammate',
  }

  const dialogPrimary = {
    disable: 'Turn off two-factor',
    regenerate: 'Replace my codes',
    policy: 'Save policy',
    reset: 'Reset their two-factor',
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Two-factor ─────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck
                className={enabled ? 'mt-1 size-4 shrink-0 text-positive-fg' : 'mt-1 size-4 shrink-0 text-muted'}
                aria-hidden="true"
              />
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-heading text-primary">
                  Two-factor authentication
                </h2>
                <p className="font-ui text-body-sm text-secondary">
                  {enabled
                    ? 'A code from your authenticator app is required every time you log in.'
                    : 'Add a code from your phone on top of your password.'}
                </p>
                {enabled && enabledAt ? (
                  <p className="font-ui text-body-sm text-muted">
                    On since{' '}
                    <span data-figure>
                      {new Date(enabledAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {enabled ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <p className="font-ui text-body-sm text-secondary">
                  Backup codes remaining:{' '}
                  <span className="text-primary" data-figure>
                    {backupCodesRemaining}
                  </span>
                </p>
                {backupCodesRemaining <= LOW_WATERMARK ? (
                  <p className="font-ui text-body-sm text-caution-fg">
                    {backupCodesRemaining === 0
                      ? 'You have none left. Without a backup code, losing your phone means asking your organization owner to reset two-factor for you.'
                      : 'Running low. Generating a new set replaces every code you have now.'}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setPending({ kind: 'regenerate' })}>
                  Generate new backup codes
                </Button>
                {orgRequired ? (
                  // Disabled with the reason on screen beside it, not in a
                  // tooltip. The owner is bound by their own policy too.
                  <div className="flex flex-col gap-1">
                    <Button type="button" variant="danger" disabled>
                      Turn off two-factor
                    </Button>
                    <p className="font-ui text-body-sm text-muted">
                      Your organization requires two-factor, so it cannot be
                      turned off.
                    </p>
                  </div>
                ) : (
                  <Button type="button" variant="danger" onClick={() => setPending({ kind: 'disable' })}>
                    Turn off two-factor
                  </Button>
                )}
              </div>
            </div>
          ) : canEnroll ? (
            <div>
              <Button type="button" variant="primary" onClick={() => setSetupOpen(true)}>
                Turn on two-factor
              </Button>
            </div>
          ) : (
            <p className="font-ui text-body-sm text-muted">
              Set a password on your account before turning on two-factor
              authentication.
            </p>
          )}
        </div>
      </Card>

      {/* ── Organization policy ────────────────────────────────────────── */}
      {isOwner ? (
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-heading text-primary">
                Require two-factor for everyone
              </h2>
              <p className="font-ui text-body-sm text-secondary">
                Everyone in your organization is asked to set up two-factor
                before they can use SouqStudio. Nobody is locked out — they are
                sent here to set it up.
              </p>
              {orgRequired && orgRequiredSince ? (
                <p className="font-ui text-body-sm text-muted">
                  Required since{' '}
                  <span data-figure>
                    {new Date(orgRequiredSince).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </p>
              ) : null}
            </div>

            {!enabled && !orgRequired ? (
              <div className="flex flex-col gap-1">
                <Button type="button" variant="secondary" disabled>
                  Require two-factor
                </Button>
                <p className="font-ui text-body-sm text-muted">
                  Turn on two-factor for your own account first.
                </p>
              </div>
            ) : (
              <div>
                <Button
                  type="button"
                  variant={orgRequired ? 'danger' : 'secondary'}
                  onClick={() => setPending({ kind: 'policy', required: !orgRequired })}
                >
                  {orgRequired ? 'Stop requiring two-factor' : 'Require two-factor'}
                </Button>
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {/* ── Teammates ──────────────────────────────────────────────────── */}
      {isOwner && teammates.length > 0 ? (
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-heading text-primary">Your team</h2>
              <p className="font-ui text-body-sm text-secondary">
                If someone loses their phone and their backup codes, reset their
                two-factor so they can set it up again. This signs them out
                everywhere.
              </p>
            </div>

            <ul className="flex flex-col">
              {teammates.map((teammate) => (
                <li
                  key={teammate.id}
                  className="flex min-h-row flex-wrap items-center justify-between gap-2 border-b-hairline border-border-subtle py-2 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-ui text-body text-primary">
                      {teammate.name ?? teammate.email}
                    </span>
                    <span className="truncate font-ui text-body-sm text-muted">
                      {teammate.twoFactorEnabled ? 'Two-factor on' : 'Two-factor off'}
                    </span>
                  </div>
                  {teammate.twoFactorEnabled ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setPending({ kind: 'reset', teammate })}
                    >
                      Reset two-factor
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}

      {/* One dialog for all four, because all four ask for the same proof. */}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
        title={pending ? dialogTitle[pending.kind] : ''}
        description={
          pending?.kind === 'reset'
            ? `${pending.teammate.email} will be signed out everywhere and asked to set two-factor up again.`
            : pending?.kind === 'regenerate'
              ? 'Your current backup codes stop working immediately.'
              : pending?.kind === 'disable'
                ? 'Your account will be protected by your password alone.'
                : undefined
        }
        primaryAction={{
          label: pending ? dialogPrimary[pending.kind] : '',
          onClick: submitPending,
          destructive: pending?.kind === 'disable' || pending?.kind === 'reset',
          loading: submitting,
        }}
        secondaryAction={{ label: 'Cancel', onClick: closeDialog }}
      >
        <div className="flex flex-col gap-4">
          {error ? (
            <p
              role="alert"
              className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
            >
              {error}
            </p>
          ) : null}

          <ReauthFields
            value={reauth}
            onChange={setReauth}
            requireSecondFactor={enabled}
            disabled={submitting}
            error={error !== null}
          />
        </div>
      </Dialog>
    </div>
  )
}
