-- E13-04: an ai_jobs row may belong to no organization (the admin panel's
-- library magic block). The foreign key keeps ON DELETE RESTRICT.

-- AlterTable
ALTER TABLE "ai_jobs" ALTER COLUMN "organizationId" DROP NOT NULL;
