import { env } from './env'

/**
 * Which model draws. E8-01 to E8-04.
 *
 * **Two providers behind one variable, and the same shape `vision.ts` settled
 * on**: the prompt and the contract live with the feature, only the transport
 * differs, and nothing downstream knows which answered. Deliberately a
 * *separate* variable from `MAGIC_BLOCK_PROVIDER` — that one picks a model that
 * reads a picture, this one picks a model that makes one, and a deployment
 * should be able to run Qwen for matching and Gemini for drawing without the two
 * being the same sentence.
 *
 * **Unset is off, and off is reported rather than thrown past.** No environment
 * has a key for either yet, so the honest state is "this feature is not
 * configured here" — which the routes turn into a refusal before anything is
 * queued or charged, instead of a job that fails at a shop owner's screen.
 *
 * **Reference images are the whole reason this interface takes them.** E8-02
 * generates a pose *of an existing character*, and a pose library whose
 * character changes face between poses is not a library. The spec reached for
 * ControlNet; both providers here do reference-conditioned generation natively,
 * which is the same requirement met one layer up.
 */

/** Image generation is not configured in this environment. */
export class ImageGenerationOffError extends Error {
  constructor() {
    super('image_generation_off')
    this.name = 'ImageGenerationOffError'
  }
}

/** The provider answered, but with nothing usable in it. */
export class NoImageError extends Error {
  constructor(readonly detail?: string) {
    super('no_image')
    this.name = 'NoImageError'
  }
}

export interface ReferenceImage {
  bytes: Buffer
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
}

export interface DrawRequest {
  prompt: string
  /**
   * How many to return. A provider may return fewer — a request for four that
   * comes back with three is three usable images, not a failure, and the job
   * says so rather than throwing away what it got.
   */
  count: number
  /**
   * Images the result must stay consistent with — the base character for a
   * pose, the character for a cover. Empty for a first generation.
   */
  references?: readonly ReferenceImage[]
}

export function imageGenerationEnabled(): boolean {
  return env.IMAGE_PROVIDER !== undefined
}

export async function draw(request: DrawRequest): Promise<Buffer[]> {
  if (env.IMAGE_PROVIDER === undefined) throw new ImageGenerationOffError()

  const images =
    env.IMAGE_PROVIDER === 'qwen' ? await withQwen(request) : await withGemini(request)

  if (images.length === 0) throw new NoImageError()
  return images
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

interface GeminiPart {
  inlineData?: { mimeType?: string; data?: string }
  text?: string
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

/**
 * **One request per image, rather than one request for four.**
 *
 * The API returns a single image per call, and four variations of one prompt are
 * four independent draws — which is what the owner is choosing between. Run
 * together, so four variations cost one call's latency rather than four.
 *
 * A single failure does not lose the others: `allSettled`, and whatever came
 * back is what the owner sees. Four is a target, not a contract.
 */
async function withGemini(request: DrawRequest): Promise<Buffer[]> {
  const key = env.GEMINI_API_KEY
  if (key === undefined) throw new ImageGenerationOffError()

  const parts: GeminiPart[] = [
    ...(request.references ?? []).map((reference) => ({
      inlineData: {
        mimeType: reference.mediaType,
        data: reference.bytes.toString('base64'),
      },
    })),
    { text: request.prompt },
  ]

  const results = await Promise.allSettled(
    Array.from({ length: request.count }, () => geminiOnce(key, parts))
  )

  const images = results
    .filter((result): result is PromiseFulfilledResult<Buffer> => result.status === 'fulfilled')
    .map((result) => result.value)

  if (images.length === 0) {
    // Every one failed. Surface the first reason — a safety block and a bad key
    // are very different problems and read identically from an empty array.
    const first = results.find((result) => result.status === 'rejected')
    throw first !== undefined && first.status === 'rejected'
      ? (first.reason as Error)
      : new NoImageError()
  }

  return images
}

async function geminiOnce(key: string, parts: GeminiPart[]): Promise<Buffer> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_IMAGE_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
    }
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`image: Gemini returned ${response.status} ${detail.slice(0, 300)}`)
  }

  const body = (await response.json()) as GeminiResponse

  /**
   * **A safety block is a refusal, not a fault, and it must be legible.**
   * E8-01's input is a photograph of people in uniform, which is exactly the
   * kind of prompt a safety filter declines. Left as an empty candidate list it
   * reads as "the model returned nothing" and gets retried twice at the owner's
   * expense.
   */
  const blocked = body.promptFeedback?.blockReason
  if (blocked !== undefined) throw new NoImageError(blocked)

  const image = body.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => part.inlineData?.data !== undefined)

  const data = image?.inlineData?.data
  if (data === undefined) throw new NoImageError()

  return Buffer.from(data, 'base64')
}

