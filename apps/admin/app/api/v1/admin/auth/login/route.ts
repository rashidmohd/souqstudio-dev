import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { hashIp, isAdminRole, issueAdminSession } from '@/lib/admin-session'
import { burnPasswordTiming, verifyPassword } from '@/lib/password'
import { clientIp } from '@/lib/ip-allowlist'
import { recordAudit } from '@/lib/audit'

/**
 * Staff sign-in. E13-01.
 *
 * **There is no sign-up, and there is deliberately no bootstrap.** A route that
 * creates the first admin when the table is empty is a door that stays unlocked
 * until somebody notices it, on the one app that can reach every organization
 * on the platform. Accounts are created from a shell:
 * `pnpm --filter @souqstudio/db admin:create`.
 *
 * The IP allowlist has already run in middleware by the time this executes,
 * which is why it is enforced there rather than here: it should apply before a
 * request reaches anything that touches the database, including this route.
 */

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

/**
 * The same sentence for a wrong address and a wrong password, and the same
 * elapsed time. Either one distinguishing the two tells whoever is probing
 * which addresses belong to staff.
 */
const REFUSAL = 'That email address and password do not match.'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    // Not the field-level message: "email is not an email" would itself
    // distinguish a malformed address from a wrong one.
    return fail('invalid_credentials', REFUSAL, 401)
  }

  const { email, password } = parsed.data

  const admin = await prisma.adminUser.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, passwordHash: true, isActive: true },
  })

  if (admin === null) {
    await burnPasswordTiming(password)
    return fail('invalid_credentials', REFUSAL, 401)
  }

  const matches = await verifyPassword(password, admin.passwordHash)
  if (!matches) return fail('invalid_credentials', REFUSAL, 401)

  /*
   * A switched-off admin gets the same refusal as a wrong password, checked
   * after the hash comparison rather than before it. Checking first would
   * return instantly for a disabled account and slowly for an active one,
   * which tells a former colleague whether their account still exists.
   */
  if (!admin.isActive) return fail('invalid_credentials', REFUSAL, 401)

  /*
   * A role outside the three is a row somebody edited by hand. It is refused
   * rather than admitted with an authority nothing in the app defines.
   */
  if (!isAdminRole(admin.role)) {
    console.error('[admin-login] unknown role on admin_users row', admin.id, admin.role)
    return fail('invalid_credentials', REFUSAL, 401)
  }

  await issueAdminSession(admin.id, {
    ipHash: hashIp(clientIp(request.headers)) ?? undefined,
    userAgent: request.headers.get('user-agent')?.slice(0, 255) ?? undefined,
  })

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  })

  /*
   * Logged, because a sign-in is the action every other entry in the audit log
   * hangs from. Nothing about the credential is recorded.
   */
  await recordAudit({
    adminUserId: admin.id,
    action: 'admin.session.started',
    entityType: 'admin_user',
    entityId: admin.id,
  })

  return ok({ email: admin.email, role: admin.role })
}
