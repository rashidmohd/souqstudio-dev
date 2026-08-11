import { prisma } from '@souqstudio/db'
import { ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { countUnusedBackupCodes } from '@/lib/two-factor'
import { BACKUP_CODES_LOW_WATERMARK } from '@/lib/backup-codes'

/**
 * E1-03 — the state of two-factor for the signed-in user.
 *
 * Counts only. There is no endpoint anywhere that returns a backup code or a
 * secret after the moment it was created; see the note in backup-codes/route.ts.
 */

export async function GET() {
  const { session, response } = await requireApiSession({ allowPendingTwoFactor: true })
  if (!session) return response

  const [user, backupCodesRemaining] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true, twoFactorEnabledAt: true, passwordHash: true },
    }),
    countUnusedBackupCodes(session.user.id),
  ])

  return ok({
    enabled: user?.twoFactorEnabled ?? false,
    enabledAt: user?.twoFactorEnabledAt ?? null,
    backupCodesRemaining,
    backupCodesLow: backupCodesRemaining <= BACKUP_CODES_LOW_WATERMARK,
    orgRequired: session.user.organizationRequiresTwoFactor,
    // The setup flow re-authenticates with a password, so a Google-only account
    // needs to be told to set one before it can start.
    canEnroll: Boolean(user?.passwordHash) && Boolean(session.user.emailVerifiedAt),
  })
}
