import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'
import { unpublishBlock } from '@/lib/library-client'

/**
 * Take a block out of the shared library. E13-04.
 *
 * Super admin only, the same bar as publishing and for the same reason: the
 * library is what every shop's picker reads. It calls `apps/web`'s
 * `/api/v1/library/unpublish` rather than writing R2, so one implementation
 * decides what the library is. A refusal is logged as well as a success.
 */

const schema = z.object({
  id: z.string().regex(/^blk_[a-z0-9_]+$/, 'A library id looks like "blk_ramadan_band".'),
})

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi('super_admin')
  if (!gate.ok) return gate.response

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', parsed.error.errors[0]?.message ?? 'Say which block to unpublish.')
  }

  const result = await unpublishBlock(parsed.data.id)
  if (!result.ok) {
    await recordAudit({
      adminUserId: gate.session.admin.id,
      action: 'library.block.unpublish_failed',
      entityType: 'block',
      entityId: parsed.data.id,
      after: { code: result.code, message: result.message },
    })
    return fail(result.code, result.message, result.status)
  }

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: 'library.block.unpublished',
    entityType: 'block',
    entityId: parsed.data.id,
    after: { version: result.data.version, count: result.data.count },
  })

  return ok(result.data)
}
