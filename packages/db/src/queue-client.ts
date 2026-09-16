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
  /**
   * What kind of thing the owner said the picture is — one of
   * `MAGIC_CATEGORIES`, validated by the route that queued this.
   *
   * **A string here rather than the engine's `MagicCategory`.** This module is
   * imported by the web app's client bundle through `@souqstudio/db`'s barrel,
   * and a type import from the engine would be free while a value import is not
   * — but the worker is what reads it, and the worker validates it against the
   * real vocabulary before it reaches a model. The route is the gate; this is a
   * transport.
   */
  category: string
}

/**
 * Brand direction — a palette and a type mood for a shop that has neither. E8-08.
 *
 * **Its own payload for the same reason `MagicBlockPayload` has one**, and the
 * opposite conclusion: this job *does* belong to a level, and which level is the
 * whole question. A chain sets colours once at the organization and every shop
 * inherits them; a franchise shop overrides them. `levelFor` has already decided
 * before this is queued, so exactly one of the two ids is set — the same shape
 * `BgRemovePayload` settled on when a logo turned out to belong to either.
 *
 * **Nothing here is written to a brand kit.** The worker produces a proposal and
 * stops. The accept route is what patches the kit and what charges for it.
 */
export interface BrandDirectionPayload {
  /** `ai_jobs` row id — what the client polls and the worker updates. */
  jobId: string
  organizationId: string
  /** Set when the owner is editing one shop's kit. Exclusive with `orgLevel`. */
  shopId?: string
  /** Set when they are editing the organization's defaults. E2-05. */
  orgLevel?: boolean
  /**
   * R2 object key of a storefront photo, a signage photo, or the logo already
   * in the kit. Absent when the owner described the shop in words instead —
   * which is the cheapest of the three inputs and the one a shop with no logo
   * and no good photograph can always reach.
   */
  sourceKey?: string
  /** What the owner typed about their shop. Absent when they uploaded instead. */
  described?: string
}

/**
 * Logo mark — four marks assembled from a structure the model chose. E8-09.
 *
 * **No diffusion model, and that is the design rather than a limitation.** The
 * model picks one of a hand-drawn set of structures and describes how to skin it
 * from the shop's own palette; the worker assembles the SVG. So it cannot emit
 * an illegal mark, it needs none of the provider decision that blocks E8-01 to
 * E8-04, and what comes out is a vector that prints. `docs/E8-ai-features.md` →
 * E8-09 has the argument in full.
 */
export interface LogoGenPayload {
  jobId: string
  organizationId: string
  shopId?: string
  orgLevel?: boolean
  /** The name to set in the mark. Arabic, Latin or both — the structures differ. */
  shopName: string
  /** What the shop sells, in the owner's words. Steers the structure choice. */
  trade?: string
  /**
   * The palette to skin the mark from, as hex.
   *
   * Passed rather than read in the worker because the owner may be looking at an
   * E8-08 proposal they have not accepted yet — "generate a logo from *these*
   * colours" is the obvious next click, and it must not require saving first.
   */
  palette: string[]
  /**
   * The shop's headline face, written into the stored SVG.
   *
   * **Named, not embedded.** This process has no font files — `CLAUDE.md`'s
   * known gap: the brand faces load from Google's CDN in a browser and are not
   * mirrored into R2 yet. A named family renders correctly on every surface that
   * has already loaded it, which is all of them, and degrades to a real fallback
   * stack anywhere else. Embedding would need the binary; rasterising would
   * silently substitute whatever the container has.
   */
  family: string
}

/**
 * A character, four variations. E8-01.
 *
 * **Its own payload rather than a branch of `AiJobPayload`**, for the reason
 * every other job on this queue now has one: that type carries a required
 * `shopId` and an open index signature, which types nothing.
 *
 * `consentedAt` is the record that the owner was told where the photograph goes
 * before it went. It is carried on the payload rather than looked up because the
 * route that took the consent is the only thing that can attest to it.
 */
export interface CharacterGenPayload {
  jobId: string
  organizationId: string
  shopId: string
  /** R2 object key of the uniform photograph. Never a client-supplied URL. */
  sourceKey: string
  /** One of `CHARACTER_STYLES`, validated by the route that queued this. */
  style: string
  /** One of `CHARACTER_GENDERS`. `both` draws two of each. */
  gender: string
  /** One of `CHARACTER_LOOKS`. */
  look: string
  /** ISO timestamp of the consent the owner gave. Never optional. */
  consentedAt: string
}

/** One pose of an existing character, two variations. E8-02 and E8-03. */
export interface PoseGenPayload {
  jobId: string
  organizationId: string
  shopId: string
  characterId: string
  /**
   * One of `POSES`, or absent when the owner described the pose themselves —
   * which is E8-03 rather than E8-02, and the only difference between them.
   */
  pose?: string
  described?: string
}

/** A cover background, three options. E8-04. */
export interface CoverGenPayload {
  jobId: string
  organizationId: string
  shopId: string
  /** One of `CAMPAIGNS`. */
  campaign: string
  described?: string
  /** One of `COVER_SHAPES`. */
  shape: string
  /** The shop's palette, so the cover is drawn in its colours. */
  palette: string[]
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
  /**
   * Set when an owner asked for this cutout by hand — E8-05's manual action,
   * one credit per image.
   *
   * **Its absence is what keeps ingest free**, and that is the whole reason this
   * is a field rather than a rule in the worker. Every cutout today is queued by
   * an ingest path — a logo upload, a catalog contribution — and E5 §3 is
   * explicit that the cutout is an ingest stage rather than the owner's chore.
   * Charging for those because they happen to run the same job would be a
   * pricing change nobody asked for, applied retroactively to a queue.
   *
   * Named apart from `organizationId` and `shopId` above, which mean something
   * else on this payload: those say *whose brand kit* a logo result is written
   * back to. These say who pays.
   */
  billOrganizationId?: string
  billShopId?: string
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

export async function enqueueBrandDirection(payload: BrandDirectionPayload) {
  return queues.ai.add('ai.brandDirection', payload, {
    // Two attempts, as everything else on this queue: each is a paid call, and a
    // picture a model cannot read a brand off will not become readable on a
    // third try. A proposal the gate refuses is regenerated inside the job, not
    // by a retry — see `brand-direction.job.ts`.
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
  })
}

export async function enqueueLogoGen(payload: LogoGenPayload) {
  return queues.ai.add('ai.logoGen', payload, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
  })
}

export async function enqueueCharacterGen(payload: CharacterGenPayload) {
  return queues.ai.add('ai.character', payload, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
  })
}

export async function enqueuePoseGen(payload: PoseGenPayload) {
  return queues.ai.add('ai.pose', payload, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
  })
}

export async function enqueueCoverGen(payload: CoverGenPayload) {
  return queues.ai.add('ai.cover', payload, {
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
