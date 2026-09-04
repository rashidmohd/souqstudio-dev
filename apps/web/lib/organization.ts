import 'server-only'

import { prisma } from '@souqstudio/db'
import type { VerifiedSession } from '@/lib/session'

/**
 * The organization's own name, for the rail's org-scope header.
 *
 * Not carried on the session. `SessionUser` flattens `organizationRequiresTwoFactor`
 * because the enrollment gate runs on every request and a second query there
 * would be paid on every request; a display name is not that, and putting it on
 * the session would mean a rename does not show until the session rotates.
 */
export async function organizationName(session: VerifiedSession): Promise<string | null> {
  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { name: true },
  })
  return organization?.name ?? null
}
