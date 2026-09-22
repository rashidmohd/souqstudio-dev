import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { CREDIT_COSTS, enqueueCharacterGen, getCreditSnapshot, prisma } from '@souqstudio/db'
import {
  MAX_GOAL,
  MAX_UNIFORM_ANGLES,
  MAX_STORE_PHOTOS,
  isShopProfileComplete,
  profileGaps,
  storePhotoKeysOf,
  CHARACTER_GENDERS,
  CHARACTER_LOOKS,
  CHARACTER_STYLES,
  type CharacterGender,
  type CharacterLook,
  type CharacterStyle,
} from '@souqstudio/engine'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { isBrandSetupComplete, readEffectiveBrand } from '@/lib/brand-kit'
import { prisma as db } from '@souqstudio/db'
import { env } from '@/lib/env'
import { keyFromPublicUrl } from '@/lib/r2'

/**
 * Generate a branded character, four variations. E8-01.
 *
 * **The consent is a required field, not a checkbox the client may forget.**
 * The uniform photograph may show identifiable people, and it leaves this
 * platform for a third-party model. `consent: true` is what the owner is
 * agreeing to, the dialog says where the picture goes before it asks, and the
 * timestamp is recorded on the job so there is a record of when it was given.
 * A request without it is refused rather than defaulted — a default here would
 * be consent nobody gave.
 *
 * **This route starts a job and returns.** Image generation is tens of seconds
 * at best. `background-jobs.md`.
 *
 * **Nothing is charged here.** The balance is checked so an owner who cannot pay
 * is refused before the work starts; the worker deducts on success.
 */

