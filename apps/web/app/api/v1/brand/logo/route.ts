import type { NextRequest } from 'next/server'
import { enqueueBgRemove } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { patchBrandAtLevel, readEffectiveBrand } from '@/lib/brand-kit'
import { levelFor } from '@/lib/brand-inheritance'
import { getObjectBytes, putObject, shopAssetKey, orgAssetKey, publicUrl } from '@/lib/r2'
import { processLogo } from '@/lib/logo'
import { assignBrandColors } from '@/lib/color'

/**
 * E4-01 and E4-02 — finish a logo upload.
 *
 * The browser has PUT its file to the staging key. This reads it back,
 * normalizes it to PNG, pulls a palette, stores it as the shop's logo, and
 * queues background removal.
 *
 * **Colour extraction happens here, not in the worker.** It costs about as long
 * as the database round trip on a 128px sample, and the wizard's next step is
 * literally "confirm these colours" — making the owner wait on a queue for
 * something this cheap would add a spinner to the one step that should feel
 * instant. Background removal is the opposite: seconds, on a service that may
 * be down, so it goes to the queue.
 */

export async function POST(_req: NextRequest) {
  const { session, response } = await requireApiSession({ allowPendingTwoFactor: true })
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role !== 'owner' && shop.role !== 'manager') {
    return fail('forbidden', 'You need to be a manager to change the logo.', 403)
  }

  // E2-05: the logo is written wherever the override level says it lives. An
  // inheriting shop is showing the organization's logo, so replacing it
  // replaces the organization's — which is what the person doing it means.
  const level = levelFor(shop.brandOverride, 'logo')
  const key = (filename: string) =>
    level === 'org'
      ? orgAssetKey(session.user.organizationId, filename)
      : shopAssetKey(session.user.organizationId, shop.id, filename)

  const stagingKey = key('logo-upload')
  const uploaded = await getObjectBytes(stagingKey)
  if (!uploaded) {
    return fail('upload_missing', 'That upload did not arrive. Try choosing the file again.', 409)
  }

  // First time the server sees the bytes. A presigned PUT pins the declared
  // content type but cannot prove the body matches it, so this is where a
  // renamed .exe stops being a possibility — sharp simply fails to parse it.
  let processed
  try {
    processed = await processLogo(uploaded)
  } catch {
    return fail(
      'invalid_image',
      'That file could not be read as an image. Try a PNG or JPG.',
      422
    )
  }

  const originalKey = key('logo-original.png')
  const logoKey = key('logo.png')

  // The original is kept deliberately: background removal is destructive and
  // sometimes wrong, and E4-01 lets the owner re-upload or retry. Without a
  // copy, a bad cutout means asking them to find the file again.
  await putObject(originalKey, processed.png, 'image/png')
  const logoUrl = await putObject(logoKey, processed.png, 'image/png')

  const colors = assignBrandColors(processed.palette)

  const target = {
    organizationId: shop.organizationId,
    shopId: shop.id,
    brandOverride: shop.brandOverride,
  }

  // Only seed the colours if nothing has been chosen yet. Re-uploading a logo
  // must not silently discard a palette adjusted by hand — and "already chosen"
  // is a question about the *effective* kit, not about one level of it.
  const current = await readEffectiveBrand(target)

  const brand = await patchBrandAtLevel(
    target,
    {
      suggestedColors: processed.palette,
      logoOriginalUrl: publicUrl(originalKey),
      logoStatus: 'processing',
      ...(current.brandKit.primaryColor ? {} : colors),
    },
    logoUrl
  )

  // Queued after the logo is already usable, so a dead queue costs the polish
  // and not the step. The job is told which level to write its result back to;
  // sending the wrong one leaves the wizard polling a key nothing updates.
  let queued = true
  try {
    await enqueueBgRemove({
      imageUrl: logoUrl,
      targetPath: logoKey,
      ...(level === 'org'
        ? { organizationId: shop.organizationId }
        : { shopId: shop.id }),
    })
  } catch {
    queued = false
    await patchBrandAtLevel(target, { logoStatus: 'original' })
  }

  return ok({
    logoUrl,
    suggestedColors: processed.palette,
    logoStatus: queued ? 'processing' : 'original',
    brandKit: brand.brandKit,
  })
}
