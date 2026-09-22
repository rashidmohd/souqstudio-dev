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
import { getFonts } from '@souqstudio/db'
import { ROLE_SLOT, FONT_ROLES } from '@/lib/font-catalog'
import { ensureFamilies } from '@/lib/font-ensure-server'
import { MAX_PALETTE, MIN_PALETTE } from '@/lib/brand-palette'
import { MAX_STYLES, MIN_STYLES } from '@/lib/brand-typography'

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
 * Shape only. **Whether the family exists is checked against the registry after
 * parsing**, not here.
 *
 * It used to be a `.refine()` against a hand-written array, which was possible
 * because the array was in the bundle. The catalog is a table now and `refine`
 * is synchronous, so membership moved to `assertFontsMirrored()` below. The
 * check itself got stricter in the move: it used to mean "a name we listed",
 * and now means "a family whose files are in R2" — which is the condition that
 * actually matters, because a name we cannot draw renders as something else
 * without ever failing.
 */
const fontFamily = z.string().trim().min(1).max(120)

/**
 * A palette is a definition, not a usage map — see `lib/brand-palette.ts`. The
 * bounds are a product judgement: three is what setup completion and the seeded
 * blocks need, and beyond eight a palette stops being an identity.
 */
const paletteEntry = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(40),
  hex,
})

const schema = z
  .object({
    palette: z.array(paletteEntry).min(MIN_PALETTE).max(MAX_PALETTE),
    primaryColor: hex,
    secondaryColor: hex,
    accentColor: hex,
    textStyles: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          name: z.string().trim().min(1).max(40),
          family: fontFamily,
          size: z.number().positive().max(8),
          weight: z.number().int().min(100).max(900),
          italic: z.boolean(),
          colorId: z.string().max(64).nullable(),
          lineHeight: z.number().positive().max(4),
          letterSpacing: z.number().optional(),
          transform: z.enum(['none', 'uppercase']).optional(),
          slot: z.enum(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption']).optional(),
        })
      )
      .min(MIN_STYLES)
      .max(MAX_STYLES),
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

/**
 * The weights this kit will actually draw in.
 *
 * **Not `WEIGHTS`, the palette of weights the editor offers.** That is all seven,
 * and passing it made the weight scope match every face a family ships — so a
 * cold Rubik still mirrored all fourteen and the blocking save only shed the
 * subsets it did not need: 99 files to 57, 7.6s to 6.1s, a fifth of what the
 * split was supposed to buy.
 *
 * A brand kit binds two or three weights in practice. Taking them from the text
 * styles being saved is what makes a cold save ~17 objects instead of ~57.
 *
 * 400 and 700 are always included: they are what `DEFAULT_STEPS` falls back to
 * for any level the kit does not override, so a style added later has something
 * to draw in without waiting for the completion job.
 */
function weightsInPatch(patch: { textStyles?: readonly { weight: number }[] | undefined }): number[] {
  const bound = (patch.textStyles ?? [])
    .map((style) => style.weight)
    .filter((weight): weight is number => typeof weight === 'number')
  return [...new Set([400, 700, ...bound])].sort((a, b) => a - b)
}

/** The families this patch sets. A slot it leaves alone is not touched. */
function fontsInPatch(patch: Partial<Record<string, unknown>>): string[] {
  return [
    ...new Set(
      FONT_ROLES.map((role) => patch[ROLE_SLOT[role]]).filter(
        (value): value is string => typeof value === 'string' && value !== ''
      )
    ),
  ]
}

/**
 * Which of them we do not yet hold files for.
 *
 * One query for all four. This validates what is being *written*, not what is
 * already stored: a shop whose old font somehow left the registry must still be
 * able to save a colour.
 */
async function unmirroredFonts(wanted: readonly string[]): Promise<string[]> {
  if (wanted.length === 0) return []
  const held = new Set((await getFonts([...wanted])).map((font) => font.family))
  return wanted.filter((family) => !held.has(family))
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

  /**
   * **Any family this patch names is in R2 before the patch is accepted.**
   *
   * A family nobody has ever picked is mirrored here, now, while the owner
   * waits — only the weights the type scale can bind and the scripts the product
   * ships in, which is ~16 objects rather than ~99 and lands near 1.5s. The rest
   * of the family is finished in the background and `fonts.complete` says
   * whether it has. `docs/fonts-from-google.md` §7 B2.
   *
   * This is deliberately *before* the shop read and the role check. Mirroring is
   * platform-level work with no tenant in it — the family is shared by every
   * shop — and a cold family is the slow path whoever is asking.
   */
  const wanted = fontsInPatch(parsed.data as Record<string, unknown>)
  const failures = await ensureFamilies(wanted, weightsInPatch(parsed.data))
  if (failures.length > 0) {
    return fail('font_not_available', failures.map((f) => f.reason).join(' '), 422)
  }

  // The backstop. `ensureFamilies` reports its own failures, so reaching this
  // means a family was registered and then vanished — never expected, and much
  // better as a refusal than as a brand kit naming a face nothing can draw.
  const missing = await unmirroredFonts(wanted)
  if (missing.length > 0) {
    return fail(
      'font_not_available',
      missing.length === 1
        ? `${missing[0]} is not available. Choose one of the offered typefaces.`
        : `These typefaces are not available: ${missing.join(', ')}.`,
      422
    )
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
