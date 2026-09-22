import 'server-only'

import { prisma, Prisma } from '@souqstudio/db'

/**
 * The admin audit log. Sole writer to `admin_audit_logs`. E13-01.
 *
 * **Called explicitly by the route that made the change, not by a Prisma
 * middleware.** An automatic writer records the shape of the query — three
 * UPDATEs on `catalog_products` — where the only question this table answers is
 * what somebody meant to do. "Archived a product" is one row; the statements it
 * took are not interesting and should not be stored.
 *
 * **`before` and `after` hold only the fields the action touched.** A
 * whole-row snapshot makes a diff unreadable, and on a catalog row it would copy
 * the `metadata` blob and the tags array every time somebody fixed a spelling.
 */

export type AuditEntry = {
  adminUserId: string
  /**
   * Verb, dot-separated, naming the thing and what happened to it:
   * `catalog.product.updated`, `library.block.published`, `prompt.updated`.
   * Past tense, because it is a record of something that already happened.
   */
  action: string
  /** The noun alone, so the log can be filtered without parsing `action`. */
  entityType: 'catalog_product' | 'block' | 'cover_prompt' | 'admin_user' | 'library'
  entityId: string
  before?: unknown
  after?: unknown
}

/**
 * Only the keys whose values differ, on both sides. This is what keeps a diff
 * legible: an edit that changed one price shows one field, not forty.
 *
 * Compared with `JSON.stringify` rather than deeply, because every value that
 * reaches here has already been through Zod and is JSON to begin with.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const changedBefore: Record<string, unknown> = {}
  const changedAfter: Record<string, unknown> = {}

  for (const key of Object.keys(after)) {
    const from = before[key]
    const to = after[key]
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue
    changedBefore[key] = from ?? null
    changedAfter[key] = to ?? null
  }

  return { before: changedBefore, after: changedAfter }
}

/** `undefined` is not a JSON value; Prisma wants `DbNull` for an absent column. */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull
  return value as Prisma.InputJsonValue
}

/**
 * Write one entry.
 *
 * **Never inside the same transaction as the change it describes**, and never
 * awaited in a way that can fail the request. A failed log must not roll back a
 * correct edit: the alternative is a panel that refuses to archive a product
 * because the audit table is full, which trades a real capability for a record
 * of it. A write that fails is reported to the server log and the action
 * stands.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: entry.adminUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: toJson(entry.before),
        after: toJson(entry.after),
      },
    })
  } catch (error) {
    console.error('[audit] failed to record', entry.action, entry.entityId, error)
  }
}
