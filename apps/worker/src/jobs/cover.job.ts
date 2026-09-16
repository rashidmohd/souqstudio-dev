import type { Job } from 'bullmq'
import sharp from 'sharp'
import { CREDIT_COSTS, consumeCredits, prisma } from '@souqstudio/db'
import type { CoverGenPayload } from '@souqstudio/db'
import {
  CAMPAIGNS,
  COVER_SHAPES,
  COVER_STYLES,
  COVER_VARIATIONS,
  type Campaign,
  type CoverShape,
  type CoverStyle,
} from '@souqstudio/engine'
import { getObjectBytes, keyFromPublicUrl, putObject } from '../lib/r2'
import { coverPrompt } from '../lib/character-prompt'
import { ImageGenerationOffError, NoImageError, draw } from '../lib/image-gen'

/**
 * A cover, three options. E8-04.
 *
 * **No text, ever, and that half of the old rule stands.** `coverPrompt` says it
 * twice because a model asked to render a shop's name produces text that is
 * misspelled, in a typeface nobody chose, and often in a language it guessed.
 * The name and the logo are typed in the editor, on top of what this draws, and
 * the seam between the two is an R2 key exactly as `lib/block-assets.ts` already
 * does for uploaded artwork.
 *
 * **The character is drawn in, not composited on.** This used to send no
 * references at all, on the spec's reasoning that compositing afterwards keeps
 * one mascot pixel-identical across every cover. That reasoning cost more than
 * it bought: nothing composites anything until E9, so a cover arrived as an
 * empty background and the owner's own mascot was nowhere in it. Sending the
 * character as a reference is the same mechanism the pose library already
 * depends on to keep a character recognisably itself, so the consistency the
 * spec wanted is bought by reference-conditioning rather than by waiting.
 *
 * **Store photographs may be sent; uniform photographs may not.** The rule is
 * `CharacterGenPayload`'s and it is not this job's to revisit: a photograph of a
 * *place* goes to the drawer, a photograph of *people* goes to the reader and
 * stops there. Nothing here has access to the second kind, and nothing here
 * should acquire it.
 */
export async function handleCoverGen(job: Job<CoverGenPayload>) {
  const { jobId, organizationId, shopId, described, palette, characterId } = job.data

  await prisma.aiJob.update({ where: { id: jobId }, data: { status: 'processing' } })

  try {
    const campaign = asCampaign(job.data.campaign)
    const shape = asShape(job.data.shape)
    const style = asStyle(job.data.style)

    if (campaign === 'custom' && (described === undefined || described.trim() === '')) {
      throw new Error('cover: a custom campaign needs a description')
    }

    /**
     * **The character is re-read here and scoped to the shop**, never taken
     * from the payload as an image. `pose.job.ts` makes the same move for the
     * same reason: a job naming another shop's character would otherwise draw
     * a cover of somebody else's mascot.
     */
    const character =
      characterId === undefined
        ? null
        : await prisma.character.findFirst({
            where: { id: characterId, shopId },
            select: { baseImageUrl: true },
          })

    if (characterId !== undefined && character === null) {
      throw new Error('cover: no such character for this shop')
    }

    /**
     * **The character leads and the scene follows.** This inverts
     * `character.job.ts`, where the scene comes first and the logo last — and
     * the inversion is the point. There, the person was the subject and the logo
     * was a detail applied to them; here the character *is* the subject and the
     * shop is the setting it stands in. Providers weight earlier references more
     * heavily, so a scene leading the list produces a photograph of a shop with
     * somebody small in the corner of it.
     */
    const characterRef = character === null ? null : await referenceFrom(character.baseImageUrl)
    const sceneRefs = await Promise.all((job.data.sceneKeys ?? []).map(referenceFromKey))
    const references = [...(characterRef === null ? [] : [characterRef]), ...sceneRefs]

    const drawn = await draw({
      prompt: coverPrompt({
        campaign,
        shape,
        style,
        palette,
        withCharacter: characterRef !== null,
        withScene: sceneRefs.length > 0,
        ...(described === undefined ? {} : { described }),
      }),
      count: COVER_VARIATIONS,
      ...(references.length === 0 ? {} : { references }),
    })

    const options = await Promise.all(
      drawn.map((bytes, index) => store(bytes, organizationId, shopId, jobId, index))
    )

    const spend = await consumeCredits({
      organizationId,
      shopId,
      action: 'cover_gen',
      cost: CREDIT_COSTS.cover_gen,
    })

    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'complete',
        completedAt: new Date(),
        result: {
          options,
          campaign,
          shape,
          style,
          /** What it was drawn from, so a job claimed later explains itself. */
          withCharacter: characterRef !== null,
          withScene: sceneRefs.length > 0,
          charged: spend.ok ? spend.charged : 0,
        },
      },
    })

    return { status: 'complete', options: options.length }
  } catch (error) {
    if (error instanceof NoImageError) {
      await fail(jobId, 'image_refused', error.detail)
      return { status: 'failed', reason: 'image_refused' }
    }

    if (error instanceof ImageGenerationOffError) {
      await fail(jobId, 'image_generation_off')
      return { status: 'failed', reason: 'image_generation_off' }
    }

    await fail(jobId, error instanceof Error ? error.message : 'unknown_error')
    throw error
  }
}

