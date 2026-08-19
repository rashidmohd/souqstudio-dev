import { describe, it, expect } from 'vitest'
import type { BrandKit } from '@souqstudio/types'
import {
  facetOf,
  keepOnReset,
  levelFor,
  resolveBrandKit,
  routePatch,
  toBrandOverride,
  type BrandOverride,
} from '@/lib/brand-inheritance'

/**
 * The inheritance rule, exhaustively.
 *
 * This is the one piece of E2 whose failure is silent and visible only to the
 * customer: getting it wrong does not throw, it just quietly shows the wrong
 * shop's colours on a printed leaflet. So the whole override × facet matrix is
 * asserted rather than sampled.
 */

const ORG: { logoUrl: string | null; brandKit: BrandKit } = {
  logoUrl: 'https://cdn/org-logo.png',
  brandKit: {
    primaryColor: '#111111',
    secondaryColor: '#222222',
    accentColor: '#333333',
    gridId: 'org-grid',
    templateId: 'org-template',
    fontDisplay: 'Org Display',
    onboardingStep: 5,
  },
}

const SHOP: { logoUrl: string | null; brandKit: BrandKit } = {
  logoUrl: 'https://cdn/shop-logo.png',
  brandKit: {
    primaryColor: '#aaaaaa',
    secondaryColor: '#bbbbbb',
    accentColor: '#cccccc',
    gridId: 'shop-grid',
    templateId: 'shop-template',
    fontDisplay: 'Shop Display',
    onboardingStep: 2,
  },
}

function resolve(override: BrandOverride) {
  return resolveBrandKit({ org: ORG, shop: SHOP, override })
}

describe('toBrandOverride', () => {
  it('accepts the four levels', () => {
    for (const level of ['inherit', 'logo', 'colors', 'full'] as const) {
      expect(toBrandOverride(level)).toBe(level)
    }
  })

  it('falls back to inherit for anything else', () => {
    // The safe direction: an unreadable value shows the organization's brand
    // rather than no brand. Routes reject bad values; this is the read floor.
    expect(toBrandOverride('nonsense')).toBe('inherit')
    expect(toBrandOverride(null)).toBe('inherit')
    expect(toBrandOverride(undefined)).toBe('inherit')
    expect(toBrandOverride('')).toBe('inherit')
  })
})

describe('levelFor', () => {
  const expected: Record<BrandOverride, Record<string, string>> = {
    inherit: { logo: 'org', colors: 'org', layout: 'org', progress: 'shop' },
    logo: { logo: 'shop', colors: 'org', layout: 'org', progress: 'shop' },
    colors: { logo: 'org', colors: 'shop', layout: 'org', progress: 'shop' },
    full: { logo: 'shop', colors: 'shop', layout: 'shop', progress: 'shop' },
  }

  it('matches the specified matrix', () => {
    for (const override of Object.keys(expected) as BrandOverride[]) {
      for (const [facet, level] of Object.entries(expected[override])) {
        expect(levelFor(override, facet as never)).toBe(level)
      }
    }
  })

  it('always keeps wizard progress with the shop', () => {
    // A second branch must run its own setup rather than inherit "finished".
    for (const override of ['inherit', 'logo', 'colors', 'full'] as const) {
      expect(levelFor(override, 'progress')).toBe('shop')
    }
  })
})

describe('facetOf', () => {
  it('groups grid, template and fonts together as layout', () => {
    expect(facetOf('gridId')).toBe('layout')
    expect(facetOf('templateId')).toBe('layout')
    expect(facetOf('fontDisplay')).toBe('layout')
    expect(facetOf('fontPrice')).toBe('layout')
    expect(facetOf('fontBody')).toBe('layout')
  })
})

describe('resolveBrandKit', () => {
  it('inherit takes everything from the organization', () => {
    const r = resolve('inherit')
    expect(r.logoUrl).toBe(ORG.logoUrl)
    expect(r.brandKit.primaryColor).toBe('#111111')
    expect(r.brandKit.templateId).toBe('org-template')
  })

  it('logo swaps only the logo', () => {
    const r = resolve('logo')
    expect(r.logoUrl).toBe(SHOP.logoUrl)
    expect(r.brandKit.primaryColor).toBe('#111111')
    expect(r.brandKit.templateId).toBe('org-template')
  })

  it('colors swaps only the three brand colours', () => {
    const r = resolve('colors')
    expect(r.logoUrl).toBe(ORG.logoUrl)
    expect(r.brandKit.primaryColor).toBe('#aaaaaa')
    expect(r.brandKit.secondaryColor).toBe('#bbbbbb')
    expect(r.brandKit.accentColor).toBe('#cccccc')
    // Layout is org-owned at every level below full — the spec names no
    // override for grid, template or fonts.
    expect(r.brandKit.templateId).toBe('org-template')
    expect(r.brandKit.fontDisplay).toBe('Org Display')
  })

  it('full ignores the organization entirely', () => {
    const r = resolve('full')
    expect(r.logoUrl).toBe(SHOP.logoUrl)
    expect(r.brandKit.primaryColor).toBe('#aaaaaa')
    expect(r.brandKit.templateId).toBe('shop-template')
  })

  it('reports where each facet came from', () => {
    expect(resolve('colors').source).toEqual({
      logo: 'org',
      colors: 'shop',
      layout: 'org',
      progress: 'shop',
    })
  })

  it('takes wizard progress from the shop even when inheriting', () => {
    expect(resolve('inherit').brandKit.onboardingStep).toBe(2)
  })

  it('does not fall back per field', () => {
    // A shop on `full` with nothing set resolves to nothing set. Filling the
    // gaps from the organization would make "full override" mean "full
    // override except where you left something blank", and the settings screen
    // could never say what the shop is actually using.
    const r = resolveBrandKit({
      org: ORG,
      shop: { logoUrl: null, brandKit: {} },
      override: 'full',
    })
    expect(r.brandKit.primaryColor).toBeUndefined()
    expect(r.brandKit.templateId).toBeUndefined()
    expect(r.logoUrl).toBeNull()
  })

  it('omits keys absent on the owning side rather than writing undefined', () => {
    const r = resolveBrandKit({
      org: { logoUrl: null, brandKit: { primaryColor: '#111111' } },
      shop: { logoUrl: null, brandKit: {} },
      override: 'inherit',
    })
    expect(Object.keys(r.brandKit)).toEqual(['primaryColor'])
  })
})

