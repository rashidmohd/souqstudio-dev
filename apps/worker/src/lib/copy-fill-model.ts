import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { fillReplyJsonSchema, fillReplySchema, interpretFill, type FillLine } from '@souqstudio/engine'
import { env } from './env'
import {
  DeclinedFillError,
  SYSTEM,
  UnusableFillError,
  type FillInput,
  questionFor,
} from './copy-fill-prompt'
import { candidateObjects } from './vision-qwen'

/**
 * Which model writes a generative fill.
 *
 * **The same variable as every other AI feature that reads or writes text**,
 * `MAGIC_BLOCK_PROVIDER`, for the reason `direction-vision.ts` gives: one
 * variable is one decision about where shop data goes, and a second switch
 * would let features drift onto different providers without anybody choosing.
 */
export async function writeFill(input: FillInput): Promise<FillLine[]> {
  const reply = env.MAGIC_BLOCK_PROVIDER === 'qwen' ? await withQwen(input) : await withAnthropic(input)
  const lines = interpretFill(reply, input.slots)
  if (lines.length === 0) throw new UnusableFillError()
  return lines
}

/**
 * Opus, matching the other Claude paths in this process. Bilingual retail
 * copy that fits a budget is judgement in two languages at once, and the call
 * is a few hundred output tokens.
 */
const MODEL = 'claude-opus-5'

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

async function withAnthropic(input: FillInput): Promise<unknown> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(fillReplySchema) },
    messages: [{ role: 'user', content: questionFor(input) }],
  })

  // A decline is an answer. It is not retried and it is not charged.
  if (response.stop_reason === 'refusal') throw new DeclinedFillError()
  return response.parsed_output
}

const CONTRACT = `Answer with a single JSON object and nothing else: no prose,
no code fence. It must validate against this JSON Schema:

${JSON.stringify(fillReplyJsonSchema(), null, 2)}

One entry in \`lines\` per line you were given, with its \`id\` exactly as given.`

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[]
}

async function withQwen(input: FillInput): Promise<unknown> {
  if (env.DASHSCOPE_API_KEY === undefined) {
    throw new Error('fill: MAGIC_BLOCK_PROVIDER is qwen but DASHSCOPE_API_KEY is not set')
  }

  const response = await fetch(`${env.DASHSCOPE_BASE_URL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      // The vision model answers text-only turns too, and a second model id
      // would be a second thing to keep current. `direction-vision.ts` does
      // the same for a described shop.
      model: env.QWEN_VISION_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${SYSTEM}\n\n${CONTRACT}` },
        { role: 'user', content: questionFor(input) },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`fill: DashScope returned ${response.status} ${detail.slice(0, 300)}`)
  }

  const body = (await response.json()) as ChatResponse
  const text = body.choices?.[0]?.message?.content
  if (typeof text !== 'string' || text.trim() === '') throw new UnusableFillError()

  // The first candidate the schema accepts. `candidateObjects` recovers from a
  // code fence and from a correction emitted inside the object it corrects.
  return candidateObjects(text).find((candidate) => fillReplySchema.safeParse(candidate).success) ?? null
}
