import type { NextRequest } from 'next/server'
import { enqueueBgRemove } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { createOrgProduct, lookupBarcode } from '@/lib/catalog'
import { hasValidCheckDigit, normalizeBarcode } from '@/lib/catalog-display'
import { MIN_PRODUCT_IMAGE_EDGE, readProductImage } from '@/lib/catalog-image'
import { cutoutKey, customProductKey, getObjectBytes, publicUrl } from '@/lib/r2'

/**
 * E5-04 — add a product the catalog does not have.
 *
 * The row lands in the **organization's** collection and is usable the moment
 * this returns. The contribution row it also writes is the E5-05 review queue
 * entry, and review decides promotion to the universal catalog rather than
 * availability — the difference between a self-served product and one where a
 * shop owner in Dubai at 11pm waits on a reviewer in the morning.
 *
 * The cutout is queued afterwards and its failure is not this request's
 * failure. A product with only an `ORIGINAL` renders today: `IMAGE_PICK` falls
 * back to it and `imageIsFallback` is what tells the editor to flag it. Refusing
 * the product because a queue is down would trade something that works for
 * nothing at all.
 */

const schema = z.object({
  // The upload key, not a URL. A client-supplied URL is a client-supplied
  // fetch target; a key is validated against the prefix this shop may write to.
  imageKey: z.string().min(1).max(300),
  nameEn: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().max(200).optional(),
  brandEn: z.string().trim().max(120).optional(),
  specEn: z.string().trim().max(200).optional(),
  category: z.string().trim().max(80).optional(),
  subcategory: z.string().trim().max(80).optional(),
  // A string, not a number: the column is Decimal(10,3) and routing a pack size
  // through a float is the one place a rounding error could enter pack maths.
  packSize: z
    .string()
    .trim()
    .regex(/^\d{1,7}(\.\d{1,3})?$/)
    .optional(),
  packUnit: z.enum(['G', 'KG', 'ML', 'L', 'PIECE']).optional(),
  packCount: z.number().int().positive().max(999).optional(),
  barcode: z.string().trim().max(20).optional(),
})

export async function POST(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  if (shop.role === 'viewer') {
    return fail('forbidden', 'You need edit access to add a product.', 403)
  }

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
  const input = parsed.data

  // The key must be one this shop was handed. Without this check the field is
  // an arbitrary read of the bucket: any key the caller names would be fetched
  // and published as their product's image, including another tenant's.
  const prefix = customProductKey(session.user.organizationId, shop.id, '')
  if (!input.imageKey.startsWith(prefix)) {
    return fail('invalid_input', 'That upload could not be matched to this shop.', 422)
  }

  let barcode: string | undefined
  if (input.barcode) {
    barcode = normalizeBarcode(input.barcode)
    if (!hasValidCheckDigit(barcode)) {
      return fail(
        'invalid_barcode',
        'That is not a valid barcode. Check the digits under the bars, or leave it blank.',
        422
      )
    }

    // Checked here as well as at lookup, because the two arrive by different
    // paths: an owner can open this form without ever having scanned. Creating
    // a second private row for a barcode the organization already holds would
    // also violate the compound unique index and surface as a 500.
    const existing = await lookupBarcode(session, barcode)
    if (existing?.collection === 'organization') {
      return fail(
        'barcode_exists',
        'You already have a product with that barcode.',
        409
      )
    }
  }

  const bytes = await getObjectBytes(input.imageKey)
  if (!bytes) {
    return fail('upload_missing', 'That photo did not arrive. Try choosing it again.', 409)
  }

  const image = await readProductImage(bytes)
  if (!image.ok) {
    return image.reason === 'too_small'
      ? fail(
          'image_too_small',
          `That photo is too small to print. Use one at least ${MIN_PRODUCT_IMAGE_EDGE} pixels on each side.`,
          422
        )
      : fail('invalid_image', 'That file could not be read as a photo. Try a PNG or JPG.', 422)
  }

  const imageUrl = publicUrl(input.imageKey)

  const created = await createOrgProduct(
    session,
    shop.id,
    {
      nameEn: input.nameEn,
      ...(input.nameAr ? { nameAr: input.nameAr } : {}),
      ...(input.brandEn ? { brandEn: input.brandEn } : {}),
      ...(input.specEn ? { specEn: input.specEn } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.subcategory ? { subcategory: input.subcategory } : {}),
      ...(input.packSize ? { packSize: input.packSize } : {}),
      ...(input.packUnit ? { packUnit: input.packUnit } : {}),
      ...(input.packCount ? { packCount: input.packCount } : {}),
      ...(barcode ? { barcode } : {}),
    },
    {
      r2Key: input.imageKey,
      url: imageUrl,
      width: image.meta.width,
      height: image.meta.height,
    }
  )

  // E5 §3 — the cutout is an ingest stage, not the owner's chore. Never fail
  // the request on it: the product is already usable with its ORIGINAL, and a
  // missing cutout is a visible quality flag rather than a broken product.
  let cutoutQueued = true
  try {
    await enqueueBgRemove({
      imageUrl,
      // A *different* key from the source. The worker writes its result to
      // `targetPath` without looking at what is there, so passing `imageKey`
      // would overwrite the photo the matte is recoverable from — and the
      // ORIGINAL row would then point at a cutout.
      targetPath: cutoutKey(input.imageKey),
      catalogProductId: created.id,
      sourceAssetId: created.imageAssetId,
    })
  } catch {
    cutoutQueued = false
  }

  return ok({ productId: created.id, cutoutQueued }, 201)
}