const schema = z.object({
  /** The R2 key the presigned upload wrote. Never a client-supplied URL. */
  sourceKey: z.string().min(1).max(200),
  style: z.enum(CHARACTER_STYLES as unknown as [CharacterStyle, ...CharacterStyle[]]),
  gender: z.enum(CHARACTER_GENDERS as unknown as [CharacterGender, ...CharacterGender[]]),
  look: z
    .enum(CHARACTER_LOOKS as unknown as [CharacterLook, ...CharacterLook[]])
    .default('unspecified'),
  /**
   * The owner has been told the photograph goes to a third-party model and has
   * agreed. Literal `true` — `z.boolean()` would accept `false` and leave the
   * decision to a later `if` somebody can delete.
   */
  consent: z.literal(true),
  /** More angles of the same uniform. They reach the vision step and stop. */
  angleKeys: z.array(z.string().min(1).max(200)).max(MAX_UNIFORM_ANGLES).optional(),
  /**
   * Photographs of the shop, as a scene. **The only owner-supplied images that
   * reach the image model**, which is why they are named apart from the uniform.
   */
  sceneKeys: z.array(z.string().min(1).max(200)).max(MAX_STORE_PHOTOS).optional(),
  /** What the owner wants it for. Quoted into the prompt as data. */
  goal: z.string().trim().max(MAX_GOAL).optional(),
  /** A logo the owner uploaded for this, to be worn on the uniform. */
  logoKey: z.string().min(1).max(200).optional(),
  /**
   * Use the logo already in the brand kit instead of uploading one.
   *
   * **Resolved on the server from the kit, never sent as a URL.** The kit's
   * logo is a public URL on the row and a client passing one back would be
   * choosing which image gets sent to a model — this looks it up instead.
   * Exclusive with `logoKey`.
   */
  useBrandLogo: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  /**
   * **Refused before anything is queued, when no provider is configured.** The
   * worker would fail the job in a way that charges nothing and explains little;
   * this is a sentence an owner can act on, three minutes earlier.
   */
  if (env.IMAGE_PROVIDER === undefined) {
    return fail(
      'image_generation_off',
      'Character generation is not switched on for this deployment yet.',
      503
    )
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail(
      'invalid_input',
      'Add a photo of your uniform and agree to it being sent, then try again.',
      422
    )
  }

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to make a character.', 403)
  }

  const { organizationId } = session.user

  /**
   * **The key must be this organization's.** The presign route mints keys under
   * the organization's own prefix, so a caller who edits the prefix is asking
   * the worker to read another tenant's object — and here that object is a
   * photograph of somebody's staff.
   */
  const prefix = `${organizationId}/`
  const ownsKey = (key: string) => key.startsWith(prefix) && !key.includes('..')

  const everyKey = [
    parsed.data.sourceKey,
    ...(parsed.data.angleKeys ?? []),
    ...(parsed.data.sceneKeys ?? []),
    // A key the client supplied. The one resolved from the brand kit is this
    // organization's by construction and is added after this check.
    ...(parsed.data.logoKey === undefined ? [] : [parsed.data.logoKey]),
  ]
  if (!everyKey.every(ownsKey)) {
    return fail('invalid_input', 'That upload does not belong to this organization.', 422)
  }

  /**
   * **The two prerequisites, checked here and not only in the interface.**
   *
   * A character that does not know what the shop sells is four generic people,
   * and one drawn before the palette exists cannot be matched to the brand it is
   * for. The flow refuses to start without both, and this is the half of that
   * refusal a client cannot skip — the screen is the other half.
   */
  const shopRow = await db.shop.findUnique({
    where: { id: shop.id },
    select: { trades: true, bio: true },
  })

  const profile = {
    trades: shopRow?.trades ?? [],
    bio: shopRow?.bio ?? null,
    storePhotoKeys: [],
  }

  if (!isShopProfileComplete(profile)) {
    return fail(
      'profile_incomplete',
      `Tell us ${profileGaps(profile).join(' and ')} in this shop's settings first.`,
      409
    )
  }

  const brand = await readEffectiveBrand({
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  })

  if (!isBrandSetupComplete(brand.brandKit)) {
    return fail(
      'brand_incomplete',
      'Finish your brand kit first. The character is drawn to match it.',
      409
    )
  }

  /**
   * Which logo, if any, goes on the uniform.
   *
   * The brand kit's logo is stored as a public URL, and what the worker needs is
   * an R2 key — `keyFromPublicUrl` is the seam that already exists for exactly
   * this, and a logo hosted anywhere else is simply not offered rather than
   * fetched over HTTP by a background job.
   */
  let logoKey = parsed.data.logoKey
  if (logoKey === undefined && parsed.data.useBrandLogo === true) {
    const resolved = brand.logoUrl === null ? null : keyFromPublicUrl(brand.logoUrl)
    if (resolved === null) {
      return fail(
        'no_brand_logo',
        'There is no logo in your brand kit to put on the uniform. Upload one instead.',
        409
      )
    }
    logoKey = resolved
  }

  const cost = CREDIT_COSTS.character_gen
  const snapshot = await getCreditSnapshot(organizationId)
  if (snapshot.total < cost) {
    return fail(
      'insufficient_credits',
      `Making a character costs ${cost} credits and you have ${snapshot.total}. Top up to carry on.`,
      402
    )
  }

  const job = await prisma.aiJob.create({
    data: {
      organizationId,
      shopId: shop.id,
      type: 'character_gen',
      status: 'queued',
      creditsCost: cost,
    },
    select: { id: true },
  })

  try {
    await enqueueCharacterGen({
      jobId: job.id,
      organizationId,
      shopId: shop.id,
      sourceKey: parsed.data.sourceKey,
      style: parsed.data.style,
      gender: parsed.data.gender,
      look: parsed.data.look,
      consentedAt: new Date().toISOString(),
      ...(parsed.data.angleKeys === undefined ? {} : { angleKeys: parsed.data.angleKeys }),
      ...(parsed.data.sceneKeys === undefined ? {} : { sceneKeys: parsed.data.sceneKeys }),
      ...(parsed.data.goal === undefined ? {} : { goal: parsed.data.goal }),
      ...(logoKey === undefined ? {} : { logoKey }),
    })
  } catch {
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: 'queue_unavailable', completedAt: new Date() },
    })
    return fail('queue_unavailable', 'We could not start that just now. Try again in a moment.', 503)
  }

  return ok({ jobId: job.id, creditsCost: cost }, 202)
}
