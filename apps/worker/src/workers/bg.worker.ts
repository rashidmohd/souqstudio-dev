import { Worker, type Job } from 'bullmq'
import type { ShadowRenderPayload } from '@souqstudio/db'
import { env } from '../lib/env'
import { handleBgRemove, type BgJobPayload } from '../jobs/bg.job'
import { handleShadowRender } from '../jobs/shadow.job'

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
    /*
     * **Two job names on one queue.** They share a rhythm — seconds of CPU on
     * one picture — and the same concurrency ceiling, and nothing else: a
     * shadow render calls no external service and cannot be "unavailable".
     * Branching on the name rather than on a payload field, as `ai.worker`
     * does, so a payload never has to carry a discriminator the handler could
     * disagree with.
     *
     * The two assertions are the cost of that: BullMQ types a worker by one
     * payload, and the name is what actually discriminates. Each branch asserts
     * only the type its own `add()` call writes.
     */
    if (job.name === 'bg.shadow') {
      return handleShadowRender(job as Job<ShadowRenderPayload>)
    }
    return handleBgRemove(job as Job<BgJobPayload>)
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
