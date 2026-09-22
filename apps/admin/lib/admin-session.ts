import 'server-only'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { prisma } from '@souqstudio/db'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'
import { isAdminRole, type AdminRole } from '@/lib/admin-roles'

/**
 * The staff session layer. Sole writer to `admin_sessions`. E13-01.
 *
 * **Separate from the shop owner session layer, not shared with it.** The two
 * tables, the two cookies and the two apps stay apart on purpose: a staff
 * session reaches every organization on the platform, and the thing that makes
 * that safe is that no customer credential can ever produce one. A shared
 * helper would be one refactor away from a shared table.
 *
 * Node runtime only — `import 'server-only'` makes a client import a build
 * error, and this cannot run in middleware. See middleware.ts for why.
 */

export const ADMIN_SESSION_COOKIE = 'sq_admin_session'

/**
 * Eight hours, and no "remember me".
 *
 * An admin panel is a tool somebody opens to do a thing, not a place they live,
 * and the shop owner side's 30-day option would be wrong here for the same
 * reason the IP allowlist exists. A working day is the unit.
 */
const TTL_MS = 8 * 60 * 60 * 1000

/**
 * How long a session may sit unused before it stops working, regardless of
 * `expiresAt`. A laptop left open in a cafe is the case this covers and the
 * absolute expiry does not.
 */
const IDLE_MS = 60 * 60 * 1000

/**
 * Re-exported so a route importing the session layer does not also have to
 * import the vocabulary. The definitions live in `admin-roles.ts`, which has no
 * `server-only` and can therefore be read by a client component. See that file.
 */
export { ADMIN_ROLES, isAdminRole, type AdminRole } from '@/lib/admin-roles'

export type AdminIdentity = {
  id: string
  email: string
  name: string | null
  role: AdminRole
}

export type VerifiedAdminSession = {
  sessionId: string
  admin: AdminIdentity
}

// ─── Tokens ───────────────────────────────────────────────────────────────────

/** 32 random bytes, base64url. The only copy lives in the cookie. */
function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * HMAC-SHA256 under `ADMIN_SESSION_SECRET`, rather than the plain SHA-256
 * `apps/web` stores for shop owner sessions.
 *
 * Not a cryptographic upgrade — a 256-bit CSPRNG token has no dictionary to
 * attack, so the plain hash was already sound. The key buys an operational
 * control instead: **rotating the secret invalidates every staff session at
 * once**, with no migration, no deploy and no table scan. That is the
 * break-glass action an admin panel wants after a laptop goes missing, and the
 * shop owner session layer has no use for it.
 */
function hashToken(token: string): string {
  return createHmac('sha256', env.ADMIN_SESSION_SECRET).update(token).digest('hex')
}

/**
 * Client addresses are recorded as a hash. The sessions list needs to tell two
 * sessions apart, which a hash does; it does not need to hold a staff member's
 * home IP address in a table forever.
 */
export function hashIp(ip: string | null): string | null {
  if (ip === null || ip === '') return null
  return createHash('sha256').update(`${env.ADMIN_SESSION_SECRET}:${ip}`).digest('hex').slice(0, 32)
}

// ─── Cookie ───────────────────────────────────────────────────────────────────

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    /**
     * `strict`, where the shop owner cookie is `lax`.
     *
     * `lax` exists so a link into the product from an email still arrives
     * logged in. Nothing should ever link into this app from anywhere, so the
     * tradeoff that justifies `lax` is absent and the stronger value costs
     * nothing.
     */
    sameSite: 'strict' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires,
  }
}

// ─── Issue ────────────────────────────────────────────────────────────────────

/**
 * Start a staff session and set the cookie. Call only from a route handler —
 * server components cannot write cookies.
 */
export async function issueAdminSession(
  adminUserId: string,
  options: { ipHash?: string | undefined; userAgent?: string | undefined } = {}
): Promise<void> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + TTL_MS)

  await prisma.adminSession.create({
    data: {
      adminUserId,
      tokenHash: hashToken(token),
      expiresAt,
      lastUsedAt: new Date(),
      ipHash: options.ipHash ?? null,
      userAgent: options.userAgent ?? null,
    },
  })

  cookies().set(ADMIN_SESSION_COOKIE, token, cookieOptions(expiresAt))
}

// ─── Verify ───────────────────────────────────────────────────────────────────

/**
 * Resolve the current staff session, or null. Safe to call from a server
 * component.
 *
 * Returns null for every failure mode rather than distinguishing them. The
 * caller's only useful question is whether this request is staff.
 *
 * **The admin row is re-read on every request**, which is what makes
 * `isActive = false` take effect immediately rather than at the next login.
 * Switching an admin off is the closest thing this app has to firing somebody,
 * and it has to be instant.
 */
export async function getAdminSession(): Promise<VerifiedAdminSession | null> {
  const token = cookies().get(ADMIN_SESSION_COOKIE)?.value
  if (token === undefined || token === '') return null

  const row = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      adminUser: {
        select: { id: true, email: true, name: true, role: true, isActive: true },
      },
    },
  })

  if (row === null) return null
  if (row.revokedAt !== null) return null

  const now = Date.now()
  if (row.expiresAt.getTime() <= now) return null
  if (now - row.lastUsedAt.getTime() > IDLE_MS) return null
  if (!row.adminUser.isActive) return null
  // A role that is not one of the three is a row somebody edited by hand. It
  // resolves to no session rather than to an unknown authority.
  if (!isAdminRole(row.adminUser.role)) return null

  /*
   * `lastUsedAt` is only written when it has drifted by more than a minute.
   * Writing it on every request would put an UPDATE in front of every page
   * load, including the ones that render a table of ten thousand rows.
   */
  if (now - row.lastUsedAt.getTime() > 60_000) {
    await prisma.adminSession.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date(now) },
    })
  }

  return {
    sessionId: row.id,
    admin: {
      id: row.adminUser.id,
      email: row.adminUser.email,
      name: row.adminUser.name,
      role: row.adminUser.role,
    },
  }
}

// ─── End ──────────────────────────────────────────────────────────────────────

/** Log out. Revokes the row as well as clearing the cookie. */
export async function endAdminSession(): Promise<void> {
  const token = cookies().get(ADMIN_SESSION_COOKIE)?.value
  cookies().delete(ADMIN_SESSION_COOKIE)
  if (token === undefined || token === '') return

  await prisma.adminSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/** End every session belonging to one admin. Used when a role or password changes. */
export async function revokeAllSessions(adminUserId: string): Promise<number> {
  const result = await prisma.adminSession.updateMany({
    where: { adminUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return result.count
}

// ─── Login throttle ───────────────────────────────────────────────────────────

/**
 * Constant-time string comparison, for anything compared outside an indexed
 * lookup.
 */
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
