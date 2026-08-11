import { Worker } from 'bullmq'
import type { EmailJobPayload } from '@souqstudio/db'
import { env } from '../lib/env'
import { handleEmailJob } from '../jobs/email.job'

export const emailWorker = new Worker<EmailJobPayload>(
  'email',
  handleEmailJob,
  {
    connection: { url: env.REDIS_URL },
    concurrency: 5,
  }
)

emailWorker.on('completed', (job, result) => {
  const outcome = result === 'sent' ? 'Sent' : 'Skipped'
  console.log(`[email] ${outcome} ${job.data.template} to ${job.data.to}`)
})

emailWorker.on('failed', (job, err) => {
  // The recipient is logged, the props never are — they carry one-time codes.
  console.error(
    `[email] Job ${job?.id} (${job?.data.template} to ${job?.data.to}) failed:`,
    err.message
  )
})
