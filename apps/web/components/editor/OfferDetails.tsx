'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useEditorStore } from '@/stores/editor-store'
import type { ComposedOffer } from '@/lib/offer-book-compose'
import { callApi } from '@/lib/api-client'
import { offerTypeOf, offerTypeOptions } from '@/lib/offer-types'

/**
 * The rest of E6-03: unit price, legal lines, chips, footnotes, and what each
 * product on the card is called in this book.
 *
 * **Price, was-price and tier stay in `OfferProperties`** — they are what an
 * owner opens the panel for, and they were built first because until a price
 * exists no book can publish. Everything here is the second visit.
 *
 * Two save shapes, and the split is not arbitrary:
 *
 * - **Optimistic, for fields the card can redraw from what the client already
 *   knows** — the unit-price mode, a legal line. The design system is explicit
 *   that an owner changing eleven prices must never wait on a round trip.
 * - **Server then refresh, for anything that changes the *composition*** —
 *   adding a chip, reordering the products on a card. Those recompose the offer
 *   (a chip stacks under the tier, a reorder moves the connector between two
 *   names), and predicting the result on the client is writing the composer
 *   twice.
 */

type Props = { bookId: string; offer: ComposedOffer }

export function OfferDetails({ bookId, offer }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <UnitPriceFields bookId={bookId} offer={offer} />
      <OfferTypeField bookId={bookId} offer={offer} />
      <Chips bookId={bookId} offer={offer} />
      <Footnotes bookId={bookId} offer={offer} />
      <LegalLines bookId={bookId} offer={offer} />
      <ItemDetails bookId={bookId} offer={offer} />
    </div>
  )
}

/** A section heading, so the panel reads as a list of decisions rather than a form. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Optimistic save of an offer patch, with the revert the design system requires.
 *
 * A failure reverts **that one field** and names it rather than discarding the
 * batch — which is what `failed` in the store carries, and why it is a set
 * rather than one id.
 */
