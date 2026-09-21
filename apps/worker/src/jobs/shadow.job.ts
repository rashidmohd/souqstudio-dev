import type { Job } from 'bullmq'
import { prisma } from '@souqstudio/db'
import type { ShadowRenderPayload } from '@souqstudio/db'
import { isShadowPreset, shadowKey } from '@souqstudio/types'
import { getObjectBytes, putObject } from '../lib/r2'
import { renderShadow } from '../lib/shadow'

/**
 * Render one shadow preset for one catalog image. E14 §2.4.
 *
 * **The rendition sits beside the source and the row records that it exists.**
 * `shadowKey` derives the object; `image_assets.shadowPresets` is what lets a
 * page point at it without a HEAD against the bucket per card. The source is
 * untouched — a card with no shadow draws it, and a different preset is
 * re-rendered from it rather than from an already-shadowed picture.
 *
 * **The row is updated last**, the same ordering the cutout ingest uses and for
 * the same reason: the column is what marks the work done, so writing it before
 * the object lands would point a page at something that is not there.
 *
 * **It throws rather than resolving on failure.** Unlike `bg.remove`, which
 * treats an unavailable Rembg as "keep the original" because a shop owner
 * cannot restart a microservice, everything here is local — sharp, R2 and a
 * row. A failure is a real fault and worth the retry.
 */
export async function handleShadowRender(job: Job<ShadowRenderPayload>): Promise<{
  key: string
  width: number
  height: number
}> {
  const { imageAssetId, preset, color } = job.data

  if (!isShadowPreset(preset)) {
    // A name nothing renders. Thrown rather than ignored: a page is waiting for
    // a rendition that will never arrive, and silence is how that goes unnoticed.
    throw new Error(`bg.shadow: unknown preset "${preset}"`)
  }

  const asset = await prisma.imageAsset.findUnique({
    where: { id: imageAssetId },
    select: { id: true, r2Key: true, shadowPresets: true },
  })
  if (asset === null) throw new Error(`bg.shadow: no image asset ${imageAssetId}`)

  // Already there. A duplicate job is cheap to drop and expensive to run.
  if (asset.shadowPresets.includes(preset)) {
    return { key: shadowKey(asset.r2Key, preset), width: 0, height: 0 }
  }

  const source = await getObjectBytes(asset.r2Key)
  if (!source) throw new Error(`bg.shadow: ${asset.r2Key} is not in the bucket`)

  const rendered = await renderShadow(source, preset, color)
  const key = shadowKey(asset.r2Key, preset)
  await putObject(key, rendered.png, 'image/png')

  /*
   * **`push` rather than a replaced array.** Two presets can render
   * concurrently — the queue runs at concurrency 2 — and reading the list here
   * and writing it back would lose whichever finished first.
   */
  await prisma.imageAsset.update({
    where: { id: asset.id },
    data: { shadowPresets: { push: preset } },
  })

  console.log(
    `[bg] shadow ${preset} for ${asset.id}: ${rendered.width}×${rendered.height}, pad ${rendered.pad}`
  )

  return { key, width: rendered.width, height: rendered.height }
}
