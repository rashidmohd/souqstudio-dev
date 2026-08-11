import { Worker } from 'bullmq'
import { env } from '../lib/env'
import { handleBgRemove } from '../jobs/bg.job'

/**
 * Background removal. E4-01.
 *
 * Concurrency stays low: each job holds a full-size image in memory through
 * sharp and waits on Rembg, so the limit here is really Rembg's throughput
 * rather than ours. Five in flight against a single-model service just queues
 * them somewhere less visible.
 *
 * Note that `handleBgRemove` resolves rather than throws when Rembg is
 * unreachable — see the reasoning there. A job that fails here is a real fault
 * (bad payload, R2 unreachable) and is worth retrying.
 */
export const bgWorker = new Worker(
  'bg',
  async (job) => {
    console.log(`[bg] Processing job ${job.id} — ${job.name}`)
    return handleBgRemove(job)
  },
  {
    connection: { url: env.REDIS_URL },
    concurrency: 2,
  }
)

bgWorker.on('completed', (job, result) => {
  console.log(`[bg] Job ${job.id} completed — ${result?.status ?? 'done'}`)
})

bgWorker.on('failed', (job, err) => {
  console.error(`[bg] Job ${job?.id} failed:`, err.message)
})
