import { ok } from '@/lib/api'
import { endSession } from '@/lib/session'

/**
 * E1-02 logout. Listed in references/api-conventions.md and previously unbuilt;
 * E1-03 needed it, because the forced-enrollment screen has to offer a way out
 * that is not "go back to the screen you are already on".
 *
 * No session check. Signing out when you are already signed out is not an
 * error, and answering differently would say whether a stale cookie was still
 * live.
 */
export async function POST() {
  await endSession()
  return ok({ loggedOut: true })
}
