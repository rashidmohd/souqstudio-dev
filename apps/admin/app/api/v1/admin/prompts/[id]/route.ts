import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { diffFields, recordAudit } from '@/lib/audit'
import { promptSchema } from '@/lib/prompt-schema'

/**
 * Edit one cover prompt. E13, AI prompt management.
 *
 * **There is no DELETE.** `isActive` is the off switch, and a `covers` row
 * records the slug it was generated from: deleting a prompt orphans the history
 * of every cover made from it. A prompt that produced bad covers is also worth
 * keeping to compare against the one that replaced it, which is the whole
 * reason the column exists.
 *
 * **The slug is not editable either.** It is what a picker sends and what a
 * generated cover recorded; changing it silently breaks the link between a
 * cover and the direction that made it. A new slug is a new prompt, and the old
 * one is switched off.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const existing = await prisma.coverPrompt.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      slug: true,
      label: true,
      hint: true,
      scene: true,
      person: true,
      group: true,
      sortOrder: true,
      isActive: true,
    },
  })
  if (existing === null) return fail('not_found', 'That prompt does not exist.', 404)

  const body = await request.json().catch(() => null)
  const parsed = promptSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return fail('invalid_request', issue?.message ?? 'That prompt cannot be saved.')
  }

  const input = parsed.data

  if (input.slug !== existing.slug) {
    return fail(
      'slug_immutable',
      'A slug cannot change: generated covers record the one they came from. Switch this prompt off and add a new one.'
    )
  }

  const { slug: _slug, ...writable } = input

  await prisma.coverPrompt.update({ where: { id: params.id }, data: writable })

  const changes = diffFields(existing, writable)
  if (Object.keys(changes.after).length > 0) {
    await recordAudit({
      adminUserId: gate.session.admin.id,
      action: 'prompt.updated',
      entityType: 'cover_prompt',
      entityId: params.id,
      before: changes.before,
      after: changes.after,
    })
  }

  return ok({ id: params.id })
}
