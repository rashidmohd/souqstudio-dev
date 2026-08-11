import 'server-only'

import { prisma } from '@souqstudio/db'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from '@/lib/env'
import { generateToken, hashToken } from '@/lib/tokens'

/**
 * The session layer. Sole writer to the `sessions` table.
 *
 * next-auth cannot issue a database session for a password login — its
 * credentials path encodes a JWT and never writes a row. Revocability is why
 * database sessions were specified, so sessions are ours and next-auth is scoped
 * to the Google handshake. Full reasoning: souqstudio-technical →
 * references/auth.md.
 *
 * Nothing else writes to `sessions`. Rotation and theft detection stop being
 * trustworthy the moment a second writer exists, and review will not catch it.
 *
 * Node runtime only — `import 'server-only'` makes a client import a build error,
 * and this cannot run in middleware. See middleware.ts for why.
 */

export const SESSION_COOKIE = 'sq_session'

/** E1-02: "remember me" is a 30-day session. */
const REMEMBER_ME_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Without it, a week — long enough not to nag, short enough to matter. */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type SessionUser = {
  id: string
  email: string
  name: string | null
  role: string
  organizationId: string
  emailVerifiedAt: Date | null
  /** E1-03. Carried on the session so the enrollment gate costs no extra query. */
  twoFactorEnabled: boolean
  /** Flattened from the organization — see the select in getSession(). */
  organizationRequiresTwoFactor: boolean
}

export type VerifiedSession = {
  sessionId: string
  user: SessionUser
}

// ─── Cookie ───────────────────────────────────────────────────────────────────

/**
 * Cookie options. `secure` is off in development because localhost is plain HTTP
 * and the browser would silently drop the cookie.
 */
function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires,
  }
}

// ─── Issue ────────────────────────────────────────────────────────────────────

/**
 * Start a new session and set the cookie. Call only from a route handler or
 * server action — server components cannot write cookies.
 *
 * Returns the raw token for tests; it is already in the cookie. Never log it.
 */
export async function issueSession(
  userId: string,
  // `| undefined` is explicit for exactOptionalPropertyTypes: callers derive
  // these from optional headers, so they pass undefined rather than omitting.
  options: {
    rememberMe?: boolean | undefined
    ipHash?: string | undefined
    userAgent?: string | undefined
  } = {}
): Promise<string> {
  const token = generateToken()
  const expiresAt = new Date(
    Date.now() + (options.rememberMe ? REMEMBER_ME_TTL_MS : DEFAULT_TTL_MS)
  )

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      // A fresh login starts its own rotation family. Refreshes stay within it.
      familyId: generateToken(),
      lastUsedAt: new Date(),
      ipHash: options.ipHash ?? null,
      userAgent: options.userAgent ?? null,
    },
  })

  cookies().set(SESSION_COOKIE, token, cookieOptions(session.expiresAt))
  return token
}

// ─── Verify ───────────────────────────────────────────────────────────────────

/**
 * Resolve the current session, or null. Safe to call from server components.
 *
 * Returns null for every failure mode rather than distinguishing them — the
 * caller's only useful question is "is this request authenticated".
 */
export async function getSession(): Promise<VerifiedSession | null> {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return null

  const row = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          emailVerifiedAt: true,
          twoFactorEnabled: true,
          // E2-03. An owner removing someone must end their access now, not at
          // the next login. tokenVersion and revokeAllSessions already do that
          // for sessions that exist; this closes the window where a session row
          // outlives the removal — a replica lag, a retry, a race with logout.
          removedAt: true,
          // Joined rather than fetched separately: the enrollment gate runs on
          // every protected page, and this is already the request's one session
          // lookup. Flattened onto SessionUser below so callers never have to
          // reach through a nested shape.
          organization: { select: { requireTwoFactor: true } },
        },
      },
    },
  })

  if (!row) return null
  if (row.revokedAt) return null

  // Replay of a rotated token. A legitimate client holds exactly one current
  // token and never presents a superseded one, so this is a stolen copy —
  // and we cannot tell whether the thief or the victim is holding it. Kill the
  // whole family and make both re-authenticate.
  if (row.replacedById) {
    await revokeFamily(row.familyId)
    return null
  }

  if (row.expiresAt <= new Date()) return null

  // Removed from the organization. Same answer as no session at all — there is
  // nothing they could usefully be told here, and the login screen is where
  // that conversation belongs.
  if (row.user.removedAt) return null

  // Best-effort freshness for the account-security screen. Not awaited on the
  // critical path — a failed write must not fail the request.
  void prisma.session
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined)

  const { organization, removedAt: _removedAt, ...user } = row.user
  return {
    sessionId: row.id,
    user: { ...user, organizationRequiresTwoFactor: organization.requireTwoFactor },
  }
}

/**
 * The gate for protected pages. Middleware only checks that a cookie exists —
 * this is where a request is actually authenticated.
 */
