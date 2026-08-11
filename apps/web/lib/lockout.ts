/**
 * Failed-login lockout policy. E1-02: five attempts, fifteen minute cooldown.
 *
 * Pure functions over the counters on `users` — no database access here, so the
 * policy can be reasoned about and tested on its own, and the caller stays in
 * charge of the transaction.
 */

export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000

type LockoutState = {
  failedLoginAttempts: number
  lockedUntil: Date | null
}

/** True while the cooldown is still running. */
export function isLockedOut(user: LockoutState, now: Date = new Date()): boolean {
  return user.lockedUntil !== null && user.lockedUntil > now
}

export function lockoutRemainingMs(user: LockoutState, now: Date = new Date()): number {
  if (!isLockedOut(user, now)) return 0
  // isLockedOut has established lockedUntil is non-null.
  return (user.lockedUntil as Date).getTime() - now.getTime()
}

/**
 * The counters to persist after a failed attempt. The lock is applied on the
 * fifth failure and the counter keeps climbing — it is reset by success, or by
 * the next failure after the cooldown has elapsed.
 */
export function registerFailure(user: LockoutState, now: Date = new Date()): LockoutState {
  // A failure arriving after the cooldown expired starts a fresh run rather
  // than inheriting the old count, which would lock them out on attempt one.
  const priorAttempts = user.lockedUntil !== null && user.lockedUntil <= now ? 0 : user.failedLoginAttempts
  const failedLoginAttempts = priorAttempts + 1

  return {
    failedLoginAttempts,
    lockedUntil:
      failedLoginAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(now.getTime() + LOCKOUT_DURATION_MS)
        : null,
  }
}

/** Cleared on any successful login. */
export function clearFailures(): LockoutState {
  return { failedLoginAttempts: 0, lockedUntil: null }
}
