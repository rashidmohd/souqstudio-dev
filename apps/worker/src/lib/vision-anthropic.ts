import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { magicChoiceSchema } from '@souqstudio/engine/src/magic'
import { env } from './env'
import {
  QUESTION,
  SYSTEM,
  type VisionImage,
  type VisionReader,
  interpret,
} from './magic-prompt'

/**
 * Reading a card with Claude. E8-07.
 *
 * **The schema constrains generation here**, which is what separates this
 * provider from the other one: `magicChoiceSchema` is handed to the API as the
 * output format, so the model cannot name a structure that is not in the
 * library or a colour that is not a role. `interpret` still runs on the result
 * — see the note there — but it is checking rather than salvaging.
 */

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

/**
 * Opus, and not a cheaper model — a note for whoever tunes this later.
 *
 * The saving from a smaller model is a few cents on a call an owner makes a
 * handful of times a month, and this is the reasoning-heavy end of the product:
 * read a photograph, infer which of twenty-five arrangements it is, judge
 * whether the ground is dark enough to invert the type on. A cheaper model that
 * picks the wrong structure costs the owner's trust in the feature, which is
 * worth more than the model is.
 */
const MODEL = 'claude-opus-5'

export const readWithAnthropic: VisionReader = async (image: VisionImage) => {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    // Adaptive thinking, at the default effort. Matching a layout is a judgement
    // — which of four stacked arrangements, is that ground dark enough to invert
    // — and it is the part that decides whether the owner keeps the result.
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(magicChoiceSchema) },
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
          { type: 'text', text: QUESTION },
        ],
      },
    ],
  })

  // `parsed_output` is null when the model produced something the schema
  // refused. `interpret` turns that into the same `UnreadableDesignError` the
  // other provider raises, so the job handler has one failure vocabulary.
  return interpret(response.parsed_output)
}
