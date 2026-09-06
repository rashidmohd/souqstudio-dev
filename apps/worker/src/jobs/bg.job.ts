import type { Job } from 'bullmq'
import sharp from 'sharp'
import { prisma, Prisma } from '@souqstudio/db'
import type { BgRemovePayload } from '@souqstudio/db'
import type { BrandKit } from '@souqstudio/types'
import { getObjectBytes, putObject, keyFromPublicUrl, publicUrl } from '../lib/r2'
import { MATTE_APPROVAL_THRESHOLD, analyseMatte } from '../lib/matte'
import { removeBackground, RembgUnavailableError } from '../lib/rembg'

/**
 * Background removal. E4-01 for logos, E5 §3 for catalog cutouts.
 *
 * **Two branches, told apart by the payload.** A job carrying
 * `catalogProductId` and `sourceAssetId` is a product cutout and writes an
 * `image_assets` row; anything else is a logo and writes to a brand kit. They
 * share the fetch, the Rembg call and the unavailability rule, and nothing
 * else — a logo is normalised and trimmed to be composited, while a product
 * cutout keeps its canvas so the layout engine can place it by optical weight.
 *
 * **The shop owner is never blocked by this.** They uploaded a logo and moved on
 * to picking colours; this runs behind them. If Rembg is down — a separate
 * Python service, the most fragile thing in the stack — the logo they uploaded
 * stays exactly as it is and the kit is marked `original`. Onboarding completes
 * either way. A shop owner in Dubai at 11pm cannot restart a microservice, so
 * the product must not ask them to.
 *
 * That is why an unavailable Rembg is **not** a thrown error. Throwing would
 * put the job through three retries and then dead-letter it, leaving the kit
 * stuck on `processing` forever with a spinner nobody resolves. The job
 * completes, having recorded that removal did not happen.
 */

/**
 * The payload as this handler needs it — one of `shopId` or `organizationId`
 * is what ties it to a kit.
 *
 * E2-05 made the level a question. A shop that inherits its brand renders the
 * *organization's* logo, so removal status belongs on the organization's kit;
 * a shop that overrides its logo owns its own. The web side decides which via
 * `levelFor(override, 'logo')` and sets exactly one of the two.
 */
type BgJobPayload = BgRemovePayload & { shopId?: string; organizationId?: string }

export async function handleBgRemove(job: Job<BgJobPayload>): Promise<{
  status: 'removed' | 'kept_original'
  url: string
  /** Catalog branch only: what the matte scored and whether it was approved. */
  quality?: number
  reviewState?: 'APPROVED' | 'PENDING'
}> {
  const { imageUrl, targetPath, shopId, organizationId, catalogProductId, sourceAssetId } =
    job.data

  if (catalogProductId && sourceAssetId) {
    return handleCatalogCutout({
      imageUrl,
      targetPath,
      catalogProductId,
      sourceAssetId,
    })
  }

  const target = shopId
    ? ({ level: 'shop', id: shopId } as const)
    : organizationId
      ? ({ level: 'org', id: organizationId } as const)
      : null

  const sourceKey = keyFromPublicUrl(imageUrl)
  if (!sourceKey) {
    // A URL outside our own bucket is a programming error, not a transient
    // fault. Throw so it surfaces rather than silently doing nothing.
    throw new Error(`bg.remove: imageUrl is not an R2 object: ${imageUrl}`)
  }

  const source = await getObjectBytes(sourceKey)

  let cutout: Buffer
  try {
    cutout = await removeBackground(source, 'logo.png')
  } catch (error) {
    if (error instanceof RembgUnavailableError) {
      console.warn(`[bg] ${error.message} — keeping the uploaded logo as-is`)
      if (target) await markLogo(target, { logoStatus: 'original' })
      return { status: 'kept_original', url: imageUrl }
    }
    throw error
  }

  // Trim the transparent margin the cutout leaves behind. Without this the logo
  // carries invisible padding onto the artboard and every placement looks
  // slightly small and slightly off-centre for reasons nobody can see.
  const trimmed = await sharp(cutout)
    .trim()
    .png()
    .toBuffer()
    // A logo that is one flat colour can trim to nothing. Keep the untrimmed
    // cutout rather than storing an empty image.
    .catch(() => cutout)

  const url = await putObject(targetPath, trimmed, 'image/png')

  if (target) {
    await markLogo(target, { logoStatus: 'ready' }, url)
  }

  return { status: 'removed', url: url || publicUrl(targetPath) }
}

/**
 * A catalog product cutout. E5 §3.
 *
 * Four differences from the logo branch, each of them load-bearing:
 *
 * - **The canvas is not trimmed.** A logo is trimmed so it composites cleanly.
 *   A product cutout keeps the original frame and records where the content sits
 *   inside it, because the layout engine scales cards to *optical weight* — trim
 *   the canvas and that information is gone, and a cutout carrying 30% padding
 *   renders visibly smaller than its neighbours with nobody able to say why.
 * - **It writes a row, not a status.** `image_assets` gains a CUTOUT derived
 *   from the ORIGINAL. The original is untouched, which is what makes a bad
 *   matte recoverable.
 * - **A low score does not fail the job.** The row is written `PENDING` and the
 *   card falls back to the ORIGINAL with a visible quality flag. A haloed cutout
 *   that nobody looks at is the failure this avoids; a job that throws would
 *   simply be retried into the same result three times.
 * - **An unavailable Rembg writes nothing at all.** No row means no cutout means
 *   the fallback, which is already correct. The logo branch has a `logoStatus`
 *   to correct; this has nothing to undo.
 */
