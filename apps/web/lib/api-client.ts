/**
 * Calling our own JSON routes from the browser, without trusting that the
 * answer is JSON.
 *
 * **Written after "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"
 * reached a shop owner.** Every route in this product answers
 * `{ data, error }` — until one does not: a 404 for a route that is not
 * deployed yet, a 500 whose stack Next renders as a page, a proxy or captive
 * portal returning its own HTML. `response.json()` then throws a `SyntaxError`,
 * and a `catch` that reports `error.message` prints the parser's complaint
 * about a angle bracket to somebody trying to add a photo of a milk bottle.
 *
 * Three rules, and they are the whole module:
 *
 * 1. **A parse failure is never the message.** It says nothing the reader can
 *    act on and everything about our own plumbing. The fallback the caller
 *    supplies is shown instead, and the real one goes to the console for us.
 * 2. **`error.message` from the envelope *is* the message.** Our routes write
 *    those for shop owners — "That photo is too small to print" — and replacing
 *    them with something generic would throw away the only sentence that helps.
 * 3. **A status with no envelope still gets a sentence.** A bare 500 or 404
 *    means the route did not run, which is ours to fix and not theirs, so it
 *    says so rather than blaming their connection.
 *
 * No `server-only`: it runs in the browser by design.
 */

export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: string }

/**
 * What a route said, or a sentence explaining why we do not know.
 *
 * `fallback` is what the caller wants said when the answer was not JSON at
 * all — phrase it for the action, not for the transport: "That photo could not
 * be added", never "Request failed".
 */
export async function readApi<T>(response: Response, fallback: string): Promise<ApiResult<T>> {
  const body = await response.text().catch(() => '')

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    /*
     * Logged, not shown. When this fires the useful detail is the status and
     * the first line of whatever came back — an HTML title is usually enough
     * to tell a 404 from a crash — and none of it belongs on screen.
     */
    console.error(
      `[api] ${response.status} ${response.url} did not return JSON:`,
      body.slice(0, 200)
    )
    return { data: null, error: fallback }
  }

  const envelope = parsed as { data?: unknown; error?: { message?: unknown } | null }

  if (envelope.error != null && typeof envelope.error.message === 'string') {
    return { data: null, error: envelope.error.message }
  }

  if (!response.ok) {
    // JSON, but not our envelope, and a failing status. Nothing to quote.
    return { data: null, error: fallback }
  }

  return { data: envelope.data as T, error: null }
}

/**
 * `fetch` plus `readApi`, with the network failure folded in.
 *
 * **One function, because the three-line dance was already copied four times**
 * and each copy handled a different subset of the ways it goes wrong. A caller
 * gets a result and never a thrown error, so there is no `catch` to write and
 * therefore no `catch` that leaks an internal message by reporting
 * `error.message`.
 */
export async function callApi<T>(
  input: string,
  init: RequestInit & { fallback: string }
): Promise<ApiResult<T>> {
  const { fallback, ...request } = init

  let response: Response
  try {
    response = await fetch(input, request)
  } catch {
    // Genuinely the connection, and the only case where saying so is honest.
    return { data: null, error: `${fallback} Check your connection.` }
  }

  return readApi<T>(response, fallback)
}
