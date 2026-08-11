import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import { requireVerifiedSession } from '@/lib/session'
import { ForcedTwoFactorSetup } from '@/components/auth/ForcedTwoFactorSetup'

export const metadata: Metadata = { title: 'Set up two-factor · SouqStudio' }

/**
 * E1-03 — forced enrollment, where the organization requires two-factor.
 *
 * **Deliberately in (auth), not (dashboard).** The gate that sends people here
 * runs in the dashboard layout, so a destination inside that layout would be
 * guarded by the gate itself and redirect forever. See TWO_FACTOR_SETUP_PATH in
 * lib/session.ts.
 *
 * `requireVerifiedSession()`, not `requireCompliantSession()` — gating the
 * remedy on the thing it remedies is the same loop in miniature.
 */
export default async function TwoFactorSetupPage() {
  const session = await requireVerifiedSession()

  const [user, organization] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true, passwordHash: true },
    }),
    prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { requireTwoFactor: true },
    }),
  ])

  // Nothing owed — either they finished, or the owner turned the policy off
  // while they were on this screen. Either way this page has no job.
  if (user?.twoFactorEnabled || !organization?.requireTwoFactor) redirect('/')

  return (
    <div className="w-full max-w-md">
      <ForcedTwoFactorSetup
        accountEmail={session.user.email}
        canEnroll={Boolean(user?.passwordHash)}
      />
    </div>
  )
}
