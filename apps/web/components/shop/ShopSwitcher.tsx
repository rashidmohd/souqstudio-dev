'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronsUpDown } from 'lucide-react'
import type { ShopOption } from '@/lib/shops'
import { nameInitials } from '@/lib/initials'
import { cn } from '@/lib/utils'

/**
 * The shop switcher at the head of the rail's shop zone. E2-02, and the last
 * unbuilt piece of layout-map.md's rail diagram.
 *
 * **A bare native `<select>`, not `components/ui/select.tsx`.** The inventory
 * left this open with the objection that "a native select in the rail reads as
 * a form field in a navigation column" — and that is true of `Select`, which is
 * a labelled 8px rectangle by design. It is not true of the element itself. So
 * the row is our own markup and the select is laid transparently over it: no
 * label above, no rectangle, nothing that reads as a field, and on the tablet a
 * shop owner is actually holding, the platform picker, its scroll physics and
 * its accessibility tree still come for free. That is the same reasoning the
 * inventory gives for `Select` being native underneath.
 *
 * The visible markup is `aria-hidden` and the select carries the accessible
 * name, so the row is announced once, as one control.
 *
 * **One shop renders no control at all.** A disabled switcher would be a
 * control whose reason is invisible, which is the thing the design system's
 * disabled rule exists to prevent. With one shop there is nothing to switch to,
 * so the row is just the label saying where you are.
 */
export function ShopSwitcher({
  shops,
  activeShopId,
  collapsed,
}: {
  shops: ShopOption[]
  activeShopId: string | null
  collapsed: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  // The cookie is a hint the server re-checks, so it can point at a shop this
  // list does not contain — access revoked between two requests. Falling back
  // to the first reachable shop matches what getActiveShop() does server-side.
  const active = shops.find((shop) => shop.id === activeShopId) ?? shops[0]
  if (!active) return null

  const switchable = shops.length > 1

  async function switchTo(shopId: string) {
    if (!active || shopId === active.id) return
    setPending(true)
    try {
      // The route sets the cookie because the route is where access is
      // verified — see app/api/v1/shops/active. `refresh()` because every
      // shop-scoped server component above re-reads it.
      const response = await fetch('/api/v1/shops/active', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shopId }),
      })
      if (response.ok) router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className={cn(
        'relative flex min-h-control items-center rounded-control',
        'transition-colors duration-fast ease-sq',
        switchable && 'hover:bg-stone-100',
        // The select is transparent, so the ring has to come from the wrapper
        // or a keyboard user sees nothing at all.
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-border-focus',
        pending && 'opacity-disabled',
        collapsed ? 'justify-center' : 'justify-center lg:justify-start lg:gap-3 lg:px-3'
      )}
    >
      {/* A rounded square on sky-tint, against the account row's sand circle.
          A shop is a thing and a person is a person; the two marks sit at
          opposite ends of the same rail and must not be mistaken for each
          other. Charcoal on sky-tint is 9.7:1. */}
      <span
        aria-hidden="true"
        className="inline-flex h-chip w-chip shrink-0 items-center justify-center rounded-chip bg-sky-tint font-ui text-label font-medium text-charcoal"
      >
        {nameInitials(active.name)}
      </span>

      {collapsed ? null : (
        <>
          <span
            aria-hidden="true"
            className="hidden truncate font-ui text-body font-medium text-primary lg:inline"
          >
            {active.name}
          </span>
          {switchable ? (
            <ChevronsUpDown
              aria-hidden="true"
              className="ms-auto hidden size-icon shrink-0 text-muted lg:block"
            />
          ) : null}
        </>
      )}

      {switchable ? (
        <select
          aria-label="Active shop"
          value={active.id}
          disabled={pending}
          onChange={(event) => switchTo(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}
