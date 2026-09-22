-- E13-01 — admin authentication.
--
-- `admin_users` and `admin_audit_logs` have existed since the baseline and
-- nothing has ever read them. This is the migration that makes them usable:
-- a session table, a way to switch an admin off, and the indexes the audit
-- log needs once it is actually written to.
--
-- **Why a session table rather than a signed stateless cookie.** The scaffold's
-- `ADMIN_SESSION_SECRET` suggested a stateless one, and this keeps the variable
-- but changes its job. A staff session reaches every organization on the
-- platform, so ending one has to be a fact about the system rather than a wait
-- for an expiry. The secret now keys the stored hash, which buys the
-- operational control a plain SHA-256 would not: rotating it invalidates every
-- admin session at once, with no migration and no deploy.

-- ── admin_users ──────────────────────────────────────────────────────────────
-- `isActive` is how an admin is removed. The row itself cannot be deleted while
-- `admin_audit_logs` points at it, and it should not be: a departed admin's
-- history is the part worth keeping.
ALTER TABLE "admin_users" ADD COLUMN "name" TEXT;
ALTER TABLE "admin_users" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "admin_users" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── admin_sessions ───────────────────────────────────────────────────────────
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    -- HMAC-SHA256 of the cookie token under ADMIN_SESSION_SECRET. The raw token
    -- lives in the cookie and nowhere else.
    "tokenHash" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_sessions_tokenHash_key" ON "admin_sessions"("tokenHash");
CREATE INDEX "admin_sessions_adminUserId_expiresAt_idx" ON "admin_sessions"("adminUserId", "expiresAt");

ALTER TABLE "admin_sessions"
  ADD CONSTRAINT "admin_sessions_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── admin_audit_logs ─────────────────────────────────────────────────────────
-- The table is read three ways and had an index for none of them: newest first,
-- everything that touched one entity, and everything one admin did.
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");
CREATE INDEX "admin_audit_logs_entityType_entityId_idx" ON "admin_audit_logs"("entityType", "entityId");
CREATE INDEX "admin_audit_logs_adminUserId_createdAt_idx" ON "admin_audit_logs"("adminUserId", "createdAt");
