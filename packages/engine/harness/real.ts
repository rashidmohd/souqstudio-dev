/**
 * Real catalog rows, when someone has exported them.
 *
 * `pnpm --filter @souqstudio/db catalog:harness-export` writes
 * `real-products.json` beside this file; if it is not there the harness renders
 * the dummy sets alone and says so. The file is gitignored — it is a snapshot of
 * whatever database the exporter was pointed at, and checking one in would make
 * a stale copy of somebody's dev catalog look like a fixture.
 *
 * **The engine has no database import and this does not add one.** `packages/db`
 * already depends on `packages/engine`; a read in the other direction would
 * close a cycle and, worse, pull Prisma into a package the browser bundle and
 * the PDF worker both import. JSON on disk is the seam.
 *
 * **Prices in that file are invented.** A catalog row has no price — the whole
 * of E6 is what would give it one — so the exporter derives a stable fake from
 * the row id. Names, brands, specs, pack lines and, most importantly, the
 * *absences* are real. Read a page accordingly: the price mark proves nothing
 * here that `WORST_CASE` did not already prove better.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HarnessProduct } from './product'

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'real-products.json')

export interface RealCounts {
  total: number
  withNameAr: number
  withBrand: number
  withSpec: number
  withPack: number
  withCategory: number
  withImage: number
}

export interface RealCatalog {
  generatedAt: string
  organizationId: string | null
  counts: RealCounts
  sets: Record<string, HarnessProduct[]>
}

export function loadRealCatalog(): RealCatalog | null {
  if (!existsSync(FILE)) return null

  const parsed = JSON.parse(readFileSync(FILE, 'utf8')) as RealCatalog
  // A set the exporter could not fill — no Arabic names in the catalog, say —
  // arrives as an empty array. Dropping it here is what keeps `main.ts` from
  // having to reason about it, and an empty page is not a diagnostic.
  parsed.sets = Object.fromEntries(
    Object.entries(parsed.sets).filter(([, rows]) => rows.length > 0)
  )
  return parsed
}

/** One line under each real page, so a reader can tell thin data from a thin
 *  block. Percentages are of the whole visible catalog, not of the twelve rows
 *  on the page. */
export function censusLine(counts: RealCounts): string {
  const pct = (n: number) => `${((n / counts.total) * 100).toFixed(0)}%`
  return (
    `${counts.total} rows visible — ` +
    `Arabic name ${pct(counts.withNameAr)}, brand ${pct(counts.withBrand)}, ` +
    `spec ${pct(counts.withSpec)}, pack ${pct(counts.withPack)}, ` +
    `category ${pct(counts.withCategory)}, image ${pct(counts.withImage)}.`
  )
}

/** What each set was selected for. Kept next to the loader rather than in the
 *  exporter so the note and the page it labels live in one file. */
export const SET_NOTES: Record<string, { title: string; note: string }> = {
  typical: {
    title: 'Real catalog — a typical page',
    note:
      'Every Nth row of the visible catalog, so the page spans the table rather than the ' +
      'head of it. This is what an owner would see composing from the catalog as it stands today.',
  },
  longest: {
    title: 'Real catalog — the longest names',
    note:
      'The longest nameEn in the catalog, which is the upper bound the fit ladder has to ' +
      'absorb. Compare with the worst-case dummies: these are longer, and they are not ' +
      'Arabic — they are English, French and Turkish product names run together.',
  },
  arabic: {
    title: 'Real catalog — Arabic edition, real strings',
    note:
      'Rows that actually carry a nameAr, rendered rtl. Consistency check #9 asks for this ' +
      'and the Open Food Facts export cannot supply it: every row here is a demo-seed row.',
  },
  sparse: {
    title: 'Real catalog — rows with a name and nothing else',
    note:
      'No brand, no spec, no pack size. The card has to hold together with two thirds of ' +
      'its content missing, and the image box falls back to the word "image" rather than a brand.',
  },
}
