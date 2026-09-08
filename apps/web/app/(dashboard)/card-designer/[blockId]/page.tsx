import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import { requireCompliantSession } from '@/lib/session'
import { getActiveShop } from '@/lib/active-shop'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { loadBlock } from '@/lib/blocks'
import { DesignerShell } from '@/components/card-designer/DesignerShell'

export const metadata: Metadata = { title: 'Block designer · SouqStudio' }

/**
 * The block designer. E7.
 *
 * **The route is `card-designer/[blockId]`, not `[templateId]`.** The parameter
 * was named after a table that no longer exists — templates and grids were
 * dropped by the composition model, and what an owner designs here is a block.
 * The design skill's layout map is updated to match.
 *
 * A server component that reads the block directly, the same way the editor
 * reads `loadBook`. The client shell takes it from there, because a drag is
 * logical state and belongs in the store.
 *
 * **It keeps the dashboard rail, exactly as `editor/[id]` does.** The design
 * skill says both canvases escape the shell; a nested layout cannot do that —
 * Next nests layouts rather than replacing them, so escaping means a route group
 * outside `(dashboard)`, which is also where the auth gate lives. Matching the
 * editor is the requirement that actually matters here: canvas parity is a hard
 * rule, and a designer that escaped while the editor did not would be the
 * divergence the rule exists to prevent. Written up in `docs/E7-pending.md`.
 */
export default async function CardDesignerPage({ params }: { params: { blockId: string } }) {
  const session = await requireCompliantSession()
  const shop = await getActiveShop(session)
  if (shop === null) notFound()

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { planId: true },
  })

  const block = await loadBlock(params.blockId, session.user.organizationId, organization?.planId ?? null)
  if (block === null) notFound()

  // The shop's *effective* kit, not its own row: a branch that inherits the
  // organization's brand has an empty kit of its own, and drawing the card from
  // that would render every colour as a fallback.
  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  })

  // Editing is a manager's decision, the same bar the API puts on it — a block
  // decides what every future book in the organization looks like. A viewer or
  // an editor opens the designer read-only rather than being sent away: seeing
  // how a card is built is useful, and the controls say who may change it.
  const canEdit = shop.role === 'owner' || shop.role === 'manager'

  return (
    <DesignerShell
      blockId={block.id}
      name={block.name}
      description={block.description}
      status={block.status}
      repeats={block.repeats}
      editable={canEdit && block.organizationId !== null}
      arrangements={block.arrangements}
      kit={brand.brandKit}
      shopName={shop.name}
    />
  )
}
