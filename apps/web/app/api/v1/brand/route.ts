import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import {
  patchBrandAtLevel,
  readEffectiveBrand,
  isBrandSetupComplete,
  ONBOARDING_STEPS,
} from '@/lib/brand-kit'
import { isValidHex, EXAMPLE_HEX } from '@/lib/color'
import { findFont } from '@/lib/brand-fonts'

/**
 * E1-04 and E4 — read and save the brand kit.
 *
 * `GET` is also what the wizard polls for background-removal progress: the
 * worker writes `logoStatus` onto the same object, so one endpoint answers both
 * "what have I chosen" and "is my logo ready" without a second round trip.
 *
 * `PATCH` is partial by design. The wizard saves after every step so a refresh
 * resumes rather than restarts, which means most requests carry one field.
 *
 * **E2-05 changed what "the brand kit" means here.** The kit rendered is the
 * organization's, the shop's, or a mix, depending on `shops.brandOverride` — so
 * reads resolve through `readEffectiveBrand` and writes route each field to the
 * level that owns it. For an inheriting shop, which is every shop until someone
 * changes it, that means editing the brand edits the *organization's* kit. That
 * is the intended behaviour and not a leak: it is the kit the shop is showing.
 */

const hex = z
  .string()
  .trim()
  .refine(isValidHex, `Use a colour like ${EXAMPLE_HEX}.`)

/**
 * A font is valid only if it is in the catalog. The value reaches a JSONB
 * column and then a stylesheet request, and a family we do not load renders as
 * something else without ever failing.
 */
const fontFamily = z
  .string()
  .trim()
  .refine((value) => findFont(value) !== undefined, 'Choose one of the offered typefaces.')

const schema = z
  .object({
    primaryColor: hex,
    secondaryColor: hex,
    accentColor: hex,
    fontHeadline: fontFamily,
    fontDisplay: fontFamily,
    fontPrice: fontFamily,
    fontBody: fontFamily,
    onboardingStep: z.number().int().min(1).max(ONBOARDING_STEPS),
    /** Set once, on the finish step. */
    complete: z.boolean(),
  })
  .partial()

export async function GET() {
  const { session, response } = await requireApiSession({ allowPendingTwoFactor: true })
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  })

  return ok({
    shopId: shop.id,
    shopName: shop.name,
    logoUrl: brand.logoUrl,
    brandKit: brand.brandKit,
    brandOverride: brand.override,
    /** Which level each facet resolved from — the shop settings screen shows it. */
    source: brand.source,
    complete: isBrandSetupComplete(brand.brandKit),
  })
}

export async function PATCH(req: NextRequest) {
  const { session, response } = await requireApiSession({ allowPendingTwoFactor: true })
  if (!session) return response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Check the highlighted fields and try again.', 422)
  }

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  // Editing the brand is a manager's job. Owner passes trivially; an editor
  // creates offer books and does not change the brand — E2-03's role table.
  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to change the brand.', 403)
  }

  const target = {
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  }

  const { complete, ...kitPatch } = parsed.data

  // Finishing is a claim the server checks rather than takes. A client that
  // posts `complete` with half a kit would otherwise unlock an editor that has
  // no template to render with. Checked against the *effective* kit, because
  // that is what the editor will actually render with.
  if (complete) {
    const current = await readEffectiveBrand(target)
    const merged = { ...current.brandKit, ...kitPatch }
    if (!isBrandSetupComplete(merged)) {
      return fail(
        'setup_incomplete',
        'Finish choosing your colours, grid and template first.',
        422
      )
    }
  }

  const brand = await patchBrandAtLevel(target, {
    ...kitPatch,
    ...(complete ? { onboardingCompletedAt: new Date().toISOString() } : {}),
  })

  return ok({
    brandKit: brand.brandKit,
    brandOverride: brand.override,
    source: brand.source,
    complete: isBrandSetupComplete(brand.brandKit),
  })
}
