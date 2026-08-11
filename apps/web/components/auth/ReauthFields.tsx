'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { OtpInput } from '@/components/auth/OtpInput'
import { CodeInput } from '@/components/auth/CodeInput'
import { Button } from '@/components/ui/button'

/**
 * Password plus a live second factor — the proof every route that weakens
 * two-factor asks for. E1-03.
 *
 * Shared by disable, regenerating backup codes, the org-wide policy switch and
 * resetting a teammate, so those four cannot drift into asking for different
 * things.
 */
export type ReauthValue = {
  password: string
  method: 'totp' | 'backup'
  code: string
}

export const EMPTY_REAUTH: ReauthValue = { password: '', method: 'totp', code: '' }

type Props = {
  value: ReauthValue
  onChange: (value: ReauthValue) => void
  /** Off when the account has no second factor to prove — starting enrollment. */
  requireSecondFactor?: boolean
  disabled?: boolean
  error?: boolean
}

export function ReauthFields({
  value,
  onChange,
  requireSecondFactor = true,
  disabled = false,
  error = false,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        value={value.password}
        onChange={(event) => onChange({ ...value, password: event.target.value })}
        disabled={disabled}
        size="lg"
      />

      {requireSecondFactor ? (
        <div className="flex flex-col gap-2">
          {value.method === 'totp' ? (
            <OtpInput
              label="Authentication code"
              value={value.code}
              onChange={(code) => onChange({ ...value, code })}
              error={error}
              disabled={disabled}
            />
          ) : (
            <CodeInput
              label="Backup code"
              value={value.code}
              onChange={(code) => onChange({ ...value, code })}
              hint="Looks like A7K2-M9PQ-R4XT."
              error={error}
              disabled={disabled}
            />
          )}

          <div className="flex justify-start">
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              // Switching clears the code: the two formats are not
              // interchangeable and a half-typed one carried across would be
              // submitted as the wrong kind.
              onClick={() =>
                onChange({
                  ...value,
                  method: value.method === 'totp' ? 'backup' : 'totp',
                  code: '',
                })
              }
            >
              {value.method === 'totp' ? 'Use a backup code' : 'Use your authenticator app'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
