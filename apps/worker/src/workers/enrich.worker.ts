import { Worker } from 'bullmq'
import { env } from '../lib/env'

// TODO: implement enrich worker
// See apps/worker/CLAUDE.md for full implementation guidance

export const enrichWorker = new Worker(
  'enrich',
  async (job) => {
    console.log(`[enrich] Processing job ${job.id} — ${job.name}`)
    throw new Error('Not yet implemented')
  },
  {
    connection: { url: env.REDIS_URL },
    concurrency: 2,
  }
)

enrichWorker.on('completed', (job) => {
  console.log(`[enrich] Job ${job.id} completed`)
})

enrichWorker.on('failed', (job, err) => {
  console.error(`[enrich] Job ${job?.id} failed:`, err.message)
})
