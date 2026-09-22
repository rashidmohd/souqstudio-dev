'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { callApi } from '@/lib/api-client'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { OfferDetails } from '@/components/editor/OfferDetails'
import { SlotAdjust } from '@/components/editor/SlotAdjust'
import { moveOffer, removeOffer } from '@/lib/editor-actions'
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
              <li key={flag} className="flex flex-col gap-1 font-ui text-body-sm text-caution-fg">
                {FLAG_TEXT[flag]}
                {/*
                 * **The fix beside the problem it fixes.** E8-05 specified a
                 * manual background removal and nothing had it, so a flag that
                 * says the cutout is not ready has, until now, been a statement
                 * with nothing to do about it. This is the only screen that ever
                 * tells an owner the photo still has its background.
                 */}
                {flag === 'fallback-image' && offer.fallbackImageProductId !== null ? (
                  <RemoveBackground
                    productId={offer.fallbackImageProductId}
                    // What the toast calls it, captured now: the card may not
                    // be selected by the time the cutout lands.
                    name={offer.name}
                    shared={offer.fallbackImageIsShared}
                  />
                ) : null}
                {/*
                 * **The catalog can name a product it cannot picture**, which
                 * is the common case rather than the edge one — only a small
                 * share of rows carry a packshot. So this flag was the most
                 * frequent thing the panel said and the only one with nothing
                 * to do about it.
                 */}
                {flag === 'no-image' && offer.missingImageProductId !== null ? (
                  <AddPhoto productId={offer.missingImageProductId} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <OfferActions bookId={bookId} offer={offer} />
    </div>
  )
}

/**
 * What an owner can do to the card they have selected, rather than to one of
 * its fields.
 *
 * **This is where selecting a card on the artboard stops being a dead end.**
 * Clicking a cell has selected its offer since E6-02 and every action then
 * lived across the screen in the tray, matched to the card by its ordinal
 * number — which is precisely the translation an artboard exists to remove. The
 * tray keeps its own controls; it is a list, and a list is where you act on
 * things you have not got in front of you.
 *
 * **Persistent controls, not a context menu.** The design skill is explicit
 * that every hover-revealed affordance needs a persistent equivalent because
 * the editor ships on tablet, so these are buttons in the panel. A right-click
 * menu over the artboard is a reasonable *accelerator* on top of this and is
 * written up in `docs/E6-pending.md`; it is not a home for actions that exist
 * nowhere else.
 *
 * **Remove has no confirmation and that is the system's rule, not a shortcut.**
 * The design skill → Destructive actions: a toast with Undo beats a dialog for
 * anything reversible, and removing a product is the example it gives. What
 * makes it reversible is `POST .../restore` and the snapshot the delete hands
 * back — see `lib/offer-snapshot.ts`.
 */
function OfferActions({ bookId, offer }: { bookId: string; offer: ComposedOffer }) {
  const router = useRouter()
  const order = useEditorStore((state) => state.order)
  const select = useEditorStore((state) => state.select)
  const [busy, setBusy] = React.useState(false)

  const index = order.indexOf(offer.id)

  async function run(action: () => Promise<boolean>) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t-hairline border-border-subtle pt-3">
      <span className="font-ui text-label font-medium text-primary">This card</span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || index <= 0}
          onClick={() =>
            void run(() => moveOffer({ bookId, offerId: offer.id, by: -1, refresh: () => router.refresh() }))
          }
        >
          <ChevronUp className="size-4" aria-hidden="true" strokeWidth={2} />
          Earlier
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || index === -1 || index === order.length - 1}
          onClick={() =>
            void run(() => moveOffer({ bookId, offerId: offer.id, by: 1, refresh: () => router.refresh() }))
          }
        >
          <ChevronDown className="size-4" aria-hidden="true" strokeWidth={2} />
          Later
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const removed = await removeOffer({
                bookId,
                offerId: offer.id,
                name: offer.name,
                refresh: () => router.refresh(),
              })
              // The panel is about to be describing an offer that is not in the
              // book. Clearing the selection is what closes it — and undo
              // re-selects the card it puts back, so the way in survives.
              if (removed) select(null)
              return removed
            })
          }
        >
          <Trash2 className="size-4" aria-hidden="true" strokeWidth={2} />
          Remove from book
        </Button>
      </div>
      {/* The consequence, said before it happens rather than after. Every offer
          after this one moves up a cell, which an owner otherwise reads as the
          book rearranging itself. */}
      <p className="font-ui text-body-sm text-muted">
        Removing a card moves every offer after it along by one.
      </p>
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

