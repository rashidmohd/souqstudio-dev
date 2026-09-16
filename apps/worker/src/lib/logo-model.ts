import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { logoSetJsonSchema, logoSetSchema, type LogoSet } from '@souqstudio/engine'
import { env } from './env'
import {
  SYSTEM,
  UnusableMarkError,
  type MarkInput,
  type MarkReader,
  interpretFirstMarks,
  interpretMarks,
  questionFor,
} from './logo-prompt'
import { candidateObjects } from './vision-qwen'

/**
 * Which model proposes logo marks. E8-09.
 *
 * Behind the same `MAGIC_BLOCK_PROVIDER` as the other two AI features, for the
 * reason `direction-vision.ts` gives: a second switch would let one feature run
 * on Claude and another on Qwen without anybody deciding that.
 *
 * **This is the one AI call in the product that sends no image**, so it is also
 * the one whose provider choice carries no question about shop owners' uploaded
 * pictures. It stays on the shared variable anyway — a third rule about which
 * model answers what is harder to hold in a head than one.
 */
export async function readMarks(input: MarkInput): Promise<LogoSet> {
  return env.MAGIC_BLOCK_PROVIDER === 'qwen' ? withQwen(input) : withAnthropic(input)
}

const MODEL = 'claude-opus-5'

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

const withAnthropic: MarkReader = async (input) => {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(logoSetSchema) },
    messages: [{ role: 'user', content: questionFor(input) }],
  })

  return interpretMarks(response.parsed_output)
}

const CONTRACT = `Answer with a single JSON object and nothing else — no prose,
no code fence. It must validate against this JSON Schema:

${JSON.stringify(logoSetJsonSchema(), null, 2)}

Every field is required on every mark, including the ones the structure you chose
ignores. \`structure\` and \`symbol\` must be enumerated values spelled exactly.
\`inkIndex\` and \`accentIndex\` are positions in the palette you were given,
counting from zero.`

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[]
}

const withQwen: MarkReader = async (input) => {
  if (env.DASHSCOPE_API_KEY === undefined) {
    throw new Error('logo: MAGIC_BLOCK_PROVIDER is qwen but DASHSCOPE_API_KEY is not set')
  }

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
        { role: 'user', content: questionFor(input) },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`logo: DashScope returned ${response.status} ${detail.slice(0, 300)}`)
  }

  const body = (await response.json()) as ChatResponse
  const text = body.choices?.[0]?.message?.content
  if (typeof text !== 'string' || text.trim() === '') throw new UnusableMarkError()

  return interpretFirstMarks(candidateObjects(text))
}
