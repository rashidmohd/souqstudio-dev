import { Worker } from 'bullmq'
import { env } from '../lib/env'
import { handleMagicBlock } from '../jobs/magic-block.job'

/**
 * The AI queue.
 *
 * **Routed by job name, not by a `type` field on the payload.** The four image
 * jobs — character, pose, cover, prompt — share `AiJobPayload` and are still
 * stubs; magic block carries its own payload and is implemented. Branching on
 * the name keeps the payloads from having to be one union, which is what let
 * `MagicBlockPayload` drop the `shopId` that a block does not have.
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

    // E8-01 through E8-04. Correctly wired, not yet implemented.
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
