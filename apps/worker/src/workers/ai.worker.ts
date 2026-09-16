import { Worker } from 'bullmq'
import { env } from '../lib/env'
import { handleMagicBlock } from '../jobs/magic-block.job'
import { handleBrandDirection } from '../jobs/brand-direction.job'
import { handleLogoGen } from '../jobs/logo-gen.job'

/**
 * The AI queue.
 *
 * **Routed by job name, not by a `type` field on the payload.** The four image
 * jobs — character, pose, cover, prompt — share `AiJobPayload` and are still
 * stubs; magic block, brand direction and logo generation each carry their own
 * payload and are implemented. Branching on the name keeps the payloads from
 * having to be one union, which is what let `MagicBlockPayload` drop the
 * `shopId` that a block does not have, and what lets `BrandDirectionPayload`
 * carry a `shopId` *or* an `orgLevel` flag rather than one required id.
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

    // E8-01 through E8-04. Correctly wired, not yet implemented — they need a
    // diffusion provider, which is a decision nobody has made. `E8-pending.md` §3.
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
