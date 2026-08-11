-- E3 Billing & Subscription.
--
-- Two departures from what `prisma migrate diff` generated, both deliberate:
--
--   1. `plans.tier` is added WITH a default and the default is then dropped.
--      Prisma generates a bare `ADD COLUMN "tier" INTEGER NOT NULL`, which
--      aborts on any database that already holds plan rows. `plans` is empty
--      today because nothing has ever seeded it — but this migration also has
--      to apply cleanly to a database that was pushed to later. Same reasoning
--      as the backfills in the E2 migration.
--
--   2. `ALTER TABLE "user_shop_access" ALTER COLUMN "updatedAt" DROP DEFAULT`
--      is NOT included. It is drift left by the E2 migration, which added the
--      column with `DEFAULT CURRENT_TIMESTAMP` so the backfill had a value
--      while the Prisma model declares `@updatedAt` and no default. It is
--      harmless — Prisma writes the column itself on every insert — and it
--      belongs to E2, not here. It will keep appearing in every diff until
--      someone clears it. See docs/E3-pending.md.
--
-- The columns are camelCase and quoted, because no Prisma field in this schema
-- carries an @map. Only the tables are snake_case, via @@map.

-- ─── organizations: the Stripe cache and the pooling mode (E3-01, E3-03) ──────
-- Every column here is written by the webhook handler, not by a route. Stripe
-- remains authoritative for all of it.
ALTER TABLE "organizations" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creditPooling" TEXT NOT NULL DEFAULT 'pooled',
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "dataPurgeAt" TIMESTAMP(3),
ADD COLUMN     "pastDueSince" TIMESTAMP(3),
ADD COLUMN     "pendingPlanId" TEXT;

-- ─── plans: Stripe prices, tier ordering, rollover (E3-01, E3-03) ─────────────
ALTER TABLE "plans" ADD COLUMN     "creditsRollover" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stripePriceId" TEXT,
ADD COLUMN     "stripeShopPriceId" TEXT,
ADD COLUMN     "tier" INTEGER NOT NULL DEFAULT 0;

-- The default existed only so the ADD COLUMN could not abort. A plan without a
-- deliberate tier is a plan whose upgrade direction is undefined, so the schema
-- must keep requiring one.
ALTER TABLE "plans" ALTER COLUMN "tier" DROP DEFAULT;

-- ─── credit_balances: the one part of billing that is not a Stripe cache ──────
CREATE TABLE "credit_balances" (
    "organizationId" TEXT NOT NULL,
    "monthlyRemaining" INTEGER NOT NULL DEFAULT 0,
    "topupRemaining" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "lowBalanceNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_balances_pkey" PRIMARY KEY ("organizationId")
);

-- ─── credit_topups: purchased credits, granted by the invoice.paid webhook ────
CREATE TABLE "credit_topups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripeInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedAt" TIMESTAMP(3),

    CONSTRAINT "credit_topups_pkey" PRIMARY KEY ("id")
);

-- ─── shop_credit_allocations: allocated pooling, Business plan and above ──────
CREATE TABLE "shop_credit_allocations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "allocated" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_credit_allocations_pkey" PRIMARY KEY ("id")
);

-- ─── stripe_events: idempotency for a transport that retries by design ────────
CREATE TABLE "stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "credit_topups_stripeInvoiceId_key" ON "credit_topups"("stripeInvoiceId");

CREATE INDEX "credit_topups_organizationId_createdAt_idx" ON "credit_topups"("organizationId", "createdAt");

CREATE UNIQUE INDEX "shop_credit_allocations_shopId_key" ON "shop_credit_allocations"("shopId");

CREATE INDEX "shop_credit_allocations_organizationId_idx" ON "shop_credit_allocations"("organizationId");

CREATE INDEX "stripe_events_type_receivedAt_idx" ON "stripe_events"("type", "receivedAt");

CREATE UNIQUE INDEX "plans_stripePriceId_key" ON "plans"("stripePriceId");

CREATE UNIQUE INDEX "plans_stripeShopPriceId_key" ON "plans"("stripeShopPriceId");

-- Both are period queries: the billing screen sums the organization over the
-- current cycle, and allocated pooling sums one shop over the same window on
-- the path of every AI action.
CREATE INDEX "usage_events_organizationId_createdAt_idx" ON "usage_events"("organizationId", "createdAt");

CREATE INDEX "usage_events_shopId_createdAt_idx" ON "usage_events"("shopId", "createdAt");

-- ─── Foreign keys ─────────────────────────────────────────────────────────────
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_topups" ADD CONSTRAINT "credit_topups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shop_credit_allocations" ADD CONSTRAINT "shop_credit_allocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shop_credit_allocations" ADD CONSTRAINT "shop_credit_allocations_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
