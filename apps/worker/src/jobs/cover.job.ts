import type { Job } from 'bullmq'
import sharp from 'sharp'
import { CREDIT_COSTS, consumeCredits, prisma } from '@souqstudio/db'
import type { CoverGenPayload } from '@souqstudio/db'
import {
  COVER_SHAPES,
  COVER_STYLES,
  COVER_VARIATIONS,
  type CoverShape,
  type CoverStyle,
} from '@souqstudio/engine'
import { getObjectBytes, keyFromPublicUrl, putObject } from '../lib/r2'
import { coverPrompt, type CoverPerson } from '../lib/character-prompt'
import { ImageGenerationOffError, NoImageError, draw } from '../lib/image-gen'

/**
 * A cover, three options. E8-04.
 *
 * **No text, ever, and that half of the old rule stands.** `coverPrompt` says it
 * twice because a model asked to render a shop's name produces text that is
 * misspelled, in a typeface nobody chose, and often in a language it guessed.
 * The name is typed in the editor, on top of what this draws, and the seam
 * between the two is an R2 key exactly as `lib/block-assets.ts` already does for
 * uploaded artwork.
 *
 * **The logo is the half that bends, on one surface.** A mark printed on a
 * carrier bag in the scene is a picture being copied rather than a word being
 * spelled, and an owner who wants their bag in the shot could not get it from a
 * cover that refused every mark. It is off unless the payload carries a
 * `logoKey`, and `coverLogoRule` carries the reasoning for why a bag and
 * nothing else.
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
  const { jobId, organizationId, shopId, palette, characterId, logoKey } = job.data

  await prisma.aiJob.update({ where: { id: jobId }, data: { status: 'processing' } })

  try {
    const shape = asShape(job.data.shape)
    const style = asStyle(job.data.style)

    /**
     * **The scene arrives resolved.** The route reads `cover_prompts` and puts
     * the text on the payload, so this worker never queries for it — which also
     * means editing a prompt does not rewrite a job already in the queue. The
     * only other source is an owner's own words, which the route quotes as data.
     */
    const scene = job.data.scene?.trim()
    if (scene === undefined || scene === '') {
      throw new Error('cover: no scene to draw')
    }

    const person = asPerson(job.data.person)

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
    /**
     * **The character is only fetched for a staff scene.** A customer is
     * invented, so sending the mascot as a reference would produce a shopper
     * with the assistant's face — which is the failure this branch exists to
     * prevent, and it would look like the shop photographing its own staff
     * pretending to shop.
     */
    const characterRef =
      person !== 'staff' || character === null
        ? null
        : await referenceFrom(character.baseImageUrl)
    const sceneRefs = await Promise.all((job.data.sceneKeys ?? []).map(referenceFromKey))

    /**
     * **The owner's own references come last.** They are guidance about the
     * look, and everything before them is what the picture is *of* — the person
     * and the room. Providers weight earlier references more heavily, so a mood
     * image leading the list produces a variation on the mood image rather than
     * a cover of this shop.
     */
    const ownRefs = await Promise.all((job.data.referenceKeys ?? []).map(referenceFromKey))

    /**
     * **The logo goes last, and `coverLogoRule` names that position.**
     *
     * `character.job.ts` puts it last for one reason — a logo leading the list
     * produces a picture of a logo with a scene behind it — and that reason
     * holds here unchanged. What is new is that a cover may send six images
     * rather than two, so last is not only a weighting: it is the only thing
     * that tells the model which attachment is the logo, and the prompt says
     * "the last attached image" because of this line.
     */
    const logoRef = logoKey === undefined ? null : await referenceFromKey(logoKey)

    const references = [
      ...(characterRef === null ? [] : [characterRef]),
      ...sceneRefs,
      ...ownRefs,
      ...(logoRef === null ? [] : [logoRef]),
    ]

    const drawn = await draw({
      prompt: coverPrompt({
        scene,
        person,
        shape,
        style,
        palette,
        withScene: sceneRefs.length > 0,
        withReference: ownRefs.length > 0,
        withLogo: logoRef !== null,
      }),
      count: COVER_VARIATIONS,
      ...(references.length === 0 ? {} : { references }),
    })

    const options = await Promise.all(
      drawn.map((bytes, index) => store(bytes, organizationId, shopId, jobId, index))
    )

    /**
     * **Every option is kept, here, before the job is complete.**
     *
     * Keeping used to be the owner's click: three options came back, they ticked
     * the ones worth having and `POST /covers` wrote those rows. Two things were
     * wrong with that. The credits are spent on all three whatever they tick, so
     * the two they did not tick were paid-for work thrown away — and a shop that
     * closed the tab mid-draw got nothing at all, because the only thing that
     * ever wrote a row was a click on a screen that was no longer open.
     *
     * A generated cover is a brand asset from the moment it exists. It lands in
     * the library, and removing one is an ordinary decision an owner makes later
     * against something they can see, rather than a decision they are forced to
     * make once, at thumbnail size, before the tab may be closed.
     *
     * **Written before the job is marked complete**, so the client that polls
     * cannot see `complete` and reload the library ahead of the rows existing.
     * If this throws, the job fails and no credits are consumed — `consumeCredits`
     * is below.
     */
    const covers = await prisma.$transaction(
      options.map((option) =>
        prisma.cover.create({
          data: {
            shopId,
            r2Key: option.key,
            campaign: job.data.promptSlug ?? 'custom',
            style,
            shape,
          },
          select: { id: true },
        })
      )
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
        /**
         * **Claimed by the job itself**, because there is nothing left to come
         * back for — the covers are in the library. The bell lists complete work
         * that still needs the owner, and a cover that is already an asset does
         * not qualify. `POST /covers` still stamps this for a job drawn before
         * covers were kept automatically.
         */
        claimedAt: new Date(),
        result: {
          options,
          /** The rows written above, so a client can tell what it now owns. */
          coverIds: covers.map((cover) => cover.id),
          /** The prompt this was made from, for the library to label itself. */
          promptSlug: job.data.promptSlug ?? 'custom',
          shape,
          style,
          /** What it was drawn from, so a job claimed later explains itself. */
          person,
          withScene: sceneRefs.length > 0,
          withReference: ownRefs.length > 0,
          withLogo: logoRef !== null,
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



/**
 * Absent is `flat-graphic` rather than an error: every cover drawn before the
 * style axis existed was one, so an old job replayed from the queue should come
 * back looking like itself.
 */
/** Absent is `staff`, which is what every scene was before customers existed. */
function asPerson(value: string | undefined): CoverPerson {
  return value === 'customer' || value === 'none' || value === 'staff' ? value : 'staff'
}

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
