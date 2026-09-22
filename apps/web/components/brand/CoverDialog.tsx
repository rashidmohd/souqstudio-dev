'use client'

import * as React from 'react'
import {
  COVER_SHAPES,
  COVER_SHAPE_NOTE,
  COVER_SHAPE_RATIO,
  COVER_STYLES,
  COVER_STYLE_COPY,
  type CoverShape,
  type CoverStyle,
} from '@souqstudio/engine'
import { Image as ImageIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MachineOutput } from '@/components/ui/machine-output'
import { uploadArtwork } from '@/lib/upload-artwork'

/**
 * Generate a cover from the shop's own character and its own shop. E8-04.
 *
 * **It draws from what the shop already has.** The first build asked only for a
 * campaign and drew an abstract graphic, because the spec had the character
 * composited on afterwards by E9 — and since nothing composites anything yet,
 * what an owner got was a generic background with their mascot nowhere in it.
 * The character and the store photographs are references now, so the cover is
 * of *their* shop the first time they see it.
 *
 * **Both sources are optional and neither is offered blind.** `covers/sources`
 * says what exists; a shop with no character is not asked whether to use one,
 * because an option that fails on click is worse than an absent one.
 *
 * **The campaign list is the pre-written half.** An owner picks an occasion
 * rather than writing a prompt, and "describe it yourself" is there for the one
 * they did not think of — the same shape `CharacterFlow` uses for its styles.
 *
 * **Still no text in the picture, and that has not changed.** A model asked to
 * render a shop's name produces misspelled words in a typeface nobody chose, so
 * the name and the logo are typed in the editor on top of this.
 *
 * **It lives beside "Upload" rather than in the brand kit or the create flow.**
 * `PageBackgroundControl` already turns an R2 key into `{ from: 'asset' }`, and
 * a generated cover is stored at `{org}/{shop}/covers/…` — which satisfies the
 * background route's org-prefix tenancy check without a line of change. The
 * alternative placements both needed somewhere new to put the result: the create
 * flow would have to carry the key in `offer_book_drafts` until the book exists,
 * and a brand-kit library would need a table. This needed neither, and it works
 * on a book an owner already has rather than only on the next one they start.
 *
 * **A cover is kept, not applied.** This screen makes brand assets: a cover is
 * generated once, kept, and picked from the editor whenever a book wants it.
 * The first build applied it straight to the page an owner happened to be on,
 * which meant the same shop paid five credits again the next week for the same
 * Ramadan cover.
 *
 * **And every one of them is kept, by the worker, without being asked.** What
 * this screen shows after a generation is a receipt rather than a decision —
 * see `Phase`. The two consequences are that closing the tab mid-draw no longer
 * loses the work, and that the two options an owner did not tick are no longer
 * paid-for pictures nothing points at.
 */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once a kept cover has been written, so the library can reload. */
  onKept: () => void
}

/**
 * One attached reference: its key for the server, its preview for this screen.
 *
 * **The preview is the local file, not a fetch.** `uploadArtwork` hands back an
 * R2 key and nothing else, and turning that into a URL needs `R2_PUBLIC_URL`,
 * which is a server variable — making it public to draw a thumbnail would put a
 * deployment detail in the browser bundle for good. The bytes are already in
 * hand here, so an object URL costs nothing and shows the real file.
 */
type Attached = { key: string; preview: string }

/** What each person choice means, shown as the select's hint. */
const PERSON_HINT: Readonly<Record<CoverPerson, string>> = {
  staff: 'Your own shop worker, kept the same across covers',
  customer: 'A shopper, invented fresh for this cover',
  none: 'The shop and the goods alone',
}

type Option = { url: string; key: string }
type Character = { id: string; baseImageUrl: string; style: string }
type StorePhoto = { key: string; url: string }
type CoverPerson = 'staff' | 'customer' | 'none'
type Prompt = {
  slug: string
  label: string
  hint: string | null
  group: string
  person: CoverPerson
}
type Sources = {
  prompts: Prompt[]
  characters: Character[]
  storePhotos: StorePhoto[]
  /** The brand kit's logo, or null when there is none a cover could be drawn from. */
  logoUrl: string | null
}

/**
 * **Three phases, and no ticking step between them.**
 *
 * `picking` used to sit where `saved` is: three thumbnails, a checkbox each and
 * a Keep button that wrote only what was ticked. The covers are written by the
 * worker now, the moment they are drawn — so what was a decision is a result,
 * and this screen shows the owner what they already own rather than asking them
 * to rescue it from a grid of squares.
 */
