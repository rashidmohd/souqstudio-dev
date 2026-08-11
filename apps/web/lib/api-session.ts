import 'server-only'

import type { NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getSession, type VerifiedSession } from '@/lib/session'
import { needsTwoFactorEnrollment } from '@/lib/two-factor'

/**
 * The session gate for JSON routes.
 *
 * `requireSession()` calls `redirect()`, which is right for a page and wrong
 * for an API — a fetch should get a 401 it can branch on, not a 307 to HTML.
 * So routes read `getSession()` instead, and this wraps that in the two checks
 * every mutating route wants.
 *
 * It exists as a single chokepoint rather than a helper each route may remember
 * to call, because an opt-in gate is a gate that eventually gets forgotten, and
 * the one that forgets is the one that matters. Routes that legitimately must
 * run for a user who still owes enrollment opt out explicitly, in a way that is
 * visible at the call site.
 */

export type ApiSessionOptions = {
  /**
   * Allow a user who owes two-factor enrollment under their organization's
   * policy. True for the routes that let them satisfy it — the 2FA endpoints
   * themselves, logout, and status reads. Anything else must leave this off.
   */
  allowPendingTwoFactor?: boolean
  /** Require a verified email address. Off by default; verification has its own flow. */
  requireVerifiedEmail?: boolean
}

export type ApiSessionResult =
  | { session: VerifiedSession; response: null }
  | { session: null; response: NextResponse }

export async function requireApiSession(
  options: ApiSessionOptions = {}
): Promise<ApiSessionResult> {
  const session = await getSession()
  if (!session) {
    return {
      session: null,
      response: fail('unauthenticated', 'Log in to continue.', 401),
    }
  }

  if (options.requireVerifiedEmail && !session.user.emailVerifiedAt) {
    return {
      session: null,
      response: fail(
        'email_unverified',
        'Verify your email address before continuing.',
        403
      ),
    }
  }

  if (!options.allowPendingTwoFactor && needsTwoFactorEnrollment(session.user)) {
    return {
      session: null,
      response: fail(
        'two_factor_enrollment_required',
        'Your organization requires two-factor authentication. Set it up to continue.',
        403
      ),
    }
  }

  return { session, response: null }
}
