import { NextResponse } from 'next/server'
import { getAdminSession, endAdminSession } from '@/lib/admin-session'
import { recordAudit } from '@/lib/audit'

/**
 * Log out. E13-01.
 *
 * **POST only, and it redirects rather than returning JSON.** The rail's log
 * out control is a form, not a link: a GET would be followed by anything that
 * prefetches, and an admin would find themselves logged out by hovering. The
 * redirect is what lets that form work without JavaScript.
 *
 * Revokes the row as well as clearing the cookie. Clearing the cookie alone
 * leaves a token that still resolves if it is replayed from somewhere the
 * browser is not.
 */
export async function POST(request: Request) {
  const session = await getAdminSession()
  await endAdminSession()

  if (session !== null) {
    await recordAudit({
      adminUserId: session.admin.id,
      action: 'admin.session.ended',
      entityType: 'admin_user',
      entityId: session.admin.id,
    })
  }

  // 303, so the browser follows with a GET rather than re-posting.
  return NextResponse.redirect(new URL('/login', request.url), 303)
}
