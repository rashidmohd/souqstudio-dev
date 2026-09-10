import type { MagicCategory } from '@souqstudio/engine'
import type { MagicChoice } from '@souqstudio/engine/src/magic'
import { env } from './env'
import type { VisionImage } from './magic-prompt'
import { readWithAnthropic } from './vision-anthropic'
import { readWithQwen } from './vision-qwen'

/**
 * Which model reads the picture. E8-07.
 *
 * **One variable decides, and the rollback is unsetting it.** Same shape as
 * `BLOCK_LIBRARY_URL`: the default is the path that is known to work, the
 * override is explicit, and nothing is assembled from `NODE_ENV`. A deployment
 * that has never heard of Qwen behaves exactly as it did before this file
 * existed.
 *
 * **Both providers answer the same question and are held to the same schema.**
 * `magic-prompt.ts` owns the question so the two stay comparable, and
 * `interpret` validates both so nothing downstream has to know which answered —
 * which is what keeps the 2,400-block enumeration in `magic.test.ts` a true
 * statement about the feature rather than about one provider.
 *
 * To compare them rather than choose blind:
 * `pnpm --filter @souqstudio/worker magic:check` renders cards whose structure
 * is known and reports what came back. Run it once per provider.
 */
export async function readCardDesign(
  image: VisionImage,
  category: MagicCategory
): Promise<MagicChoice> {
  return env.MAGIC_BLOCK_PROVIDER === 'qwen'
    ? readWithQwen(image, category)
    : readWithAnthropic(image, category)
}

export {
  NoMatchError,
  UnreadableDesignError,
  type VisionImage,
} from './magic-prompt'
