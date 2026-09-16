'use client'

import * as React from 'react'
import {
  CAMPAIGNS,
  CAMPAIGN_COPY,
  COVER_SHAPE_NOTE,
  COVER_STYLES,
  COVER_STYLE_COPY,
  type Campaign,
  type CoverShape,
  type CoverStyle,
} from '@souqstudio/engine'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { RadioCards } from '@/components/ui/radio-cards'
import { Textarea } from '@/components/ui/textarea'
import { MachineOutput } from '@/components/ui/machine-output'

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
 * **The shape is derived, never asked.** The page knows its own aspect and the
 * owner has already answered this question by choosing what they are making;
 * asking again is a second chance to get it wrong, and a story-shaped ground on
 * an A4 page is cropped to nothing by `fit: 'cover'`.
 */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The page's own aspect — width ÷ height. Decides the shape generated. */
  aspect: number
  /** Handed the R2 key of the option the owner kept. */
  onChosen: (assetId: string) => void
}

type Option = { url: string; key: string }
type Character = { id: string; baseImageUrl: string; style: string }
type StorePhoto = { key: string; url: string }
type Sources = { characters: Character[]; storePhotos: StorePhoto[] }

type Phase =
  | { at: 'asking'; error?: string }
  | { at: 'drawing' }
  | { at: 'picking'; options: Option[]; withCharacter: boolean }

/**
 * Which shape to draw, from the page's own proportions.
 *
 * The midpoints between the three: square sits at 1, portrait at ~0.71 (A4) and
 * story at ~0.56 (9:16). Anything wider than a square is still drawn square —
 * there is no landscape ground, and a square one cropped to a wide page loses
 * its top and bottom rather than its subject.
 */
export function shapeFor(aspect: number): CoverShape {
  if (aspect >= 0.86) return 'square'
  if (aspect >= 0.63) return 'portrait'
  return 'story'
}

export function CoverDialog({ open, onOpenChange, aspect, onChosen }: Props) {
  const [campaign, setCampaign] = React.useState<Campaign>('weekend')
  const [style, setStyle] = React.useState<CoverStyle>('photographic')
  const [described, setDescribed] = React.useState('')
  const [phase, setPhase] = React.useState<Phase>({ at: 'asking' })
  const [sources, setSources] = React.useState<Sources | null>(null)
  const [characterId, setCharacterId] = React.useState<string | null>(null)
  const [useScene, setUseScene] = React.useState(true)
  const shape = shapeFor(aspect)

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

  async function generate() {
    setPhase({ at: 'drawing' })
    try {
      const withCharacter = characterId !== null
      const queued = await post<{ jobId: string }>('/api/v1/covers/generate', {
        campaign,
        shape,
        style,
        useScene: useScene && hasPhotos,
        ...(withCharacter ? { characterId } : {}),
        ...(campaign === 'custom' ? { described: described.trim() } : {}),
      })
      const options = await poll(queued.jobId)
      setPhase({ at: 'picking', options, withCharacter })
    } catch (error) {
      setPhase({ at: 'asking', error: message(error) })
    }
  }

  const ready = campaign !== 'custom' || described.trim().length >= 3
  const characters = sources?.characters ?? []
  const storePhotos = sources?.storePhotos ?? []
  const hasPhotos = storePhotos.length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate a cover"
      description="Drawn from your character, your shop and your colours. Your name and logo go on top in the editor, not in the picture."
      size="lg"
    >
      {phase.at === 'picking' ? (
        <MachineOutput
          label={
            phase.withCharacter
              ? 'Drawn from your character and your shop'
              : 'Drawn from your brand colours'
          }
        >
        <div className="flex flex-col gap-3">
          <p className="font-ui text-body-sm text-secondary">
            Three covers, {COVER_SHAPE_NOTE[shape].toLowerCase()}. Choose one to put behind this
            page. Your name and logo go on top in the editor.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {phase.options.map((option) => (
              <button
                key={option.key}
                type="button"
                className="group overflow-hidden rounded-card border border-default bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={() => {
                  onChosen(option.key)
                  onOpenChange(false)
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={option.url}
                  alt=""
                  className="block w-full transition-transform group-hover:scale-[1.02]"
                  style={{ aspectRatio: String(aspect) }}
                />
                <span className="block p-2 font-ui text-body-sm text-secondary group-hover:text-primary">
                  Use this one
                </span>
              </button>
            ))}
          </div>

          <div>
            <Button type="button" variant="ghost" onClick={() => setPhase({ at: 'asking' })}>
              Try another campaign
            </Button>
          </div>
        </div>
        </MachineOutput>
      ) : (
        <div className="flex flex-col gap-4">
          {characters.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="font-ui text-label text-primary">Who is in it?</legend>
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
                      disabled={phase.at === 'drawing'}
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
                {characterId === null
                  ? 'Nobody — just a graphic. Tap a character to put them in it.'
                  : 'Drawn into the cover, kept the same as the one you made.'}
              </p>
            </fieldset>
          ) : null}

          {hasPhotos ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={useScene}
                disabled={phase.at === 'drawing'}
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

          <RadioCards
            label="What is this for?"
            value={campaign}
            columns={2}
            name="cover-campaign"
            disabled={phase.at === 'drawing'}
            options={CAMPAIGNS.map((option) => ({
              value: option,
              label: option === 'custom' ? 'Describe it yourself' : CAMPAIGN_COPY[option].label,
            }))}
            onChange={setCampaign}
          />

          {campaign === 'custom' ? (
            <Textarea
              label="Describe the ground you want"
              rows={3}
              maxLength={200}
              value={described}
              disabled={phase.at === 'drawing'}
              onChange={(event) => setDescribed(event.target.value)}
              hint="What the page should feel like — not the words on it. Those are typed in the editor."
            />
          ) : (
            <p className="font-ui text-body-sm text-secondary">
              {CAMPAIGN_COPY[campaign].draw}
            </p>
          )}

          <RadioCards
            label="How should it look?"
            value={style}
            columns={2}
            name="cover-style"
            disabled={phase.at === 'drawing'}
            options={COVER_STYLES.map((option) => ({
              value: option,
              label: COVER_STYLE_COPY[option].label,
              description: COVER_STYLE_COPY[option].note,
            }))}
            onChange={setStyle}
          />

          <p className="font-ui text-body-sm text-secondary">
            {COVER_SHAPE_NOTE[shape]}, in your brand colours. Three options, 5 credits.
          </p>

          {phase.at === 'asking' && phase.error ? (
            <p className="font-ui text-body-sm text-critical-fg" role="alert">
              {phase.error}
            </p>
          ) : null}

          <div>
            <Button
              type="button"
              disabled={!ready}
              loading={phase.at === 'drawing'}
              onClick={() => void generate()}
            >
              {phase.at === 'drawing' ? 'Drawing three options…' : 'Generate'}
            </Button>
          </div>

          {phase.at === 'drawing' ? (
            <p className="font-ui text-body-sm text-secondary">
              This takes about a minute. You can close this — finished work waits for you in the
              bell at the top of the rail.
            </p>
          ) : null}
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
      throw new Error('That is taking longer than it should. Check the bell in a minute — it will be there.')
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
      throw new Error('That did not finish. You were not charged — try again.')
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
