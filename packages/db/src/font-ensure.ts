import { fetchGoogleFamily, mirrorFamily, type MirrorDeps, type MirrorScope } from './font-mirror'
import { getFont, registerFont, type Font } from './fonts'
import { prisma } from './client'

/**
 * Getting a family into R2 on demand, fast enough to block a save on.
 * `docs/fonts-from-google.md` §7 B2.
 *
 * **The invariant this keeps is narrower than the one first proposed**, and the
 * narrowing was a measured decision. *"A family named by a brand kit is fully in
 * R2"* costs up to 7.2s on a font change, because a family is up to 99 objects
 * and the cost is per-object round trips — raising concurrency from 6 to 32 took
 * Rubik from 7.2s to 7.3s. What holds instead is:
 *
 *   **A family named by a brand kit is drawable, now, in the weights that kit
 *   binds and the scripts the product ships in.**
 *
 * The rest of the family follows in the background, and `fonts.complete` says
 * whether it has. **Exactly one caller reads that flag: the export gate.** No
 * rendering surface tests it — the specimen, the artboard and the picker draw
 * with whatever is mirrored — which is what stops per-weight presence checks
 * spreading through the app, the objection §2b raised against this shape.
 */

/**
 * The scripts every shop needs, as a constant rather than a lookup.
 *
 * **There is no per-shop language column, and that is not an omission.** The
 * product ships English and Arabic together: the block document schema refuses a
 * static string carrying `textEn` without `textAr`, so every shop's book is
 * bilingual whether or not its owner thinks of it that way. A family that cannot
 * draw both was never offerable, which is why the curated ten all carry both.
 *
 * `latin-ext` is in the blocking set although it is a fourth subset to wait for.
 * It holds the accented characters a European brand name reaches for, and a
 * product name briefly falling back mid-edit is worse than one more file.
 */
export const REQUIRED_SUBSETS = ['arabic', 'latin', 'latin-ext'] as const

export interface EnsureDeps extends MirrorDeps {
  /** For the Developer API. Absent means the library cannot be widened. */
  apiKey: string
}

export interface EnsureResult {
  font: Font
  /** True when this call did the mirroring rather than finding it already done. */
  mirrored: boolean
}

/**
 * Make sure a family is drawable, mirroring only what is needed if it is not.
 *
 * Returns the existing row untouched when there is one — **including an
 * incomplete one.** A second shop picking a half-mirrored family must not
 * re-mirror it or wait behind it; the completion job is already going to finish
 * it, and what is there is enough to draw with.
 */
export async function ensureFamily(
  family: string,
  weights: readonly number[],
  deps: EnsureDeps
): Promise<EnsureResult> {
  const existing = await getFont(family)
  if (existing) return { font: existing, mirrored: false }

  // One family, not the whole catalog — that download was most of a cold save.
  const entry = await fetchGoogleFamily(deps.apiKey, family)
  if (!entry) {
    throw new Error(`${family} is not a Google Fonts family. Names are case- and space-sensitive.`)
  }

  // The gate that makes the picker safe, enforced here as well as in the picker:
  // a family that cannot draw both scripts produces tofu on half of every book,
  // and a filter in the UI is not a control.
  const covers = REQUIRED_SUBSETS.filter((subset) => entry.subsets.includes(subset))
  if (!covers.includes('arabic') || !covers.includes('latin')) {
    throw new Error(
      `${family} does not cover both Arabic and Latin (it has: ${entry.subsets.join(', ')}). ` +
        'Every offer book carries both scripts.'
    )
  }

  const scope: MirrorScope = { weights, subsets: covers }
  const { registration } = await mirrorFamily(entry, deps, scope)
  return { font: await registerFont(registration), mirrored: true }
}

/**
 * Finish a family that was mirrored in a hurry.
 *
 * Idempotent, and safe to run against a family that is already complete — every
 * key is deterministic, so re-uploading writes the same bytes to the same place.
 * That is what lets this be retried by a queue without bookkeeping.
 */
export async function completeFamily(family: string, deps: EnsureDeps): Promise<Font | null> {
  const existing = await getFont(family)
  if (!existing || existing.complete) return existing

  const entry = await fetchGoogleFamily(deps.apiKey, family)
  if (!entry) {
    throw new Error(`${family}: mirrored once but no longer in Google's catalog.`)
  }

  // No scope: the whole family, every weight and every script.
  const { registration } = await mirrorFamily(entry, deps)
  return registerFont(registration)
}

/** Families still waiting to be finished. The completion job's worklist. */
export async function incompleteFamilies(): Promise<string[]> {
  const rows = await prisma.font.findMany({
    where: { complete: false },
    select: { family: true },
    orderBy: { mirroredAt: 'asc' },
  })
  return rows.map((row) => row.family)
}

/**
 * The export gate. **The only reader of `fonts.complete` in the codebase.**
 *
 * A book is exportable when every family it draws in has all of its faces in R2.
 * An incomplete family is drawable — that is the whole point of the split — but
 * a PDF built against one embeds a fallback for any weight still missing, and it
 * does so silently. A flyer that comes back in the wrong face is not recoverable
 * after it is printed, so this is a refusal rather than a warning.
 *
 * Returns the families that are not ready, so a caller can name them. An empty
 * array means go.
 */
export async function familiesNotExportable(families: readonly string[]): Promise<string[]> {
  const unique = [...new Set(families)]
  if (unique.length === 0) return []

  const rows = await prisma.font.findMany({
    where: { family: { in: unique } },
    select: { family: true, complete: true },
  })

  const ready = new Set(rows.filter((row) => row.complete).map((row) => row.family))
  // A family with no row at all is also not exportable, and for a worse reason:
  // we hold nothing for it. Same answer, so the caller needs no second check.
  return unique.filter((family) => !ready.has(family))
}
