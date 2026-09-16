import type { Job } from 'bullmq'
import sharp from 'sharp'
import { prisma } from '@souqstudio/db'
import type { BrandDirectionPayload } from '@souqstudio/db'
import { directionProblems, type BrandDirection } from '@souqstudio/engine'
import { getObjectBytes } from '../lib/r2'
import { readBrandDirection } from '../lib/direction-vision'
import {
  UnreadableShopError,
  UnusableDirectionError,
  type DirectionImage,
  type DirectionInput,
} from '../lib/direction-prompt'

/**
 * Brand direction — a palette and a type mood for a shop that has neither. E8-08.
 *
 * ```
 * ai_jobs: processing
 *      ↓
 * a storefront photo, the logo, or a sentence   →   one model call
 *      ↓
 * directionProblems()        ← the contrast bar, computed and never asked
 *      ↓  (problems: one more call, then decline)
 * ai_jobs: complete, result = the proposal
 *      ↓
 * the owner accepts  →  POST /api/v1/brand/direction/accept  →  kit patched, 3 credits
 * ```
 *
 * **This job writes no brand kit and charges nothing.** Both are the accept
 * route's, and that is the one place E8-07's ordering is deliberately not
 * copied. A palette is meant to be re-rolled during setup — charging per roll
 * prices a shop out of the step every other feature depends on — so generating
 * is free and keeping costs three credits. Nothing is deducted here, so as with
 * magic block there is no refund path to get wrong.
 *
 * **A proposal that fails the gate is regenerated once inside this job, not by a
 * retry.** BullMQ's two attempts exist for faults — the provider being down, R2
 * being unreachable. A model that proposed an illegible price colour did not
 * fault; it answered, and the answer was no good. Retrying the *job* would
 * re-fetch the image and re-run everything around it to ask the same question
 * again. Asking again here is cheaper and says what it means.
 */

const MEDIA: Readonly<Record<string, 'image/png' | 'image/jpeg' | 'image/webp'>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

/** The longest edge the picture is sent at. `magic-block.job.ts` says why 1568. */
const MAX_EDGE = 1568

/**
 * How many times a refused proposal is asked for again.
 *
 * One. A second model that proposes an unreadable price colour twice is telling
 * us something about the picture rather than having bad luck — most often a
 * photograph whose only strong colour is a pale one — and a third call spends
 * real money to hear it a third time.
 */
const RETRIES_ON_PROBLEMS = 1

export async function handleBrandDirection(job: Job<BrandDirectionPayload>) {
  const { jobId, sourceKey, described, organizationId, shopId } = job.data

  await prisma.aiJob.update({ where: { id: jobId }, data: { status: 'processing' } })

  try {
    const shopName = await nameFor(organizationId, shopId)
    const image = sourceKey === undefined ? undefined : await prepare(sourceKey)

    // Inside the try, so a payload this process cannot work from fails the row
    // rather than throwing past it — a job left at `processing` is one the
    // client polls until its own deadline.
    if (image === undefined && (described === undefined || described.trim() === '')) {
      throw new Error('direction: neither a picture nor a description was given')
    }

    const input: DirectionInput = {
      shopName,
      ...(image === undefined ? {} : { image }),
      ...(described === undefined ? {} : { described }),
    }

    const { direction, problems } = await propose(input)

    if (problems.length > 0) {
      /**
       * **Refused, not shown with a warning on it.**
       *
       * E4-02 warns an owner whose own primary colour fails AA, because it is
       * their brand and we do not get to overrule it. Nothing here is theirs
       * yet. Offering a palette we have already computed to be unusable, and
       * asking them to notice, is worse than saying we could not find one.
       */
      await fail(jobId, 'no_usable_direction', problems)
      return { status: 'failed', reason: 'no_usable_direction' }
    }

    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'complete',
        completedAt: new Date(),
        // The proposal itself, and nothing derived from it. What a mood means in
        // typefaces is the web app's to resolve, from a catalog filtered per
        // slot that this process cannot see and should not duplicate.
        result: {
          palette: direction.palette,
          priceIndex: direction.priceIndex,
          mood: direction.mood,
          notes: direction.notes,
        },
      },
    })

    return { status: 'complete' }
  } catch (error) {
    /**
     * "There is no brand to read here" is an answer, not a fault. It completes
     * the job as failed so the client stops polling, and it must never be
     * retried: the photograph will not have changed, and each attempt is a paid
     * call. Throwing is what BullMQ retries, so this branch returns.
     */
    if (error instanceof UnreadableShopError) {
      await fail(jobId, 'unreadable_shop', error.notes)
      return { status: 'failed', reason: 'unreadable_shop' }
    }

    if (error instanceof UnusableDirectionError) {
      await fail(jobId, 'unusable_direction')
      return { status: 'failed', reason: 'unusable_direction' }
    }

    await fail(jobId, error instanceof Error ? error.message : 'unknown_error')
    throw error
  }
}

/** A proposal and what is wrong with it, asked for again once if anything is. */
async function propose(
  input: DirectionInput
): Promise<{ direction: BrandDirection; problems: ReturnType<typeof directionProblems> }> {
  let last = await readBrandDirection(input)
  let problems = directionProblems(last)

  for (let attempt = 0; attempt < RETRIES_ON_PROBLEMS && problems.length > 0; attempt += 1) {
    last = await readBrandDirection(input)
    problems = directionProblems(last)
  }

  return { direction: last, problems }
}

/**
 * The shop's name, which is what the colours are for.
 *
 * Read here rather than carried on the payload: a name is a fact in the database
 * and a queue payload is a copy of it that can be stale by the time the job
 * runs. It is also the one field the model is always given, image or not.
 */
async function nameFor(organizationId: string, shopId?: string): Promise<string> {
  if (shopId !== undefined) {
    const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { name: true } })
    if (shop !== null) return shop.name
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  })

  if (org === null) throw new Error('direction: no shop or organization to propose for')
  return org.name
}

/** Mark the job failed, with something the poll route can turn into a sentence. */
async function fail(jobId: string, reason: string, notes?: readonly string[]) {
  await prisma.aiJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      errorMessage: reason,
      completedAt: new Date(),
      ...(notes === undefined ? {} : { result: { notes: [...notes] } }),
    },
  })
}

/**
 * The picture, fetched and made small enough to send.
 *
 * Re-encoded rather than passed through, for the reason `magic-block.job.ts`
 * gives: the bytes came from a presigned PUT and their declared content type was
 * never checked against their contents.
 */
async function prepare(key: string): Promise<DirectionImage> {
  const original = await getObjectBytes(key)
  const meta = await sharp(original).metadata()

  const mediaType = MEDIA[meta.format ?? '']
  if (mediaType === undefined) {
    throw new UnusableDirectionError()
  }

  const longest = Math.max(meta.width ?? 0, meta.height ?? 0)
  if (longest <= MAX_EDGE) return { bytes: original, mediaType }

  const bytes = await sharp(original)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .toBuffer()

  return { bytes, mediaType }
}
