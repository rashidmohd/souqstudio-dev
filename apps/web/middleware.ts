import { NextResponse, type NextRequest } from 'next/server'

/**
 * Route gate. **This is not authentication.**
 *
 * It checks only that a session cookie is present, and redirects to /login when
 * it is not. It cannot do more: Next 14 runs middleware on the Edge runtime with
 * no way to opt out — `export const runtime = 'nodejs'` is ignored — so Prisma
 * cannot run here. Importing `@souqstudio/db` fails the build outright, because
 * its barrel export pulls in BullMQ and ioredis, which need node:diagnostics_channel.
 *
 * A present cookie proves nothing. It may be expired, revoked, or a replayed
 * token from a rotated family. Real verification happens in Node, against the
 * database, in `requireSession()` — every protected page and route handler must
 * call it. Treating a redirect that did not happen as proof of a valid session is
 * the failure mode this comment exists to prevent.
 *
 * The point of doing it here anyway is to save an unauthenticated visitor a
 * database round trip and a flash of a loading skeleton before the redirect.
 */

const SESSION_COOKIE = 'sq_session'

/** Reachable with no session at all. */
const PUBLIC_PATHS = [
  '/login',
  // E1-03. The second-factor screen sits between a correct password and a
  // session, so by definition there is no session cookie yet. Leaving it out
  // deadlocks the flow: middleware bounces to /login, the password succeeds,
  // and it bounces again, forever. It is not really public — reaching it needs
  // the challenge cookie, which the route checks in Node.
  '/login/2fa',
  '/signup',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
]

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true
  // The shareable offer book viewer. Seen thousands of times per book by people
  // who have never heard of SouqStudio — it must never redirect to a login.
  if (pathname === '/o' || pathname.startsWith('/o/')) return true
  // E2-03. Accepting an invitation happens before the account exists, so there
  // is no session and cannot be one. Bouncing to /login here would strand every
  // invited teammate at a screen they have no credentials for. The token in the
  // URL is the credential, and the route checks it in Node.
  if (pathname.startsWith('/invite/')) return true
  return false
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  if (isPublic(pathname)) return NextResponse.next()
  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next()

  const login = new URL('/login', req.url)
  // Send them back where they were headed once they are in. Path plus query
  // only — never an absolute URL from user input, which is an open redirect.
  login.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: [
    /**
     * Pages only. API routes are excluded deliberately: they must verify the
     * session themselves in Node, and a cookie-presence check here would add
     * nothing but a second, weaker answer.
     *
     * Also excluded: _next internals, and any path with a file extension, which
     * covers everything served out of public/.
     */
    '/((?!api|_next/static|_next/image|.*\\.[\\w]+$).*)',
  ],
}
