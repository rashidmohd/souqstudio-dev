/**
 * Which parts of the product actually exist yet.
 *
 * Several E1-05 checklist items and the offer books empty state want to send
 * someone to a screen whose epic has not been built. A link to a 404 is worse
 * than no link: the shop owner cannot tell whether they did something wrong,
 * and the fix is not theirs to make. This is the same reasoning — and the same
 * shape — as `GOOGLE_HANDLER_BUILT` in lib/oauth.ts.
 *
 * **Flip a flag in the same change that adds the route.** Each one is a single
 * boolean precisely so that turning a feature on is one edit and cannot be
 * half-done.
 *
 * These are build-time facts, not per-organization entitlements. Plan gating is
 * a different question and belongs with the plan, not here.
 */

/** E6 — the offer book editor at /editor/[id]. */
export const EDITOR_BUILT = false

/** E5 — the product catalog browser at /catalog. */
export const CATALOG_BUILT = false

/** E4-05 — brand kit management at /brand. */
export const BRAND_KIT_BUILT = false

/** E2-03 — team management and invites at /settings/team. */
export const TEAM_BUILT = true

/**
 * E2-01 — deleting an organization, at /settings/organization.
 *
 * Off, and not merely unbuilt. The spec gives it one clause — "exports data
 * first" — with no format, no delivery mechanism and no retention rule; there
 * is no export queue to carry it (`ExportJob` is offer-book-scoped, E9); and
 * E3 separately promises data is kept for 90 days after cancellation, which
 * this would contradict.
 *
 * E3 removed one of the four reasons — cancelling a subscription is now
 * self-served, so deleting an organization would no longer strand a live
 * Stripe subscription. The other three stand.
 */
export const ORG_DELETE_BUILT = false

/** E10 — sharing, and E11's view of it. */
export const SHARING_BUILT = false

/** E10 — Instagram connection under shop settings. */
export const INSTAGRAM_BUILT = false
