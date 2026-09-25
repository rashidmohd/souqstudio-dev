import { Worker } from 'bullmq'
import { env } from '../lib/env'
import { handleMagicBlock } from '../jobs/magic-block.job'
import { handleBrandDirection } from '../jobs/brand-direction.job'
import { handleLogoGen } from '../jobs/logo-gen.job'
import { handleCharacterGen } from '../jobs/character.job'
import { handlePoseGen } from '../jobs/pose.job'
import { handleCoverGen } from '../jobs/cover.job'
import { handleCopyFill } from '../jobs/copy-fill.job'

/**
 * The AI queue.
 *
 * **Routed by job name, not by a `type` field on the payload.** Every job here
 * now carries its own payload, and branching on the name is what lets them: a
 * block has no `shopId`, a brand direction has a `shopId` *or* an `orgLevel`
 * flag, and a pose has a `characterId` that means nothing to the others. One
 * union of all of them would type none of them.
 *
 * `AiJobPayload` survives as the shape nothing uses any more. It is left rather
 * than deleted because it is exported from `@souqstudio/db`'s barrel.
 *
 * Concurrency stays at two. Each job holds an image in memory and waits on an
 * external provider with its own rate limits, so more in flight only queues
 * them somewhere less visible.
 */
export const aiWorker = new Worker(
  'ai',
  async (job) => {
    console.log(`[ai] Processing job ${job.id} — ${job.name}`)

    if (job.name === 'ai.magicBlock') {
      return handleMagicBlock(job)
    }

    if (job.name === 'ai.brandDirection') {
      return handleBrandDirection(job)
    }

    if (job.name === 'ai.logoGen') {
      return handleLogoGen(job)
    }

    if (job.name === 'ai.character') {
      return handleCharacterGen(job)
    }

    // E8-02 and E8-03 are one handler: they differ by whether the pose was
    // picked from a list or described, which is one sentence of prompt.
    if (job.name === 'ai.pose' || job.name === 'ai.prompt') {
      return handlePoseGen(job)
    }

    if (job.name === 'ai.cover') {
      return handleCoverGen(job)
    }

    if (job.name === 'ai.copyFill') {
      return handleCopyFill(job)
    }

    throw new Error(`Not yet implemented: ${job.name}`)
  },
  {
    connection: { url: env.REDIS_URL },
    concurrency: 2,
  }
)

aiWorker.on('completed', (job, result) => {
  console.log(`[ai] Job ${job.id} completed — ${result?.status ?? 'done'}`)
})

aiWorker.on('failed', (job, err) => {
  console.error(`[ai] Job ${job?.id} failed:`, err.message)
})
