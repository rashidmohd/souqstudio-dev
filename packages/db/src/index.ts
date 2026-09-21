export { prisma, withOrg } from './client'
/**
 * Prisma's own types, re-exported so no app has to import `@prisma/client`
 * directly — the rule in CLAUDE.md exists so the generated client has exactly
 * one entry point. `Prisma` carries the input types that writing a JSONB column
 * needs.
 */
export { Prisma } from '@prisma/client'
// The tier *vocabulary* — the colours and what emphasis means — is in
// `@souqstudio/types`, not here. A client component renders it, and importing
// this package from one pulls Prisma and BullMQ into the browser bundle.
export { DEFAULT_PROMO_TIERS, seedPromoTiers } from './promo-tiers'
/**
 * Row types, for the same reason. A library that takes "a plan" as an argument
 * wants the generated row shape, not a hand-written copy that drifts from the
 * schema the first time a column is added.
 */
export type {
  Organization,
  Shop,
  Plan,
  CreditBalance,
  CreditTopup,
  ShopCreditAllocation,
  UsageEvent,
} from '@prisma/client'
/**
 * AI credit accounting — E3-03. Here rather than in apps/web/lib because the
 * web app checks the balance and the worker deducts it; see credits.ts.
 */
export {
  CREDIT_COSTS,
  TOPUP_PACK,
  CREDIT_ROLLOVER_MULTIPLE,
  LOW_BALANCE_FRACTION,
  rolloverAmount,
  splitSpend,
  addMonths,
  currentPeriod,
  getCreditSnapshot,
  consumeCredits,
  grantTopupCredits,
  startBillingPeriod,
} from './credits'
export type { CreditAction, CreditSnapshot, SpendResult } from './credits'
export {
  queues,
  closeQueues,
  enqueueEmail,
  enqueuePdf,
  enqueueAiJob,
  enqueueBgRemove,
  enqueueShadowRender,
  enqueueEnrich,
  enqueueMagicBlock,
  enqueueBrandDirection,
  enqueueLogoGen,
  enqueueCharacterGen,
  enqueuePoseGen,
  enqueueCoverGen,
} from './queue-client'
export type {
  EmailJobPayload,
  PdfJobPayload,
  AiJobPayload,
  BgRemovePayload,
  ShadowRenderPayload,
  MagicBlockPayload,
  BrandDirectionPayload,
  LogoGenPayload,
  CharacterGenPayload,
  PoseGenPayload,
  CoverGenPayload,
} from './queue-client'
/**
 * Writing the block library into `blocks` — one implementation, two callers: the
 * seed on every deploy, and `POST /api/v1/library/sync` when somebody publishes
 * a design and will not wait for a release. See the file.
 */
export { syncLibrary } from './library-sync'
export type { LibrarySyncResult } from './library-sync'
