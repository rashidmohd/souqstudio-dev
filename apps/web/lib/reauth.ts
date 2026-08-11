import 'server-only'

import type { NextResponse } from 'next/server'
import { prisma } from '@souqstudio/db'
import { fail } from '@/lib/api'
import { verifyPassword } from '@/lib/password'
import { verifySecondFactor, type SecondFactorMethod } from '@/lib/two-factor'

/**
 * Proving it is really you, for actions that change how you sign in. E1-03.
 *
 * Two levels:
 *
 * - **Password only**, to *start* enrollment. Turning two-factor on for
 *   somebody is a hostile act — it locks them out — so it wants a real
 *   credential rather than a "logged in recently" window, which would also be
 *   new machinery the codebase has no concept of.
 *
 * - **Password and a live second factor**, to turn it off, replace the backup
 *   codes, change the organization policy, or reset a teammate. Session theft
 *   is precisely what the second factor defends against, so an attacker holding
 *   a stolen session *and* the password must not be able to switch it off. With
 *   this rule they would first have to beat the second factor, at which point
 *   disabling it wins them nothing new.
 *
 * A backup code counts as the second factor throughout. The commonest honest
 * reason to disable two-factor is a lost phone, and refusing the recovery
 * credential precisely when recovery is needed would be perverse.
 */

export type ReauthResult = { ok: true } | { ok: false; response: NextResponse }

export type ReauthInput = {
  password: string
  method?: SecondFactorMethod | undefined
  code?: string | undefined
}

export async function reauthenticate(
  userId: string,
  input: ReauthInput,
  options: { requireSecondFactor: boolean }
): Promise<ReauthResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, twoFactorEnabled: true },
  })
  if (!user) {
    return { ok: false, response: fail('unauthenticated', 'Log in to continue.', 401) }
  }

  // A Google-only account has no password to check against. Today this is
  // unreachable — the Google handler is not built — but it must not silently
  // become "no password means no check".
  if (!user.passwordHash) {
    return {
      ok: false,
      response: fail(
        'password_required',
        'Set a password on your account before changing two-factor settings.',
        409
      ),
    }
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    return {
      ok: false,
      response: fail('invalid_password', 'That password is not right. Try again.', 401),
    }
  }

  if (!options.requireSecondFactor || !user.twoFactorEnabled) return { ok: true }

  if (!input.method || !input.code) {
    return {
      ok: false,
      response: fail(
        'second_factor_required',
        'Enter a code from your authenticator app, or one of your backup codes.',
        422
      ),
    }
  }

  const result = await verifySecondFactor(userId, input.method, input.code)
  if (!result.ok) {
    switch (result.reason) {
      case 'not_enabled':
        // Raced against a disable in another tab. Nothing to prove.
        return { ok: true }
      case 'replayed':
        return {
          ok: false,
          response: fail(
            'code_replayed',
            'That code has already been used. Wait for your app to show a new one.',
            400
          ),
        }
      case 'wrong_code':
        return {
          ok: false,
          response: fail('wrong_code', 'That code is not right. Try again.', 400),
        }
    }
  }

  return { ok: true }
}
