import type { Job } from 'bullmq'
import sharp from 'sharp'
import { CREDIT_COSTS, Prisma, consumeCredits, prisma } from '@souqstudio/db'
import type { CharacterGenPayload } from '@souqstudio/db'
import {
  CHARACTER_GENDERS,
  CHARACTER_LOOKS,
  CHARACTER_STYLES,
  CHARACTER_VARIATIONS,
  type CharacterGender,
  type CharacterLook,
  type CharacterStyle,
  type Uniform,
  validTrades,
} from '@souqstudio/engine'
import { getObjectBytes, putObject } from '../lib/r2'
import { readUniform } from '../lib/uniform-vision'
import { characterPrompt, NoUniformError, UnreadableUniformError } from '../lib/character-prompt'
import { ImageGenerationOffError, NoImageError, draw } from '../lib/image-gen'

/**
 * A branded character, four variations. E8-01.
 *
 * ```
 * ai_jobs: processing
 *      ↓
 * the uniform photograph  →  ONE vision call  →  a description of clothing
 *      ↓                        (the photograph goes no further)
 * characterPrompt()       →  image model, four draws
 *      ↓
 * R2, one object per variation  →  consumeCredits  →  ai_jobs: complete
 *      ↓
 * the owner picks one  →  POST /api/v1/characters  →  a `characters` row
 * ```
 *
 * **The photograph reaches exactly one provider, once.** It may contain
 * identifiable people — the owner consented to that, and the route recorded when
 * — so the smallest possible thing is done with it: a vision model reduces it to
 * a description of a garment, and the image model is given that sentence. The
 * picture is never sent to a second vendor and never stored beyond its upload.
 *
 * **Credits on completion, never at queue time** — `background-jobs.md`, and the
 * shape `character_gen` is priced for: ten credits, four variations, charged
 * once the images exist. Discarded variations are not refunded because they were
 * not the product; the choice was.
 */

const MEDIA: Readonly<Record<string, 'image/png' | 'image/jpeg' | 'image/webp'>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

const MAX_EDGE = 1568

