'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { OfferDetails } from '@/components/editor/OfferDetails'
import { SlotAdjust } from '@/components/editor/SlotAdjust'
import { useEditorStore } from '@/stores/editor-store'
import type { ComposedOffer } from '@/lib/offer-book-compose'

/**
 * The properties of the selected offer. E6-03.
 *
 * **Price, was-price and tier first, and they stay at the top.** They are what
 * an owner opens the panel for, and they were built first because until a price
 * exists no book can publish. Unit price, chips, footnotes, extra charges and
 * the per-product names live below in `OfferDetails` — the second visit, not
 * the first.
 *
 * **The tier is the only control on the price mark.** E6 §3 is explicit — owners
 * given a font-size dropdown for a price produce hundreds of inconsistent
 * treatments inside a month, and the price is the one thing on a flyer a
 * customer actually reads. Everything else about the mark is the block's.
 */
type Tier = { id: string; labelEn: string }

type Props = {
  bookId: string
  tiers: Tier[]
  currency: string
  /** The **book's** direction, so a logical nudge means the right edge. */
  direction: 'ltr' | 'rtl'
}

export function OfferProperties({ bookId, tiers, currency, direction }: Props) {
  const selectedId = useEditorStore((state) => state.selectedOfferId)
  const offer = useEditorStore((state) =>
    state.selectedOfferId === null ? undefined : state.offers[state.selectedOfferId]
  )
  const failed = useEditorStore((state) => state.failed)

  if (selectedId === null || offer === undefined) {
    return (
      <p className="font-ui text-body-sm text-secondary">
        Select a card to set its price.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-ui text-subhead text-primary">{offer.name}</h2>
        {offer.brand ? (
          <p className="font-ui text-body-sm text-muted">{offer.brand}</p>
        ) : null}
      </div>

      <Items bookId={bookId} offer={offer} />

      <PriceFields bookId={bookId} offer={offer} currency={currency} />

      <TierField bookId={bookId} offer={offer} tiers={tiers} />

      <SlotAdjust bookId={bookId} offerId={offer.id} direction={direction} />

      <OfferDetails bookId={bookId} offer={offer} />

      {failed.includes(offer.id) ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          That change did not save. Edit the field again to retry.
        </p>
      ) : null}

      {offer.flags.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-ui text-label font-medium text-primary">Before publishing</span>
          <ul className="flex flex-col gap-1">
            {offer.flags.map((flag) => (
              <li key={flag} className="font-ui text-body-sm text-caution-fg">
                {FLAG_TEXT[flag]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The products behind the card.
 *
 * **Only shown once there are two.** A single-product offer is the ordinary
 * case, its one item is already the heading above, and listing it under a
 * "Products" label would imply a decision the owner has not made.
 *
 * Removing the last one is refused by the route rather than hidden here: an
 * offer with no product is a price attached to nothing, and removing it is
 * *deleting the offer* — a different action, with its own control in the tray.
 */
function Items({ bookId, offer }: { bookId: string; offer: ComposedOffer }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (offer.items.length < 2) return null

  async function remove(itemId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/v1/offer-books/${bookId}/offers/${offer.id}/items/${itemId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? 'That did not save. Try again.')
        return
      }
      // Not optimistic: removing item 0 hands the packshot and the brand lockup
      // to whatever was second, and the connectors shift. That is the server
      // recomposing the card, not a field the client can predict.
      router.refresh()
    } catch {
      setError('That did not save. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-label font-medium text-primary">Products on this offer</span>
      <ul className="flex flex-col">
        {offer.items.map((item, index) => (
          <li key={item.id} className="flex min-h-row items-center justify-between gap-2">
            <span className="min-w-0 truncate font-ui text-body-sm text-secondary">
              {item.connector ? (
                <span className="text-muted">{item.connector === 'OR' ? 'or ' : 'and '}</span>
              ) : null}
              {item.name}
              {index === 0 ? (
                // Item 0 supplies the packshot and the brand lockup — worth
                // saying, because removing it moves both.
                <span className="text-muted"> · photo</span>
              ) : null}
            </span>
            <Button
              type="button"
              variant="ghost"
              aria-label={`Remove ${item.name} from this offer`}
              disabled={busy}
              onClick={() => void remove(item.id)}
            >
              <X className="size-4" aria-hidden="true" strokeWidth={2} />
            </Button>
          </li>
        ))}
      </ul>
      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** What each flag means to a shop owner, rather than what it is called in code. */
const FLAG_TEXT: Record<ComposedOffer['flags'][number], string> = {
  'no-price': 'This offer has no price yet.',
  'missing-name-ar': 'This product has no Arabic name, so it cannot publish in Arabic.',
  'no-image': 'This product has no photo.',
  'fallback-image': 'This photo still has its background — the cutout is not ready.',
  'fit-escalated':
    'The text on this card does not fit, even at its smallest. Shorten a name, or give it more room.',
}

/**
 * Price and was-price.
 *
 * **Both are held as text and patched on blur, not per keystroke.** Validating
 * on keystroke fights someone typing `12.` on the way to `12.50`; the design
 * system says validate on blur and re-validate on change once a field has
 * errored, which is what `touched` tracks.
 */
function PriceFields({
  bookId,
  offer,
  currency,
}: {
  bookId: string
  offer: ComposedOffer
  currency: string
}) {
  const applyLocal = useEditorStore((state) => state.applyLocal)
  const setSave = useEditorStore((state) => state.setSave)
  const settle = useEditorStore((state) => state.settle)
  const push = useEditorStore((state) => state.push)

  // Seeded from the composed mark rather than kept in the store: the store holds
  // what the card draws, and a half-typed `12.` is not something to draw.
  const composed = `${offer.priceMark.major}.${offer.priceMark.minor ?? '00'}`
  const [price, setPrice] = React.useState(composed)
  const [compare, setCompare] = React.useState(offer.priceMark.comparePrice ?? '')
  const [error, setError] = React.useState<string | null>(null)

  // Re-seed when the selection moves. Without this the fields keep the previous
  // card's numbers, which is the worst possible failure on a pricing screen.
  React.useEffect(() => {
    setPrice(composed)
    setCompare(offer.priceMark.comparePrice ?? '')
    setError(null)
  }, [offer.id, composed, offer.priceMark.comparePrice])

  async function persist(patch: Record<string, string | null>, revert: () => void) {
    setSave('saving')
    try {
      const res = await fetch(`/api/v1/offer-books/${bookId}/offers/${offer.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('save failed')
      setSave('saved')
      settle(offer.id, true)
    } catch {
      // Revert this one field and name it — never discard the batch.
      revert()
      setSave('error')
      settle(offer.id, false)
    }
  }

  function commitPrice() {
    const value = price.trim()
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(value)) {
      setError('Enter a price like 12.90.')
      return
    }
    setError(null)

    const previous = offer.priceMark
    const wasPrice = `${previous.major}.${previous.minor ?? '00'}`
    // Nothing to record, and nothing to save: an owner tabbing through a field
    // they did not change must not fill the undo stack with no-ops.
    if (Number(wasPrice) === Number(value)) return

    const [major = '0', minor = '00'] = Number(value).toFixed(2).split('.')
    const after = {
      priceMark: { ...offer.priceMark, major, minor },
      flags: offer.flags.filter((flag) => flag !== 'no-price'),
    }
    applyLocal(offer.id, after)
    push({
      offerId: offer.id,
      label: 'the price',
      undo: { price: wasPrice },
      redo: { price: value },
      before: { priceMark: previous, flags: offer.flags },
      after,
    })
    void persist({ price: value }, () => applyLocal(offer.id, { priceMark: previous }))
  }

  function commitCompare() {
    const value = compare.trim()
    if (value !== '' && !/^\d{1,8}(\.\d{1,2})?$/.test(value)) {
      setError('Enter a was-price like 32.00, or leave it empty.')
      return
    }
    setError(null)

    const previous = offer.priceMark
    if ((previous.comparePrice ?? '') === value) return

    push({
      offerId: offer.id,
      label: 'the was-price',
      undo: { comparePrice: previous.comparePrice ?? null },
      redo: { comparePrice: value === '' ? null : value },
      before: { priceMark: previous },
      after: {
        priceMark: {
          ...previous,
          ...(value === '' ? { comparePrice: undefined } : { comparePrice: value }),
        },
      },
    })
    applyLocal(offer.id, {
      priceMark: {
        ...offer.priceMark,
        ...(value === '' ? { comparePrice: undefined } : { comparePrice: value }),
      },
    })
    void persist({ comparePrice: value === '' ? null : value }, () =>
      applyLocal(offer.id, { priceMark: previous })
    )
  }

  // **E6-08 — debounced two seconds after the last change.** Blur still commits
  // immediately; this is for the owner who types a price and moves on to the
  // artboard without leaving the field. Only a *valid* value auto-commits, so
  // `12.` on the way to `12.50` never lands as an error the owner did not ask
  // for — the blur path is what names a genuinely bad one.
  React.useEffect(() => {
    const value = price.trim()
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(value)) return
    if (Number(value) === Number(composed)) return

    const timer = setTimeout(commitPrice, 2000)
    return () => clearTimeout(timer)
    // `commitPrice` closes over this render's values, which is what makes the
    // timer save what was typed rather than what is there two seconds later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price, composed])

  return (
    <div className="flex flex-col gap-3">
      <Input
        label={`Price (${currency})`}
        required
        inputMode="decimal"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        onBlur={commitPrice}
        placeholder="12.90"
        {...(error ? { error } : {})}
      />
      <Input
        label={`Was (${currency})`}
        inputMode="decimal"
        value={compare}
        onChange={(event) => setCompare(event.target.value)}
        onBlur={commitCompare}
        placeholder="32.00"
        hint="Struck through beside the price. Leave empty for none."
      />
    </div>
  )
}

function TierField({
  bookId,
  offer,
  tiers,
}: {
  bookId: string
  offer: ComposedOffer
  tiers: Tier[]
}) {
  const applyLocal = useEditorStore((state) => state.applyLocal)
  const setSave = useEditorStore((state) => state.setSave)
  const settle = useEditorStore((state) => state.settle)
  const push = useEditorStore((state) => state.push)

  async function change(tierId: string) {
    const tier = tiers.find((candidate) => candidate.id === tierId)
    if (tier === undefined) return

    const previous = { tierLabel: offer.tierLabel, priceMark: offer.priceMark }
    const after = {
      tierLabel: tier.labelEn,
      priceMark: { ...offer.priceMark, tierId },
    }
    applyLocal(offer.id, after)
    push({
      offerId: offer.id,
      label: 'the promo tier',
      undo: { promoTierId: previous.priceMark.tierId },
      redo: { promoTierId: tierId },
      before: previous,
      after,
    })

    setSave('saving')
    try {
      const res = await fetch(`/api/v1/offer-books/${bookId}/offers/${offer.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ promoTierId: tierId }),
      })
      if (!res.ok) throw new Error('save failed')
      setSave('saved')
      settle(offer.id, true)
    } catch {
      applyLocal(offer.id, previous)
      setSave('error')
      settle(offer.id, false)
    }
  }

  return (
    <Select
      label="Promo tier"
      hint="The one control on the price mark."
      options={tiers.map((tier) => ({ value: tier.id, label: tier.labelEn }))}
      value={offer.priceMark.tierId}
      onChange={(event) => void change(event.target.value)}
    />
  )
}

/** The quiet persistent status the design system asks for — never a toast per
 *  save, and never a Save button implying work is lost without it. */
export function SaveStatus() {
  const save = useEditorStore((state) => state.save)
  const savedAt = useEditorStore((state) => state.savedAt)
  if (save === 'idle') return null

  // "Saved [time]", per E6-08. The time matters more than the word: an owner
  // who has been pricing for ten minutes wants to know the last one landed, not
  // that something once did.
  const text =
    save === 'saving'
      ? 'Saving…'
      : save === 'saved'
        ? savedAt === null
          ? 'Saved'
          : `Saved ${new Date(savedAt).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}`
        : 'Not saved'

  return (
    <span
      className={
        save === 'error'
          ? 'font-ui text-body-sm text-critical-fg'
          : 'font-ui text-body-sm text-muted'
      }
    >
      {text}
    </span>
  )
}

/** The shell shows this beside the title; reading it from the store rather than
 *  from the server payload is what makes it drop as prices are entered. */
export function useFlaggedCount() {
  return useEditorStore((state) =>
    Object.values(state.offers).filter((offer) => offer.flags.length > 0).length
  )
}
