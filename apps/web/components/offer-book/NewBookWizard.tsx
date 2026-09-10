'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, FileSpreadsheet, Search, Smartphone, Square, Printer } from 'lucide-react'
import type { BrandKit, CatalogSearchHit } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { BOOK_KINDS, KIND_SPEC, type BookKind } from '@/lib/book-kind'
import { ChoiceCard } from '@/components/offer-book/ChoiceCard'
import { DesignPicker } from '@/components/offer-book/DesignPicker'
import { PriceListMatcher } from '@/components/offer-book/PriceListMatcher'
import { ProductSearch } from '@/components/offer-book/ProductSearch'
import { WizardStep } from '@/components/offer-book/WizardStep'
import type { PickableBlock } from '@/components/offer-book/types'

/**
 * Starting an offer book. E6 — `docs/E6-create-flow.md`.
 *
 * **This replaced `NewBookForm`, which was one form asking four questions at
 * once and the wrong first one.** What it asked first was a title: the least
 * consequential and most reversible decision on the screen, about a thing that
 * did not exist yet, and it refused to submit without one. What it never asked
 * at all was which design the book should use, because the grid builder closed
 * over a single block id — so twenty-five seeded offer cards existed and one was
 * reachable. And its spreadsheet path appeared only for shops that had already
 * committed an import into their catalog on an earlier visit, which is a
 * different job wearing this one's clothes.
 *
 * Four steps now, in the order an owner actually decides: what am I making,
 * what should it look like, what goes in it, and then a look at the result.
 *
 * **The screen accumulates rather than pages.** Every answered step collapses to
 * its answer and stays visible, so at the Create button the owner can see all
 * three decisions and change one without losing the other two. See `WizardStep`.
 *
 * **Every step that has a defensible default carries one**, so the floor is
 * Continue, Continue, add products, Create. The kind has no default — that is
 * the one question only the owner can answer — and the other two do.
 */
type Props = {
  /** Repeating offer cards this shop may compose with: theirs, then the library. */
  blocks: PickableBlock[]
  kit: BrandKit
  /** The interface language, which is what the book's language defaults to. */
  lang: 'en' | 'ar'
}

/** `POST /api/v1/offer-books` caps both arrays here. The message has to arrive
 *  before the request is refused, not after. */
const MAX_OFFERS = 200

const KIND_ICON: Record<BookKind, React.ReactNode> = {
  booklet: <BookOpen className="size-4" strokeWidth={1.75} />,
  post: <Square className="size-4" strokeWidth={1.75} />,
  status: <Smartphone className="size-4" strokeWidth={1.75} />,
  poster: <Printer className="size-4" strokeWidth={1.75} />,
}

type Source = 'catalog' | 'sheet'
type Step = 1 | 2 | 3

