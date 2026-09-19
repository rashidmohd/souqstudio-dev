import type { NextRequest } from 'next/server'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { prisma } from '@souqstudio/db'
import { blockUsage, loadBlock } from '@/lib/blocks'

/**
 * Where else this design is drawn, and whether the shop may change it at all.
 *
 * **The question the editor asks before it opens a designer.** A block is
 * organization-wide: editing the card in Week 33 edits it in Week 31 and in
 * Ramadan 2026, and an owner who finds that out afterwards has changed three
 * printed books by accident. So the window is preceded by this, and what comes
 * back decides which of three things happens — edit it, fork it, or ask.
 *
 * **`seeded` is the other half of the answer and it is not a warning.** A block
 * with no organization is SouqStudio's, shared by every account and read-only
 * to all of them, so "edit" on one is really "duplicate, repoint, then edit".
 * The client cannot tell from the block alone — `loadBlock` returns seeded and
 * owned blocks through one shape on purpose — so it is said here.
 *
 * A GET, and no role gate: this reports on what the shop can already see, and
 * a viewer who may not design still benefits from being told a card is shared
 * before they open it read-only. The writes it leads to have their own gates.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  // Inlined, as every other block route does it. Six of them read the plan
  // this way; extracting it is a sweep of its own rather than a detour here.
  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { planId: true },
  })

  const block = await loadBlock(
    params.id,
    session.user.organizationId,
    organization?.planId ?? null
  )
  if (block === null) return fail('not_found', 'That block does not exist.', 404)

  /*
   * The book the owner is editing, dropped from the list. Read from the query
   * rather than inferred, because this route has no idea where it was called
   * from — and naming the book they are looking at as a reason for caution is
   * noise they have to read past every time.
   *
   * Unvalidated beyond its presence: it only ever *removes* a row from a list
   * already scoped to this organization, so the worst a wrong id can do is
   * leave the list one book longer than it needed to be.
   */
  const exclude = request.nextUrl.searchParams.get('exclude')

  const books = await blockUsage(
    params.id,
    session.user.organizationId,
    exclude ?? undefined
  )

  return ok({
    // Null organization means ours. The client needs the fact, not the id.
    seeded: block.organizationId === null,
    locked: block.locked,
    name: block.name,
    books,
  })
}
