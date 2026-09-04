'use client'

import * as React from 'react'
import type { BrandKit } from '@souqstudio/types'
import { Select } from '@/components/ui/select'
import { useBrandStore } from '@/stores/brand-store'
import {
  FONT_ROLES,
  ROLE_COPY,
  ROLE_SLOT,
  fontStack,
  fontsForRole,
  googleFontsHref,
  resolveFonts,
  type FontRole,
} from '@/lib/brand-fonts'

/**
 * Choosing the three typefaces. E4, and
 * `souqstudio-design → references/brand-kit-fonts.md`.
 *
 * **A curated list, not the Google Fonts library.** `lib/brand-fonts.ts` says
 * why, and filters each slot to the families that suit it: a price face has to
 * be narrow enough for a three-decimal Kuwaiti amount in a dense cell, and a
 * promo face is wrong for pack sizes.
 *
 * The specimen shows Arabic above English on purpose. Every family here covers
 * both, and Arabic is where a face fails first — it also runs longer than its
 * English equivalent, which is the whole reason the fit ladder exists. Showing
 * only Latin would let an owner choose a face they will never see working.
 *
 * Changes land in the store immediately. Persisting is the caller's, matching
 * `ColorFields`.
 */
export function TypographyFields() {
  const { kit, setFont } = useBrandStore()
  const fonts = resolveFonts(kit)

  useGoogleFonts(Object.values(fonts))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {FONT_ROLES.map((role) => (
          <Select
            key={role}
            label={ROLE_COPY[role].label}
            hint={hintFor(role, fonts[role])}
            value={fonts[role]}
            onChange={(event) => setFont(role, event.target.value)}
            options={fontsForRole(role).map((font) => ({
              value: font.family,
              label: font.family,
            }))}
          />
        ))}
      </div>

      <Specimen fonts={fonts} />
    </div>
  )
}

function hintFor(role: FontRole, family: string): string {
  const note = fontsForRole(role).find((font) => font.family === family)?.note
  return note ? `${ROLE_COPY[role].hint} · ${note}` : ROLE_COPY[role].hint
}

/**
 * What the three faces look like together, at roughly the proportions a card
 * uses. Not the artboard — a real preview needs the block renderer — but enough
 * to tell whether a price face and a name face sit together.
 */
function Specimen({ fonts }: { fonts: Record<FontRole, string> }) {
  return (
    <div className="flex flex-col gap-2 rounded-control bg-stone-0 p-4">
      <span className="font-ui text-label font-medium text-secondary">Specimen</span>

      <div className="flex flex-col gap-1">
        <p dir="rtl" className="text-heading" style={{ fontFamily: fontStack(fonts.display) }}>
          أرز بسمتي ذهبي
        </p>
        <p className="text-heading" style={{ fontFamily: fontStack(fonts.display) }}>
          Golden basmati rice
        </p>
      </div>

      <p className="text-body-sm text-secondary" style={{ fontFamily: fontStack(fonts.body) }}>
        10 kg jute bag · product of India
      </p>

      {/* Western numerals and LTR, in Arabic too — E6 §6. */}
      <p
        dir="ltr"
        data-figure
        className="text-title"
        style={{ fontFamily: fontStack(fonts.price), fontWeight: 800 }}
      >
        AED 24.50
      </p>
    </div>
  )
}

/**
 * Load the chosen families from Google's CDN, for the specimen only.
 *
 * One `<link>` per set of families, replaced when the set changes and left in
 * place otherwise, so switching a slot does not accumulate stylesheets. The tag
 * is not removed on unmount: the face is almost certainly wanted again on the
 * next render of this screen, and dropping it would flash the fallback.
 *
 * **Chrome only.** The export pipeline must self-host — Playwright cannot
 * depend on an external network on a critical path, and PDF embedding needs the
 * real file. See `lib/brand-fonts.ts`.
 */
function useGoogleFonts(families: readonly string[]): void {
  const href = googleFontsHref(families)

  React.useEffect(() => {
    if (href === '') return
    if (document.querySelector(`link[data-brand-fonts][href="${href}"]`)) return

    for (const stale of document.querySelectorAll('link[data-brand-fonts]')) {
      stale.remove()
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.brandFonts = 'true'
    document.head.appendChild(link)
  }, [href])
}

/** The three slots a save sends. Exported so the caller cannot guess them. */
export function typographyPatch(kit: BrandKit): Pick<
  BrandKit,
  'fontDisplay' | 'fontPrice' | 'fontBody'
> {
  const fonts = resolveFonts(kit)
  return {
    [ROLE_SLOT.display]: fonts.display,
    [ROLE_SLOT.price]: fonts.price,
    [ROLE_SLOT.body]: fonts.body,
  }
}