/**
 * Ask for the background to be removed from this product's photo. E8-05.
 *
 * **One credit, said before the press rather than after.** The cost is in the
 * label because this is the one paid action in the editor, and an owner who
 * clicks it is several screens away from the billing page.
 *
 * **It queues and says so; it does not block.** Rembg takes seconds and may be
 * down entirely, in which case the product keeps its original photo and nothing
 * is charged — so there is no outcome worth holding the panel open for.
 *
 * **But something has to go back and look, and it is not this.** A single
 * `router.refresh()` on the 202 refreshed the page as it was *before* the
 * worker had run, so the panel promised a cutout in a moment and nothing made
 * it appear. Waiting here would have been just as wrong: this component lives
 * in the selected offer's flag list, and an owner who queues a removal and
 * clicks the next card unmounts the wait along with the button. `CutoutWatch`
 * holds it for the whole book and raises the toast that reports it.
 *
 * What is left here is the press and what it looks like from the selected card:
 * `cutoutPending` is the store's answer to "is one in flight for this product",
 * so returning to the card mid-job says so rather than offering to pay again.
 *
 * **On a shared catalog photo it asks first, and this is the one case that
 * earns a dialog.** The design system prefers undo over confirm and reserves
 * dialogs for the irreversible; both halves here are. A credit is spent, and
 * the cutout is offered to every other shop using this product once a reviewer
 * accepts it — an owner who learns that afterwards has already published
 * somebody's photo on their behalf. On their *own* photo none of that is true
 * and the button simply runs.
 */
function RemoveBackground({
  productId,
  name,
  shared,
}: {
  productId: string
  name: string
  shared: boolean
}) {
  const startCutout = useEditorStore((state) => state.startCutout)
  const queued = useEditorStore((state) =>
    state.cutoutPending.some((pending) => pending.productId === productId)
  )
  const [state, setState] = React.useState<'idle' | 'working' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [asking, setAsking] = React.useState(false)

  async function run() {
    setAsking(false)
    setState('working')
    setError(null)

    /**
     * **`callApi`, because the hand-rolled version reported a failure as a
     * success.** It read `body.error` off `response.json().catch(() => null)`
     * and never looked at `response.ok` — so a route that threw, and was
     * therefore rendered by Next as an HTML error page, parsed to `null`, found
     * no `error` key, and took the silence for a queued job. The panel then
     * said the cutout was on its way, nothing was enqueued, and pressing again
     * did the same thing again.
     *
     * `lib/api-client.ts` was written for exactly this and `AddPhoto` below
     * already used it. This is the copy that was missed.
     */
    const queued = await callApi<{ queued: boolean }>(
      `/api/v1/catalog/products/${productId}/cutout`,
      { method: 'POST', fallback: 'We could not start that background removal.' }
    )

    if (queued.data === null) {
      setState('error')
      setError(queued.error)
      return
    }

    setState('idle')
    // Handed over. The cutout lands as an `image_assets` row the page
    // re-reads, and `CutoutWatch` is what goes back for it.
    startCutout({ productId, name, shared, startedAt: Date.now() })
  }

  if (queued) {
    return (
      <span className="font-ui text-body-sm text-secondary">
        Removing the background. It appears here in a moment.
        {shared ? ' Other shops get it once we have checked it.' : ''}
      </span>
    )
  }

  return (
    <span className="flex flex-col gap-1">
      <Button
        type="button"
        variant="ghost"
        loading={state === 'working'}
        onClick={() => (shared ? setAsking(true) : void run())}
      >
        Remove the background, <span data-figure>1</span> credit
      </Button>
      {error === null ? null : (
        <span className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </span>
      )}
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title="This is a shared catalog photo"
        /*
         * Their flyer first, because that is what they came for and what
         * happens immediately; the catalog second, because it is the part they
         * would not have guessed. The cost last — the button already said it,
         * and repeating it as the headline would read like a warning about a
         * single credit rather than about the photo.
         */
        description="We will make your own cut-out of it. Your books use it straight away, and other shops using this product get it once we have checked it."
        primaryAction={{ label: 'Remove the background', onClick: () => void run() }}
        secondaryAction={{ label: 'Cancel', onClick: () => setAsking(false) }}
      >
        {/* The cost as a body line rather than inside `description`, because
            the figure rule needs an element to mark and a string prop has
            nowhere to put one. */}
        <p className="font-ui text-body text-secondary">
          It costs <span data-figure>1</span> credit.
        </p>
      </Dialog>
    </span>
  )
}

