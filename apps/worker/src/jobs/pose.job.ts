import type { Job } from 'bullmq'
import sharp from 'sharp'
import { CREDIT_COSTS, consumeCredits, prisma } from '@souqstudio/db'
import type { PoseGenPayload } from '@souqstudio/db'
import { POSES, POSE_VARIATIONS, type Pose } from '@souqstudio/engine'
import { getObjectBytes, keyFromPublicUrl, putObject } from '../lib/r2'
import { describedPosePrompt, posePrompt } from '../lib/character-prompt'
import { ImageGenerationOffError, NoImageError, draw } from '../lib/image-gen'

/**
 * A pose of an existing character. E8-02, and E8-03 when it is described.
 *
 * **One job for both, because they differ by one sentence.** E8-02 picks from a
 * list of seven and E8-03 lets the owner write their own; everything else — the
 * base character as a reference, the rules that keep it the same character, the
 * storage, the charge — is identical. Two handlers would be two copies of the
 * consistency prompt, which is the one thing here that must not drift.
 *
 * **The base character is sent as a reference image, and that is the feature.**
 * The spec asked for ControlNet with the reference locked; both providers do
 * reference-conditioned generation, so the lock lives in `posePrompt`. A pose
 * library whose character changes face between poses is not a library, and this
 * is the only thing standing between those two outcomes.
 *
 * **Priced by which one it is.** `pose_gen` is 3 and `prompt_gen` is 5, from E3 —
 * a described pose costs more because it returns more and because it is the
 * power-user path.
 */
export async function handlePoseGen(job: Job<PoseGenPayload>) {
  const { jobId, organizationId, shopId, characterId, described } = job.data

  await prisma.aiJob.update({ where: { id: jobId }, data: { status: 'processing' } })

  try {
    /**
     * **The character is re-read here and scoped to the shop**, rather than
     * trusted from the payload. A queue payload is data: a job carrying another
     * shop's `characterId` would otherwise generate poses of somebody else's
     * mascot and file them under this one.
     */
    const character = await prisma.character.findFirst({
      where: { id: characterId, shopId },
      select: { id: true, baseImageUrl: true },
    })
    if (character === null) throw new Error('pose: no such character for this shop')

    const pose = described === undefined ? asPose(job.data.pose) : undefined
    const prompt = pose === undefined ? describedPosePrompt(described ?? '') : posePrompt(pose)

    const reference = await referenceFrom(character.baseImageUrl)

    const drawn = await draw({
      prompt,
      count: POSE_VARIATIONS,
      references: [reference],
    })

    const variations = await Promise.all(
      drawn.map((bytes, index) => store(bytes, organizationId, shopId, jobId, index))
    )

    const action = pose === undefined ? 'prompt_gen' : 'pose_gen'
    const spend = await consumeCredits({
      organizationId,
      shopId,
      action,
      cost: CREDIT_COSTS[action],
    })

    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: 'complete',
        completedAt: new Date(),
        result: {
          variations,
          characterId: character.id,
          ...(pose === undefined ? { described } : { pose }),
          charged: spend.ok ? spend.charged : 0,
        },
      },
    })

    return { status: 'complete', variations: variations.length }
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
 * The base character, fetched as bytes for the image model.
 *
 * Read from R2 by key rather than by URL. `baseImageUrl` is a public URL stored
 * on the row, and fetching it over HTTP would work today and break the day the
 * bucket moves behind a different origin — `keyFromPublicUrl` is the seam that
 * already exists for that.
 */
async function referenceFrom(
  baseImageUrl: string
): Promise<{ bytes: Buffer; mediaType: 'image/png' }> {
  const key = keyFromPublicUrl(baseImageUrl)
  if (key === null) throw new Error(`pose: the character's image is not an R2 object`)

  // Re-encoded to PNG so the media type declared to the provider is a fact about
  // the bytes rather than about what was stored.
  const bytes = await sharp(await getObjectBytes(key)).png().toBuffer()
  return { bytes, mediaType: 'image/png' }
}

async function store(
  bytes: Buffer,
  organizationId: string,
  shopId: string,
  jobId: string,
  index: number
): Promise<{ url: string; key: string }> {
  const png = await sharp(bytes).png().toBuffer()
  const key = `${organizationId}/${shopId}/characters/poses/${jobId}-${index}.png`
  const url = await putObject(key, png, 'image/png')
  return { url, key }
}

function asPose(value: string | undefined): Pose {
  const found = POSES.find((pose) => pose === value)
  if (found === undefined) throw new Error(`pose: "${value ?? ''}" is not a pose we draw`)
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
