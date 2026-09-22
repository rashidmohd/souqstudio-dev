import 'server-only'

import { redirect } from 'next/navigation'
import type { NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { ROLE_LABELS, roleAtLeast, type AdminRole } from '@/lib/admin-roles'
import {
  getAdminSession,
  type AdminIdentity,
  type VerifiedAdminSession,
} from '@/lib/admin-session'

/**
 * Who on the team may do what. E13-01.
 *
 * Every authorization decision in this app goes through this module, for the
 * reason `apps/web/lib/authz.ts` gives: a check written inline in one route is
 * a check the next route forgets.
 *
 * **There is no organization dimension here, and that is the difference that
 * matters.** Shop owner authorization asks "may this user touch this shop";
 * staff authorization asks only "is this person allowed to do this kind of
 * thing", because the answer already spans every tenant. Nothing in this app
 * should ever filter by `organizationId` to decide permission — if a screen
 * seems to need that, it is a shop owner screen and belongs in `apps/web`.
 */

/**
 * The rank and the labels live in `admin-roles.ts`, not here: the rail is a
 * client component and needs both, and this module imports Prisma and
 * `next/headers`. Re-exported so a server component gets everything from one
 * import.
 */
export { roleAtLeast, ROLE_LABELS, type AdminRole } from '@/lib/admin-roles'

// ─── Pages ────────────────────────────────────────────────────────────────────

/**
 * For a server component. Redirects to the login screen when there is no
 * session, which is what a page wants and a fetch does not.
 */
export async function requireAdmin(): Promise<VerifiedAdminSession> {
  const session = await getAdminSession()
  if (session === null) redirect('/login')
  return session
}

/**
 * For a server component behind a role. Sends an admin who is signed in but not
 * permitted to the overview rather than to the login screen — bouncing a
 * logged-in person to a login form reads as a broken session and gets reported
 * as one.
 */
export async function requireAdminRole(minimum: AdminRole): Promise<VerifiedAdminSession> {
  const session = await requireAdmin()
  if (!roleAtLeast(session.admin.role, minimum)) redirect('/?denied=1')
  return session
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export type AdminGate =
  | { ok: true; session: VerifiedAdminSession }
  | { ok: false; response: NextResponse }

/**
 * For a route handler. Returns a 401 rather than redirecting, in the same
 * `{ ok, response }` shape `apps/web` uses so route bodies read the same way
 * down the page.
 *
 * **A present cookie is not a session.** `middleware.ts` checks only that one
 * exists, because Prisma cannot run on the Edge runtime. Every route verifies
 * here, in Node, against the database.
 */
export async function requireAdminApi(minimum?: AdminRole): Promise<AdminGate> {
  const session = await getAdminSession()

  if (session === null) {
    return {
      ok: false,
      response: fail('unauthenticated', 'Sign in to continue.', 401),
    }
  }

  if (minimum !== undefined && !roleAtLeast(session.admin.role, minimum)) {
    return {
      ok: false,
      response: fail(
        'forbidden',
        `This needs the ${ROLE_LABELS[minimum].toLowerCase()} role. Yours is ${ROLE_LABELS[session.admin.role].toLowerCase()}.`,
        403
      ),
    }
  }

  return { ok: true, session }
}

/** Display name for the rail and the audit log. Falls back to the address. */
export function adminLabel(admin: AdminIdentity): string {
  return admin.name ?? admin.email
}
