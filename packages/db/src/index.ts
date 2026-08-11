export { prisma, withOrg } from './client'
/**
 * Prisma's own types, re-exported so no app has to import `@prisma/client`
 * directly — the rule in CLAUDE.md exists so the generated client has exactly
 * one entry point. `Prisma` carries the input types that writing a JSONB column
 * needs.
 */
export { Prisma } from '@prisma/client'
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
export { queues, enqueueEmail, enqueuePdf, enqueueAiJob, enqueueBgRemove, enqueueEnrich } from './queue-client'
export type { EmailJobPayload, PdfJobPayload, AiJobPayload, BgRemovePayload } from './queue-client'
