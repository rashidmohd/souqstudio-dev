/**
 * A block's own artwork, drawn on a book page.
 *
 * **This test exists because the failure was silent and the types allowed it.**
 * `BookPage` built everything a block needed and handed over only some of it:
 * `asset` arrived as a prop and `palette` was resolved two lines above the
 * return, and both went to `PageGround` — the paper — and to nothing else. A
 * card could therefore not draw a picture the owner had put on it, and a fill
 * naming a brand colour by id resolved against an empty palette. Both fields
 * are optional on `DrawContext`, by design, because a surface without a base URL
 * genuinely cannot invent one — so nothing failed to compile and nothing failed
 * to render. It just drew nothing, in every book, for every block that used
 * artwork.
 *
 * Rendered rather than inspected, for the reason `draw.test.tsx` gives: a
 * context carrying a resolver proves nothing about whether anything draws it.
 */

// JSX compiles to `React.createElement` here — the app is not on the automatic
// runtime — so the import is used even though nothing names it.
import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Block, BrandKit } from '@souqstudio/types'
import type { FlowPage } from '@souqstudio/engine'
import { artboardIdentity } from '@/lib/artboard-identity'
import { BookPage } from '@/components/editor/BookPage'

const KIT: BrandKit = {
  primaryColor: '#1B4D3E',
  secondaryColor: '#C8A951',
  accentColor: '#B3261E',
}

/** A generated cover's key: what the brand kit hands the designer, and long
 *  enough to be the case that the old 64-character `assetId` cap refused. */
const KEY = 'org_fixture/shop_fixture/covers/job_fixture-0.jpg'
const URL = `https://cdn.example/${KEY}`

/** One static block that is nothing but the owner's artwork, edge to edge. */
const BLOCK: Block = {
  id: 'block_fixture',
  organizationId: 'org_fixture',
  name: 'Artwork band',
  repeats: false,
  arrangements: [
    {
      aspectMin: 0.01,
      aspectMax: 100,
      elements: [
        {
          id: 'element_fixture',
          kind: 'image',
          box: { start: 0, top: 0, width: 1, height: 1 },
          source: { from: 'asset', assetId: KEY },
          fit: 'cover',
        },
      ],
    },
  ],
  thumbnailUrl: null,
}

const PAGE: FlowPage = {
  index: 0,
  placements: [
    {
      sourceId: 'region_fixture',
      rect: { x: 0, y: 0, width: 600, height: 400 },
      blockId: BLOCK.id,
      offerId: null,
      kind: 'static',
    },
  ],
  capacity: 0,
  cells: [],
  merges: [],
  pinnedRegionIds: [],
}

function draw(asset?: (assetId: string) => string | null): string {
  return renderToStaticMarkup(
    <BookPage
      page={PAGE}
      size={{ width: 600, height: 800 }}
      offers={{}}
      blocks={{ [BLOCK.id]: BLOCK }}
      kit={KIT}
      identity={artboardIdentity({
        shop: { name: 'Fixture Mart', location: null, phone: null },
      })}
      direction="ltr"
      {...(asset === undefined ? {} : { asset })}
    />
  )
}

describe('BookPage artwork', () => {
  it('draws a block image from the asset resolver it was given', () => {
    expect(draw((assetId) => `https://cdn.example/${assetId}`)).toContain(URL)
  })

  it('draws nothing rather than a placeholder when there is no resolver', () => {
    // The stated contract of the optional prop: a surface that was never given
    // a base URL cannot invent one, and an empty frame is the honest answer.
    expect(draw()).not.toContain('cdn.example')
  })
})
