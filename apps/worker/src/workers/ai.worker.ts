import { Worker } from 'bullmq'
import { env } from '../lib/env'

// TODO: implement ai worker
// See apps/worker/CLAUDE.md for full implementation guidance

export const aiWorker = new Worker(
  'ai',
  async (job) => {
    console.log(`[ai] Processing job ${job.id} — ${job.name}`)
    throw new Error('Not yet implemented')
  },
  {
    connection: { url: env.REDIS_URL },
    concurrency: 2,
  }
)

aiWorker.on('completed', (job) => {
  console.log(`[ai] Job ${job.id} completed`)
})

aiWorker.on('failed', (job, err) => {
  console.error(`[ai] Job ${job?.id} failed:`, err.message)
})
