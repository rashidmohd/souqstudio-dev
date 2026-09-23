import { NextResponse, type NextRequest } from 'next/server'
import { clientIp, isAllowed, parseAllowlist } from '@/lib/ip-allowlist'

/**
 * The admin app's front door. Two jobs, and **neither of them is
 * authentication.**
 *
 * 1. The IP allowlist. This *is* a real control and it is enforced here
 *    deliberately: it is the one check that should apply before a request
 *    reaches any code that reads the database, including the login route.
 * 2. A session cookie presence check, which proves nothing at all.
 *
 * Next 14 pins middleware to the Edge runtime with no opt-out —
 * `export const runtime = 'nodejs'` is ignored — so Prisma cannot run here and
 * importing `@souqstudio/db` fails the build. A present cookie may be expired,
 * revoked, or belong to an admin who was switched off an hour ago. Real
 * verification happens in Node, in `requireAdmin()` and `requireAdminApi()`, and
 * every page and route calls one of them. Treating "middleware did not redirect
 * me" as proof of a session is the failure mode this comment exists to prevent.
 *
 * `process.env` is read directly here, which is against the rule everywhere
 * else. The validated `env` module imports Zod and `server-only` and cannot load
 * on the Edge. This is the only file in the app with the exemption.
 */

const ADMIN_SESSION_COOKIE = 'sq_admin_session'

/** Reachable with no session. */
const PUBLIC_PATHS = ['/login']

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  /*
   * The liveness probe comes from the platform's network rather than from an
   * operator, and it exposes nothing. Excluded from the allowlist on purpose —
   * see the note in app/api/health/route.ts.
   */
  if (pathname === '/api/health') return NextResponse.next()

  const allowlist = parseAllowlist(process.env.ADMIN_IP_ALLOWLIST)
  const ip = clientIp(req.headers)
  if (!isAllowed(ip, allowlist)) {
    /*
     * A flat 404 with no body. A 403 confirms that an admin panel is here and
     * that the caller simply came from the wrong network, which is a fact worth
     * nothing to a colleague and something to a stranger.
     *
     * **But it is logged.** The silent version of this cost a deployment: every
     * page answered 404, the health check answered `ok` because it is exempt,
     * and there was nothing anywhere saying an address had been refused. The
     * response stays blank and the operator gets the sentence — which is the
     * split the client/server boundary exists for. `x-forwarded-for` is echoed
     * raw so that a malformed one is visible as itself.
     */
    console.warn(
      `[admin] refused ${pathname} from ${ip ?? 'an unresolvable address'}` +
        ` — ADMIN_IP_ALLOWLIST has ${allowlist.length} entr${allowlist.length === 1 ? 'y' : 'ies'}.` +
        ` x-forwarded-for: ${req.headers.get('x-forwarded-for') ?? '(none)'}.` +
        ` Unset the variable to allow every address.`
    )
    return new NextResponse(null, { status: 404 })
  }

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next()

  /*
   * API routes are excluded from the cookie check, for the reason apps/web
   * excludes them: they verify in Node themselves, and a weaker second answer
   * here would only invite reliance on it. They are still behind the allowlist
   * above, which is the check that has to happen early.
   */
  if (pathname.startsWith('/api/')) return NextResponse.next()

  if (req.cookies.has(ADMIN_SESSION_COOKIE)) return NextResponse.next()

  const login = new URL('/login', req.url)
  // Path plus query only. Never an absolute URL from user input.
  login.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: [
    /**
     * Everything except Next internals and static files. **API routes are
     * included**, unlike apps/web's matcher: the allowlist has to cover them,
     * and the cookie check skips them in the body above.
     */
    '/((?!_next/static|_next/image|.*\\.[\\w]+$).*)',
  ],
}
