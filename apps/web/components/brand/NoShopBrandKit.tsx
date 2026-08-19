'use client'

import { useRouter } from 'next/navigation'
import { EmptyState } from '@/components/shared/empty-state'

/**
 * The brand kit with no shop to hold one.
 *
 * Reachable when every shop the session can see has been archived, or when a
 * teammate's per-shop access has just been revoked. Rare, and it has to render
 * something: the alternative is a page of empty sections saving into nothing.
 *
 * A client component only because `EmptyState`'s action takes a function, which
 * cannot cross the server boundary.
 */
export function NoShopBrandKit() {
  const router = useRouter()

  return (
    <EmptyState
      kind="empty"
      title="No shop to brand yet"
      body="A brand kit belongs to a shop — its logo, its colours, and the look of every offer book it makes."
      action={{
        label: 'Add a shop',
        onClick: () => router.push('/settings/shops'),
      }}
      // No illustration. Every slot in the manifest is still `todo`, and
      // shipping a placeholder box where artwork belongs is explicitly barred.
    />
  )
}
