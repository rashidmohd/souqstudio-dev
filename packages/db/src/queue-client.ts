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

/**
 * Magic block — read a picture of a card, produce a block. E8-07.
 *
 * **Its own payload rather than a branch of `AiJobPayload`**, because it is the
 * one AI job that produces no image and belongs to no shop. Every other job on
 * this queue generates a picture for one shop's brand kit; this one writes a row
 * into `blocks`, which is organization-scoped — a chain designs a card once and
 * every shop in it uses that card. `AiJobPayload` carries a required `shopId`
 * and an open index signature, and widening it to fit would lose the type check
 * on the four jobs that do have one.
 *
 * `sourceKey` is an R2 object key rather than a URL. The upload goes through the
 * presigned route the designer already uses for artwork, which hands back the
 * key it wrote — and a key is what survives the bucket moving behind a different
 * public origin.
 */
export interface MagicBlockPayload {
  /** `ai_jobs` row id — what the client polls and the worker updates. */
  jobId: string
  organizationId: string
  /** R2 object key of the uploaded picture. Never a client-supplied URL. */
  sourceKey: string
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
  /**
   * E5 §3. Set when this is a catalog cutout rather than a logo: the worker
   * writes an `image_assets` row of kind CUTOUT against this product, derived
   * from `sourceAssetId`, carrying `bboxTight` and a matting `quality` score.
   *
   * `bboxTight` is not decoration — the layout engine scales cards to optical
   * weight, so a cutout with 30% transparent padding renders visibly smaller
   * than its neighbours without it. A low `quality` lands the asset in review
   * rather than on a printed page.
   *
   * Set with `sourceAssetId` and neither `shopId` nor `organizationId`.
   */
  catalogProductId?: string
  sourceAssetId?: string
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

export async function enqueueMagicBlock(payload: MagicBlockPayload) {
  return queues.ai.add('ai.magicBlock', payload, {
    // Two attempts, like every other job on this queue: each one is a paid call
    // to a model provider, and a prompt the model cannot answer will not become
    // answerable on the third try.
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
