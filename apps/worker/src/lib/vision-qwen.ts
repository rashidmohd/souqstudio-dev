import { magicChoiceJsonSchema } from '@souqstudio/engine/src/magic'
import { env } from './env'
import {
  QUESTION,
  SYSTEM,
  UnreadableDesignError,
  type VisionImage,
  type VisionReader,
  interpret,
} from './magic-prompt'

/**
 * Reading a card with Qwen, over DashScope's OpenAI-compatible endpoint. E8-07.
 *
 * **Plain `fetch`, no SDK.** One POST with a JSON body is not worth a
 * dependency, and the `openai` package would be a second HTTP client in a
 * process that already has one for Anthropic. Retries are BullMQ's — the job is
 * configured for two attempts, and a third client-side retry inside one attempt
 * would only make the queue's count a lie.
 *
 * **The schema is asked for rather than enforced.** Anthropic constrains
 * generation to `magicChoiceSchema`; here the contract goes into the prompt as
 * JSON Schema and `response_format: json_object` gets syntactically valid JSON
 * back. So a wrong answer is possible in a way it is not on the other provider
 * — which is exactly why `interpret` validates both. A reply that names a
 * structure the library does not have fails the zod parse and surfaces as
 * `UnreadableDesignError`, the same failure the job handler already knows.
 */

/**
 * The region matters and is not guessed.
 *
 * DashScope serves Beijing and Singapore from different hosts, and an account
 * created in one is not authorised on the other — the failure is a 401 that
 * reads exactly like a bad key. It is an environment variable with a default
 * rather than a value assembled in code, for the same reason
 * `BLOCK_LIBRARY_URL` is: a person can read it on the Railway dashboard and
 * tell whether it is right.
 */
const BASE = env.DASHSCOPE_BASE_URL

/** Qwen's flagship vision model. Overridable — the family moves quickly. */
const MODEL = env.QWEN_VISION_MODEL

const CONTRACT = `Answer with a single JSON object and nothing else — no prose,
no code fence. It must validate against this JSON Schema:

${JSON.stringify(magicChoiceJsonSchema, null, 2)}

Every field is required. \`structure\` must be one of the enumerated names
exactly as spelled. \`ground\` and \`accent\` must be one of the enumerated colour
roles — never a hex value, never a colour name.`

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[]
  error?: { message?: string }
}

export const readWithQwen: VisionReader = async (image: VisionImage) => {
  if (env.DASHSCOPE_API_KEY === undefined) {
    throw new Error('vision: MAGIC_BLOCK_PROVIDER is qwen but DASHSCOPE_API_KEY is not set')
  }

  const response = await fetch(`${BASE.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${SYSTEM}\n\n## The answer\n\n${CONTRACT}` },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${image.mediaType};base64,${image.bytes.toString('base64')}`,
              },
            },
            { type: 'text', text: QUESTION },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    // The body carries the provider's own message, which is what distinguishes
    // a bad key from an unauthorised region from a model name that has moved.
    // Thrown rather than returned: this is a fault, and BullMQ should retry it.
    const detail = await response.text().catch(() => '')
    throw new Error(`vision: DashScope returned ${response.status} ${detail.slice(0, 300)}`)
  }

  const body = (await response.json()) as ChatResponse
  const content = body.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim() === '') throw new UnreadableDesignError()

  let raw: unknown
  try {
    raw = JSON.parse(stripFence(content))
  } catch {
    throw new UnreadableDesignError()
  }

  return interpret(raw)
}

/**
 * A code fence around the JSON, which `json_object` mode is supposed to prevent
 * and models produce anyway.
 *
 * Tolerated rather than refused: the answer inside is usually correct, and
 * failing a good match over three backticks would spend an owner's credits to
 * punish the provider's formatting.
 */
function stripFence(content: string): string {
  const fenced = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenced?.[1] ?? content
}
