import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'

/**
 * The offer book somebody started and has not finished.
 * `docs/E6-create-flow.md` §21.
 *
 * **A draft of the journey, not of the book.** Nothing here is a product, an
 * offer or a book — creating one of those writes rows an owner has not agreed
 * to yet, and half the point of this is that they have not finished agreeing.
 * It is the wizard's own state, restored into the same wizard.
 *
 * **The server does not read `state`.** It is written by `NewBookWizard` and
 * given back to `NewBookWizard`; nothing else parses it, and no decision
 * anywhere depends on its shape. So it is validated for *size and safety*
 * rather than for meaning: an object, bounded, belonging to this shop and this
 * person. The day the server needs to reason about a field in it, that field
 * stops being state and becomes a column.
 *
 * **Per person, not per shop.** Two staff starting different books must not
 * overwrite each other. The unique index is `(shopId, userId)` and the upsert
 * below is what makes saving idempotent — the wizard writes on a debounce and
 * would otherwise race itself into two rows.
 */

/**
 * 512 KB of JSON.
 *
 * A two-hundred-row sheet with its candidates is tens of kilobytes; this is
 * loose enough never to be met by a real sheet and tight enough that a bug or a
 * paste cannot put a megabyte into a row that is read on every visit to the
 * create screen. Measured on the serialized text, because that is what is
 * stored.
 */
const MAX_STATE_BYTES = 512 * 1024

const saveSchema = z.object({
  state: z.record(z.unknown()),
})

export async function GET() {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return ok({ draft: null })

  const draft = await prisma.offerBookDraft.findUnique({
    where: { shopId_userId: { shopId: shop.id, userId: session.user.id } },
    select: { state: true, updatedAt: true },
  })

  // **Null is an answer, not a 404.** "You have nothing half-finished" is the
  // ordinary case and the screen renders the same either way; a 404 would make
  // every first visit log an error.
  return ok({
    draft: draft === null ? null : { state: draft.state, updatedAt: draft.updatedAt.toISOString() },
  })
}

export async function PUT(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'Create a shop before making an offer book.', 400)
  if (shop.role === 'viewer') {
    return fail('forbidden', 'You need edit access to make an offer book.', 403)
  }

  const body = await request.json().catch(() => null)
  const parsed = saveSchema.safeParse(body)
  if (!parsed.success) return fail('invalid_request', 'That could not be saved.', 422)

  if (JSON.stringify(parsed.data.state).length > MAX_STATE_BYTES) {
    return fail(
      'too_large',
      'That price list is too big to save as a draft. Create the book now, or split the file.',
      413
    )
  }

  const draft = await prisma.offerBookDraft.upsert({
    where: { shopId_userId: { shopId: shop.id, userId: session.user.id } },
    create: {
      organizationId: session.user.organizationId,
      shopId: shop.id,
      userId: session.user.id,
      state: parsed.data.state as object,
    },
    update: { state: parsed.data.state as object },
    select: { updatedAt: true },
  })

  return ok({ updatedAt: draft.updatedAt.toISOString() })
}

/**
 * Throw away what was started.
 *
 * Called on two very different occasions and deliberately not told which: the
 * owner pressing "start again", and the book being created. **Both mean the
 * journey is over**, and a draft that outlives the book it became is a "continue
 * where you left off" pointing at work already done.
 */
export async function DELETE() {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return ok({ deleted: false })

  // `deleteMany`, not `delete`: deleting a draft that is not there is the
  // expected outcome of creating a book without ever saving one, and `delete`
  // would raise on it.
  const { count } = await prisma.offerBookDraft.deleteMany({
    where: { shopId: shop.id, userId: session.user.id },
  })

  return ok({ deleted: count > 0 })
}