function useOfferSave(bookId: string, offerId: string) {
  const setSave = useEditorStore((state) => state.setSave)
  const settle = useEditorStore((state) => state.settle)

  return React.useCallback(
    async (patch: Record<string, unknown>, revert: () => void) => {
      setSave('saving')
      try {
        const res = await fetch(`/api/v1/offer-books/${bookId}/offers/${offerId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!res.ok) throw new Error('save failed')
        setSave('saved')
        settle(offerId, true)
      } catch {
        revert()
        setSave('error')
        settle(offerId, false)
      }
    },
    [bookId, offerId, setSave, settle]
  )
}

/**
 * The unit price. E5 §4, E6-03.
 *
 * `AUTO` derives `(1 kg = 4.900)` from the pack columns and shows it live;
 * `MANUAL` takes what the owner types and freezes it, so a reprint reproduces
 * the number that was printed rather than recomputing against pack data since
 * corrected; `HIDDEN` draws no line.
 *
 * **`AUTO` says so when it cannot answer.** 4.2% of the catalog carries a pack
 * size, so "no line" is the ordinary outcome and an owner staring at an empty
 * card deserves to know it is the product that is missing a pack size rather
 * than the control that is broken.
 */
function UnitPriceFields({ bookId, offer }: Props) {
  const applyLocal = useEditorStore((state) => state.applyLocal)
  const save = useOfferSave(bookId, offer.id)
  const [mode, setMode] = React.useState(offer.unitPriceMode)
  const [value, setValue] = React.useState(offer.unitPriceValue ?? '')
  const [unit, setUnit] = React.useState(offer.unitPriceUnit ?? 'KG')
  const [error, setError] = React.useState<string | null>(null)

  // Re-seed when the selection moves, for the same reason the price fields do:
  // keeping the previous card's numbers is the worst failure on this panel.
  React.useEffect(() => {
    setMode(offer.unitPriceMode)
    setValue(offer.unitPriceValue ?? '')
    setUnit(offer.unitPriceUnit ?? 'KG')
    setError(null)
  }, [offer.id, offer.unitPriceMode, offer.unitPriceValue, offer.unitPriceUnit])

  return (
    <Section title="Unit price">
      <Select
        label="Show a unit price"
        value={mode}
        hint="Reads as credible, and costs nothing. Not required in the GCC."
        options={[
          { value: 'AUTO', label: 'Work it out from the pack size' },
          { value: 'MANUAL', label: 'I will type it' },
          { value: 'HIDDEN', label: 'Do not show one' },
        ]}
        onChange={(event) => {
          const next = event.target.value as 'AUTO' | 'MANUAL' | 'HIDDEN'
          const previous = { mode, unitPrice: offer.unitPrice }
          setMode(next)
          if (next === 'HIDDEN') applyLocal(offer.id, { unitPrice: null })
          void save({ unitPriceMode: next }, () => {
            setMode(previous.mode)
            applyLocal(offer.id, { unitPrice: previous.unitPrice })
          })
        }}
      />

      {mode === 'MANUAL' ? (
        <div className="flex items-end gap-2">
          <Input
            label="Rate"
            inputMode="decimal"
            figure
            value={value}
            placeholder="4.900"
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => {
              const text = value.trim()
              if (text === '') return
              if (!/^\d{1,7}(\.\d{1,3})?$/.test(text)) {
                setError('Enter a rate like 4.900.')
                return
              }
              setError(null)
              const previous = offer.unitPrice
              applyLocal(offer.id, {
                unitPrice: unit === 'PIECE' ? `${text} each` : `1 ${unit.toLowerCase()} = ${text}`,
              })
              void save({ unitPriceValue: text, unitPriceUnit: unit }, () =>
                applyLocal(offer.id, { unitPrice: previous })
              )
            }}
            {...(error ? { error } : {})}
          />
          <Select
            label="Per"
            value={unit}
            options={[
              { value: 'KG', label: 'kilogram' },
              { value: 'L', label: 'litre' },
              { value: 'PIECE', label: 'piece' },
            ]}
            onChange={(event) => setUnit(event.target.value as typeof unit)}
          />
        </div>
      ) : null}

      {mode === 'AUTO' ? (
        <p className="font-ui text-body-sm text-muted">
          {offer.unitPrice === null
            ? 'This product has no pack size, so there is nothing to work out. Add one in the catalog, or type the rate yourself.'
            : offer.unitPrice}
        </p>
      ) : null}
    </Section>
  )
}

/**
 * What kind of promotion this is — buy one get one, and the rest.
 *
 * **The vocabulary was import-only until now**, which meant a book built from
 * a price list said "Buy 1 get 1 free" in both languages and a book built by
 * hand said whatever the owner typed into a free-text chip, in one. Same
 * promotion, same product, two wordings — which is what a closed set exists to
 * prevent. The options are generated from `OFFER_TYPES`, so a new mechanic is
 * a row there and appears here with no edit.
 *
 * **One value, replaced rather than appended.** An offer has one mechanic;
 * `PUT .../type` deletes the old chip and writes the new one in a transaction,
 * so choosing buy-2-get-1 over buy-1-get-1 cannot print both. That is the
 * difference between this and `Chips` below, which is a list.
 *
 * **"Something else" is not a fallback, it is the honest third answer.** A shop
 * running `Ramadan special` means it, and refusing the words because they are
 * not in our table would be deciding we know their promotions better than they
 * do. Its Arabic is theirs to supply — a chip is copy rather than catalog data,
 * so a missing translation is not the publish blocker a missing product name is.
 */
function OfferTypeField({ bookId, offer }: Props) {
  const router = useRouter()
  const current = offer.chips.find((chip) => chip.isOfferType)
  const known = current === undefined ? null : offerTypeOf(current.label)

  /**
   * What the select is showing. Three states share it: a key from the table,
   * `custom` for the owner's own words, and `none`.
   *
   * Seeded from the stored chip and then owned by the control — a select that
   * re-derived its value from props on every render would snap back while the
   * write was in flight.
   */
  const [choice, setChoice] = React.useState<string>(
    current === undefined ? 'none' : (known ?? 'custom')
  )
  const [words, setWords] = React.useState(known === null ? (current?.label ?? '') : '')
  const [wordsAr, setWordsAr] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // The offer the panel is describing can change under it — clicking another
  // card keeps this component mounted. Without this the new offer's mechanic
  // would be shown as the old one's until something else re-rendered.
  React.useEffect(() => {
    const chip = offer.chips.find((entry) => entry.isOfferType)
    const key = chip === undefined ? null : offerTypeOf(chip.label)
    setChoice(chip === undefined ? 'none' : (key ?? 'custom'))
    setWords(key === null ? (chip?.label ?? '') : '')
    setWordsAr('')
    setError(null)
  }, [offer.id, offer.chips])

  async function write(body: unknown) {
    setBusy(true)
    setError(null)
    const result = await callApi(`/api/v1/offer-books/${bookId}/offers/${offer.id}/type`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      fallback: 'That offer type could not be applied.',
    })
    setBusy(false)
    if (result.error !== null) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  function choose(next: string) {
    setChoice(next)
    if (next === 'none') void write({ kind: 'none' })
    // Custom waits for the words — writing on selection would clear the
    // mechanic and leave an empty box where one used to be.
    else if (next !== 'custom') void write({ kind: 'known', key: next })
  }

  return (
    <Section title="Offer type">
      <Select
        label="Promotion"
        value={choice}
        disabled={busy}
        options={[
          { value: 'none', label: 'No promotion — the prices say it' },
          ...offerTypeOptions().map((option) => ({
            value: option.key,
            label: option.labelEn,
          })),
          { value: 'custom', label: 'Something else' },
        ]}
        onChange={(event) => choose(event.target.value)}
      />

      {choice === 'custom' ? (
        <div className="flex flex-col gap-2 rounded-control border-hairline border-border-subtle p-3">
          <Input
            label="What it says"
            value={words}
            placeholder="Ramadan special"
            onChange={(event) => setWords(event.target.value)}
          />
          <Input
            label="In Arabic"
            dir="rtl"
            value={wordsAr}
            hint="Optional. Shown in Arabic editions."
            onChange={(event) => setWordsAr(event.target.value)}
          />
          <div>
            <Button
              type="button"
              variant="primary"
              loading={busy}
              disabled={words.trim() === ''}
              onClick={() =>
                void write({
                  kind: 'custom',
                  labelEn: words.trim(),
                  ...(wordsAr.trim() === '' ? {} : { labelAr: wordsAr.trim() }),
                })
              }
            >
              Use these words
            </Button>
          </div>
        </div>
      ) : null}

      {error === null ? null : (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      )}
    </Section>
  )
}

/**
 * Chips. E6 §7 — the flashes at the top of a card's z-order.
 *
 * **Not the promo tier.** The tier is the one authoring control on the price
 * mark and there is exactly one; chips are additional, and they draw stacked
 * under it in the block's chip slot.
 */
function Chips({ bookId, offer }: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [label, setLabel] = React.useState('')
  const [labelAr, setLabelAr] = React.useState('')
  const [kind, setKind] = React.useState('CUSTOM')
  const [anchor, setAnchor] = React.useState('TOP_START')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function add() {
    if (label.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/offer-books/${bookId}/offers/${offer.id}/chips`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          labelEn: label.trim(),
          labelAr: labelAr.trim() === '' ? null : labelAr.trim(),
          anchor,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? 'That chip did not save.')
        return
      }
      setLabel('')
      setLabelAr('')
      setOpen(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function remove(chipId: string) {
    setBusy(true)
    await fetch(`/api/v1/offer-books/${bookId}/offers/${offer.id}/chips/${chipId}`, {
      method: 'DELETE',
    })
    setBusy(false)
    router.refresh()
  }

  return (
    <Section title="Chips">
      {offer.chips.length === 0 && !open ? (
        <p className="font-ui text-body-sm text-muted">
          Small flashes on the card: “Limit 2”, “Product of UAE”.
        </p>
      ) : null}

      <ul className="flex flex-col">
        {offer.chips.map((chip) => (
          <li key={chip.id} className="flex min-h-row items-center justify-between gap-2">
            <span className="min-w-0 truncate font-ui text-body-sm text-secondary">
              {chip.label}
            </span>
            <Button
              type="button"
              variant="ghost"
              aria-label={`Remove the ${chip.label} chip`}
              disabled={busy}
              onClick={() => void remove(chip.id)}
            >
              <X className="size-4" aria-hidden="true" strokeWidth={2} />
            </Button>
          </li>
        ))}
      </ul>

      {open ? (
        <div className="flex flex-col gap-2 rounded-control border-hairline border-border-subtle p-3">
          <Input
            label="Chip text"
            value={label}
            placeholder="Limit 2 per customer"
            onChange={(event) => setLabel(event.target.value)}
          />
          {/* The shop's own words, so a missing Arabic version is not a publish
              blocker the way a missing product name is — but a card in an Arabic
              book reading "Limit 2" in English is worth avoiding. */}
          <Input
            label="In Arabic"
            dir="rtl"
            value={labelAr}
            hint="Optional. Shown in Arabic editions."
            onChange={(event) => setLabelAr(event.target.value)}
          />
          <Select
            label="Kind"
            value={kind}
            /*
              **No "Buy N of M" here any more.** That was this dropdown's name
              for `SCALE`, which is now the marker for the offer's mechanic and
              is written by the Offer type control above. Two ways to make one
              would mean a card could carry two, and the control above could
              not tell which it was editing.
            */
            options={[
              { value: 'CUSTOM', label: 'Anything else' },
              { value: 'COUNTER', label: 'Purchase limit' },
              { value: 'ORIGIN', label: 'Country of origin' },
              { value: 'CERT', label: 'Certification' },
              { value: 'LOYALTY', label: 'Loyalty points' },
            ]}
            onChange={(event) => setKind(event.target.value)}
          />
          <Select
            label="Corner"
            value={anchor}
            hint="Start and end follow the book's language."
            options={[
              { value: 'TOP_START', label: 'Reading-order start' },
              { value: 'TOP_END', label: 'Reading-order end' },
              { value: 'INLINE', label: 'Inside the card' },
            ]}
            onChange={(event) => setAnchor(event.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="primary" loading={busy} onClick={() => void add()}>
              Add chip
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" strokeWidth={1.75} />
          Add a chip
        </Button>
      )}

      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}
    </Section>
  )
}

/**
 * Footnotes. E6 §8.
 *
 * **No number is shown here, and that is the rule rather than an omission.**
 * Markers are assigned at render time in reading order, so an Arabic edition
 * numbers right-to-left from the same rows. A number in this panel would be a
 * second answer that can disagree with the printed one.
 */
function Footnotes({ bookId, offer }: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState('')
  const [textAr, setTextAr] = React.useState('')
  const [scope, setScope] = React.useState('PAGE')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function add() {
    if (text.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/offer-books/${bookId}/offers/${offer.id}/footnotes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          textEn: text.trim(),
          textAr: textAr.trim() === '' ? null : textAr.trim(),
          scope,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? 'That note did not save.')
        return
      }
      setText('')
      setTextAr('')
      setOpen(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function remove(noteId: string) {
    setBusy(true)
    await fetch(`/api/v1/offer-books/${bookId}/offers/${offer.id}/footnotes/${noteId}`, {
      method: 'DELETE',
    })
    setBusy(false)
    router.refresh()
  }

  return (
    <Section title="Notes">
      {offer.footnotes.length === 0 && !open ? (
        <p className="font-ui text-body-sm text-muted">
          Small print: “While stocks last”. Numbered automatically when the book
          is drawn.
        </p>
      ) : null}

      <ul className="flex flex-col">
        {offer.footnotes.map((note) => (
          <li key={note.id} className="flex min-h-row items-center justify-between gap-2">
            <span className="min-w-0 truncate font-ui text-body-sm text-secondary">
              {note.text}
              <span className="text-muted">
                {note.scope === 'BOOK' ? ' · terms page' : ' · this page'}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              aria-label={`Remove the note ${note.text}`}
              disabled={busy}
              onClick={() => void remove(note.id)}
            >
              <X className="size-4" aria-hidden="true" strokeWidth={2} />
            </Button>
          </li>
        ))}
      </ul>

      {open ? (
        <div className="flex flex-col gap-2 rounded-control border-hairline border-border-subtle p-3">
          <Input
            label="Note"
            value={text}
            placeholder="While stocks last"
            onChange={(event) => setText(event.target.value)}
          />
          <Input
            label="In Arabic"
            dir="rtl"
            value={textAr}
            hint="Optional. Shown in Arabic editions."
            onChange={(event) => setTextAr(event.target.value)}
          />
          <Select
            label="Where it appears"
            value={scope}
            options={[
              { value: 'PAGE', label: 'At the foot of this page' },
              { value: 'BOOK', label: 'On the terms page at the end' },
            ]}
            onChange={(event) => setScope(event.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="primary" loading={busy} onClick={() => void add()}>
              Add note
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" strokeWidth={1.75} />
          Add a note
        </Button>
      )}

      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}
    </Section>
  )
}

/**
 * Legal lines — deposits and service fees.
 *
 * **Under the card, not as footnotes**, because they are part of the price
 * rather than a caveat about it: a customer reading `12.90` needs to know the
 * bottle deposit is on top before they get to the till, not in the small print
 * on another page.
 *
 * The whole list is sent on every change. It is at most four short strings, and
 * a patch that could only append would have no way to express a removal.
 */
function LegalLines({ bookId, offer }: Props) {
  const applyLocal = useEditorStore((state) => state.applyLocal)
  const save = useOfferSave(bookId, offer.id)
  const [draft, setDraft] = React.useState('')

  function commit(lines: string[]) {
    const previous = offer.legalLines
    applyLocal(offer.id, { legalLines: lines })
    void save({ legalLines: lines }, () => applyLocal(offer.id, { legalLines: previous }))
  }

  return (
    <Section title="Extra charges">
      <ul className="flex flex-col">
        {offer.legalLines.map((line, index) => (
          <li key={`${line}-${index}`} className="flex min-h-row items-center justify-between gap-2">
            <span className="min-w-0 truncate font-ui text-body-sm text-secondary">{line}</span>
            <Button
              type="button"
              variant="ghost"
              aria-label={`Remove ${line}`}
              onClick={() => commit(offer.legalLines.filter((_, i) => i !== index))}
            >
              <X className="size-4" aria-hidden="true" strokeWidth={2} />
            </Button>
          </li>
        ))}
      </ul>

      {offer.legalLines.length < 4 ? (
        <Input
          label="Add a charge"
          value={draft}
          placeholder="Plus 0.50 bottle deposit"
          hint="Printed under the price. Press enter to add."
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            const line = draft.trim()
            if (line === '') return
            commit([...offer.legalLines, line])
            setDraft('')
          }}
        />
      ) : null}
    </Section>
  )
}

/**
 * What each product is called *in this book*, and in what order.
 *
 * **Overrides write to `offer_items`, never back to the catalog.** The catalog
 * is shared with every other account: a name corrected for one week's headline
 * would follow the product everywhere and outlive the flyer it was written for.
 * Clearing a box restores the catalog's own name rather than blanking the card.
 *
 * The connector belongs to the *slot*, not to the product — "A or B" reordered
 * is "B or A" — so moving a product never asks the owner to choose the joining
 * word again. `moveItem` in the API is where that holds.
 */
function ItemDetails({ bookId, offer }: Props) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function patch(itemId: string, body: Record<string, unknown>, refresh = true) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/v1/offer-books/${bookId}/offers/${offer.id}/items/${itemId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      if (!res.ok) {
        const failed = await res.json().catch(() => null)
        setError(failed?.error?.message ?? 'That did not save. Try again.')
        return
      }
      if (refresh) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Names on this card">
      <ul className="flex flex-col gap-3">
        {offer.items.map((item, index) => (
          <li key={item.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-ui text-label font-medium text-primary">
                {item.name}
              </span>
              {offer.items.length > 1 && index > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Move ${item.name} earlier on the card`}
                  onClick={() => void patch(item.id, { position: index - 1 })}
                >
                  Move up
                </Button>
              ) : null}
            </div>

            {index > 0 ? (
              <Select
                label="Joined by"
                value={item.connector ?? 'OR'}
                disabled={busy}
                options={[
                  { value: 'OR', label: 'or' },
                  { value: 'AND', label: 'and' },
                ]}
                onChange={(event) => void patch(item.id, { connector: event.target.value })}
              />
            ) : null}

            {/* Keyed by item id so the boxes re-seed when the selection moves.
                Uncontrolled otherwise: a controlled field that saves on blur
                fights the owner mid-word on every keystroke. */}
            <Input
              key={`${item.id}-name-en`}
              label="Name in this book"
              defaultValue={item.nameOverrideEn ?? ''}
              placeholder={item.name}
              hint="Leave empty to use the catalog's own name."
              disabled={busy}
              onBlur={(event) =>
                void patch(item.id, { nameOverrideEn: event.target.value.trim() || null }, false)
              }
            />
            <Input
              key={`${item.id}-name-ar`}
              label="Arabic name in this book"
              dir="rtl"
              defaultValue={item.nameOverrideAr ?? ''}
              disabled={busy}
              onBlur={(event) =>
                void patch(item.id, { nameOverrideAr: event.target.value.trim() || null }, false)
              }
            />
            <Input
              key={`${item.id}-spec-en`}
              label="Size or spec in this book"
              defaultValue={item.specOverrideEn ?? ''}
              disabled={busy}
              onBlur={(event) =>
                void patch(item.id, { specOverrideEn: event.target.value.trim() || null }, false)
              }
            />
          </li>
        ))}
      </ul>

      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}
    </Section>
  )
}