export function NewBookWizard({ blocks, kit, lang }: Props) {
  const router = useRouter()

  const [step, setStep] = React.useState<Step>(1)
  const [kind, setKind] = React.useState<BookKind | null>(null)

  // Preselected to the card every book in this product has used until now, so an
  // owner with no opinion presses Continue. A step that cannot be skipped by not
  // caring is a step resented by the majority who do not.
  const [cardBlockId, setCardBlockId] = React.useState(
    blocks.find((block) => block.id === 'blk_offer_card' && !block.locked)?.id ??
      blocks.find((block) => !block.locked)?.id ??
      ''
  )

  const [source, setSource] = React.useState<Source>('catalog')
  const [picked, setPicked] = React.useState<CatalogSearchHit[]>([])
  const [rows, setRows] = React.useState<Array<{ catalogProductId: string; price: string | null }>>(
    []
  )

  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Referentially stable, or the effect inside `PriceListMatcher` that reports
  // its resolved rows fires on every render of this component.
  const takeRows = React.useCallback(
    (next: Array<{ catalogProductId: string; price: string | null }>) => setRows(next),
    []
  )

  const chosenDesign = blocks.find((block) => block.id === cardBlockId)
  const count = source === 'catalog' ? picked.length : rows.length

  async function create() {
    setError(null)

    // Never disable submit to enforce validation. A disabled button with no
    // explanation is a dead end: submit, then say what is missing.
    if (kind === null) return setError('Pick what you want to make.')
    if (count === 0) {
      return setError(
        source === 'catalog'
          ? 'Add at least one product.'
          : 'None of those rows matched a product yet.'
      )
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/offer-books', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          language: lang,
          // No title. `autoTitle` names it and the editor renames it — §4 and §6
          // of the flow doc.
          ...(cardBlockId === '' ? {} : { cardBlockId }),
          // A union on the wire, not two optional fields: sending both would be
          // a client that has not decided which it meant.
          ...(source === 'catalog'
            ? { productIds: picked.map((product) => product.id) }
            : { rows }),
        }),
      })
      const body = await res.json()

      if (!res.ok || body.error) {
        setError(body.error?.message ?? 'The book could not be created. Try again.')
        return
      }

      // Straight to the preview, which is a real book by then. `loadBook` runs
      // the engine over database rows and there is no second path that composes
      // from a request body; building one so the preview could precede the write
      // would be two composition paths that must agree forever.
      router.push(`/editor/${body.data.id}/preview`)
    } catch {
      setError('The book could not be created. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <WizardStep
        index={1}
        title="What are you making?"
        state={step === 1 ? 'current' : 'done'}
        summary={kind === null ? null : KIND_SPEC[kind].label}
        onChange={() => setStep(1)}
      >
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {BOOK_KINDS.map((option) => (
              <ChoiceCard
                key={option}
                name="book-kind"
                checked={kind === option}
                onSelect={() => {
                  setKind(option)
                  setStep(2)
                }}
                icon={KIND_ICON[option]}
                title={KIND_SPEC[option].label}
                body={KIND_SPEC[option].description}
              />
            ))}
          </div>
          <p className="font-ui text-body-sm text-muted">
            You can change the layout later. Nothing here is permanent.
          </p>
        </>
      </WizardStep>

      <WizardStep
        index={2}
        title="Which design?"
        state={step === 2 ? 'current' : step > 2 ? 'done' : 'ahead'}
        summary={chosenDesign?.name}
        onChange={() => setStep(2)}
      >
        <>
          <DesignPicker
            blocks={blocks}
            kit={kit}
            value={cardBlockId}
            onChange={setCardBlockId}
            direction={lang === 'ar' ? 'rtl' : 'ltr'}
          />
          <div>
            <Button type="button" onClick={() => setStep(3)}>
              Continue
            </Button>
          </div>
        </>
      </WizardStep>

      <WizardStep
        index={3}
        title="Which products?"
        state={step === 3 ? 'current' : 'ahead'}
      >
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChoiceCard
              name="product-source"
              checked={source === 'catalog'}
              onSelect={() => setSource('catalog')}
              icon={<Search className="size-4" strokeWidth={1.75} />}
              title="Search the catalog"
              body="Add them one at a time. Prices are set afterwards."
            />
            <ChoiceCard
              name="product-source"
              checked={source === 'sheet'}
              onSelect={() => setSource('sheet')}
              icon={<FileSpreadsheet className="size-4" strokeWidth={1.75} />}
              title="Upload a price list"
              body="A CSV of names and prices. The book arrives priced."
            />
          </div>

          {source === 'catalog' ? (
            <ProductSearch picked={picked} onChange={setPicked} max={MAX_OFFERS} />
          ) : (
            <PriceListMatcher onResolved={takeRows} max={MAX_OFFERS} />
          )}

          {error ? (
            <p className="font-ui text-body-sm text-critical-fg" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="primary" onClick={create} loading={submitting}>
              Create
            </Button>
            <span className="font-ui text-body-sm text-muted">
              <Figure value={count} size="data-sm" /> {count === 1 ? 'offer' : 'offers'}.{' '}
              {source === 'sheet'
                ? 'Prices come from the sheet. You can change them next.'
                : 'Prices are set on the next screen.'}
            </span>
          </div>
        </>
      </WizardStep>
    </div>
  )
}