/**
 * An R2 object, fetched as bytes for the image model.
 *
 * Re-encoded to PNG so the media type declared to the provider is a fact about
 * the bytes rather than about what the key's extension claimed — a store
 * photograph is whatever the owner's phone saved.
 */
async function referenceFromKey(key: string): Promise<{ bytes: Buffer; mediaType: 'image/png' }> {
  const bytes = await sharp(await getObjectBytes(key)).png().toBuffer()
  return { bytes, mediaType: 'image/png' }
}

/**
 * The character, read by key rather than over HTTP.
 *
 * `baseImageUrl` is a public URL on the row, and fetching it would work today
 * and break the day the bucket moves behind a different origin.
 * `keyFromPublicUrl` is the seam that already exists for that — the same one
 * `pose.job.ts` uses.
 */
async function referenceFrom(baseImageUrl: string) {
  const key = keyFromPublicUrl(baseImageUrl)
  if (key === null) throw new Error('cover: the character\'s image is not an R2 object')
  return referenceFromKey(key)
}

/**
 * One option, stored.
 *
 * **JPEG, unlike every other generated image here.** A cover is a full-bleed
 * photograph-sized graphic with no transparency, and a PNG of one is several
 * megabytes an owner loads on 4G. A character is PNG because it has to be cut
 * out; this never does.
 */
async function store(
  bytes: Buffer,
  organizationId: string,
  shopId: string,
  jobId: string,
  index: number
): Promise<{ url: string; key: string }> {
  const jpeg = await sharp(bytes).jpeg({ quality: 88 }).toBuffer()
  const key = `${organizationId}/${shopId}/covers/${jobId}-${index}.jpg`
  const url = await putObject(key, jpeg, 'image/jpeg')
  return { url, key }
}

function asCampaign(value: string): Campaign {
  const found = CAMPAIGNS.find((campaign) => campaign === value)
  if (found === undefined) throw new Error(`cover: "${value}" is not a campaign we draw`)
  return found
}

/**
 * Absent is `flat-graphic` rather than an error: every cover drawn before the
 * style axis existed was one, so an old job replayed from the queue should come
 * back looking like itself.
 */
function asStyle(value: string | undefined): CoverStyle {
  if (value === undefined) return 'flat-graphic'
  const found = COVER_STYLES.find((style) => style === value)
  if (found === undefined) throw new Error(`cover: "${value}" is not a style we draw`)
  return found
}

function asShape(value: string): CoverShape {
  const found = COVER_SHAPES.find((shape) => shape === value)
  if (found === undefined) throw new Error(`cover: "${value}" is not a shape we draw`)
  return found
}

async function fail(jobId: string, reason: string, detail?: string) {
  await prisma.aiJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      errorMessage: reason,
      completedAt: new Date(),
      ...(detail === undefined ? {} : { result: { notes: [detail] } }),
    },
  })
}
