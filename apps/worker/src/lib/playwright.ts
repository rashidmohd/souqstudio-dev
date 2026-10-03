import { chromium, type Browser } from 'playwright'
import { createPool, type Pool } from 'generic-pool'

/**
 * The warm Chromium pool. `souqstudio-technical` → `references/export-pipeline.md`.
 *
 * **Never a browser per job.** Launching one costs 400 to 600ms and a warm page
 * about 3ms, so every capture borrows a browser from here and gives it back.
 * The PDF export will borrow from the same pool when it lands; thumbnails are
 * its first user.
 *
 * **Created on first use, not at boot.** The worker runs email, AI and
 * background removal too, and a deployment that never draws a thumbnail should
 * not hold two Chromium processes for nothing. The export pipeline asks for a
 * minimum of two warm, and that is what the pool keeps once it exists.
 */

let pool: Pool<Browser> | null = null

function browsers(): Pool<Browser> {
  pool ??= createPool<Browser>(
    {
      create: () => chromium.launch({ args: ['--disable-dev-shm-usage'] }),
      destroy: (browser) => browser.close(),
      validate: async (browser) => browser.isConnected(),
    },
    { min: 2, max: 10, testOnBorrow: true, acquireTimeoutMillis: 30_000 }
  )
  return pool
}

/**
 * Run `work` with a browser from the pool, always handing it back. A leaked
 * browser is a pool slot lost until the process restarts.
 */
export async function withBrowser<T>(work: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await browsers().acquire()
  try {
    return await work(browser)
  } finally {
    await browsers().release(browser)
  }
}

/** For graceful shutdown. A pool that was never created has nothing to close. */
export async function closeBrowsers(): Promise<void> {
  if (pool === null) return
  await pool.drain()
  await pool.clear()
}
