'use client'

import * as React from 'react'
import {
  COVER_SHAPES,
  COVER_SHAPE_NOTE,
  COVER_STYLES,
  COVER_STYLE_COPY,
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
 * **A cover is kept, not applied.** This screen makes brand assets: a cover is
 * generated once, kept, and picked from the editor whenever a book wants it.
 * The first build applied it straight to the page an owner happened to be on,
 * which meant the same shop paid five credits again the next week for the same
 * Ramadan cover.
 */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once a kept cover has been written, so the library can reload. */
  onKept: () => void
}

/** What each shape is, as a CSS aspect ratio, so a thumbnail matches the file. */
const ASPECT_OF: Readonly<Record<CoverShape, string>> = {
  square: '1 / 1',
  portrait: '3 / 4',
  story: '9 / 16',
}

type Option = { url: string; key: string }
type Character = { id: string; baseImageUrl: string; style: string }
type StorePhoto = { key: string; url: string }
type Prompt = { slug: string; label: string; hint: string | null; group: string }
type Sources = { prompts: Prompt[]; characters: Character[]; storePhotos: StorePhoto[] }

type Phase =
  | { at: 'asking'; error?: string }
  | { at: 'drawing' }
  | { at: 'picking'; jobId: string; options: Option[]; withCharacter: boolean; error?: string }

export function CoverDialog({ open, onOpenChange, onKept }: Props) {
  const [promptSlug, setPromptSlug] = React.useState<string>('custom')
  const [style, setStyle] = React.useState<CoverStyle>('photographic')
  /**
   * **Asked here, where it was derived in the editor.** There is no page in
   * front of an owner on this screen, so nothing can infer it — and a cover kept
   * at the wrong shape is cropped to a sliver the week they use it. The picker
   * in the editor is what warns when a kept cover does not suit the page.
   */
  const [shape, setShape] = React.useState<CoverShape>('portrait')
  const [keeping, setKeeping] = React.useState(false)
  const [described, setDescribed] = React.useState('')
  const [phase, setPhase] = React.useState<Phase>({ at: 'asking' })
  const [sources, setSources] = React.useState<Sources | null>(null)
  const [characterId, setCharacterId] = React.useState<string | null>(null)
  const [useScene, setUseScene] = React.useState(true)

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

  async function keep(index: number) {
    if (phase.at !== 'picking') return
    setKeeping(true)
    try {
      await post('/api/v1/covers', { jobId: phase.jobId, indexes: [index] })
      onKept()
      onOpenChange(false)
    } catch (error) {
      setPhase({ ...phase, error: message(error) })
    } finally {
      setKeeping(false)
    }
  }

  async function generate() {
    setPhase({ at: 'drawing' })
    try {
      const withCharacter = characterId !== null
      const queued = await post<{ jobId: string }>('/api/v1/covers/generate', {
        promptSlug,
        shape,
        style,
        useScene: useScene && hasPhotos,
        ...(withCharacter ? { characterId } : {}),
        ...(promptSlug === 'custom' ? { described: described.trim() } : {}),
      })
      const options = await poll(queued.jobId)
      setPhase({ at: 'picking', jobId: queued.jobId, options, withCharacter })
    } catch (error) {
      setPhase({ at: 'asking', error: message(error) })
    }
  }

  const ready = promptSlug !== 'custom' || described.trim().length >= 3
  const prompts = sources?.prompts ?? []
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
            Three covers, {COVER_SHAPE_NOTE[shape].toLowerCase()}. Keep the one you want — it
            joins your covers and any book can use it. Your name and logo go on top in the editor.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {phase.options.map((option, index) => (
              <button
                key={option.key}
                type="button"
                className="group overflow-hidden rounded-card border border-default bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                disabled={keeping}
                onClick={() => void keep(index)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={option.url}
                  alt=""
                  className="block w-full transition-transform group-hover:scale-[1.02]"
                  style={{ aspectRatio: ASPECT_OF[shape] }}
                />
                <span className="block p-2 font-ui text-body-sm text-secondary group-hover:text-primary">
                  {keeping ? 'Keeping…' : 'Keep this one'}
                </span>
              </button>
            ))}
          </div>

          {phase.error ? (
            <p className="font-ui text-body-sm text-critical-fg" role="alert">
              {phase.error}
            </p>
          ) : null}

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

          {/*
            **The occasions come from the server**, because they are rows in
            `cover_prompts` that get tuned against what the model sends back. A
            list compiled in here would drift from them the first time somebody
            edited one.
          */}
          <RadioCards
            label="What is this cover of?"
            value={promptSlug}
            columns={2}
            name="cover-prompt"
            disabled={phase.at === 'drawing'}
            options={[
              ...prompts.map((option) => ({
                value: option.slug,
                label: option.label,
                ...(option.hint === null ? {} : { description: option.hint }),
              })),
              { value: 'custom', label: 'Describe it yourself' },
            ]}
            onChange={setPromptSlug}
          />

          {promptSlug === 'custom' ? (
            <Textarea
              label="Describe the ground you want"
              rows={3}
              maxLength={200}
              value={described}
              disabled={phase.at === 'drawing'}
              onChange={(event) => setDescribed(event.target.value)}
              hint="What the page should feel like — not the words on it. Those are typed in the editor."
            />
          ) : null}

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

          <RadioCards
            label="What shape?"
            value={shape}
            columns={1}
            name="cover-shape"
            disabled={phase.at === 'drawing'}
            options={COVER_SHAPES.map((option) => ({
              value: option,
              label: COVER_SHAPE_NOTE[option],
            }))}
            onChange={setShape}
          />

          <p className="font-ui text-body-sm text-secondary">
            Drawn in your brand colours. Three options, 5 credits.
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
