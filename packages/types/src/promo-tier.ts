/**
 * The vocabulary of a promo tier — the badge on a card's price mark.
 *
 * **Here, and the two places it is not are both instructive.**
 *
 * It cannot live in `apps/web/lib`: these are `--sq-tpl-*` names, and the
 * design lint refuses a template token in application chrome. That rule is
 * right — a promo badge is offer book *content*, and the tokens are
 * deliberately not the shop's palette, so a "Half price" flash is the same red
 * on every account rather than sand on one and navy on another.
 * `docs/E6-pending.md` §6.
 *
 * It cannot live in `packages/db` either, which is where `DEFAULT_PROMO_TIERS`
 * sits and where this was tried first. The picker that renders these is a
 * client component, and importing `@souqstudio/db` from one pulls Prisma and
 * BullMQ into the browser bundle — `typecheck` and `lint` both pass on that
 * and `next build` fails with `Can't resolve 'child_process'`. Fourth time in
 * this codebase; `apps/web/CLAUDE.md` and `STATUS` §5 both warn about it.
 *
 * So it lives in the package that is pure, unlinted and already holds the
 * shared vocabulary a card is built from — beside `Currency` and
 * `THREE_DECIMAL_CURRENCIES`. The database imports it for its seed; the route
 * validates against it; the picker renders it.
 */

/**
 * The colours a tier may be.
 *
 * Ink and paper are excluded: they are a card's ground and its text, and a
 * badge drawn in either is invisible against what it sits on.
 */
export const TIER_TOKENS = [
  '--sq-tpl-offer-red',
  '--sq-tpl-save-yellow',
  '--sq-tpl-deep',
] as const

export type TierToken = (typeof TIER_TOKENS)[number]

/** What each is called to an owner. Nobody chooses a CSS custom property. */
export const TIER_TOKEN_LABEL: Record<TierToken, string> = {
  '--sq-tpl-offer-red': 'Red',
  '--sq-tpl-save-yellow': 'Yellow',
  '--sq-tpl-deep': 'Navy',
}

/**
 * What `emphasis` means to an owner, rather than 1, 2, 3.
 *
 * It drives badge scale in the layout engine *and* decides which offers bid
 * first for a spanning region — so "loud" is not only about size, which is why
 * the third label says so.
 */
export const EMPHASIS_LABEL: Record<number, string> = {
  1: 'Quiet',
  2: 'Standard',
  3: 'Loud — bids for the big spaces',
}