export async function requireSession(): Promise<VerifiedSession> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

/**
 * E1-01 gates the editor on a verified email. Separate from requireSession so
 * the onboarding and settings screens stay reachable while unverified.
 */
export async function requireVerifiedSession(): Promise<VerifiedSession> {
  const session = await requireSession()
  if (!session.user.emailVerifiedAt) redirect('/verify-email')
  return session
}

/**
 * Where someone owing two-factor enrollment is sent.
 *
 * **It lives in the (auth) route group, not under (dashboard), and that is
 * load-bearing.** This gate runs in the dashboard layout, so anything it
 * redirects *to* that also sits under that layout is guarded by the gate
 * itself — an infinite redirect. Pointing at /settings/account produced exactly
 * that: /settings/account → /settings/account?required=1 → forever. The (auth)
 * group has its own layout and no gate, so the loop is impossible by
 * construction rather than by an exemption someone has to remember.
 *
 * It also happens to be the right family for the screen: single column, no
 * navigation, one decision — the same treatment as /verify-email.
 */
export const TWO_FACTOR_SETUP_PATH = '/two-factor-setup'

/**
 * E1-03. The gate for the app shell: a verified session that also satisfies the
 * organization's two-factor policy.
 *
 * Owed enrollment is a *routing* decision, not an authentication one — the
 * request is genuinely authenticated, it simply must not reach the rest of the
 * product until the owner's policy is met. That distinction matters because a
 * redirect issued from a layout does not cancel the page's own data fetch; the
 * redirect wins the response, but the query underneath it still ran. Acceptable
 * here. It would not be acceptable for authentication, and this pattern will
 * get copied — so do not reach for it to protect confidential data.
 *
 * requireSession() and requireVerifiedSession() stay ungated on purpose:
 * /verify-email and the setup screen have to remain reachable, or the gate has
 * nowhere to send anyone.
 */
export async function requireCompliantSession(): Promise<VerifiedSession> {
  const session = await requireVerifiedSession()
  if (session.user.organizationRequiresTwoFactor && !session.user.twoFactorEnabled) {
    redirect(TWO_FACTOR_SETUP_PATH)
  }
  return session
}

// ─── Rotate ───────────────────────────────────────────────────────────────────

/**
 * Issue a successor token within the same family and mark the old row as
 * replaced. The old token then trips the theft check in getSession() if it is
 * ever presented again.
 */
export async function rotateSession(currentToken: string): Promise<string | null> {
  const current = await prisma.session.findUnique({
    where: { tokenHash: hashToken(currentToken) },
  })
  if (!current || current.revokedAt || current.replacedById) return null
  if (current.expiresAt <= new Date()) return null

  const token = generateToken()

  // One transaction: a successor that exists while the predecessor still looks
  // current would let both tokens work at once.
  const successor = await prisma.$transaction(async (tx) => {
    const created = await tx.session.create({
      data: {
        userId: current.userId,
        tokenHash: hashToken(token),
        expiresAt: current.expiresAt,
        familyId: current.familyId,
        lastUsedAt: new Date(),
        ipHash: current.ipHash,
        userAgent: current.userAgent,
      },
    })
    await tx.session.update({
      where: { id: current.id },
      data: { replacedById: created.id },
    })
    return created
  })

  cookies().set(SESSION_COOKIE, token, cookieOptions(successor.expiresAt))
  return token
}

// ─── Revoke ───────────────────────────────────────────────────────────────────

/** Sign out one device. */
export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/**
 * Sign out every device except the one asking. E1-03 uses this after any
 * change to a user's two-factor configuration.
 *
 * "Others, not all" because the person making the change has just proved
 * themselves twice over; signing them out is friction with no security gain.
 * Every *other* live session predates the change, so its assurance level just
 * dropped, and those go.
 *
 * Deliberately does not bump `tokenVersion`. That column means "everything,
 * everywhere, including anything stateless" and belongs to revokeAllSessions —
 * bumping it here would kill the caller's own session by the back door the
 * moment anything starts honouring it.
 */
export async function revokeOtherSessions(
  userId: string,
  keepSessionId: string
): Promise<number> {
  const { count } = await prisma.session.updateMany({
    where: { userId, revokedAt: null, id: { not: keepSessionId } },
    data: { revokedAt: new Date() },
  })
  return count
}

/** Theft response — kills every token descended from one login. */
export async function revokeFamily(familyId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/**
 * Sign out everywhere: password change, 2FA reset, owner revoking access.
 *
 * Also bumps `users.tokenVersion`. Revoking the rows is what actually ends the
 * sessions — the bump is there so any future stateless token that carries a
 * version is invalidated by the same call. See the note in references/auth.md.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    }),
  ])
}

/** Sign out: revoke the current row and clear the cookie. */
export async function endSession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
  cookies().delete(SESSION_COOKIE)
}
