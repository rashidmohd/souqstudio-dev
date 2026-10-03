import { Worker } from 'bullmq'
import type { BlockThumbnailPayload } from '@souqstudio/db'
import { env } from '../lib/env'
import { handleBlockThumbnail } from '../jobs/block-thumbnail.job'

/**
 * Captures from headless Chromium. Today one job name, `render.blockThumbnail`.
 *
 * Two at a time: each holds a browser from the pool for a second or two, and
 * the first time a shop opens a picker it asks for every block it shows, so
 * this is a queue that drains rather than one somebody waits on.
 */
export const renderWorker = new Worker<BlockThumbnailPayload>(
  'render',
  async (job) => handleBlockThumbnail(job),
  {
    connection: { url: env.REDIS_URL },
    concurrency: 2,
  }
)

renderWorker.on('completed', (job, result) => {
  console.log(`[render] Job ${job.id} completed — ${result?.status ?? 'done'}`)
})

renderWorker.on('failed', (job, err) => {
  console.error(`[render] Job ${job?.id} failed:`, err.message)
})
