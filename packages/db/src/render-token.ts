import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Who may open the web app's render page, and for what.
 *
 * `/render/block/[id]` draws a block for the worker's headless browser to
 * capture. It has no session, because the browser is not a user, so the URL
 * carries its own credential: an HMAC over exactly what it draws, with an
 * expiry. Changing the block, the kit or the direction breaks the signature,
 * so a token for one picture cannot be used to view another.
 *
 * Here rather than in either app because both halves must agree byte for byte:
 * the worker signs and the web app verifies. Same reason the queue names live
 * in this package.
 */

export type RenderKitSource = { shopId: string } | { library: true }

export type RenderClaim = {
  blockId: string
  kit: RenderKitSource
  direction: 'ltr' | 'rtl'
  /** Unix seconds after which the token is refused. */
  expires: number
}

/** Long enough for a cold browser and slow fonts, short enough not to matter if logged. */
export const RENDER_TOKEN_TTL_SECONDS = 120

function message(claim: RenderClaim): string {
  const kit = 'shopId' in claim.kit ? `shop:${claim.kit.shopId}` : 'library'
  return [claim.blockId, kit, claim.direction, String(claim.expires)].join('|')
}

export function signRender(claim: RenderClaim, secret: string): string {
  return createHmac('sha256', secret).update(message(claim)).digest('hex')
}

/** Constant-time, and false for an expired claim whatever its signature. */
export function verifyRender(
  claim: RenderClaim,
  signature: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000)
): boolean {
  if (claim.expires < now) return false
  const expected = Buffer.from(signRender(claim, secret), 'hex')
  const given = Buffer.from(signature, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** The query string the render page reads, in one place so both sides agree. */
export function renderQuery(claim: RenderClaim, secret: string): string {
  const params = new URLSearchParams({
    dir: claim.direction,
    exp: String(claim.expires),
    sig: signRender(claim, secret),
  })
  if ('shopId' in claim.kit) params.set('shop', claim.kit.shopId)
  else params.set('library', '1')
  return params.toString()
}
