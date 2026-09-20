/**
 * The shop, the identity and the book, as an artboard's vocabulary names them.
 *
 * **Four surfaces share `draw.tsx`** — `/brand`'s block preview, the editor's
 * page, the designer's canvas and its worst-case panel — and each of them used
 * to pass a bare `shopName: string`. That was exactly as much of the vocabulary
 * as the painter could answer: `shop.address` and `shop.phone` were declared in
 * `TextSource`, resolved to `''` in `draw.tsx` and in `harness/svg.ts` alike,
 * and had done for as long as both had existed. E14 §3.4.
 *
 * So the three subjects travel together, through one adapter, for the same
 * reason `toArtboardOffer` exists: three copies of this mapping is three
 * chances for a footer to say something different on one surface than on the
 * one beside it.
 *
 * **`brand` is the single identity source — §3.2.** It means *the identity this
 * book should carry*, already resolved through `readEffectiveBrand` and
 * `brandOverride` by whoever loaded the page, exactly as the artboard's colours
 * already are. A group footer that must always show the parent mark says so
 * with an identity pin on the block; there is no second entry to bind to, and
 * an owner who was offered one would pick wrong for half their branches.
 */

export interface ArtboardIdentity {
  shop: { name: string; address: string; phone: string }
  brand: { name: string; logo: string | null }
  book: { title: string; validFrom: string; validTo: string }
}

/**
 * Whether this block carries its own shop's identity or its parent's.
 *
 * **A mode, not a source the owner picks — §3.2.** `brandOverride` already
 * decides whether a shop shows its own logo or the organization's, and an owner
 * designing a header must not be asked to choose between two, because whichever
 * they pick is wrong for half their branches. `organization` forces the parent
 * mark, and it exists for the one deliberate case: a group footer that always
 * shows the group.
 *
 * The same shape as Figma Buzz's variable modes — a template carries brand modes
 * the user switches, rather than duplicate fields they choose between.
 */
export type IdentityPin = 'inherit' | 'organization'

/**
 * What a shop row, a resolved brand and a book make.
 *
 * `pin` is the block's, so this is called per surface rather than per page when
 * a surface draws blocks with different pins — which the editor does.
 */
export function artboardIdentity(input: {
  shop: {
    name: string
    location?: string | null
    phone?: string | null
    organization?: { name: string } | undefined
  }
  brand?: { logoUrl?: string | null; inheritsIdentity?: boolean } | undefined
  book?: { title?: string | null; validFrom?: string | null; validTo?: string | null } | undefined
  pin?: IdentityPin | undefined
}): ArtboardIdentity {
  const orgName = input.shop.organization?.name ?? null
  // Pinned to the parent, or inheriting it through `brandOverride`: either way
  // the identity this book carries is the organization's, and `brand.name` says
  // so. A shop on its own kit shows its own name.
  const parent = input.pin === 'organization' || input.brand?.inheritsIdentity === true
  return {
    shop: {
      name: input.shop.name,
      // `shops.location` and `shops.phone` — columns that existed and that
      // nothing read. E14 §3.4.
      address: input.shop.location ?? '',
      phone: input.shop.phone ?? '',
    },
    brand: {
      // Falls back to the shop's own name: a shop that inherits nothing still
      // has an identity, and a header bound to it should not go blank.
      name: (parent ? orgName : null) ?? input.shop.name,
      logo: input.brand?.logoUrl ?? null,
    },
    book: {
      title: input.book?.title ?? '',
      // **Strings, resolved before they get here** — §8. A date the engine
      // formats is a locale decision in a package that has no locale.
      validFrom: input.book?.validFrom ?? '',
      validTo: input.book?.validTo ?? '',
    },
  }
}

/**
 * The sample a preview draws against.
 *
 * **Populated rather than blank**, and that is the point of it: a block preview
 * showing a footer with three empty boxes is a preview that says the block is
 * broken when the fixture is. Same argument as `SampleProduct`'s nulls, in the
 * other direction — a product's absences are real and a shop's are not, because
 * every shop has a name and every book has dates by the time it prints.
 */
export const PREVIEW_IDENTITY: ArtboardIdentity = {
  shop: {
    name: 'Al Nakheel Market',
    address: 'Shop 14, Al Wasl Road, Jumeirah 1, Dubai',
    phone: '+971 4 398 7710',
  },
  brand: { name: 'Al Nakheel Group', logo: null },
  book: { title: 'Weekly Offers', validFrom: '1 October', validTo: '7 October' },
}
