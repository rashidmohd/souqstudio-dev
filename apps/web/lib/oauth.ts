import 'server-only'

import { env } from '@/lib/env'

/**
 * Whether Google sign-in is usable in this environment.
 *
 * The auth screens ask this before rendering the Google button. A button that
 * leads to a misconfiguration error is worse than no button — the owner cannot
 * tell whether they did something wrong, and the fix is not theirs to make.
 *
 * Both halves are required: a client id with no secret fails at the token
 * exchange, which is late enough to look like a Google outage.
 */
export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

/**
 * The handler at /api/v1/auth/google does not exist yet.
 *
 * Flip to `true` in the same change that adds it. Credentials alone must not
 * reveal the button: someone pasting a client id into .env would otherwise get
 * a button that 404s, and would reasonably assume they had pasted it wrong.
 */
const GOOGLE_HANDLER_BUILT = false

/** What the auth screens actually ask before rendering the Google button. */
export function canSignInWithGoogle(): boolean {
  return GOOGLE_HANDLER_BUILT && isGoogleConfigured()
}