async function handleCatalogCutout(input: {
  imageUrl: string
  targetPath: string
  catalogProductId: string
  sourceAssetId: string
}): Promise<{
  status: 'removed' | 'kept_original'
  url: string
  quality?: number
  reviewState?: 'APPROVED' | 'PENDING'
}> {
  const sourceKey = keyFromPublicUrl(input.imageUrl)
  if (!sourceKey) {
    throw new Error(`bg.remove: imageUrl is not an R2 object: ${input.imageUrl}`)
  }

  if (sourceKey === input.targetPath) {
    // The one mistake that destroys data here, refused rather than trusted:
    // writing the cutout over its own source leaves the ORIGINAL row pointing
    // at a cutout and nothing to re-run against. `cutoutKey()` on the web side
    // derives a distinct key; this is the guard for anyone who bypasses it.
    throw new Error(`bg.remove: refusing to overwrite the source asset at ${sourceKey}`)
  }

  const source = await getObjectBytes(sourceKey)

  let cutout: Buffer
  try {
    cutout = await removeBackground(source, 'product.png')
  } catch (error) {
    if (error instanceof RembgUnavailableError) {
      console.warn(`[bg] ${error.message} — the product keeps its original image`)
      return { status: 'kept_original', url: input.imageUrl }
    }
    throw error
  }

  // Normalised to PNG without resizing. PNG because a cutout has an alpha
  // channel by definition and Rembg's output format is not guaranteed; the size
  // is left alone because `bboxTight` is recorded in these pixels and a resize
  // would silently invalidate it.
  const png = await sharp(cutout).png().toBuffer()
  const meta = await sharp(png).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0

  // The alpha plane alone: one byte per pixel instead of four, which on a
  // 2000×2000 packshot is 4MB rather than 16MB held while the analysis runs.
  const alpha = await sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer()
  const { bbox, quality } = analyseMatte(alpha, width, height)

  const url = await putObject(input.targetPath, png, 'image/png')
  const reviewState = quality >= MATTE_APPROVAL_THRESHOLD ? 'APPROVED' : 'PENDING'

  await prisma.imageAsset.create({
    data: {
      productId: input.catalogProductId,
      kind: 'CUTOUT',
      // What this was derived from. Keeping the link is what lets a rejected
      // matte be re-run without asking the owner for the photo again.
      derivedFrom: input.sourceAssetId,
      r2Key: input.targetPath,
      width,
      height,
      bboxTight: bbox ?? Prisma.JsonNull,
      quality,
      reviewState,
    },
  })

  console.log(
    `[bg] cutout for ${input.catalogProductId}: quality ${quality}, ${reviewState}`
  )

  return { status: 'removed', url: url || publicUrl(input.targetPath), quality, reviewState }
}

/**
 * Write the outcome back onto the brand kit.
 *
 * Read-modify-write on a JSONB column, because Prisma cannot patch one key of a
 * Json field. The wizard writes to other keys of the same object, so this reads
 * immediately before writing and touches only what it owns — a whole-object
 * overwrite here would silently discard a colour the owner picked while the job
 * was running.
 */
async function markLogo(
  target: { level: 'shop' | 'org'; id: string },
  patch: Pick<BrandKit, 'logoStatus'>,
  logoUrl?: string
): Promise<void> {
  // The two branches are the same three lines against two tables. Kept apart
  // rather than abstracted: Prisma's delegates are separate types, and a
  // generic wrapper over them costs more to read than the duplication saves.
  //
  // The writes assert `Prisma.InputJsonObject`, matching `lib/brand-kit.ts` in
  // the web app. `BrandKit` is an interface, and an interface has no implicit
  // index signature, so it is not assignable to Prisma's mapped JSON input type
  // however JSON-shaped its fields are. This held structurally only while every
  // field was a primitive; `typeScale` nests another interface and ended that.
  // The value really is JSON — it round-trips through a JSONB column.
  if (target.level === 'org') {
    const org = await prisma.organization.findUnique({
      where: { id: target.id },
      select: { brandKit: true },
    })
    if (!org) return

    await prisma.organization.update({
      where: { id: target.id },
      data: {
        brandKit: { ...((org.brandKit ?? {}) as BrandKit), ...patch } as Prisma.InputJsonObject,
        ...(logoUrl ? { logoUrl } : {}),
      },
    })
    return
  }

  const shop = await prisma.shop.findUnique({
    where: { id: target.id },
    select: { brandKit: true },
  })
  if (!shop) return

  await prisma.shop.update({
    where: { id: target.id },
    data: {
      brandKit: { ...((shop.brandKit ?? {}) as BrandKit), ...patch } as Prisma.InputJsonObject,
      ...(logoUrl ? { logoUrl } : {}),
    },
  })
}
