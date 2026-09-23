'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { NAV_ROW_LABEL, NAV_ROW_LEADING, navRowClass } from '@/components/shared/nav-item'
import { toast } from '@souqstudio/designer/components/ui/toast'
import { cn } from '@souqstudio/designer/lib/utils'

/**
 * The way out. Pinned to the foot of the rail under `Profile`, in the user
 * zone — logging out follows the person, not the business.
 *
 * **It existed as a route and nothing else.** `POST /api/v1/auth/logout` was
 * built by E1-03 so the forced two-factor screen could offer an exit, and the
 * only caller in the product was that screen: a signed-in owner on any ordinary
 * page had no way to sign out at all.
 *
 * **A rail row, not a button beside one** — the second row built from
 * `nav-item`'s exported shape rather than a copy of its measurements, after
 * `UnfinishedWork`. It renders a `<button>` for the same reason that one does:
 * there is no destination. The rail's rule against linking to a route that does
 * not exist is kept, and so is the one about a row's label naming what happens.
 *
 * **No confirmation.** The design system prefers undo over confirm, and here
 * the undo is logging back in. A dialog would charge every exit for a mistake
 * that costs one password.
 *
 * `push` then `refresh`, in that order and both of them: the cookie is gone by
 * the time this runs, so the shell above must re-render against no session or
 * the next back-navigation paints a signed-in rail.
 */
export function LogOutRow({ collapsed }: { collapsed: boolean }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function logOut() {
    if (pending) return
    setPending(true)
    try {
      const res = await fetch('/api/v1/auth/logout', { method: 'POST' })
      // The route answers the same whether or not a session was live, so
      // anything but a 2xx is the network or the server, never "you were
      // already signed out".
      if (!res.ok) throw new Error('logout failed')
      router.push('/login')
      router.refresh()
    } catch {
      // Saying so matters more here than anywhere: someone who believes they
      // have signed out of a shared tablet and has not is the failure this
      // message exists to prevent.
      toast({ message: 'Could not log you out. Check your connection and try again.', tone: 'critical' })
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void logOut()}
      disabled={pending}
      // Always set, at every width — the label is hidden by CSS on a narrow
      // rail, never semantically. Same contract as NavItem.
      aria-label="Log out"
      title="Log out"
      // `w-full` because a button does not fill its column the way an anchor
      // does, and without it the hover tint is the width of the text.
      className={cn(navRowClass({ collapsed }), 'w-full disabled:opacity-disabled')}
    >
      <span className={NAV_ROW_LEADING}>
        {/* The glyph points out of the rail, so it mirrors when the rail moves
            to the other edge in Arabic. A transform, not a physical class. */}
        <LogOut className="size-icon-lg rtl:-scale-x-100" aria-hidden="true" />
      </span>
      {collapsed ? null : <span className={NAV_ROW_LABEL}>Log out</span>}
    </button>
  )
}
