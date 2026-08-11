import 'server-only'

import { enqueueEmail, prisma, Prisma } from '@souqstudio/db'
import type { InviteStatus, Role, ShopGrant } from '@souqstudio/types'
import { env } from '@/lib/env'
import { expiryFrom, generateToken, hashToken, INVITE_TTL_MS } from '@/lib/tokens'

/**
 * Invites. E2-03.
 *
 * A single secret, unlike everything else in lib/tokens.ts's orbit.
 * `VerificationToken` pairs an emailed code with a cookie token, which proves
 * the person reading the inbox is the person at the browser — right for
 * verifying your own address, impossible for an invite, which is opened on a
 * device that has never seen this product and may have been forwarded there.
 * So the token in the URL is the whole credential, and it carries 256 bits to
 * make that safe.
 *
 * Only the hash is stored. A leaked dump of `invites` cannot be replayed into
 * an organization.
 */

/** Escalating cooldown between sends to one address, in minutes. */
const RESEND_COOLDOWN_MINUTES = [1, 3, 10, 60]

function cooldownMsFor(resendCount: number): number {
  const index = Math.min(resendCount, RESEND_COOLDOWN_MINUTES.length - 1)
  return (RESEND_COOLDOWN_MINUTES[index] ?? 60) * 60 * 1000
}

/**
 * Seconds until this address may be invited again. Zero means now.
 *
 * The same escalation as verification codes, and for the same reason: cheap for
 * one honest retry when a colleague says the mail never arrived, expensive for
 * anyone using an authenticated endpoint as a mail bomb. Rate limiting is still
 * an open gap repo-wide; this is the local defence, not a substitute.
 */
export function retryAfterSeconds(
  invite: { lastSentAt: Date | null; resendCount: number } | null,
  now: Date = new Date()
): number {
  if (!invite?.lastSentAt) return 0
  const readyAt = invite.lastSentAt.getTime() + cooldownMsFor(invite.resendCount)
  return Math.max(0, Math.ceil((readyAt - now.getTime()) / 1000))
}

/**
 * What a row means, derived rather than stored.
 *
 * There is no `status` column deliberately. Every one of these follows from a
 * timestamp, and storing it too would give two answers that can disagree — an
 * invite that says "pending" while its `expiresAt` is last week.
 */
export function inviteStatus(
  invite: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date()
): InviteStatus {
  if (invite.acceptedAt) return 'accepted'
  if (invite.revokedAt) return 'revoked'
  if (invite.expiresAt <= now) return 'expired'
  return 'pending'
}

export function isRedeemable(
  invite: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date()
): boolean {
  return inviteStatus(invite, now) === 'pending'
}

/** Shop grants stored as JSON, read back defensively. */
export function toShopGrants(value: unknown): ShopGrant[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { shopId, role } = entry as { shopId?: unknown; role?: unknown }
    if (typeof shopId !== 'string' || !shopId) return []
    return [
      typeof role === 'string' && role !== 'owner'
        ? { shopId, role: role as Exclude<Role, 'owner'> }
        : { shopId },
    ]
  })
}

export type IssuedInvite = {
  id: string
  email: string
  role: string
  expiresAt: Date
  /** The raw token. Exists only here and in the email — never stored, never logged. */
  token: string
}

/**
 * Create an invite, or rotate the one already outstanding for this address.
 *
 * One code path for "invite" and "resend expired invite", because the unique
 * constraint on (organizationId, email) means they are the same write. Resend
 * is not a different act — it is this one, done again.
 */
export async function issueInvite(input: {
  organizationId: string
  email: string
  role: Exclude<Role, 'owner'>
  shopGrants: ShopGrant[]
  invitedById: string
}): Promise<IssuedInvite> {
  const token = generateToken()
  const expiresAt = expiryFrom(INVITE_TTL_MS)
  const email = input.email.trim().toLowerCase()

  // Prisma's JSON input rejects an optional property typed `role?: X | undefined`
  // under exactOptionalPropertyTypes, and ShopGrant deliberately keeps that
  // shape so "no override" is distinct from "override with nothing". Rebuilt
  // key by key so the stored JSON has no undefined in it, then cast — the same
  // trade as the BrandKit write in lib/brand-kit.ts.
  const shopGrants = input.shopGrants.map((grant) =>
    grant.role ? { shopId: grant.shopId, role: grant.role } : { shopId: grant.shopId }
  ) as Prisma.InputJsonValue

  const invite = await prisma.invite.upsert({
    where: {
      organizationId_email: { organizationId: input.organizationId, email },
    },
    create: {
      organizationId: input.organizationId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedById: input.invitedById,
      shopGrants,
      expiresAt,
      lastSentAt: new Date(),
    },
    update: {
      role: input.role,
      // A new token every send, so an old link in an old inbox stops working
      // the moment a new one is issued.
      tokenHash: hashToken(token),
      invitedById: input.invitedById,
      shopGrants,
      expiresAt,
      // Re-inviting someone whose invite was revoked or had expired revives the
      // row rather than refusing it. Refusing would leave no way to fix a
      // mistake short of a database edit.
      acceptedAt: null,
      revokedAt: null,
      resendCount: { increment: 1 },
      lastSentAt: new Date(),
    },
    select: { id: true, email: true, role: true, expiresAt: true },
  })

  return { ...invite, token }
}

/**
 * Send the invitation.
 *
 * The template and its worker registration already exist —
 * packages/email/src/templates/auth/UserInvite.tsx, keyed 'user-invite'. E2
 * supplies the props and writes no template.
 *
 * Failure is swallowed by the caller, not here: the invite row is already
 * written, and "resend" exists precisely so a dropped email is recoverable.
 */
export async function sendInviteEmail(input: {
  to: string
  token: string
  inviterName: string
  organizationName: string
  role: string
}): Promise<void> {
  await enqueueEmail({
    template: 'user-invite',
    to: input.to,
    props: {
      inviterName: input.inviterName,
      organizationName: input.organizationName,
      role: input.role,
      acceptUrl: `${env.NEXTAUTH_URL.replace(/\/$/, '')}/invite/${input.token}`,
      expiresInHours: Math.round(INVITE_TTL_MS / (60 * 60 * 1000)),
    },
  })
}

/** Look an invite up by the raw token from the link. */
export async function findInviteByToken(token: string) {
  return prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      organizationId: true,
      email: true,
      role: true,
      shopGrants: true,
      invitedById: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      organization: { select: { name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  })
}
