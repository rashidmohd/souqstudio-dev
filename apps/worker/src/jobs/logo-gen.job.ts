import type { Job } from 'bullmq'
import { CREDIT_COSTS, Prisma, consumeCredits, prisma } from '@souqstudio/db'
import type { LogoGenPayload } from '@souqstudio/db'
import { drawMark, namesTheShop, skinFrom, type LogoChoice } from '@souqstudio/engine'
import { putObject } from '../lib/r2'
import { readMarks } from '../lib/logo-model'
import { NoMarkError, UnusableMarkError, type MarkInput } from '../lib/logo-prompt'

/**
 * Logo mark — four marks a shop can choose from. E8-09.
 *
 * ```
 * ai_jobs: processing
 *      ↓
 * a name, a trade, a palette   →   one model call, no image either way
 *      ↓
 * namesTheShop()        ← a mark that renamed the shop is dropped here
 *      ↓
 * drawMark()            →   SVG, assembled from the shop's own colours
 *      ↓
 * R2, one object per mark   →  consumeCredits  →  ai_jobs: complete
 *      ↓
 * the owner picks one  →  POST /api/v1/brand/logo/generated
 * ```
 *
 * **Credits are consumed last, and only on success** — `background-jobs.md`, and
 * the same ordering magic block uses. This is deliberately *not* E8-08's
 * charge-on-acceptance: a direction is a suggestion that leaves nothing behind
 * when declined, and this run produces four stored artefacts whether or not one
 * is chosen. `character_gen` prices the same shape at the same number.
 *
 * **Stored as SVG, not PNG, and that is load-bearing.** The mark is set in the
 * shop's own headline face, and this process has no font files — `CLAUDE.md`'s
 * known gap: the brand faces are loaded from Google's CDN by a browser and are
 * not mirrored into R2 yet. Rasterising here would silently substitute whatever
 * the container happens to have, which is a logo in the wrong typeface and no
 * error anywhere. A vector referencing the family renders correctly wherever the
 * family is loaded, which is every surface that draws it today. When the fonts
 * are mirrored this can additionally write a PNG; until then it must not pretend.
 */

const COST = CREDIT_COSTS.logo_gen

export async function handleLogoGen(job: Job<LogoGenPayload>) {
  const { jobId, organizationId, shopId, shopName, trade, palette, family } = job.data

  await prisma.aiJob.update({ where: { id: jobId }, data: { status: 'processing' } })

  try {
    if (palette.length === 0) {
      throw new Error('logo: no palette to draw the mark from')
    }

    const input: MarkInput = {
      shopName,
      palette,
      ...(trade === undefined ? {} : { trade }),
    }

    const set = await readMarks(input)

    /**
     * **A mark that renamed the shop is dropped, not corrected.**
     *
     * The prompt says a model may drop words and never add one, and this is what
     * holds it to that. Correcting it here — substituting the real name into the
     * layout it chose — would be drawing a mark nobody specified at a size
     * nobody checked, which is how "Al Noor" becomes a name running off the edge
     * of the box. Dropping one of four leaves three, which is still a choice.
     */
    const honest = set.marks.filter((mark) => namesTheShop(mark.setAs, shopName))
    if (honest.length === 0) {
      await fail(jobId, 'no_mark', [
        'We could not make a mark from that name without changing it.',
        ...set.notes,
      ])
      return { status: 'failed', reason: 'no_mark' }
    }

    const drawn = await Promise.all(
      honest.map((mark, index) => store(mark, palette, family, organizationId, jobId, index))
    )

    const marks = drawn.filter((mark): mark is StoredMark => mark !== null)
    if (marks.length === 0) {
      // Every mark named a palette index that resolved to nothing. Reachable
      // only through a palette of unreadable hex, which the route refuses — so
      // this is the belt to that braces.
      throw new UnusableMarkError()
    }

    const spend = await consumeCredits({
      organizationId,
      ...(shopId === undefined ? {} : { shopId }),
      action: 'logo_gen',
      cost: COST,
    })

    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'complete',
        completedAt: new Date(),
        result: {
          // Prisma's JSON input type wants an index signature, which a named
          // interface deliberately lacks. Every field is a string by
          // construction, so the cast is safe — the same one `magic-block.job`
          // makes for `arrangements`.
          marks: marks as unknown as Prisma.InputJsonValue,
          notes: set.notes,
          // A balance that ran out between the route's check and here does not
          // undo the marks — the same trade magic block makes, recorded rather
          // than silently absorbed.
          charged: spend.ok ? spend.charged : 0,
        },
      },
    })

    return { status: 'complete', marks: marks.length }
  } catch (error) {
    /**
     * "This name will not make a mark" is an answer, not a fault. It completes
     * the job as failed so the client stops polling and must never be retried:
     * the name will not have changed, and each attempt is a paid call.
     */
    if (error instanceof NoMarkError) {
      await fail(jobId, 'no_mark', error.notes)
      return { status: 'failed', reason: 'no_mark' }
    }

    if (error instanceof UnusableMarkError) {
      await fail(jobId, 'unusable_mark')
      return { status: 'failed', reason: 'unusable_mark' }
    }

    await fail(jobId, error instanceof Error ? error.message : 'unknown_error')
    throw error
  }
}

interface StoredMark {
  structure: string
  setAs: string
  why: string
  url: string
  /**
   * The choice itself, kept beside the file.
   *
   * **So the picker can draw the mark rather than load it.** `drawMark` is pure
   * and lives in the engine, so the dialog renders each candidate through the
   * same function that wrote the file — the same "one painter, every surface"
   * rule the block library already follows. It matters here for a specific
   * reason: an SVG loaded through `<img>` is an isolated document that cannot
   * see the page's webfonts, so a mark previewed that way would show the
   * structure and the colours correctly and the typeface wrong.
   */
  choice: LogoChoice
}

/**
 * One mark, drawn and written to the bucket.
 *
 * The family is the kit's headline face, named rather than embedded — the
 * payload's own comment says why, and `LogoGenPayload.family` is where it comes
 * from.
 */
async function store(
  choice: LogoChoice,
  palette: readonly string[],
  family: string,
  organizationId: string,
  jobId: string,
  index: number
): Promise<StoredMark | null> {
  const skin = skinFrom(palette, choice)
  if (skin === null) return null

  const svg = drawMark(choice, skin, family)
  const key = `${organizationId}/logo-marks/${jobId}-${index}.svg`
  const url = await putObject(key, Buffer.from(svg, 'utf8'), 'image/svg+xml')

  return { structure: choice.structure, setAs: choice.setAs, why: choice.why, url, choice }
}

async function fail(jobId: string, reason: string, notes?: readonly string[]) {
  await prisma.aiJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      errorMessage: reason,
      completedAt: new Date(),
      ...(notes === undefined ? {} : { result: { notes: [...notes] } }),
    },
  })
}
