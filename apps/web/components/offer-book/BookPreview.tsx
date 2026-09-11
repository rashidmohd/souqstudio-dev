'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Trash2 } from 'lucide-react'
import type { Block, BrandKit, PageBackground } from '@souqstudio/types'
import type { FlowPage } from '@souqstudio/engine'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { BookPage } from '@/components/editor/BookPage'
import { assetResolver } from '@/lib/block-assets'
import type { ComposedOffer } from '@/lib/offer-book-compose'

/**
 * The book, drawn, with the two things you can do about it.
 * E6 — `docs/E6-create-flow.md` §2.4.
 *
 * **`BookPage` and not a second renderer**, which is the rule the whole
 * composition model rests on: there is one painter in this product,
 * `components/blocks/draw.tsx`, and four surfaces share it. A preview that drew
 * its own approximation of a page would be a fifth reading of the rules and the
 * first one to disagree with the PDF.
 *
 * **No `onSelectOffer`, deliberately.** `BookPage` renders no hit targets at all
 * when it has no handler, rather than pressable-looking cards that do nothing.
 * This screen is a look, not an edit. The edit is one button away.
 *
 * **Discard is not behind a confirmation dialog.** The design system prefers
 * undo over confirm for anything reversible, and reserves dialogs for the
 * genuinely irreversible. This is a draft that is seconds old, has never been
 * published or shared, and the flow that made it is one click behind — so the
 * recovery is making it again, which is the thing the owner was already doing.
 */
type Props = {
  bookId: string
  pages: FlowPage[]
  size: { width: number; height: number }
  offers: Record<string, ComposedOffer>
  blocks: Record<string, Block>
  kit: BrandKit
  shopName: string
  /** The **book's** language, never the interface's. */
  direction: 'ltr' | 'rtl'
  /** The paper behind every card. Null is `--sq-tpl-paper`. */
  background: PageBackground | null
  /** Where uploaded artwork lives. A server variable, so it arrives as a prop. */
  assetBaseUrl: string
  offerCount: number
  /** Only a draft can be discarded. A published book has a short code that may
   *  be on a printed flyer, and deleting one is E10's problem. */
  canDiscard: boolean
}

/**
 * How many pages are drawn before the rest are counted instead.
 *
 * A twelve-offer booklet at 3 × 3 is two pages and both belong on the screen.
 * Two hundred offers at 2 × 3 is thirty-four, and thirty-four full-page SVGs is
 * a screen that takes seconds to paint and that nobody scrolls to the end of.
 * Six is enough to see that the design is right, which is the question this
 * screen exists to answer.
 */
const MAX_DRAWN = 6

export function BookPreview({
  bookId,
  pages,
  size,
  offers,
  blocks,
  kit,
  shopName,
  direction,
  background,
  assetBaseUrl,
  offerCount,
  canDiscard,
}: Props) {
  const router = useRouter()
  const asset = React.useMemo(() => assetResolver(assetBaseUrl), [assetBaseUrl])
  const [discarding, setDiscarding] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const drawn = pages.slice(0, MAX_DRAWN)
  const hidden = pages.length - drawn.length

  async function discard() {
    setError(null)
    setDiscarding(true)
    try {
      const res = await fetch(`/api/v1/offer-books/${bookId}`, { method: 'DELETE' })
      const body = await res.json()

      if (!res.ok || body.error) {
        setError(body.error?.message ?? 'That could not be discarded. Try again.')
        return
      }

      // Back to the flow that made it, not to the home screen. The owner is
      // mid-task and the next thing they want is another go at the same thing.
      router.push('/editor/new')
    } catch {
      setError('That could not be discarded. Check your connection and try again.')
      setDiscarding(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* One primary per screen region, and this is it. */}
        <Button type="button" variant="primary" onClick={() => router.push(`/editor/${bookId}`)}>
          Open editor
          <ArrowRight className="size-4" aria-hidden="true" strokeWidth={2} />
        </Button>

        {canDiscard ? (
          <Button type="button" variant="danger" onClick={discard} loading={discarding}>
            <Trash2 className="size-4" aria-hidden="true" strokeWidth={2} />
            Discard
          </Button>
        ) : null}

        <span className="font-ui text-body-sm text-muted">
          <Figure value={offerCount} size="data-sm" /> {offerCount === 1 ? 'offer' : 'offers'} on{' '}
          <Figure value={pages.length} size="data-sm" /> {pages.length === 1 ? 'page' : 'pages'}.
        </span>
      </div>

      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}

      {/*
        The artboard's own dark ground, which is the one dark surface in the
        product and what makes paper read as paper. Same treatment as the editor
        — canvas parity is a hard requirement, and a preview that framed the page
        differently from the editor would make the two feel like two products.
      */}
      <div className="rounded-card bg-canvas-surround p-4">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {drawn.map((page) => (
            <li key={page.index}>
              <BookPage
                page={page}
                size={size}
                offers={offers}
                blocks={blocks}
                kit={kit}
                shopName={shopName}
                direction={direction}
                background={background}
                asset={asset}
              />
            </li>
          ))}
        </ul>

        {hidden > 0 ? (
          <p className="pt-4 text-center font-ui text-body-sm text-inverse">
            <Figure value={hidden} size="data-sm" /> more {hidden === 1 ? 'page' : 'pages'} in the
            editor.
          </p>
        ) : null}
      </div>
    </div>
  )
}
