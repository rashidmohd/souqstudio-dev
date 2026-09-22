import { requireAdmin } from '@/lib/admin-auth'
import { AdminRail } from '@/components/shared/AdminRail'

/**
 * Every signed-in screen. The rail, and the session check that makes the rail
 * true.
 *
 * **This layout verifying the session does not excuse the pages inside it from
 * doing the same.** A layout runs once per navigation and a page can be
 * requested on its own, so each page calls `requireAdmin()` or
 * `requireAdminRole()` for itself. The check here is what makes the rail
 * possible — it needs the role to decide what to show — and it is deliberately
 * not load-bearing on its own.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin()

  return (
    <div className="flex min-h-screen">
      <AdminRail role={admin.role} name={admin.name} email={admin.email} />
      <main className="min-w-0 flex-1 px-4 py-6">
        <div className="mx-auto flex max-w-full flex-col gap-6">{children}</div>
      </main>
    </div>
  )
}
