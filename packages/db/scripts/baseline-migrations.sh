#!/usr/bin/env bash
# Baseline an existing database whose `_prisma_migrations` table is missing.
#
# Fixes `P3005 — The database schema is not empty`, which `prisma migrate deploy`
# raises when the schema exists but no migration history does. It writes ONLY to
# `_prisma_migrations`; no table, column or row of real data is touched.
#
# **Only run this when the schema is already current.** Marking a migration
# applied that is not actually reflected means every future deploy skips it, and
# the drift is silent. Verify first — for the state this was written for, all of
# these were present:
#
#   fonts.complete column, fonts_complete_idx, fonts_subsets_idx,
#   shops.trades DEFAULT '{}'::text[]
#
# Run from packages/db with DATABASE_URL pointing at the database to baseline.
set -euo pipefail

cd "$(dirname "$0")/.."

count=$(ls prisma/migrations | grep -v migration_lock | wc -l | tr -d ' ')
echo "Baselining $count migrations…"

for m in $(ls prisma/migrations | grep -v migration_lock | sort); do
  printf '  %-45s' "$m"
  npx prisma migrate resolve --applied "$m" >/dev/null 2>&1 && echo 'applied' || echo 'FAILED'
done

echo
npx prisma migrate status
