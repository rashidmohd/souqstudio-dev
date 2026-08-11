import { Worker } from 'bullmq'
import { env } from '../lib/env'

// TODO: implement pdf worker
// See apps/worker/CLAUDE.md for full implementation guidance

export const pdfWorker = new Worker(
  'pdf',
  async (job) => {
    console.log(`[pdf] Processing job ${job.id} — ${job.name}`)
    throw new Error('Not yet implemented')
  },
  {
    connection: { url: env.REDIS_URL },
    concurrency: 3,
  }
)

pdfWorker.on('completed', (job) => {
  console.log(`[pdf] Job ${job.id} completed`)
})

pdfWorker.on('failed', (job, err) => {
  console.error(`[pdf] Job ${job?.id} failed:`, err.message)
})
