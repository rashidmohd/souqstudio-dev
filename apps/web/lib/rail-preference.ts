/**
 * Whether the dashboard rail is collapsed. A view preference, nothing more.
 *
 * **A cookie, not localStorage.** The shell renders on the server, so the rail's
 * width has to be known before the first paint. localStorage is readable only
 * after hydration, which means a frame of the wrong width on every navigation —
 * the same flash the `NavItem.collapsed` comment refuses to accept for the
 * breakpoint, moved to a preference. The server reads this and the rail is born
 * at the right width.
 *
 * **Not `httpOnly`, unlike `sq_shop`.** That cookie is a hint the server
 * re-checks against what a session may actually reach; this one decides how wide
 * a `<nav>` is. The client writes it directly on toggle, because routing a UI
 * preference through a server action re-renders the page under the rail on every
 * click. Nothing here is trusted, so nothing needs protecting.
 */

export const RAIL_COOKIE = 'sq_rail'

export type RailState = 'expanded' | 'collapsed'

/**
 * Anything but the literal `collapsed` is expanded — missing, misspelt, or
 * hand-edited in devtools. The value is client-controlled and never validated,
 * so the fallback is the state that hides nothing.
 */
export function parseRailState(value: string | undefined): RailState {
  return value === 'collapsed' ? 'collapsed' : 'expanded'
}

/**
 * A `document.cookie` assignment. One year, because a preference should outlive
 * a browser restart the way the owner's mental model does — the same reasoning
 * as `sq_shop`, which sets no expiry at all.
 *
 * `secure` is passed in rather than read from `env`: this runs in the browser,
 * where the validated env module does not exist, and the protocol is the honest
 * answer anyway.
 */
export function railCookie(state: RailState, secure: boolean): string {
  const attributes = ['path=/', 'max-age=31536000', 'samesite=lax']
  if (secure) attributes.push('secure')
  return `${RAIL_COOKIE}=${state}; ${attributes.join('; ')}`
}
