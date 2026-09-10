import 'server-only'

import { timingSafeEqual } from 'node:crypto'
import { fail } from '@/lib/api'
import { env } from '@/lib/env'

/**
 * Who may write the shared block library. E7 —
 * `docs/block-library-from-r2.md` §5.
 *
 * **A shared secret, and explicitly not a session.** §5 names the boundary:
 * anything that can write the library prefix can put a block document in front
 * of *every shop on the platform*. The highest role this app has is the owner of
 * one organization — `requireOrgRole(session, 'owner')` — and that is nowhere
 * near the same authority. A route here guarded by a role would let any
 * customer's owner publish a design into every other customer's picker.
 *
 * So this is a placeholder for E13's admin auth, and it is written down as one.
 * The thing it must never quietly become is `requireOrgRole`.
 *
 * **Unset means the door does not exist.** A deployment that is not meant to
 * publish — every preview environment, and the web app in production if
 * publishing is run from a laptop — has no token, and these routes answer 503
 * rather than falling back to something weaker.
 */
export function requireLibraryToken(request: Request) {
  const expected = env.LIBRARY_PUBLISH_TOKEN

  if (expected === undefined) {
    return fail(
      'not_configured',
      'Library publishing is not enabled on this deployment.',
      503
    )
  }

  const header = request.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice(7) : ''

  // Constant-time, and length-guarded first because `timingSafeEqual` throws on
  // a length mismatch — which would itself be a length oracle if it leaked.
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  const matches = a.length === b.length && timingSafeEqual(a, b)

  if (!matches) {
    // No detail. A caller who is not holding the token learns nothing about it.
    return fail('unauthenticated', 'Not authorised to publish to the library.', 401)
  }

  return null
}
