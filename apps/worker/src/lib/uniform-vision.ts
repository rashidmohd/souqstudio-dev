import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { uniformSchema, type Uniform } from '@souqstudio/engine'
import { env } from './env'
import {
  UNIFORM_CONTRACT,
  UNIFORM_QUESTION,
  UNIFORM_SYSTEM,
  UnreadableUniformError,
  interpretUniform,
} from './character-prompt'
import { candidateObjects } from './vision-qwen'
import type { VisionImage } from './magic-prompt'

/**
 * Reading a uniform off a photograph. E8-01.
 *
 * **Behind `MAGIC_BLOCK_PROVIDER`, not `IMAGE_PROVIDER`** — this is a model that
 * reads, and the variable that picks a reader already exists. The two are
 * separate because a deployment may reasonably want one vendor looking at
 * photographs and another drawing.
 *
 * **This is the only call the staff photograph is sent to.** What goes on to the
 * image model is `characterPrompt()`'s sentence about a polo shirt, built from
 * what this returns. One provider sees the picture, once.
 */
export async function readUniform(image: VisionImage): Promise<Uniform> {
  return env.MAGIC_BLOCK_PROVIDER === 'qwen' ? withQwen(image) : withAnthropic(image)
}

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

async function withAnthropic(image: VisionImage): Promise<Uniform> {
  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 8000,
    system: UNIFORM_SYSTEM,
    output_config: { format: zodOutputFormat(uniformSchema) },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: image.mediaType,
              data: image.bytes.toString('base64'),
            },
          },
          { type: 'text', text: UNIFORM_QUESTION },
        ],
      },
    ],
  })

  return interpretUniform([response.parsed_output])
}

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[]
}

async function withQwen(image: VisionImage): Promise<Uniform> {
  if (env.DASHSCOPE_API_KEY === undefined) {
    throw new Error('uniform: MAGIC_BLOCK_PROVIDER is qwen but DASHSCOPE_API_KEY is not set')
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
        { role: 'system', content: `${UNIFORM_SYSTEM}\n\n## The answer\n\n${UNIFORM_CONTRACT}` },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${image.mediaType};base64,${image.bytes.toString('base64')}`,
              },
            },
            { type: 'text', text: UNIFORM_QUESTION },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`uniform: DashScope returned ${response.status} ${detail.slice(0, 300)}`)
  }

  const body = (await response.json()) as ChatResponse
  const text = body.choices?.[0]?.message?.content
  if (typeof text !== 'string' || text.trim() === '') throw new UnreadableUniformError()

  return interpretUniform(candidateObjects(text))
}
