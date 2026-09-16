import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { brandDirectionJsonSchema, brandDirectionSchema } from '@souqstudio/engine'
import type { BrandDirection } from '@souqstudio/engine'
import { env } from './env'
import {
  SYSTEM,
  UnusableDirectionError,
  type DirectionInput,
  type DirectionReader,
  interpretDirection,
  interpretFirstDirection,
  questionFor,
} from './direction-prompt'
import { candidateObjects } from './vision-qwen'

/**
 * Which model proposes a brand direction. E8-08.
 *
 * **The same two providers behind the same variable as magic block.** A second
 * switch would let one AI feature run on Claude and another on Qwen without
 * anybody deciding that — and which provider receives shop owners' uploaded
 * images is exactly the decision `docs/E8-ai-features.md` says to make
 * deliberately rather than inherit. One variable, one answer, one thing to read
 * on the Railway dashboard.
 *
 * `MAGIC_BLOCK_PROVIDER` is now named after the first feature that used it
 * rather than after what it decides. Renaming it is a deployment change in three
 * environments to fix a word, and the variable that is actually read is worth
 * less confusion than a rename that silently reverts to the default in whichever
 * environment gets missed. Noted rather than done.
 */
export async function readBrandDirection(input: DirectionInput): Promise<BrandDirection> {
  return env.MAGIC_BLOCK_PROVIDER === 'qwen' ? withQwen(input) : withAnthropic(input)
}

/**
 * Opus, matching `vision-anthropic.ts`.
 *
 * Reading a shop off a photograph and proposing colours somebody will print for
 * a year is the reasoning-heavy end of the product, and the saving from a
 * smaller model is cents on a call an owner makes during setup and then rarely
 * again.
 */
const MODEL = 'claude-opus-5'

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

const withAnthropic: DirectionReader = async (input) => {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(brandDirectionSchema) },
    messages: [{ role: 'user', content: content(input) }],
  })

  return interpretDirection(response.parsed_output)
}

/** The user turn: a picture and a question, or just a question. */
function content(input: DirectionInput): Anthropic.ContentBlockParam[] {
  const question = { type: 'text' as const, text: questionFor(input) }
  if (input.image === undefined) return [question]

  return [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: input.image.mediaType,
        data: input.image.bytes.toString('base64'),
      },
    },
    question,
  ]
}

const CONTRACT = `Answer with a single JSON object and nothing else — no prose,
no code fence. It must validate against this JSON Schema:

${JSON.stringify(brandDirectionJsonSchema(), null, 2)}

Every field is required. Each \`hex\` must be a six-digit hex colour with a
leading #. \`mood\` must be one of the enumerated values exactly as spelled.
\`priceIndex\` is a position in the \`palette\` array you are returning, counting
from zero.`

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[]
}

const withQwen: DirectionReader = async (input) => {
  if (env.DASHSCOPE_API_KEY === undefined) {
    throw new Error('direction: MAGIC_BLOCK_PROVIDER is qwen but DASHSCOPE_API_KEY is not set')
  }

  const question = questionFor(input)
  const userContent =
    input.image === undefined
      ? question
      : [
          {
            type: 'image_url',
            image_url: {
              url: `data:${input.image.mediaType};base64,${input.image.bytes.toString('base64')}`,
            },
          },
          { type: 'text', text: question },
        ]

  const response = await fetch(`${env.DASHSCOPE_BASE_URL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.QWEN_VISION_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${SYSTEM}\n\n## The answer\n\n${CONTRACT}` },
        { role: 'user', content: userContent },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`direction: DashScope returned ${response.status} ${detail.slice(0, 300)}`)
  }

  const body = (await response.json()) as ChatResponse
  const text = body.choices?.[0]?.message?.content
  if (typeof text !== 'string' || text.trim() === '') throw new UnusableDirectionError()

  /**
   * **`candidateObjects` is imported from the magic block provider rather than
   * copied**, because what it recovers from is a property of the model and not
   * of the question: a code fence around the reply, and a correction emitted
   * *inside* the object it corrects. That happened on the first live run and it
   * will happen here. The schema is still what picks — every candidate is
   * validated, so this is recovery rather than leniency.
   */
  return interpretFirstDirection(candidateObjects(text))
}