export async function handleCharacterGen(job: Job<CharacterGenPayload>) {
  const { jobId, organizationId, shopId, sourceKey, consentedAt, goal } = job.data

  await prisma.aiJob.update({ where: { id: jobId }, data: { status: 'processing' } })

  try {
    const style = oneOf(CHARACTER_STYLES, job.data.style, 'style') as CharacterStyle
    const gender = oneOf(CHARACTER_GENDERS, job.data.gender, 'gender') as CharacterGender
    const look = oneOf(CHARACTER_LOOKS, job.data.look, 'look') as CharacterLook

    /**
     * The shop's profile, read here rather than carried on the payload.
     *
     * It is a fact in the database and a payload is a copy that can be stale by
     * the time the job runs — and this one decides what the character *is*. A
     * profile that became incomplete between the route's check and here fails
     * the job rather than drawing a generic person and charging for it.
     */
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { trades: true, bio: true },
    })
    const trades = validTrades(shop?.trades ?? [])
    const bio = shop?.bio?.trim() ?? ''
    if (trades.length === 0 || bio === '') {
      throw new Error('character: the shop profile is not complete')
    }

    /**
     * **Every angle goes to the reader; only the scene goes to the drawer.**
     * The two lists are kept apart the whole way down for that reason.
     */
    const photos = await Promise.all(
      [sourceKey, ...(job.data.angleKeys ?? [])].map(prepare)
    )
    const scene = await Promise.all((job.data.sceneKeys ?? []).map(prepare))

    const uniform = await readUniform(photos)

    /**
     * **`both` is two of each rather than four of whichever the model felt
     * like.** An owner who asks for both genders and receives four variations of
     * one has been given a choice they did not ask for, and the only way to fix
     * it is to pay again.
     */
    const runs: Exclude<CharacterGender, 'both'>[] =
      gender === 'both' ? ['male', 'female'] : [gender]
    const each = Math.max(1, Math.floor(CHARACTER_VARIATIONS / runs.length))

    const drawn: Buffer[] = []
    for (const one of runs) {
      const images = await draw({
        prompt: characterPrompt({
          uniform,
          style,
          gender: one,
          look,
          trades,
          bio,
          inScene: scene.length > 0,
          ...(goal === undefined ? {} : { goal }),
        }),
        count: each,
        ...(scene.length === 0 ? {} : { references: scene }),
      })
      drawn.push(...images)
    }

    const variations = await Promise.all(
      drawn.map((bytes, index) => store(bytes, organizationId, shopId, jobId, index))
    )

    const spend = await consumeCredits({
      organizationId,
      shopId,
      action: 'character_gen',
      cost: CREDIT_COSTS.character_gen,
    })

    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'complete',
        completedAt: new Date(),
        result: {
          variations,
          uniform: uniform as unknown as Prisma.InputJsonValue,
          style,
          gender,
          look,
          consentedAt,
          trades,
          inScene: scene.length > 0,
          notes: uniform.notes,
          charged: spend.ok ? spend.charged : 0,
        } as unknown as Prisma.InputJsonValue,
      },
    })

    return { status: 'complete', variations: variations.length }
  } catch (error) {
    if (error instanceof NoUniformError) {
      await fail(jobId, 'no_uniform', error.notes)
      return { status: 'failed', reason: 'no_uniform' }
    }

    if (error instanceof UnreadableUniformError) {
      await fail(jobId, 'unreadable_uniform')
      return { status: 'failed', reason: 'unreadable_uniform' }
    }

    /**
     * **A refusal by the image model is an answer, not a fault.** A photograph of
     * people is exactly the prompt a safety filter declines, and retrying it
     * twice spends the provider's patience rather than changing its mind.
     */
    if (error instanceof NoImageError) {
      await fail(jobId, 'image_refused', error.detail === undefined ? undefined : [error.detail])
      return { status: 'failed', reason: 'image_refused' }
    }

    if (error instanceof ImageGenerationOffError) {
      // The route refuses before queueing, so this is a deployment that lost its
      // provider between the two. Not retried: it will not come back by itself.
      await fail(jobId, 'image_generation_off')
      return { status: 'failed', reason: 'image_generation_off' }
    }

    await fail(jobId, error instanceof Error ? error.message : 'unknown_error')
    throw error
  }
}

interface StoredVariation {
  url: string
  key: string
}

/**
 * One variation, normalised and stored.
 *
 * **PNG, and the background is not removed here.** A cutout is E8-05's job and
 * it runs on the one the owner *keeps* — running it on four throwaways would
 * cost four Rembg calls and three of them are discarded a moment later.
 */
async function store(
  bytes: Buffer,
  organizationId: string,
  shopId: string,
  jobId: string,
  index: number
): Promise<StoredVariation> {
  const png = await sharp(bytes).png().toBuffer()
  const key = `${organizationId}/${shopId}/characters/${jobId}-${index}.png`
  const url = await putObject(key, png, 'image/png')
  return { url, key }
}

/** A payload value, checked against the real vocabulary. A payload is not a promise. */
function oneOf(vocabulary: readonly string[], value: string, field: string): string {
  const found = vocabulary.find((entry) => entry === value)
  if (found === undefined) throw new Error(`character: "${value}" is not a ${field} we draw`)
  return found
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

async function prepare(key: string): Promise<{
  bytes: Buffer
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
}> {
  const original = await getObjectBytes(key)
  const meta = await sharp(original).metadata()

  const mediaType = MEDIA[meta.format ?? '']
  if (mediaType === undefined) throw new UnreadableUniformError()

  const longest = Math.max(meta.width ?? 0, meta.height ?? 0)
  if (longest <= MAX_EDGE) return { bytes: original, mediaType }

  const bytes = await sharp(original)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .toBuffer()

  return { bytes, mediaType }
}

export type { StoredVariation, Uniform }
