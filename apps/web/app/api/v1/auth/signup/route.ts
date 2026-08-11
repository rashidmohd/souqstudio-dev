import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { hashPassword } from '@/lib/password'
import { issueSession } from '@/lib/session'
import { issueCode } from '@/lib/verification'

/**
 * E1-01 signup. Creates Organization + Shop + Owner in a single transaction,
 * signs the user in, and queues the verification email.
 *
 * No credit card, no manual provisioning. This has to work for a shop owner in
 * Dubai at 11pm on a Friday with nobody to ask.
 */

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  // Length only. Composition rules push people toward "Password1!" and a
  // sticky note; length is what actually costs an attacker.
  password: z.string().min(10).max(200),
  shopName: z.string().trim().min(1).max(120),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Check the highlighted fields and try again.', 422)
  }
  const { name, email, password, shopName } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    // Signup is one of the few places account existence cannot be hidden — the
    // owner has to be told why they cannot proceed. Point at recovery rather
    // than confirming anything else about the account.
    return fail(
      'email_taken',
      'That email already has an account. Log in, or reset the password if you have forgotten it.',
      409
    )
  }

  const passwordHash = await hashPassword(password)

  // One transaction: an org without an owner, or an owner without a shop, is a
  // dead account that no self-serve flow can repair.
  const user = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: shopName, email },
    })
    await tx.shop.create({
      data: { organizationId: organization.id, name: shopName },
    })
    const created = await tx.user.create({
      data: {
        organizationId: organization.id,
        email,
        name,
        passwordHash,
        role: 'owner', // whoever signs up owns the organization
      },
    })
    return created
  })

  // The one place outside lib/login.ts that calls issueSession directly, and
  // the only one that may: an account created a moment ago cannot have
  // two-factor switched on, so there is no second factor to check. Any *other*
  // route that signs someone in must go through completeLogin — see the note in
  // lib/login.ts about the Google handler.
  await issueSession(user.id, {
    ipHash: hashClientIp(req),
    userAgent: req.headers.get('user-agent') ?? undefined,
  })

  // Emails the six-digit code and sets the paired token cookie. Queued, so a
  // slow mail provider cannot slow signup and a failed send cannot fail an
  // account that already exists.
  await issueCode(email, 'email_verification')

  return ok({ id: user.id, email: user.email, needsVerification: true }, 201)
}

/**
 * Hashed before storage — an IP is personal data under GDPR and the UAE PDPL,
 * and "is this a new location" only needs equality.
 */
function hashClientIp(req: NextRequest): string | undefined {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim()
  if (!ip) return undefined
  return createHash('sha256').update(ip).digest('hex')
}