type Phase =
  | { at: 'asking'; error?: string }
  | { at: 'drawing' }
  | { at: 'saved'; options: Option[]; withCharacter: boolean }

export function CoverDialog({ open, onOpenChange, onKept }: Props) {
  const [promptSlug, setPromptSlug] = React.useState<string>('custom')
  const [person, setPerson] = React.useState<CoverPerson>('staff')
  const [style, setStyle] = React.useState<CoverStyle>('photographic')
  /**
   * **Asked here, where it was derived in the editor.** There is no page in
   * front of an owner on this screen, so nothing can infer it — and a cover kept
   * at the wrong shape is cropped to a sliver the week they use it. The picker
   * in the editor is what warns when a kept cover does not suit the page.
   */
  const [shape, setShape] = React.useState<CoverShape>('portrait')
  /**
   * Seconds since the drawing started, shown on the processing screen.
   *
   * **Because a minute with no clock on it is a minute an owner assumes is
   * broken.** The panel used to be the form with a spinner on its own button,
   * which said an action was in flight and nothing about how long it would be
   * in flight for — and a provider that takes fifty seconds looks identical to
   * one that has hung.
   */
  const [elapsed, setElapsed] = React.useState(0)
  /**
   * The advanced half: images the owner attaches for this cover alone.
   *
   * **Not the shop photographs.** Those are a standing fact about the shop and
   * live on its profile; these are "make it look like this", attached once and
   * belonging to nothing. Keeping them apart is what lets the prompt say
   * different things about them — the room is taken from one, the treatment
   * from the other.
   */
  const [references, setReferences] = React.useState<Attached[]>([])
  const [uploading, setUploading] = React.useState(false)
  const [advanced, setAdvanced] = React.useState(false)
  const referenceInput = React.useRef<HTMLInputElement>(null)
  const [described, setDescribed] = React.useState('')
  const [phase, setPhase] = React.useState<Phase>({ at: 'asking' })
  const [sources, setSources] = React.useState<Sources | null>(null)
  const [characterId, setCharacterId] = React.useState<string | null>(null)
  const [useScene, setUseScene] = React.useState(true)
  /**
   * Print the logo on a bag in the picture.
   *
   * **Off, unlike `useScene`.** Setting a cover in the owner's own shop is
   * better than a generic one every time, so that one is on. This is a trade: a
   * mark redrawn by a model is approximate, and a logo with words in it comes
   * back misspelled. The label says so rather than leaving an owner to discover
   * it on a cover they already paid for.
   */
  const [useLogo, setUseLogo] = React.useState(false)

  /**
   * What this shop has to draw from, read when the dialog opens.
   *
   * **Not on mount.** The editor renders this component for every page whether
   * or not anybody opens it, and a request per page load to answer a question
   * nobody asked is a request that should not happen.
   */
  React.useEffect(() => {
    if (!open || sources !== null) return
    let live = true
    void read<Sources>('/api/v1/covers/sources')
      .then((found) => {
        if (!live) return
        setSources(found)
        // The first row an admin ordered, so the picker opens on something
        // real rather than on the free-text option.
        setPromptSlug(found.prompts[0]?.slug ?? 'custom')
        setPerson(found.prompts[0]?.person ?? 'staff')
        // The newest character, pre-selected. A shop that made one wants it in
        // the cover — that is the whole reason they made it.
        setCharacterId(found.characters[0]?.id ?? null)
      })
      // A sources read that fails leaves both options simply unoffered, which
      // still generates a cover. It is not worth an error message.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [open, sources])

  /**
   * Reset on open, not on close.
   *
   * Closing mid-draw must not throw the work away — the job is queued, the
   * credits are spent, and the bell in the rail is what brings it back. Clearing
   * here means the next opening starts clean without this dialog deciding that
   * an in-flight generation is over.
   */
  React.useEffect(() => {
    if (open) setPhase({ at: 'asking' })
  }, [open])

  /**
   * The clock on the processing screen.
   *
   * Keyed on the phase rather than on a timestamp in it: one interval exists
   * while the drawing does, and it is cleared the moment the phase changes —
   * including when the dialog closes mid-draw, which does not cancel the job.
   */
  React.useEffect(() => {
    if (phase.at !== 'drawing') return
    setElapsed(0)
    const ticking = setInterval(() => setElapsed((was) => was + 1), 1000)
    return () => clearInterval(ticking)
  }, [phase.at])

  async function attach(files: File[]) {
    setUploading(true)
    try {
      const room = 4 - references.length
      const taking = files.slice(0, room)
      const uploaded = await Promise.all(
        taking.map(async (file) => {
          const key = await uploadArtwork(file)
          return key === null ? null : { key, preview: URL.createObjectURL(file) }
        })
      )
      setReferences((was) => [
        ...was,
        ...uploaded.filter((one): one is Attached => one !== null),
      ])
    } finally {
      setUploading(false)
    }
  }

  async function generate() {
    setPhase({ at: 'drawing' })
    try {
      const withCharacter = person === 'staff' && characterId !== null
      const referenceKeys = references.map((attached) => attached.key)
      const queued = await post<{ jobId: string }>('/api/v1/covers/generate', {
        promptSlug,
        shape,
        style,
        person,
        useScene: useScene && hasPhotos,
        useBrandLogo: useLogo && hasLogo,
        ...(referenceKeys.length === 0 ? {} : { referenceKeys }),
        ...(person === 'staff' && characterId !== null ? { characterId } : {}),
        ...(promptSlug === 'custom' ? { described: described.trim() } : {}),
      })
      const options = await poll(queued.jobId)
      /**
       * **Reloaded before the covers are shown, not after a Keep click.** The
       * worker writes the rows before it marks the job complete, so by the time
       * `poll` returns they exist — and the library behind this dialog is stale
       * until something says so. An owner who closes this screen without reading
       * it still finds all three waiting for them.
       */
      onKept()
      setPhase({ at: 'saved', options, withCharacter })
    } catch (error) {
      setPhase({ at: 'asking', error: message(error) })
    }
  }

  const ready = promptSlug !== 'custom' || described.trim().length >= 3
  const prompts = sources?.prompts ?? []
  const characters = sources?.characters ?? []
  const storePhotos = sources?.storePhotos ?? []
  const hasPhotos = storePhotos.length > 0
  const hasLogo = (sources?.logoUrl ?? null) !== null

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate a cover"
      description="Drawn from your character, your shop and your colours. Your name goes on top in the editor, not in the picture."
      size="lg"
    >
      {phase.at === 'drawing' ? (
        /*
          **A screen of its own, not a spinner on a button.**

          The design system's loading ladder puts a spinner on the pressed
          control up to a second and skeletons above that; this is a minute of
          third-party image generation, which is the far end of the ladder. The
          form was left on screen with every control disabled — thirty greyed
          selects an owner cannot use and cannot leave, which reads as a jammed
          page rather than as work in progress.

          **The placeholders are the shape of what is coming**, three of them at
          the chosen ratio, so nothing moves when the covers land in their place.
        */
        <div
          className="flex flex-col gap-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-2">
            <Loader2
              className="size-4 animate-spin text-secondary"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="font-ui text-body text-primary">
              Drawing <span data-figure>3</span> covers in your brand colours…
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((slot) => (
              <div
                key={slot}
                aria-hidden="true"
                className="w-full animate-pulse rounded-card bg-stone-100"
                style={{ aspectRatio: COVER_SHAPE_RATIO[shape].css }}
              />
            ))}
          </div>

          <p className="font-ui text-body-sm text-secondary">
            This takes about a minute, <span data-figure>{elapsed}s</span> so far. You can close
            this and carry on: the covers are saved to your brand kit either way, and finished
            work is in the bell at the top of the rail.
          </p>
        </div>
      ) : phase.at === 'saved' ? (
        <MachineOutput
          label={
            phase.withCharacter
              ? 'Drawn from your character and your shop'
              : 'Drawn from your brand colours'
          }
        >
        <div className="flex flex-col gap-3">
          <p className="font-ui text-body-sm text-secondary">
            <span data-figure>{phase.options.length}</span> covers,{' '}
            {COVER_SHAPE_NOTE[shape].toLowerCase()}. They are in your covers already, you paid
            for all of them, so you keep all of them, and any book can use them.
          </p>

          {/*
            **Shown at the ratio they were drawn at.** A cover squeezed into a
            square thumbnail is a different picture from the one the owner will
            put on a page: the top third the prompt keeps clear for their name is
            exactly what a square crop eats.
          */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {phase.options.map((option) => (
              <div
                key={option.key}
                className="overflow-hidden rounded-card border border-default bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={option.url}
                  alt="Generated cover"
                  className="block w-full object-cover"
                  style={{ aspectRatio: COVER_SHAPE_RATIO[shape].css }}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPhase({ at: 'asking' })}>
              Make another
            </Button>
          </div>
        </div>
        </MachineOutput>
      ) : (
        <div className="flex flex-col gap-4">
          {/*
            **Selects rather than cards, because there are thirty-one choices.**
            The card grids read well one at a time and stacked four deep they
            were a page of scrolling before the Generate button — an owner had to
            hunt for the thing they came to press. The description each card
            carried is not lost: it is the selected option's hint under the
            select, which is where one answer belongs rather than eighteen.
          */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Who is in it?"
              value={person}
              options={[
                {
                  value: 'staff',
                  label: 'Your character',
                  ...(characters.length === 0 ? { disabled: true } : {}),
                },
                { value: 'customer', label: 'A customer' },
                { value: 'none', label: 'Nobody' },
              ]}
              onChange={(event) => setPerson(event.target.value as CoverPerson)}
              hint={PERSON_HINT[person]}
            />

            {/*
              **The occasions come from the server**, because they are rows in
              `cover_prompts` that get tuned against what the model sends back.
              A list compiled in here would drift from them the first time
              somebody edited one.
            */}
            <Select
              label="What is this cover of?"
              value={promptSlug}
              options={[
                ...prompts.map((option) => ({ value: option.slug, label: option.label })),
                { value: 'custom', label: 'Describe it yourself' },
              ]}
              onChange={(event) => {
                const slug = event.target.value
                setPromptSlug(slug)
                // **The scene answers who is in it, and the owner may still
                // disagree.** A staff member pushing a full trolley of shopping
                // is not a picture of anything; nobody but staff stands behind
                // the meat counter.
                const chosen = prompts.find((option) => option.slug === slug)
                if (chosen !== undefined) setPerson(chosen.person)
              }}
              hint={prompts.find((option) => option.slug === promptSlug)?.hint ?? undefined}
            />

            <Select
              label="How should it look?"
              value={style}
              options={COVER_STYLES.map((option) => ({
                value: option,
                label: COVER_STYLE_COPY[option].label,
              }))}
              onChange={(event) => setStyle(event.target.value as CoverStyle)}
              hint={COVER_STYLE_COPY[style].note}
            />

            <Select
              label="What size?"
              value={shape}
              options={COVER_SHAPES.map((option) => ({
                value: option,
                label: COVER_SHAPE_RATIO[option].label,
              }))}
              onChange={(event) => setShape(event.target.value as CoverShape)}
              hint={COVER_SHAPE_NOTE[shape]}
            />
          </div>

          {promptSlug === 'custom' ? (
            <Textarea
              label="Describe the cover you want"
              rows={3}
              maxLength={200}
              value={described}
              onChange={(event) => setDescribed(event.target.value)}
              hint="Where it is and what is happening, not the words on it. Those are typed in the editor."
            />
          ) : null}

          {person === 'staff' && characters.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="font-ui text-label text-primary">Which character?</legend>
              {/* A grid with `aspect-square w-full`, as `CharacterGallery`
                  sizes its thumbnails. The size scale is replaced rather than
                  extended here, so a fixed `size-*` that is not a token is a
                  valid class name that styles nothing — `check:classes` caught
                  exactly that on the first draft of this. */}
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {characters.map((character) => {
                  const chosen = character.id === characterId
                  return (
                    <button
                      key={character.id}
                      type="button"
                      aria-pressed={chosen}
                      className={`overflow-hidden rounded-card border bg-surface p-1 ${
                        chosen ? 'border-action-primary-bg' : 'border-default'
                      }`}
                      onClick={() => setCharacterId(chosen ? null : character.id)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={character.baseImageUrl}
                        alt={`${character.style} character`}
                        className="block aspect-square w-full object-contain"
                      />
                    </button>
                  )
                })}
              </div>
              <p className="font-ui text-body-sm text-secondary">
                Drawn into the cover, kept the same as the one you made.
              </p>
            </fieldset>
          ) : null}

          {hasPhotos ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={useScene}
                onChange={(event) => setUseScene(event.target.checked)}
                className="mt-1"
              />
              <span className="font-ui text-body-sm text-primary">
                Set it in my shop
                <span className="block text-secondary">
                  Uses the{' '}
                  <span data-figure>{storePhotos.length}</span>
                  {storePhotos.length === 1 ? ' photo' : ' photos'} from your shop settings, so the
                  shelves and the counter are yours rather than invented.
                </span>
              </span>
            </label>
          ) : null}

          {hasLogo ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={useLogo}
                onChange={(event) => setUseLogo(event.target.checked)}
                className="mt-1"
              />
              <span className="font-ui text-body-sm text-primary">
                Put my logo on the bag
                <span className="block text-secondary">
                  Draws your logo onto a shopping bag in the picture, so it is part of the
                  photo rather than placed over it. It is redrawn by the model, so a logo
                  with words in it can come back with the letters wrong. Leave this off to
                  put your logo on in the editor instead, where it stays exact.
                </span>
              </span>
            </label>
          ) : null}


          {/*
            **Advanced, and folded away, because most covers do not need it.**
            Four references is the ceiling: past that a provider weights the
            earliest ones and quietly ignores the rest, which reads to an owner
            as the feature not working.
          */}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAdvanced((was) => !was)}
            >
              {advanced ? 'Hide reference images' : 'Add reference images'}
            </Button>

            {advanced ? (
              <div className="flex flex-col gap-2">
                <p className="font-ui text-body-sm text-secondary">
                  Attach up to <span data-figure>4</span> pictures of the look you want. We take
                  the colours, the light and the arrangement from them, not their contents, and
                  never anything branded in them.
                </p>

                {references.length > 0 ? (
                  <ul className="grid grid-cols-4 gap-2">
                    {references.map((attached) => (
                      <li
                        key={attached.key}
                        className="overflow-hidden rounded-card border border-default"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={attached.preview}
                          alt=""
                          className="block aspect-square w-full object-cover"
                        />
                        <button
                          type="button"
                          className="block w-full p-1 font-ui text-body-sm text-secondary hover:text-primary"
                          onClick={() => {
                            // The object URL is this component's to release —
                            // the browser holds the blob until it is revoked.
                            URL.revokeObjectURL(attached.preview)
                            setReferences((was) =>
                              was.filter((other) => other.key !== attached.key)
                            )
                          }}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    loading={uploading}
                    disabled={references.length >= 4}
                    onClick={() => referenceInput.current?.click()}
                  >
                    <ImageIcon className="size-4" aria-hidden="true" strokeWidth={1.75} />
                    {references.length === 0 ? 'Choose images' : 'Add another'}
                  </Button>
                </div>

                <input
                  ref={referenceInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    const chosen = [...(event.target.files ?? [])]
                    // Cleared so picking the same file again still fires.
                    event.target.value = ''
                    if (chosen.length > 0) void attach(chosen)
                  }}
                />
              </div>
            ) : null}
          </div>

          <p className="font-ui text-body-sm text-secondary">
            Drawn in your brand colours. <span data-figure>3</span> covers for{' '}
            <span data-figure>5</span> credits, and all three are saved to your covers.
          </p>

          {phase.error ? (
            <p className="font-ui text-body-sm text-critical-fg" role="alert">
              {phase.error}
            </p>
          ) : null}

          <div>
            <Button type="button" disabled={!ready} onClick={() => void generate()}>
              Generate
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

/**
 * Wait for the job, or say why not.
 *
 * The same shape `CharacterFlow` polls with, against the one `ai/jobs` route
 * every AI feature shares. Five minutes, because a cold image provider drawing
 * three options is slower than anything else in the product and a deadline that
 * fires early tells an owner their credits vanished.
 */
async function poll(jobId: string): Promise<Option[]> {
  const deadline = Date.now() + 5 * 60 * 1000

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error('That is taking longer than it should. Check the bell in a minute. It will be there.')
    }

    await new Promise((resolve) => setTimeout(resolve, 2500))

    const job = await read<{
      status: string
      errorMessage: string | null
      result: { options?: Option[]; notes?: string[] } | null
    }>(`/api/v1/ai/jobs/${jobId}`)

    if (job.status === 'failed') {
      if (job.errorMessage === 'image_generation_off') {
        throw new Error('Image generation is not switched on for this environment yet.')
      }
      if (job.errorMessage === 'image_refused') {
        throw new Error(
          job.result?.notes?.[0] ??
            'The drawing service would not make that one. Try a different campaign.'
        )
      }
      throw new Error('That did not finish. You were not charged. Try again.')
    }

    if (job.status !== 'complete') continue

    const options = job.result?.options ?? []
    if (options.length === 0) throw new Error('That did not finish. You were not charged.')
    return options
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  return unwrap<T>(
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

async function read<T>(url: string): Promise<T> {
  return unwrap<T>(await fetch(url))
}

async function unwrap<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as {
    data: T | null
    error: { code: string; message: string } | null
  } | null

  if (body?.error) throw new Error(body.error.message)
  if (!response.ok || body?.data === null || body?.data === undefined) {
    throw new Error('That did not work. Try again.')
  }
  return body.data
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'That did not work. Try again.'
}
