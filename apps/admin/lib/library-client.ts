import 'server-only'

import { env } from '@/lib/env'

/**
 * Publishing to the shared block library, from the admin panel. E13-04.
 *
 * **It calls `apps/web`'s routes rather than writing R2 itself**, and that is
 * the decision this module exists to hold. `apps/web/app/api/v1/library/` owns
 * what a published block *is*: the document schema, the manifest, the refusal
 * when a block draws a validation warning, and the loader's rule that a short
 * read is indistinguishable from a withdrawal. A second implementation here
 * would mean the library means one thing after a publish from the panel and
 * another after a publish from a script, and `docs/block-library-from-r2.md`
 * §12 records what that costs: a mismatch took the dev deploy down on
 * 10 September and Railway reported it as a failed build.
 *
 * **What the panel adds is the authorization the token never had.**
 * `apps/web/lib/library-auth.ts` calls `LIBRARY_PUBLISH_TOKEN` "a placeholder
 * for E13's admin auth", because a bearer secret says only that the caller
 * holds it. Here the token never leaves the server, and reaching it requires a
 * staff session and the super admin role. The token stops being the credential
 * and becomes the transport.
 */

export type LibraryConfig =
  | { configured: true; webAppUrl: string }
  | { configured: false; reason: string }

/**
 * Whether this deployment can publish, and why not when it cannot.
 *
 * Both variables or neither. A panel with the URL and no token would offer a
 * publish button that always answers 401, which is worse than a screen that
 * says the console is not set up.
 */
export function libraryConfig(): LibraryConfig {
  if (env.WEB_APP_URL === undefined) {
    return { configured: false, reason: 'WEB_APP_URL is not set on this deployment.' }
  }
  if (env.LIBRARY_PUBLISH_TOKEN === undefined) {
    return { configured: false, reason: 'LIBRARY_PUBLISH_TOKEN is not set on this deployment.' }
  }
  return { configured: true, webAppUrl: env.WEB_APP_URL }
}

export type LibraryCallResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; status: number }

/**
 * The shape `apps/web` returns. Read rather than assumed: a 502 from a proxy in
 * front of it is HTML, and parsing that as the envelope would throw inside a
 * route and surface as a 500 with no explanation.
 */
type Envelope<T> = { data: T; error: null } | { data: null; error: { code: string; message: string } }

async function call<T>(path: string, body: unknown): Promise<LibraryCallResult<T>> {
  const config = libraryConfig()
  if (!config.configured) {
    return { ok: false, code: 'not_configured', message: config.reason, status: 503 }
  }

  let response: Response
  try {
    response = await fetch(new URL(path, config.webAppUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.LIBRARY_PUBLISH_TOKEN ?? ''}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch (error) {
    return {
      ok: false,
      code: 'web_unreachable',
      message: `The web app at ${config.webAppUrl} did not answer: ${(error as Error).message}`,
      status: 502,
    }
  }

  const text = await response.text()
  let envelope: Envelope<T>
  try {
    envelope = JSON.parse(text) as Envelope<T>
  } catch {
    return {
      ok: false,
      code: 'web_unreadable',
      message: `The web app answered ${response.status} with something that is not JSON. It may be a proxy rather than the app.`,
      status: 502,
    }
  }

  if (envelope.error !== null) {
    /*
     * The message is passed through rather than replaced. It was written to be
     * read by somebody holding a failed publish, and it names the block, the
     * field and the prefix. Replacing it with a reassuring sentence throws away
     * the only diagnostic there is.
     */
    return {
      ok: false,
      code: envelope.error.code,
      message: envelope.error.message,
      status: response.status,
    }
  }

  return { ok: true, data: envelope.data }
}

export type PublishResult = {
  id: string
  prefix: string
  version: string
  count: number
  synced: boolean
  next: string
}

/**
 * Put one block's document in the bucket.
 *
 * **This does not change what any shop sees.** It writes an object. The library
 * reaches shops when a sync runs, which is `syncLibrary` below. Two steps
 * rather than one, so publishing three blocks is three writes and one sync, and
 * so "put it in the bucket" and "give it to everybody" stay separately decided
 * and separately reversible.
 */
export function publishBlock(input: {
  blockId: string
  // `| undefined` throughout, for exactOptionalPropertyTypes: the route builds
  // this from an optional Zod schema, whose output carries undefined rather
  // than omitting the key.
  id?: string | undefined
  category?: string | undefined
  name?: string | undefined
  description?: string | undefined
}): Promise<LibraryCallResult<PublishResult>> {
  return call<PublishResult>('/api/v1/library/publish', input)
}

export type SyncResult = {
  source: string
  [key: string]: unknown
}

/** Give the published library to every shop. The second step. */
export function syncLibrary(): Promise<LibraryCallResult<SyncResult>> {
  return call<SyncResult>('/api/v1/library/sync', {})
}

/**
 * Take one block out of the library, by its library id.
 *
 * **Like publishing, it changes nothing a shop sees by itself.** The next sync
 * takes the block away from shops: archived where a book already draws it,
 * deleted where nothing does. Its reach is every shop, so the route that calls
 * this is super admin only.
 */
export function unpublishBlock(id: string): Promise<LibraryCallResult<PublishResult>> {
  return call<PublishResult>('/api/v1/library/unpublish', { id })
}
