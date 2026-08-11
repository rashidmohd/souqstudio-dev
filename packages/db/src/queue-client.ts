import { Queue } from 'bullmq'
import type { EmailTemplate } from '@souqstudio/types'

const connection = {
  url: process.env.REDIS_URL!,
}

// ─── Queue instances ──────────────────────────────────────────────────────────
export const queues = {
  pdf:    new Queue('pdf',    { connection }),
  ai:     new Queue('ai',     { connection }),
  bg:     new Queue('bg',     { connection }),
  email:  new Queue('email',  { connection }),
  enrich: new Queue('enrich', { connection }),
}

// ─── Job payload types ────────────────────────────────────────────────────────
export interface EmailJobPayload {
  template: EmailTemplate
  to: string
  props: Record<string, unknown>
}

export interface PdfJobPayload {
  offerBookId: string
  format: string
  printReady: boolean
}

export interface AiJobPayload {
  type: 'character' | 'pose' | 'cover' | 'prompt'
  shopId: string
  jobId: string  // ai_jobs table id — for status updates
  [key: string]: unknown
}

export interface BgRemovePayload {
  imageUrl: string
  targetPath: string
  /**
   * Whose logo this is. The worker writes the outcome back onto the shop's
   * brand kit, which is how the setup wizard learns whether removal happened —
   * without it the job succeeds into the void.
   */
  shopId?: string
  /**
   * Set instead of `shopId` when the logo belongs to the organization rather
   * than to one shop — E2-05. An inheriting shop renders the organization's
   * logo, so the removal status of that logo is an organization fact; writing
   * it onto the shop would leave the wizard polling a key nothing updates.
   * Exactly one of the two is set, decided by `levelFor(override, 'logo')`.
   */
  organizationId?: string
  jobId?: string
}

export interface EnrichPayload {
  catalogProductId: string
}

// ─── Typed enqueue helpers ────────────────────────────────────────────────────
export async function enqueueEmail(payload: EmailJobPayload) {
  return queues.email.add('email.send', payload, {
    // Three attempts with exponential backoff — apps/worker/CLAUDE.md.
    // Provider failures are usually transient: a rate limit or an upstream blip.
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    // Keep failures for inspection; drop successes so Redis does not grow
    // without bound. The durable record is notification_log.
    removeOnComplete: 100,
    removeOnFail: 1000,
  })
}

export async function enqueuePdf(payload: PdfJobPayload) {
  return queues.pdf.add('pdf.render', payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  })
}

export async function enqueueAiJob(payload: AiJobPayload) {
  return queues.ai.add(`ai.${payload.type}`, payload, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
  })
}

export async function enqueueBgRemove(payload: BgRemovePayload) {
  return queues.bg.add('bg.remove', payload, {
    attempts: 3,
    backoff: { type: 'fixed', delay: 2000 },
  })
}

export async function enqueueEnrich(payload: EnrichPayload) {
  return queues.enrich.add('catalog.enrich', payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    priority: 10, // low priority — background enrichment
  })
}