describe('routePatch', () => {
  it('sends an inheriting shop’s edits to the organization', () => {
    // The rule that makes inheritance real rather than cosmetic: editing the
    // brand of an inheriting shop edits the kit it is actually showing.
    const { org, shop } = routePatch({ primaryColor: '#ff0000' }, 'inherit')
    expect(org).toEqual({ primaryColor: '#ff0000' })
    expect(shop).toEqual({})
  })

  it('sends a fully-overridden shop’s edits to the shop', () => {
    const { org, shop } = routePatch({ primaryColor: '#ff0000' }, 'full')
    expect(org).toEqual({})
    expect(shop).toEqual({ primaryColor: '#ff0000' })
  })

  it('splits a mixed patch across both levels', () => {
    const { org, shop } = routePatch(
      { primaryColor: '#ff0000', templateId: 't1', onboardingStep: 3 },
      'colors'
    )
    expect(org).toEqual({ templateId: 't1' })
    expect(shop).toEqual({ primaryColor: '#ff0000', onboardingStep: 3 })
  })

  it('drops undefined values rather than writing them', () => {
    const { org } = routePatch({ primaryColor: undefined }, 'inherit')
    expect(org).toEqual({})
  })
})

describe('keepOnReset', () => {
  it('keeps the progress facet', () => {
    // Setup progress belongs to the shop, not to the brand. A reset that lost
    // it would tell the owner their setup was unfinished and send them back
    // through the wizard for a brand they just chose to inherit.
    const kept = keepOnReset({
      ...SHOP.brandKit,
      onboardingCompletedAt: '2026-08-01T00:00:00.000Z',
    })
    expect(kept.onboardingStep).toBe(2)
    expect(kept.onboardingCompletedAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('drops every logo, colors and layout key', () => {
    // Asserted by walking the kit rather than by naming fields, so a field
    // added to BrandKit cannot survive a reset by being forgotten in the test
    // as well as in the filter.
    const kept = keepOnReset({
      ...SHOP.brandKit,
      logoStatus: 'ready',
      logoOriginalUrl: 'https://cdn/shop-original.png',
      suggestedColors: ['#aaaaaa'],
      fontPrice: 'Shop Price',
      fontBody: 'Shop Body',
    })
    for (const key of Object.keys(kept) as Array<keyof BrandKit>) {
      expect(facetOf(key)).toBe('progress')
    }
  })

  it('invents nothing from an empty kit', () => {
    expect(keepOnReset({})).toEqual({})
  })

  it('drops a key it does not recognise', () => {
    // Not something this shop chose through any screen we ship, and a reset is
    // the right moment to be rid of it.
    const kept = keepOnReset({ legacyColor: '#ff0000' } as unknown as BrandKit)
    expect(kept).toEqual({})
  })

  it('lands the shop back on the organization’s brand, facet for facet', () => {
    // The round trip the endpoint actually promises: kit stripped *and*
    // override set to inherit resolves to exactly what the organization has.
    // Both halves are required — resolveBrandKit has no per-field fallback, so
    // stripping alone would leave a `full` shop resolving to nothing at all.
    const after = resolveBrandKit({
      org: ORG,
      shop: { logoUrl: null, brandKit: keepOnReset(SHOP.brandKit) },
      override: 'inherit',
    })

    expect(after.logoUrl).toBe(ORG.logoUrl)
    expect(after.brandKit.primaryColor).toBe('#111111')
    expect(after.brandKit.gridId).toBe('org-grid')
    expect(after.brandKit.templateId).toBe('org-template')
    expect(after.brandKit.fontDisplay).toBe('Org Display')
    // Progress stayed the shop's own throughout.
    expect(after.brandKit.onboardingStep).toBe(2)
  })

  it('leaves a stripped kit resolving to nothing while the override still says full', () => {
    // The regression the endpoint exists to prevent, asserted directly: this is
    // what a reset that forgot to write `brandOverride` would ship.
    const stranded = resolveBrandKit({
      org: ORG,
      shop: { logoUrl: null, brandKit: keepOnReset(SHOP.brandKit) },
      override: 'full',
    })
    expect(stranded.brandKit.primaryColor).toBeUndefined()
    expect(stranded.brandKit.templateId).toBeUndefined()
  })
})
