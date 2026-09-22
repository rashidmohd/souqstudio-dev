import { ok, fail } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'
import { syncLibrary } from '@/lib/library-client'

/**
 * Give the published library to every shop. E13-04.
 *
 * **The second step, and the one that actually changes what shops see.**
 * Publishing writes an object; this is what makes the `blocks` table agree with
 * it, without waiting for a deploy to run the seed.
 *
 * It prunes: a seeded block the library no longer lists is archived if a book
 * uses it and deleted if not. `apps/web`'s loader refuses before returning on a
 * short read for that reason, so this either writes a complete library or
 * writes nothing. The audit entry is what makes a sync traceable afterwards,
 * because the prune is the part that is hard to explain a week later.
 */
export async function POST() {
  const gate = await requireAdminApi('super_admin')
  if (!gate.ok) return gate.response

  const result = await syncLibrary()

  if (!result.ok) {
    await recordAudit({
      adminUserId: gate.session.admin.id,
      action: 'library.sync_failed',
      entityType: 'library',
      entityId: 'block-library',
      after: { code: result.code, message: result.message },
    })
    return fail(result.code, result.message, result.status)
  }

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: 'library.synced',
    entityType: 'library',
    entityId: 'block-library',
    after: result.data,
  })

  return ok(result.data)
}
