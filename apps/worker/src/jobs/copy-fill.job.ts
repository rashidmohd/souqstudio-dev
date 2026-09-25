import type { Job } from 'bullmq'
import { consumeCredits, prisma } from '@souqstudio/db'
import type { CopyFillPayload } from '@souqstudio/db'
import { fillSlotSchema, tradesOf, tradesPhrase } from '@souqstudio/engine'
import { writeFill } from '../lib/copy-fill-model'
import { DeclinedFillError, UnusableFillError, type FillShop } from '../lib/copy-fill-prompt'

/**
 * Generative fill: words for a block's free text.
 *
 * ```
 * ai_jobs: processing
 *      ↓
 * shop profile  +  brief  +  slots  →  model  →  lines held to the slots
 *      ↓
 * consumeCredits(job.creditsCost)  →  ai_jobs: complete, result.lines
 * ```
 *
 * **Nothing is written to the block.** The lines go on the job and the designer
 * shows them; the owner accepting them is an ordinary edit. So this job has no
 * artefact to leave behind if the dialog is closed, and it is not in the bell's
 * claimable list.
 *
 * **Charged what the job says, on success only.** The route recorded the
 * environment's price on the row, and a job that failed was never charged, so
 * there is no refund path to get wrong. `background-jobs.md`.
 */
export async function handleCopyFill(job: Job<CopyFillPayload>) {
  const { jobId, organizationId, shopId, brief } = job.data

  const row = await prisma.aiJob.update({
    where: { id: jobId },
    data: { status: 'processing' },
    select: { creditsCost: true },
  })

  try {
    // A payload is data from a queue, not a promise. Held to the same schema
    // the route used, so a stale or hand-written job fails here legibly.
    const slots = job.data.slots.map((slot) => fillSlotSchema.parse(slot))
    if (slots.length === 0) throw new Error('fill: no lines to write')

    const shop = await shopFor(organizationId, shopId)
    const lines = await writeFill({ shop, brief, slots })

    const cost = row.creditsCost
    const spend =
      cost > 0
        ? await consumeCredits({ organizationId, shopId: shopId ?? null, action: 'copy_fill', cost })
        : null

    /**
     * **A balance that ran out between the route's check and here does not
     * withhold the words.** The route refuses an owner who cannot pay; this is
     * the narrow race where another job spent the difference meanwhile. The
     * model is already paid for, so the words are delivered and the shortfall is
     * recorded on the job, the trade `magic-block.job.ts` makes.
     */
    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'complete',
        completedAt: new Date(),
        result: { lines, charged: spend === null ? 0 : spend.ok ? spend.charged : 0 },
      },
    })

    return { status: 'complete', lines: lines.length }
  } catch (error) {
    // Both are answers rather than faults: completed as failed so the dialog
    // stops polling, and returned rather than thrown so BullMQ does not pay for
    // the same answer twice.
    if (error instanceof DeclinedFillError) {
      await fail(jobId, 'declined')
      return { status: 'failed', reason: 'declined' }
    }

    if (error instanceof UnusableFillError) {
      await fail(jobId, 'unusable_fill')
      return { status: 'failed', reason: 'unusable_fill' }
    }

    // A provider outage or a bug here is a real fault. Record it and rethrow so
    // the attempt is retried.
    await fail(jobId, error instanceof Error ? error.message : 'unknown_error')
    throw error
  }
}

/**
 * What the shop is, read now rather than carried on the payload: a profile is a
 * fact in the database and a payload is a copy of it that can be stale.
 */
async function shopFor(organizationId: string, shopId?: string): Promise<FillShop> {
  if (shopId !== undefined) {
    const shop = await prisma.shop.findFirst({
      where: { id: shopId, organizationId },
      select: { name: true, location: true, trades: true, bio: true },
    })
    if (shop !== null) {
      return {
        name: shop.name,
        trades: tradesPhrase(tradesOf(shop.trades)),
        location: blankToNull(shop.location),
        bio: blankToNull(shop.bio),
      }
    }
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  })
  if (org === null) throw new Error('fill: no shop or organization to write for')

  return { name: org.name, trades: tradesPhrase([]), location: null, bio: null }
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? null : trimmed
}

/** Mark the job failed, with something the poll route can turn into a sentence. */
async function fail(jobId: string, reason: string) {
  await prisma.aiJob.update({
    where: { id: jobId },
    data: { status: 'failed', errorMessage: reason, completedAt: new Date() },
  })
}
