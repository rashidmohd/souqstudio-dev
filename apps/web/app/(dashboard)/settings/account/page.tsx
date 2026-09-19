import type { Metadata } from 'next'
import { prisma } from '@souqstudio/db'
import { requireVerifiedSession } from '@/lib/session'
import { countUnusedBackupCodes } from '@/lib/two-factor'
import { TwoFactorSettings } from '@/components/auth/TwoFactorSettings'
import { ProfileForm } from '@/components/account/ProfileForm'
import { PageContainer } from '@/components/shared/page-container'

export const metadata: Metadata = { title: 'Profile · SouqStudio' }

/**
 * The person's own screen: their name, and how they sign in. E1-03 built the
 * second half; the first is newer.
 *
 * **Titled `Profile`, at `/settings/account`.** The rail row people actually
 * look for when they want to change their own name is `Profile`, and a row
 * promises its destination — so the heading matches the row rather than the
 * path. The path is not copy and renaming it would break every link anyone has
 * bookmarked.
 *
 * `requireVerifiedSession()`, deliberately not `requireCompliantSession()`.
 * This is where someone satisfies the organization's two-factor policy, so
 * gating it on that policy would leave them nowhere to go. The dashboard layout
 * gates everything else.
 *
 * The team list is read here rather than through an API route: this is a server
 * component and the query is one indexed read on a table it already has the
 * organization for.
 */
export default async function AccountSettingsPage() {
  const session = await requireVerifiedSession()
  const isOwner = session.user.role === 'owner'

  const [user, organization, backupCodesRemaining, teammates] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        twoFactorEnabled: true,
        twoFactorEnabledAt: true,
        passwordHash: true,
      },
    }),
    prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { requireTwoFactor: true, requireTwoFactorSince: true },
    }),
    countUnusedBackupCodes(session.user.id),
    isOwner
      ? prisma.user.findMany({
          where: { organizationId: session.user.organizationId, id: { not: session.user.id } },
          select: { id: true, email: true, name: true, twoFactorEnabled: true },
          orderBy: { email: 'asc' },
        })
      : Promise.resolve([]),
  ])

  return (
    <PageContainer>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Profile</h1>
        <p className="font-ui text-body text-secondary">
          Your details, how you sign in, and who else can.
        </p>
      </div>

      <ProfileForm
        name={user?.name ?? null}
        email={session.user.email}
        role={session.user.role}
      />

      <TwoFactorSettings
        accountEmail={session.user.email}
        enabled={user?.twoFactorEnabled ?? false}
        enabledAt={user?.twoFactorEnabledAt?.toISOString() ?? null}
        backupCodesRemaining={backupCodesRemaining}
        canEnroll={Boolean(user?.passwordHash)}
        isOwner={isOwner}
        orgRequired={organization?.requireTwoFactor ?? false}
        orgRequiredSince={organization?.requireTwoFactorSince?.toISOString() ?? null}
        teammates={teammates}
      />
    </PageContainer>
  )
}