/**
 * Supply the photo this product does not have.
 *
 * **Three steps, the middle one going nowhere near a route.** The server
 * presigns a PUT, the bytes go browser → R2, and only then does a route hear
 * about it — the same handshake `uploadArtwork` documents, and for the same
 * reason: a serverless function caps its body well below what a phone camera
 * produces, so proxying would reject good photos with a platform error the
 * owner can do nothing about.
 *
 * **It says who else will see it, before the press.** On a universal catalog
 * product the photo is contributed: this shop's books use it immediately and
 * every other shop gets it once a reviewer accepts it. That is worth one line
 * of copy, because "add a photo" reads like a private act and this one is not.
 *
 * Like `RemoveBackground` it queues the cutout and does not wait. The refresh
 * brings the ORIGINAL in; the cutout replaces it a moment later on its own.
 */
function AddPhoto({ productId }: { productId: string }) {
  const router = useRouter()
  const file = React.useRef<HTMLInputElement>(null)
  const [state, setState] = React.useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  /** Whether the photo went onto a shared catalog row. Only known after. */
  const [shared, setShared] = React.useState(false)

  async function upload(chosen: File) {
    setState('working')
    setError(null)

    /*
     * **Each step names itself in its own failure.** Three requests to three
     * different places fail in three different ways, and "that did not work"
     * across all of them is a message that cannot be acted on by the owner or
     * debugged by us. `callApi` never throws and never surfaces a parse error,
     * so there is no `catch` here to leak one.
     */

    // 1. Authorise. The key is built from the session, never from the client.
    const granted = await callApi<{ uploadUrl: string; key: string }>(
      '/api/v1/catalog/upload-url',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: chosen.type, contentLength: chosen.size }),
        fallback: 'We could not start that upload.',
      }
    )
    if (granted.data === null) {
      setState('error')
      setError(granted.error)
      return
    }

    // 2. The bytes, straight to the bucket. Not our route and not our envelope
    //    — R2 answers XML on failure, which is the other reason nothing here
    //    may assume a body is JSON.
    try {
      const put = await fetch(granted.data.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': chosen.type },
        body: chosen,
      })
      if (!put.ok) {
        console.error(`[upload] R2 refused the PUT: ${put.status}`, await put.text().catch(() => ''))
        setState('error')
        setError('That photo could not be stored. Try again in a moment.')
        return
      }
    } catch {
      setState('error')
      setError('That photo did not upload. Check your connection.')
      return
    }

    // 3. Record it. Nothing on the server knows the file's shape until it
    //    reads the object back, which is where it is measured and refused.
    const saved = await callApi<{ shared: boolean }>(
      `/api/v1/catalog/products/${productId}/image`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageKey: granted.data.key }),
        fallback: 'That photo uploaded but could not be added to the product.',
      }
    )
    if (saved.data === null) {
      setState('error')
      setError(saved.error)
      return
    }

    setShared(saved.data.shared)
    setState('done')
    router.refresh()
  }

  if (state === 'done') {
    return (
      <span className="font-ui text-body-sm text-secondary">
        {/*
          **Said after rather than before, because only the server knows.**
          Whether this product is the shop's own row or a shared catalog one is
          not on the composed offer, and putting it there would mean carrying a
          fact about the catalog on every card to caption one button. The
          sentence an owner needs is the same either way — the photo is on
          their flyer now — and the second half is the part worth telling them
          once it is true.
        */}
        Photo added, and your books use it now.
        {shared
          ? ' It goes to other shops using this product once we have checked it.'
          : ''}{' '}
        The cutout follows in a moment.
      </span>
    )
  }

  return (
    <span className="flex flex-col gap-1">
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const chosen = event.target.files?.[0]
          // Cleared so choosing the same file twice fires again — after a
          // failure that is exactly what an owner does.
          event.target.value = ''
          if (chosen !== undefined) void upload(chosen)
        }}
      />
      <Button
        type="button"
        variant="ghost"
        loading={state === 'working'}
        onClick={() => file.current?.click()}
      >
        Add a photo
      </Button>
      {error === null ? null : (
        <span className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}

/** What each flag means to a shop owner, rather than what it is called in code. */
const FLAG_TEXT: Record<ComposedOffer['flags'][number], string> = {
  'no-price': 'This offer has no price yet.',
  'missing-name-ar': 'This product has no Arabic name, so it cannot publish in Arabic.',
  'no-image': 'This product has no photo.',
  'fallback-image': 'This photo still has its background.',
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
      kind: 'patch',
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
      kind: 'patch',
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
      kind: 'patch',
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
