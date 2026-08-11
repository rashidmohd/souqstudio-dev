import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import { TwoFactorChallenge } from '@/components/auth/TwoFactorChallenge'
import { readChallenge, countUnusedBackupCodes } from '@/lib/two-factor'

export const metadata: Metadata = { title: 'Two-factor authentication · SouqStudio' }

/**
 * E1-03 — the second factor at login.
 *
 * Reached with a challenge cookie and no session. It is in middleware's public
 * list for exactly that reason; the gate here is the challenge itself.
 *
 * `next` is read server-side and sanitised the same way the login page does it.
 * An absolute URL would turn the challenge into an open redirect.
 */
export default async function TwoFactorChallengePage({
  searchParams,
}: {
  searchParams: { next?: string }
}) {
  const challenge = await readChallenge()
  // No challenge means no password step, an expired one, or one already spent.
  // Back to the start rather than a screen that cannot succeed.
  if (!challenge) redirect('/login')

  const [user, backupCodesRemaining] = await Promise.all([
    prisma.user.findUnique({
      where: { id: challenge.userId },
      select: { email: true },
    }),
    countUnusedBackupCodes(challenge.userId),
  ])

  const requested = searchParams.next ?? ''
  const safeNext = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/'

  return (
    <div className="w-full max-w-md">
      <TwoFactorChallenge
        email={user?.email ?? null}
        next={safeNext}
        hasBackupCodes={backupCodesRemaining > 0}
      />
    </div>
  )
}
