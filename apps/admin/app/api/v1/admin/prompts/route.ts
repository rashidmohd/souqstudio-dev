import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { requireAdminApi } from '@/lib/admin-auth'
import { recordAudit } from '@/lib/audit'
import { promptSchema } from '@/lib/prompt-schema'

/**
 * Add a cover prompt. E13, AI prompt management.
 *
 * **The art direction is the product, which is why these are rows.** They were
 * a TypeScript map and were wrong twice in one day: first a set of adjectives
 * that produced generic wallpaper, then a set of nouns the model put *on* the
 * shop assistant. Both fixes needed a deploy. A prompt is tuned by looking at
 * what came back, and content that needs a release to change is content nobody
 * tunes. This route is the half that was missing: the rows moved into the
 * database in September and nothing has ever been able to edit them.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdminApi('catalog_manager')
  if (!gate.ok) return gate.response

  const body = await request.json().catch(() => null)
  const parsed = promptSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return fail('invalid_request', issue?.message ?? 'That prompt cannot be saved.')
  }

  const input = parsed.data

  const clash = await prisma.coverPrompt.findUnique({
    where: { slug: input.slug },
    select: { id: true, label: true },
  })
  if (clash !== null) {
    return fail(
      'duplicate_slug',
      `"${clash.label}" already uses that slug. A slug is permanent, so pick another.`,
      409
    )
  }

  const prompt = await prisma.coverPrompt.create({ data: input, select: { id: true } })

  await recordAudit({
    adminUserId: gate.session.admin.id,
    action: 'prompt.created',
    entityType: 'cover_prompt',
    entityId: prompt.id,
    after: input,
  })

  return ok({ id: prompt.id }, 201)
}
