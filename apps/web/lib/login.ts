import 'server-only'

import { prisma } from '@souqstudio/db'
import { issueSession } from '@/lib/session'
import { issueCode } from '@/lib/verification'
import { clearFailures } from '@/lib/lockout'
import { issueChallenge } from '@/lib/two-factor'

/**
 * What happens after a credential checks out. E1-02 and E1-03.
 *
 * **This module is the only caller of `issueSession` outside lib/session.ts**,
 * and that is the point of it existing. Signup is the one exception — a user
 * created moments ago cannot have two-factor switched on — and it says so at
 * the call site.
 *
 * The rule exists because of the Google handler that is still to be built. It
 * is a redirect flow rather than a JSON POST, and the obvious implementation
 * signs the user in the moment next-auth hands back a verified email. Written
 * that way it would silently skip the second factor for every Google user, and
 * nothing in review reliably catches an omission. Routing both password and
 * OAuth through `completeLogin` means bypassing 2FA takes deliberate effort
 * rather than mere forgetfulness.
 *
 * When that handler lands it must translate `two_factor_required` into a
 * redirect to /login/2fa, not a JSON body.
 */

export type LoginOutcome =
  | { status: 'signed_in'; needsVerification: boolean }
  | { status: 'two_factor_required' }

export type LoginContext = {
  rememberMe?: boolean | undefined
  ipHash?: string | undefined
  userAgent?: string | undefined
}

/**
 * Called once the password (or OAuth identity) has been accepted.
 *
 * Note what does *not* happen on the two-factor branch: the lockout counter is
 * not cleared and `lastLoginAt` is not touched. Both belong to a login that
 * actually completed. Clearing the counter here instead would make the lockout
 * useless as a bound on code guessing — an attacker holding the password would
 * reset it on every attempt — which is the whole reason a wrong code counts as
 * a failed login in the first place.
 */
export async function completeLogin(
  userId: string,
  context: LoginContext = {}
): Promise<LoginOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  })

  if (user?.twoFactorEnabled) {
    await issueChallenge(userId, context)
    return { status: 'two_factor_required' }
  }

  return { status: 'signed_in', ...(await finalizeLogin(userId, context)) }
}

/**
 * Issue the session and settle the account's login bookkeeping.
 *
 * Separate from `completeLogin` because the second-factor route reaches this
 * point too, having already been through the challenge. Nothing else should
 * call it — going straight here skips the two-factor check.
 */
export async function finalizeLogin(
  userId: string,
  context: LoginContext = {}
): Promise<{ needsVerification: boolean }> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { ...clearFailures(), lastLoginAt: new Date() },
    select: { email: true, emailVerifiedAt: true },
  })

  await issueSession(userId, context)

  if (!user.emailVerifiedAt) {
    // Send the code now rather than making them ask. Logging in is already a
    // deliberate act, and this also sets the paired token cookie that makes the
    // code redeemable in *this* browser. The throttle result is ignored on
    // purpose: if one went out moments ago the cooldown suppresses this one and
    // the earlier code stands, so repeated logins cannot be used to mail-bomb.
    await issueCode(user.email, 'email_verification')
    return { needsVerification: true }
  }

  return { needsVerification: false }
}
