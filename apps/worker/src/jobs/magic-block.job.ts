import type { Job } from 'bullmq'
import sharp from 'sharp'
import { CREDIT_COSTS, Prisma, consumeCredits, prisma } from '@souqstudio/db'
import type { MagicBlockPayload } from '@souqstudio/db'
import { usesOnlyRoles, validateBlock } from '@souqstudio/engine'
import { arrangementsFromChoice } from '@souqstudio/engine/src/magic'
import { getObjectBytes } from '../lib/r2'
import { NotAnOfferCardError, UnreadableDesignError, readCardDesign } from '../lib/anthropic'

/**
 * Magic block — a picture of a card in, a draft block in the library out. E8-07.
 *
 * ```
 * ai_jobs: processing
 *      ↓
 * R2 object  →  vision call  →  a structure and a skin
 *      ↓
 * arrangementsFromChoice()   →  the same arrangements the shipped library uses
 *      ↓
 * validateBlock + usesOnlyRoles   ← refuses here rather than at a deploy
 *      ↓
 * blocks row, status: draft   →  consumeCredits  →  ai_jobs: complete
 * ```
 *
 * **The block is a draft and the owner lands in the designer with it.** E7 §8
 * settled that creating a block is duplicating one that works rather than
 * starting from a blank artboard; a generated block is the same move with a
 * photograph as the seed. Publishing it is a separate decision a person makes
 * after looking at it, which is also what `MachineOutput` in the library is for.
 *
 * **Credits are consumed last, and only on success.** `background-jobs.md`: a
 * shop must not pay for a job that failed, and because nothing is deducted
 * early there is no refund path to get wrong.
 */

/** What the picture may be, and what the vision call accepts. */
const MEDIA: Readonly<Record<string, 'image/png' | 'image/jpeg' | 'image/webp'>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

/**
 * The longest edge the picture is sent at.
 *
 * A shop owner photographs a flyer on a phone, which is eight megapixels of
 * mostly paper. Downscaling costs nothing legible — the layout is readable at a
 * fraction of that — and it is the difference between a request that is mostly
 * image tokens and one that is not. 1568 is where the model stops gaining
 * detail from a larger image.
 */
const MAX_EDGE = 1568

export async function handleMagicBlock(job: Job<MagicBlockPayload>) {
  const { jobId, organizationId, sourceKey } = job.data

  await prisma.aiJob.update({ where: { id: jobId }, data: { status: 'processing' } })

  try {
    const image = await prepare(sourceKey)
    const choice = await readCardDesign(image)
    const arrangements = arrangementsFromChoice(choice)

    /**
     * **The same two bars a block authored any other way clears.**
     *
     * Both should be unreachable — every structure in the registry is one the
     * shipped library already draws, and every colour the assembler emits is a
     * role by construction. They are checked anyway because "should be
     * unreachable" is the state a refactor breaks silently, and the cost of
     * being wrong is a block in an owner's library that the export worker
     * cannot draw.
     */
    const errors = validateBlock({ repeats: true, arrangements }).filter(
      (problem) => problem.severity === 'error'
    )
    if (errors.length > 0) {
      throw new Error(`magic: assembled an invalid block (${errors.map((e) => e.code).join(', ')})`)
    }
    if (!usesOnlyRoles(arrangements)) {
      throw new Error('magic: assembled a block naming a colour by value')
    }

    const block = await prisma.block.create({
      data: {
        organizationId,
        name: choice.name,
        description: choice.description,
        // Every structure in the registry repeats over the product list. A
        // picture that was not an offer card never reaches here — `readCardDesign`
        // throws `NotAnOfferCardError` instead of matching it to the nearest one.
        repeats: true,
        arrangements: arrangements as unknown as Prisma.InputJsonValue,
        // Draft, always. Nobody has looked at it yet.
        status: 'draft',
        category: 'offer-card',
      },
      select: { id: true },
    })

    const spend = await consumeCredits({
      organizationId,
      action: 'block_gen',
      cost: CREDIT_COSTS.block_gen,
    })

    /**
     * **A balance that ran out between the route's check and here does not undo
     * the block.** The route refuses an owner who cannot pay; this is the narrow
     * race where another job spent the difference while this one was running.
     * Deleting a finished block to settle a five-credit accounting question is
     * the wrong trade — the work is done and the model was already paid for. It
     * is recorded on the job so the discrepancy is visible rather than silent.
     */
    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'complete',
        completedAt: new Date(),
        result: {
          blockId: block.id,
          structure: choice.structure,
          confidence: choice.confidence,
          notes: choice.notes,
          charged: spend.ok ? spend.charged : 0,
        },
      },
    })

    return { status: 'complete', blockId: block.id }
  } catch (error) {
    /**
     * **"That is not an offer card" is an answer, not a fault.**
     *
     * It completes the job as `failed` so the client stops polling, but it must
     * never be retried — the picture will not become a different picture on the
     * second attempt, and each attempt is a paid call. Throwing is what BullMQ
     * retries, so this branch returns.
     */
    if (error instanceof NotAnOfferCardError) {
      await fail(jobId, 'not_an_offer_card', error.notes)
      return { status: 'failed', reason: 'not_an_offer_card' }
    }

    if (error instanceof UnreadableDesignError) {
      await fail(jobId, 'unreadable_design')
      return { status: 'failed', reason: 'unreadable_design' }
    }

    // Everything else — R2 unreachable, the model provider down, a bug here —
    // is a real fault. Record it and rethrow so the attempt is retried.
    await fail(jobId, error instanceof Error ? error.message : 'unknown_error')
    throw error
  }
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
 * **Re-encoded rather than passed through.** The bytes came from a presigned
 * PUT, so what is in the bucket is whatever the browser uploaded and its
 * declared content type was never verified against its contents. Running it
 * through sharp settles the format from the actual bytes, and a file that is not
 * an image fails here rather than inside a model request.
 */
async function prepare(key: string): Promise<{
  bytes: Buffer
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
}> {
  const original = await getObjectBytes(key)
  const meta = await sharp(original).metadata()

  const mediaType = MEDIA[meta.format ?? '']
  if (mediaType === undefined) {
    throw new UnreadableDesignError()
  }

  const longest = Math.max(meta.width ?? 0, meta.height ?? 0)
  if (longest <= MAX_EDGE) return { bytes: original, mediaType }

  // `withoutEnlargement` is redundant behind the check above and kept as the
  // statement of intent: this only ever shrinks.
  const bytes = await sharp(original)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .toBuffer()

  return { bytes, mediaType }
}
