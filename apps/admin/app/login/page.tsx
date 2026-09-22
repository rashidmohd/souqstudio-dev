import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/admin-session'
import { env } from '@/lib/env'
import { parseAllowlist } from '@/lib/ip-allowlist'
import { LoginForm } from '@/components/auth/LoginForm'
import { Card } from '@/components/ui/card'

/**
 * The only screen reachable without a session. Centred single column, no
 * navigation, one decision.
 *
 * A signed-in admin who reaches this is sent onward rather than shown a second
 * login form, which otherwise reads as a broken session.
 */
export const dynamic = 'force-dynamic'

/**
 * Only a path, never an absolute URL, and never a protocol-relative one. A
 * `next` parameter that accepts `//evil.example` is an open redirect, and it is
 * worth more on this app than on most.
 */
function safeNext(raw: string | undefined): string {
  if (raw === undefined) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string }
}) {
  const session = await getAdminSession()
  const next = safeNext(searchParams.next)
  if (session !== null) redirect(next)

  /*
   * The allowlist being empty is said out loud rather than left to a runbook. A
   * security control that is off and silent is a control nobody knows is off,
   * and this is the screen every admin sees.
   */
  const allowlistEmpty = parseAllowlist(env.ADMIN_IP_ALLOWLIST).length === 0

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-full flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-eyebrow uppercase text-muted">SouqStudio</span>
          <h1 className="font-display text-display text-primary">Admin</h1>
        </div>

        <Card>
          <LoginForm next={next} />
        </Card>

        {allowlistEmpty ? (
          <p className="rounded-block bg-sand p-3 text-body-sm text-secondary">
            ADMIN_IP_ALLOWLIST is empty, so this panel accepts a request from any address.
            That is correct on a laptop. Set it before this deployment is reachable from
            the internet.
          </p>
        ) : null}
      </div>
    </div>
  )
}
