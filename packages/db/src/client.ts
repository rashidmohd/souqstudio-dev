import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/**
 * Run a unit of work with the PostgreSQL row-level security context set.
 *
 * E2 ships this seam ahead of the policies themselves so that new code is
 * written through it from the start. Until the RLS migration lands this is
 * behaviourally a plain transaction — correct, and slightly slower than a bare
 * query. Once the policies exist it is the only thing standing between one
 * tenant and another's rows.
 *
 * ```ts
 * const shops = await withOrg(session.user.organizationId, (tx) =>
 *   tx.shop.findMany({ where: { archivedAt: null } })
 * )
 * ```
 *
 * **`SET app.current_org_id = ${orgId}` — the form in the technical skill's
 * references/database.md — does not work, in two separate ways.** `SET` is a
 * utility statement, so PostgreSQL will not accept a bind parameter in it and
 * Prisma's prepared statement errors at runtime. And `SET` is *session*-scoped:
 * on a pooled connection the value outlives the request and the next request to
 * borrow that connection inherits the previous tenant's id. A control that
 * silently authorizes cross-tenant reads is worse than no control at all.
 *
 * `set_config(name, value, true)` fixes both. It is an ordinary function call,
 * so the value binds, and the third argument scopes it to the current
 * transaction — which is why the callback has to run inside one.
 *
 * The trade is that an interactive transaction holds a pooled connection for
 * the life of the callback. Keep the callback to queries; never await a fetch,
 * a queue push or anything else that can block inside it.
 */
export async function withOrg<T>(
  organizationId: string,
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`
    return fn(tx)
  })
}
