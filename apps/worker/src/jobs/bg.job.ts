import type { Job } from 'bullmq'
import sharp from 'sharp'
import { prisma } from '@souqstudio/db'
import type { BgRemovePayload } from '@souqstudio/db'
import type { BrandKit } from '@souqstudio/types'
import { getObjectBytes, putObject, keyFromPublicUrl, publicUrl } from '../lib/r2'
import { removeBackground, RembgUnavailableError } from '../lib/rembg'

/**
 * Background removal for shop logos. E4-01, reached from the E1-04 setup wizard.
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
}> {
  const { imageUrl, targetPath, shopId, organizationId } = job.data
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
  if (target.level === 'org') {
    const org = await prisma.organization.findUnique({
      where: { id: target.id },
      select: { brandKit: true },
    })
    if (!org) return

    await prisma.organization.update({
      where: { id: target.id },
      data: {
        brandKit: { ...((org.brandKit ?? {}) as BrandKit), ...patch },
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
      brandKit: { ...((shop.brandKit ?? {}) as BrandKit), ...patch },
      ...(logoUrl ? { logoUrl } : {}),
    },
  })
}