// ─── Qwen ─────────────────────────────────────────────────────────────────────

interface QwenResponse {
  output?: {
    choices?: { message?: { content?: ({ image?: string } | { text?: string })[] } }[]
  }
  message?: string
}

/**
 * Qwen over DashScope's multimodal generation endpoint.
 *
 * **The edit model when there are references, the generation model otherwise** —
 * they are different models and the distinction is the whole of E8-02: a pose is
 * an *edit* of the base character, conditioned on it, and asking a text-to-image
 * model for "the same character, waving" produces a different person waving.
 *
 * `DASHSCOPE_BASE_URL`'s note applies unchanged: Beijing and Singapore are
 * different hosts and an account is not authorised on the other, which fails as
 * a 401 that reads exactly like a bad key.
 */
async function withQwen(request: DrawRequest): Promise<Buffer[]> {
  const key = env.DASHSCOPE_API_KEY
  if (key === undefined) throw new ImageGenerationOffError()

  const references = request.references ?? []
  const model = references.length > 0 ? env.QWEN_IMAGE_EDIT_MODEL : env.QWEN_IMAGE_MODEL

  const content = [
    ...references.map((reference) => ({
      image: `data:${reference.mediaType};base64,${reference.bytes.toString('base64')}`,
    })),
    { text: request.prompt },
  ]

  // The compatible-mode base is the OpenAI-shaped one magic block uses; image
  // generation is on DashScope's own path, so the suffix is replaced rather
  // than appended.
  const base = env.DASHSCOPE_BASE_URL.replace(/\/+$/, '').replace(/\/compatible-mode\/v1$/, '')

  const results = await Promise.allSettled(
    Array.from({ length: request.count }, () =>
      qwenOnce(`${base}/api/v1/services/aigc/multimodal-generation/generation`, key, model, content)
    )
  )

  const images = results
    .filter((result): result is PromiseFulfilledResult<Buffer> => result.status === 'fulfilled')
    .map((result) => result.value)

  if (images.length === 0) {
    const first = results.find((result) => result.status === 'rejected')
    throw first !== undefined && first.status === 'rejected'
      ? (first.reason as Error)
      : new NoImageError()
  }

  return images
}

async function qwenOnce(
  url: string,
  key: string,
  model: string,
  content: unknown[]
): Promise<Buffer> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, input: { messages: [{ role: 'user', content }] } }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`image: DashScope returned ${response.status} ${detail.slice(0, 300)}`)
  }

  const body = (await response.json()) as QwenResponse
  const parts = body.output?.choices?.[0]?.message?.content ?? []
  const url_ = parts.find((part): part is { image: string } => 'image' in part && !!part.image)
    ?.image

  if (url_ === undefined) throw new NoImageError(body.message)

  // DashScope hands back a URL with a short life rather than bytes. Fetched here
  // so that everything above this line deals in Buffers and the two providers
  // stay interchangeable.
  const image = await fetch(url_)
  if (!image.ok) throw new NoImageError(`fetching the result returned ${image.status}`)

  return Buffer.from(await image.arrayBuffer())
}
