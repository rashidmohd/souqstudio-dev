import type { BrandKit } from '@souqstudio/types'
import { artboardIdentity, type ArtboardIdentity } from './artboard-identity'

/**
 * What a library block is drawn against while SouqStudio designs it.
 *
 * A shop designs against its own kit. A library block belongs to no shop and
 * will be drawn in every shop's colours, so it is designed against a stand-in
 * and must read well in anybody's. These are the engine harness's stand-in
 * colours (`packages/engine/harness/dummy.ts`), so the admin designer and the
 * gallery that checks the library show a block the same way.
 */

// A stand-in shop's brand colours: data on a kit, not chrome, so the token
// rule does not govern them (CLAUDE.md, "A colour a shop owner picked").
/* eslint-disable no-restricted-syntax */
export const LIBRARY_PREVIEW_KIT: BrandKit = {
  palette: [
    { id: 'primary', name: 'Primary', hex: '#1B4DB1' },
    { id: 'secondary', name: 'Secondary', hex: '#0E2A5C' },
    { id: 'accent', name: 'Accent', hex: '#C9A227' },
  ],
  primaryColor: '#1B4DB1',
  secondaryColor: '#0E2A5C',
  accentColor: '#C9A227',
}
/* eslint-enable no-restricted-syntax */

/** A sample shop, with every empty field filled, as the designer canvas wants. */
export function libraryPreviewIdentity(): ArtboardIdentity {
  return artboardIdentity({
    shop: { name: 'Sample Supermarket' },
    samples: true,
  })
}
