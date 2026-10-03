import type { Job } from 'bullmq'
import sharp from 'sharp'
import {
  prisma,
  RENDER_TOKEN_TTL_SECONDS,
  renderQuery,
  type BlockThumbnailPayload,
} from '@souqstudio/db'
import { env } from '../lib/env'
import { withBrowser } from '../lib/playwright'
import { putObject } from '../lib/r2'

/**
 * A block, drawn to a PNG for the lists that show many blocks at once.
 *
 * **Captured, not re-rendered.** Chromium opens the web app's render page,
 * which draws the block with the same painter every list uses, in the shop's
 * own faces, and this screenshots it. The worker never paints a block itself:
 * it has no font files, and a second painter is how a picture stops matching
 * the screen. `lib/block-thumbnail.ts` in the designer package has the rest.
 *
 * **Every outcome but a fault resolves.** Not configured, already drawn, the
 * block gone or changed since the job was queued: none of those improve on a
 * retry, and the list draws live meanwhile. A browser or storage failure
 * throws, and BullMQ retries it once.
 */

export type BlockThumbnailResult =
  | { status: 'stored'; url: string }
  | { status: 'exists' | 'disabled' | 'gone' | 'superseded' }

/** Long enough for a cold pool, R2 fonts and artwork; a capture is usually under two seconds. */
const READY_TIMEOUT_MS = 30_000

export async function handleBlockThumbnail(
  job: Job<BlockThumbnailPayload>
): Promise<BlockThumbnailResult> {
  const { blockId, renderKey, kit, direction } = job.data

  if (env.WEB_RENDER_URL === undefined || env.RENDER_TOKEN_SECRET === undefined) {
    console.warn('[render] WEB_RENDER_URL or RENDER_TOKEN_SECRET is unset; no thumbnail drawn.')
    return { status: 'disabled' }
  }

  const existing = await prisma.blockThumbnail.findUnique({
    where: { blockId_renderKey: { blockId, renderKey } },
    select: { id: true },
  })
  if (existing !== null) return { status: 'exists' }

  const query = renderQuery(
    {
      blockId,
      kit,
      direction,
      expires: Math.floor(Date.now() / 1000) + RENDER_TOKEN_TTL_SECONDS,
    },
    env.RENDER_TOKEN_SECRET
  )
  const url = `${env.WEB_RENDER_URL.replace(/\/$/, '')}/render/block/${blockId}?${query}`

  const captured = await withBrowser(async (browser) => {
    const context = await browser.newContext({
      viewport: { width: 800, height: 800 },
      deviceScaleFactor: 2,
    })
    try {
      const page = await context.newPage()
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
      // The page answers 404 for every refusal, and for a block or shop that
      // no longer exists. Nothing to draw, and nothing a retry would change.
      if (response === null || response.status() === 404) return null
      if (!response.ok()) throw new Error(`render page answered ${response.status()}`)

      const stage = page.locator('#block-thumbnail[data-render-ready="true"]')
      await stage.waitFor({ timeout: READY_TIMEOUT_MS })

      const drawn = await stage.getAttribute('data-render-key')
      return { drawn, png: await stage.screenshot({ type: 'png', omitBackground: true }) }
    } finally {
      await context.close()
    }
  })

  if (captured === null) return { status: 'gone' }
  // Saved again since this was queued, or the kit moved. Whatever caused that
  // queued its own job for the new key; this picture would be filed under a key
  // nobody will look up.
  if (captured.drawn !== renderKey) return { status: 'superseded' }

  const meta = await sharp(captured.png).metadata()
  const stored = await putObject(
    `block-thumbnails/${blockId}/${renderKey}.png`,
    captured.png,
    'image/png'
  )

  await prisma.blockThumbnail.upsert({
    where: { blockId_renderKey: { blockId, renderKey } },
    create: { blockId, renderKey, url: stored, width: meta.width ?? 0, height: meta.height ?? 0 },
    update: { url: stored },
  })

  return { status: 'stored', url: stored }
}
