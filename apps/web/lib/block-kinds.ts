import type { MagicCategory } from '@souqstudio/engine'

/**
 * What each kind of block is called, and what it is, in the owner's words.
 *
 * **One table, because two screens ask the same question.** The magic dialog
 * asks *"what is in the picture?"* and the new-block dialog asks *"what are you
 * making?"*, and they are the same list of five — so two copies would be two
 * names for one kind, which is how an owner stops being able to tell a "Panel"
 * from a "Message". Same argument as `BINDING_LABEL` in the engine.
 *
 * `seasonal` is absent, and `MagicCategory` is where that is argued: a seasonal
 * block is a design plus an *occasion*, and neither a photograph nor a starter
 * can pick the occasion — a wrong one is a shop wishing its customers Eid
 * Mubarak in March. An owner who wants one imports it from the library, where
 * the occasion is named on the tile they are pointing at.
 */
export const KIND_LABEL: Readonly<Record<MagicCategory, string>> = {
  'offer-card': 'Offer card',
  header: 'Header',
  panel: 'Panel',
  footer: 'Footer',
  'social-post': 'Square post',
}

/** What each kind is, for an owner who has never heard our words for them. */
export const KIND_NOTE: Readonly<Record<MagicCategory, string>> = {
  'offer-card': 'One product with its price — the card that repeats down a page.',
  header: 'The band across the top of a page, a front cover, or a divider between sections.',
  panel: 'A message among the offers — a note, a brand panel, an announcement.',
  footer: 'The last row of a page: your name, the contact line, the small print.',
  'social-post': 'One square post: an announcement, your opening hours, a thank-you.',
}

/**
 * What a starter of this kind arrives carrying.
 *
 * **Said before it is made, not discovered after.** §3.6's *always seed* is the
 * rule a "new block" button has to answer, and the answer is that it is not a
 * blank artboard — so the dialog says what will be on it. An owner who expects
 * an empty canvas and gets three elements has been surprised by their own
 * product; one who was told is being handed a starting point.
 */
export const KIND_STARTS_WITH: Readonly<Record<MagicCategory, string>> = {
  'offer-card': 'A product picture, its name and detail, and a price.',
  header: 'Your shop’s name on a coloured band, with a line underneath.',
  panel: 'A headline and a supporting line.',
  footer: 'Your shop’s name, address and phone, on a dark band.',
  'social-post': 'Your logo, a headline and your shop’s name, on a coloured square.',
}
