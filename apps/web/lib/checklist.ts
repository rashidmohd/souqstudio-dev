import 'server-only'

import { prisma } from '@souqstudio/db'
import type { BrandKit } from '@souqstudio/types'
import { isBrandSetupComplete } from '@/lib/brand-kit'
import { EDITOR_BUILT, SHARING_BUILT, TEAM_BUILT, INSTAGRAM_BUILT } from '@/lib/features'

/**
 * The getting-started checklist. E1-05.
 *
 * **Every item is measured, never remembered.** There is no "completed" column
 * for any of these — each one is a question about the data, so the answer stays
 * true if a shop deletes its only offer book or removes its last teammate. A
 * stored flag would drift from reality the first time that happened, and a
 * checklist that lies about your own account is worse than no checklist.
 *
 * The counts are deliberately `take: 1` existence checks rather than totals.
 * Nothing here needs to know that a shop has 400 offer books, only that it has
 * one — and the difference matters on a list that grows.
 */

export type ChecklistItemId =
  | 'brand'
  | 'first_book'
  | 'share_book'
  | 'invite_team'
  | 'connect_instagram'

export type ChecklistItem = {
  id: ChecklistItemId
  label: string
  done: boolean
  /** Optional items do not hold back completion. E1-05 marks Instagram so. */
  optional: boolean
  /** Where the item sends someone, or null while that screen does not exist. */
  href: string | null
  /** Shown when `href` is null, so a dead item is never unexplained. */
  unavailableReason?: string
}

export type ChecklistState = {
  items: ChecklistItem[]
  /** Required items only — Instagram never blocks this. */
  allRequiredDone: boolean
  /** E1-05: dismissible once the first offer book is published. */
  dismissible: boolean
  dismissed: boolean
  /** Whether to render it at all. */
  visible: boolean
}

const NOT_BUILT = 'Coming soon'

export async function readChecklist(input: {
  userId: string
  organizationId: string
  shopIds: string[]
  brandKit: BrandKit
  dismissedAt: Date | null
}): Promise<ChecklistState> {
  const { shopIds } = input

  const [firstBook, publishedBook, teammate, instagram] = await Promise.all([
    shopIds.length
      ? prisma.offerBook.findFirst({ where: { shopId: { in: shopIds } }, select: { id: true } })
      : null,
    shopIds.length
      ? prisma.offerBook.findFirst({
          where: { shopId: { in: shopIds }, status: 'published' },
          select: { id: true },
        })
      : null,
    // More than one user in the organization means somebody was invited. The
    // owner themselves is not a teammate.
    prisma.user.findFirst({
      where: { organizationId: input.organizationId, id: { not: input.userId } },
      select: { id: true },
    }),
    shopIds.length
      ? prisma.socialConnection.findFirst({
          where: { shopId: { in: shopIds }, platform: 'instagram' },
          select: { id: true },
        })
      : null,
  ])

  const items: ChecklistItem[] = [
    {
      id: 'brand',
      label: 'Set up your brand',
      done: isBrandSetupComplete(input.brandKit),
      optional: false,
      href: '/onboarding',
    },
    {
      id: 'first_book',
      label: 'Create your first offer book',
      done: Boolean(firstBook),
      optional: false,
      ...link(EDITOR_BUILT, '/editor/new'),
    },
    {
      id: 'share_book',
      label: 'Share your first offer book',
      done: Boolean(publishedBook),
      optional: false,
      ...link(SHARING_BUILT, '/'),
    },
    {
      id: 'invite_team',
      label: 'Invite a team member',
      done: Boolean(teammate),
      optional: false,
      ...link(TEAM_BUILT, '/settings/team'),
    },
    {
      id: 'connect_instagram',
      label: 'Connect Instagram',
      done: Boolean(instagram),
      optional: true,
      ...link(INSTAGRAM_BUILT, '/settings/shops'),
    },
  ]

  const allRequiredDone = items.filter((item) => !item.optional).every((item) => item.done)
  const dismissed = input.dismissedAt !== null

  return {
    items,
    allRequiredDone,
    // E1-05 ties dismissal to publishing, not to finishing every item. Someone
    // who has shared an offer book has seen the product work; keeping the list
    // on their dashboard after that is nagging.
    dismissible: Boolean(publishedBook),
    dismissed,
    // Hidden once everything required is done, even undismissed — the list has
    // nothing left to say.
    visible: !dismissed && !allRequiredDone,
  }
}

/** A destination, or an explained absence. */
function link(built: boolean, href: string) {
  return built ? { href } : { href: null, unavailableReason: NOT_BUILT }
}
