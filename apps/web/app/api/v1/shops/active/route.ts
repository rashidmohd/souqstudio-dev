import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { setActiveShopCookie } from '@/lib/active-shop'
import { requireShopAccess } from '@/lib/authz'

/**
 * E2-02 — point this session at a shop.
 *
 * **The static segment beats `[id]` in the App Router**, so this file wins for
 * `/shops/active` and `/shops/[id]` never sees it. Shop ids are cuids, which
 * cannot be the literal string "active", so no real shop is shadowed. Worth
 * saying out loud because the collision is invisible until someone adds a shop
 * id that looks like a word.
 *
 * The cookie is set here rather than by the client because it is validated
 * here: `requireShopAccess` is what stops the cookie being a way to name any
 * shop in the database. A server component reading it re-checks anyway, but
 * refusing at the point of writing is what makes the refusal visible.
 */

const schema = z.object({ shopId: z.string().min(1) })

export async function PUT(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Choose a shop to switch to.', 422)
  }

  // Viewer is enough. Switching to a shop is looking at it, not changing it.
  const access = await requireShopAccess(session, parsed.data.shopId, 'viewer', {
    allowInactive: true,
  })
  if (!access.ok) return access.response

  setActiveShopCookie(access.value.shop.id)

  return ok({ shopId: access.value.shop.id, name: access.value.shop.name })
}
