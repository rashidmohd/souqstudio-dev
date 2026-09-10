import type { NextRequest } from 'next/server'
import { CREDIT_COSTS, enqueueMagicBlock, getCreditSnapshot, prisma } from '@souqstudio/db'
import { MAGIC_CATEGORIES, type MagicCategory } from '@souqstudio/engine'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'

/**
 * Magic block — a picture of a card in, a block in the library out. E8-07.
 *
 * The owner photographs or screenshots something they want — an offer card, a
 * header, a panel, a footer or a square social post — says which of those it is,
 * and a vision model decides which of the library's designs for *that kind* it
 * matches. What comes back is a **draft block in the designer**, never a
 * published one — the same shape E7 §8 settled on for every other way a block is
 * created: an escape hatch from a good starting point, not a blank artboard and
 * not a finished thing nobody looked at.
 *
 * **This route starts a job and returns. It never calls a model.** A vision call
 * is seconds at best, and `background-jobs.md` is unambiguous that no route
 * blocks on work that can exceed a second. The row goes in first so the client
 * always has something to poll.
 *
 * **Nothing is charged here.** Credits are checked so an owner who cannot pay is
 * refused before the work starts, and deducted by the worker on success. That
 * ordering is what makes a failed job need no refund path — there is nothing to
 * refund, which is the only version of this that cannot leak credits.
 */

const schema = z.object({
  /**
   * The R2 object key the presigned upload wrote — `POST /api/v1/blocks/artwork`
   * hands it back as `assetId`. There is no second upload route: the designer
   * already has one that takes a PNG, JPG or WebP straight into the bucket
   * without the bytes passing through a serverless function, and a picture of a
   * card is the same kind of object as artwork for a card.
   */
  sourceKey: z.string().min(1).max(200),
  /**
   * What kind of thing the owner says the picture is.
   *
   * **It is the owner's answer and it binds the model**, which is why it is
   * validated here rather than passed through: it selects the vocabulary the
   * worker shows a model and the schema the reply is held to, so an unrecognised
   * value is not a bad label on a good block — it is a job that cannot be built
   * at all. `seasonal` is deliberately not among them; `block-category.ts` says
   * why.
   *
   * Defaulted rather than required, because an offer card is what this feature
   * was for a version ago and a client that has not caught up should still get
   * the thing it used to ask for.
   */
  category: z
    .enum(MAGIC_CATEGORIES as unknown as [MagicCategory, ...MagicCategory[]])
    .default('offer-card'),
})

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  // The same bar the rest of E7 puts on authoring: a block changes what every
  // future book in the organization looks like.
  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_input', 'Upload a picture of the card first.', 422)
  }

  const { organizationId } = session.user

  /**
   * **The key must be this organization's, and that is checked rather than
   * assumed.** A key arrives from the client, and the presign route mints it as
   * `<organizationId>/blocks/<random>` — so a caller who edits one character of
   * the prefix is asking the worker to read another tenant's object and turn it
   * into their block. Reading the org from the session is only half the rule;
   * this is the other half.
   */
  const prefix = `${organizationId}/blocks/`
  if (!parsed.data.sourceKey.startsWith(prefix) || parsed.data.sourceKey.includes('..')) {
    return fail('invalid_input', 'That upload does not belong to this organization.', 422)
  }

  const cost = CREDIT_COSTS.block_gen
  const snapshot = await getCreditSnapshot(organizationId)
  if (snapshot.total < cost) {
    return fail(
      'insufficient_credits',
      `Reading a card costs ${cost} credits and you have ${snapshot.total}. Top up to carry on.`,
      402
    )
  }

  const job = await prisma.aiJob.create({
    data: {
      organizationId,
      // No `shopId`. A block belongs to the organization — a chain designs a
      // card once and every shop in it uses that card.
      type: 'block_gen',
      status: 'queued',
      creditsCost: cost,
    },
    select: { id: true },
  })

  try {
    await enqueueMagicBlock({
      jobId: job.id,
      organizationId,
      sourceKey: parsed.data.sourceKey,
      category: parsed.data.category,
    })
  } catch {
    /**
     * A dead queue is reported, not swallowed.
     *
     * The catalog contribution route deliberately lets a failed enqueue pass,
     * because the row it wrote is the useful artefact and the cutout is a
     * garnish. Here the job *is* the product: leaving the row at `queued` would
     * give the client something to poll forever. Marking it failed is what the
     * poll route turns into a sentence the owner can act on.
     */
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: 'queue_unavailable', completedAt: new Date() },
    })
    return fail('queue_unavailable', 'We could not start that just now. Try again in a moment.', 503)
  }

  return ok({ jobId: job.id, creditsCost: cost }, 202)
}
