import type { Job } from 'bullmq'
import sharp from 'sharp'
import { CREDIT_COSTS, consumeCredits, prisma } from '@souqstudio/db'
import type { CoverGenPayload } from '@souqstudio/db'
import {
  CAMPAIGNS,
  COVER_SHAPES,
  COVER_VARIATIONS,
  type Campaign,
  type CoverShape,
} from '@souqstudio/engine'
import { putObject } from '../lib/r2'
import { coverPrompt } from '../lib/character-prompt'
import { ImageGenerationOffError, NoImageError, draw } from '../lib/image-gen'

/**
 * A cover background, three options. E8-04.
 *
 * **A background, not a cover.** The shop's name, its logo and its character go
 * on top afterwards — `coverPrompt` says so twice, because a model asked to
 * render a shop's name produces text that is misspelled, in a typeface nobody
 * chose, and often in a language it guessed. That composition is E9's, and the
 * seam between the two is an R2 key, exactly as `lib/block-assets.ts` already
 * does for uploaded artwork.
 *
 * **No reference image and no character sent.** The spec has the character
 * composited onto the cover rather than drawn into it, which is what keeps one
 * generated mascot identical across every cover it appears on.
 */
export async function handleCoverGen(job: Job<CoverGenPayload>) {
  const { jobId, organizationId, shopId, described, palette } = job.data

  await prisma.aiJob.update({ where: { id: jobId }, data: { status: 'processing' } })

  try {
    const campaign = asCampaign(job.data.campaign)
    const shape = asShape(job.data.shape)

    if (campaign === 'custom' && (described === undefined || described.trim() === '')) {
      throw new Error('cover: a custom campaign needs a description')
    }

    const drawn = await draw({
      prompt: coverPrompt({
        campaign,
        shape,
        palette,
        ...(described === undefined ? {} : { described }),
      }),
      count: COVER_VARIATIONS,
    })

    const options = await Promise.all(
      drawn.map((bytes, index) => store(bytes, organizationId, shopId, jobId, index))
    )

    const spend = await consumeCredits({
      organizationId,
      shopId,
      action: 'cover_gen',
      cost: CREDIT_COSTS.cover_gen,
    })

    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'complete',
        completedAt: new Date(),
        result: {
          options,
          campaign,
          shape,
          charged: spend.ok ? spend.charged : 0,
        },
      },
    })

    return { status: 'complete', options: options.length }
  } catch (error) {
    if (error instanceof NoImageError) {
      await fail(jobId, 'image_refused', error.detail)
      return { status: 'failed', reason: 'image_refused' }
    }

    if (error instanceof ImageGenerationOffError) {
      await fail(jobId, 'image_generation_off')
      return { status: 'failed', reason: 'image_generation_off' }
    }

    await fail(jobId, error instanceof Error ? error.message : 'unknown_error')
    throw error
  }
}

/**
 * One option, stored.
 *
 * **JPEG, unlike every other generated image here.** A cover is a full-bleed
 * photograph-sized graphic with no transparency, and a PNG of one is several
 * megabytes an owner loads on 4G. A character is PNG because it has to be cut
 * out; this never does.
 */
async function store(
  bytes: Buffer,
  organizationId: string,
  shopId: string,
  jobId: string,
  index: number
): Promise<{ url: string; key: string }> {
  const jpeg = await sharp(bytes).jpeg({ quality: 88 }).toBuffer()
  const key = `${organizationId}/${shopId}/covers/${jobId}-${index}.jpg`
  const url = await putObject(key, jpeg, 'image/jpeg')
  return { url, key }
}

function asCampaign(value: string): Campaign {
  const found = CAMPAIGNS.find((campaign) => campaign === value)
  if (found === undefined) throw new Error(`cover: "${value}" is not a campaign we draw`)
  return found
}

function asShape(value: string): CoverShape {
  const found = COVER_SHAPES.find((shape) => shape === value)
  if (found === undefined) throw new Error(`cover: "${value}" is not a shape we draw`)
  return found
}

async function fail(jobId: string, reason: string, detail?: string) {
  await prisma.aiJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      errorMessage: reason,
      completedAt: new Date(),
      ...(detail === undefined ? {} : { result: { notes: [detail] } }),
    },
  })
}
