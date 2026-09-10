import { magicChoiceJsonSchema } from '@souqstudio/engine/src/magic'
import { env } from './env'
import {
  QUESTION,
  SYSTEM,
  UnreadableDesignError,
  type VisionImage,
  type VisionReader,
  interpretFirst,
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

  // Every reading of the reply, in preference order. The schema picks.
  return interpretFirst(candidateObjects(content))
}

/**
 * Every way the reply might be read, in preference order.
 *
 * **It returns candidates rather than an answer, and that distinction was
 * earned.** `json_object` mode is supposed to make this unnecessary and does
 * not; two tolerances came out of the first live run:
 *
 * - **A code fence**, which is cheap to strip. Failing a good match over three
 *   backticks would spend an owner's credits to punish formatting.
 * - **A broken object with a corrected one nested inside it.** The model emitted
 *   a `notes` array with mismatched quotes, abandoned it, and re-emitted the
 *   whole object correctly — *before the first one had closed*. Its answer was
 *   right both times; only the first serialisation was malformed.
 *
 * The trap is that the wreckage still parsed. Mismatched quotes turned half a
 * sentence into a key, and the outer object was valid JSON carrying a valid
 * `structure` and a `notes` that was a string. So picking "the first thing that
 * parses" returns junk with the right structure name in it. Only the schema can
 * tell the two apart, which is why this hands `interpretFirst` a list.
 *
 * This is recovery, not leniency: every candidate is still held to the schema,
 * and a reply naming a structure the library does not have is still refused.
 */
export function candidateObjects(content: string): unknown[] {
  const text = content.trim()
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)

  const parsed: unknown[] = []
  for (const candidate of [fenced?.[1] ?? text, ...balancedObjects(text)]) {
    try {
      const value: unknown = JSON.parse(candidate)
      if (typeof value === 'object' && value !== null) parsed.push(value)
    } catch {
      // Not JSON. Try the next reading.
    }
  }

  return parsed
}

/**
 * Every balanced `{...}` span in the text, **at any depth**, latest first.
 *
 * **Depth is the whole point, and collecting only top-level spans was a bug.**
 * When the model corrected itself it did not emit two objects side by side — it
 * emitted a broken one, and the corrected object arrived *inside* it, before the
 * broken one had closed. So there was exactly one top-level span, it ran from
 * the first brace to the last, and it was the malformed one. The good object was
 * nested in the wreckage.
 *
 * Latest start first, because a correction comes after the thing it corrects.
 *
 * Brace counting rather than a regular expression, because the braces nest and a
 * string value may legitimately contain one. Quoted spans are skipped so a brace
 * inside `description` cannot end an object early.
 */
function balancedObjects(text: string): string[] {
  const found: { start: number; span: string }[] = []
  const open: number[] = []
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]

    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }

    if (ch === '"') inString = true
    else if (ch === '{') open.push(i)
    else if (ch === '}') {
      const start = open.pop()
      if (start !== undefined) found.push({ start, span: text.slice(start, i + 1) })
    }
  }

  return found.sort((a, b) => b.start - a.start).map((entry) => entry.span)
}
