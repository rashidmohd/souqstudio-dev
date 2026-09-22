'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Blocks,
  LayoutDashboard,
  Package,
  ScrollText,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROLE_LABELS, roleAtLeast, type AdminRole } from '@/lib/admin-roles'

/**
 * The admin rail. E13 — `apps/admin/CLAUDE.md`.
 *
 * **One scope zone, where the shop owner rail has two.** That rail is split by a
 * hard divider into shop scope and org scope because every screen there belongs
 * to one or the other and users get confused when they mix. Nothing here
 * belongs to an organization at all: every screen is platform-wide, so a
 * divider would be separating two things that are the same thing.
 *
 * Items the signed-in role cannot use are **not rendered**, rather than rendered
 * disabled. A disabled control must show its reason on the screen, and "your
 * role does not include this" is not a reason a person can act on — there is
 * nothing for them to do about it but ask somebody else.
 */

type Item = {
  href: string
  label: string
  icon: LucideIcon
  minimum: AdminRole
}

const ITEMS: readonly Item[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, minimum: 'support_agent' },
  { href: '/catalog', label: 'Catalog', icon: Package, minimum: 'support_agent' },
  { href: '/blocks', label: 'Block library', icon: Blocks, minimum: 'support_agent' },
  { href: '/prompts', label: 'AI prompts', icon: Sparkles, minimum: 'catalog_manager' },
  { href: '/audit', label: 'Audit log', icon: ScrollText, minimum: 'support_agent' },
]

export function AdminRail({
  role,
  name,
  email,
}: {
  role: AdminRole
  name: string | null
  email: string
}) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Admin sections"
      className="flex h-full w-rail shrink-0 flex-col gap-4 border-e border-border-subtle bg-surface p-3"
    >
      <div className="flex flex-col gap-px px-2 py-1">
        <span className="font-display text-subhead text-primary">SouqStudio</span>
        <span className="text-eyebrow uppercase text-muted">Admin</span>
      </div>

      <ul className="flex flex-col gap-1">
        {ITEMS.filter((item) => roleAtLeast(role, item.minimum)).map((item) => {
          // `startsWith` on every item but the root, so a detail page keeps its
          // section highlighted. The root would match everything.
          const active =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-control items-center gap-3 rounded-control px-2 text-body transition-colors duration-fast ease-sq',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
                  active
                    ? 'bg-selected-bg text-selected-fg'
                    : 'text-secondary hover:bg-stone-100 hover:text-primary'
                )}
              >
                <Icon className="size-icon shrink-0" strokeWidth={2} aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-2 border-t border-border-subtle pt-3">
        <div className="flex flex-col px-2">
          <span className="truncate text-body-sm text-primary" title={email}>
            {name ?? email}
          </span>
          <span className="text-label text-muted">{ROLE_LABELS[role]}</span>
        </div>
        {/*
          A form rather than a link, because logging out revokes a row and must
          not be reachable by anything that prefetches a GET.
        */}
        <form action="/api/v1/admin/auth/logout" method="post">
          <button
            type="submit"
            className="flex h-control w-full items-center rounded-control px-2 text-start text-body text-secondary transition-colors duration-fast ease-sq hover:bg-stone-100 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            Log out
          </button>
        </form>
      </div>
    </nav>
  )
}
