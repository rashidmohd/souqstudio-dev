import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { DashboardRail } from '@/components/shared/dashboard-rail'
import { RAIL_COOKIE, parseRailState } from '@/lib/rail-preference'
import { requireCompliantSession } from '@/lib/session'

/**
 * The app shell. Layout family 1 — see the design skill →
 * references/layout-map.md.
 *
 * `requireCompliantSession()` is the gate: signed in, email verified, and
 * satisfying the organization's two-factor policy. Every page under this group
 * inherits it. It is a *routing* gate — pages still verify for themselves where
 * confidentiality is at stake.
 *
 * **Nothing this layout renders may take a function prop.** The rail lives in
 * its own client component and imports its own icons, because `NavItem` takes a
 * Lucide component and a function cannot be serialized across the server/client
 * boundary — doing it from here 500s every page under the shell. A string is
 * not a function, which is why `initialState` may cross: reading the rail
 * preference here is what lets the rail render at its remembered width on the
 * server, instead of flashing the default one and correcting after hydration.
 *
 * The route the gate redirects to must live outside this group, or the gate
 * guards its own destination and redirects forever. See TWO_FACTOR_SETUP_PATH.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireCompliantSession()
  const railState = parseRailState(cookies().get(RAIL_COOKIE)?.value)

  return (
    <div className="flex min-h-screen bg-page">
      <DashboardRail initialState={railState} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
