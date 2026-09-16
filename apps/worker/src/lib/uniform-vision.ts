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
 * Reading a uniform off one or more photographs. E8-01.
 *
 * **Behind `MAGIC_BLOCK_PROVIDER`, not `IMAGE_PROVIDER`** — this is a model that
 * reads, and the variable that picks a reader already exists. The two are
 * separate because a deployment may reasonably want one vendor looking at
 * photographs and another drawing.
 *
 * **This is the only call the staff photographs are sent to.** What goes on to
 * the image model is `characterPrompt()`'s sentence about a polo shirt, built
 * from what this returns. One provider sees the pictures, once.
 *
 * **Several angles, one answer.** A back, a sleeve and a logo close-up describe
 * one garment better than a single flat photograph does — and they are all read
 * in one call rather than merged afterwards, because merging two independent
 * descriptions of the same shirt is a job nothing here can do well.
 */
export async function readUniform(images: readonly VisionImage[]): Promise<Uniform> {
  if (images.length === 0) throw new UnreadableUniformError()
  return env.MAGIC_BLOCK_PROVIDER === 'qwen' ? withQwen(images) : withAnthropic(images)
}

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

async function withAnthropic(images: readonly VisionImage[]): Promise<Uniform> {
  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 8000,
    system: UNIFORM_SYSTEM,
    output_config: { format: zodOutputFormat(uniformSchema) },
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((image) => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: image.mediaType,
              data: image.bytes.toString('base64'),
            },
          })),
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

async function withQwen(images: readonly VisionImage[]): Promise<Uniform> {
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
            ...images.map((image) => ({
              type: 'image_url',
              image_url: {
                url: `data:${image.mediaType};base64,${image.bytes.toString('base64')}`,
              },
            })),
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
