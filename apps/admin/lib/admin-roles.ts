/**
 * The staff role vocabulary. E13-01.
 *
 * **A module of its own, with no `server-only`, and the separation is
 * load-bearing.** The rail is a client component and needs two things: what a
 * role is called, and whether it reaches a given section. Both used to live in
 * `admin-auth.ts` beside `requireAdmin`, which imports Prisma, `next/headers`
 * and `server-only` — so a client component asking "what is this role called"
 * pulled the whole session layer and failed the build outright.
 *
 * Same argument as `packages/engine/src/block-category.ts`: a vocabulary is
 * small, stable and safe for a browser to hold. What enforces it is neither.
 */

/** The three roles E13 specifies. */
export const ADMIN_ROLES = ['super_admin', 'catalog_manager', 'support_agent'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value)
}

/**
 * Higher includes every lower one.
 *
 * The three are not a clean ladder in E13's description — a catalog manager and
 * a support agent do different jobs rather than more and less of one — but
 * every capability the panel has today falls into "read", "change the catalog
 * and the prompts" or "change what every shop sees", and those do nest. When a
 * capability appears that a support agent needs and a catalog manager must not
 * have, this becomes a capability map and stops being a rank. Until then a rank
 * is honest and a map would be invented structure.
 */
const ROLE_RANK: Readonly<Record<AdminRole, number>> = {
  support_agent: 1,
  catalog_manager: 2,
  super_admin: 3,
}

export function roleAtLeast(role: AdminRole, minimum: AdminRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum]
}

/** What each role is called on screen. Sentence case, per the design system. */
export const ROLE_LABELS: Readonly<Record<AdminRole, string>> = {
  super_admin: 'Super admin',
  catalog_manager: 'Catalog manager',
  support_agent: 'Support agent',
}
