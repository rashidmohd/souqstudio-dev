'use client'

import * as React from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { MAGIC_CATEGORIES, categoryRepeats, type MagicCategory } from '@souqstudio/engine'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import { Dialog } from '@/components/ui/dialog'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { MachineOutput } from '@/components/ui/machine-output'
import { Segmented } from '@/components/ui/segmented'
import { BlockPreview } from '@/components/blocks/BlockPreview'

/**
 * Magic block — a picture in, a block in the library out. E8-07.
 *
 * The owner photographs something they want and gets one of their own, in their
 * colours. What the model actually does is *match*: it picks from the same
 * designs the shipped library is built from. That is why the result can be
 * previewed here rather than described — it is an ordinary block by the time
 * this dialog sees it.
 *
 * **The owner says what kind of thing it is first, and that binds the match.**
 * An offer card, a header, a panel, a footer or a square post — the model is
 * shown that kind's designs and nothing else, because a model choosing between
 * eight things is a better matcher than one choosing between fifty-nine. The
 * cost of binding is that a picture of a footer uploaded under "header" comes
 * back declined rather than quietly matched to the nearest masthead, which is
 * the trade this feature should make: a wrong match is a block the owner has to
 * notice is wrong, and they paid for it either way.
 *
 * **The block is saved as a draft before this screen renders**, which is
 * deliberate and is what makes closing the tab safe. A draft is excluded from
 * the book composer (`listBlocks`, `forComposing`) so nothing an owner has not
 * looked at can reach a customer, and `/brand/blocks` shows it with a draft
 * chip. There is no save button anywhere after this: the designer autosaves, and
 * publishing is the availability control inside it.
 */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kit: BrandKit
  /** Spendable balance, so the cost is answerable before anything is spent. */
  credits: number
  /** Called once a block exists, so the page behind can re-read. */
  onCreated: () => void
}

/** What it costs. `CREDIT_COSTS.block_gen`, restated for a client bundle. */
const COST = 5

const ACCEPT = 'image/png,image/jpeg,image/webp'

/**
 * The kinds, in the owner's words.
 *
 * **Its own copy rather than the import picker's**, and the difference is the
 * grammar: that one filters a library and says "Offer cards", this one describes
 * one picture and says "Offer card". Sharing a map would make one of the two
 * read wrong, which is worse than two short tables that each read right.
 */
const KIND_LABEL: Readonly<Record<MagicCategory, string>> = {
  'offer-card': 'Offer card',
  header: 'Header',
  panel: 'Panel',
  footer: 'Footer',
  'social-post': 'Square post',
}

/** What each kind is, for an owner who has never heard our words for them. */
const KIND_NOTE: Readonly<Record<MagicCategory, string>> = {
  'offer-card': 'One product with its price — the card that repeats down a page.',
  header: 'The band across the top of a page, a front cover, or a divider between sections.',
  panel: 'A message among the offers — a note, a brand panel, an announcement.',
  footer: 'The last row of a page: your name, the contact line, the small print.',
  'social-post': 'One square post: an announcement, your opening hours, a thank-you.',
}

/** Completes "That does not look like …" and "Try a picture of just the …". */
const KIND_PHRASE: Readonly<Record<MagicCategory, string>> = {
  'offer-card': 'a single offer card',
  header: 'a header',
  panel: 'a panel',
  footer: 'a footer',
  'social-post': 'a square post',
}

/** What is acceptable, said before the drop rather than as a rejection after. */
const KIND_HINT: Readonly<Record<MagicCategory, string>> = {
  'offer-card':
    'PNG, JPG or WebP, up to 10MB. One card rather than a whole page — a page of eight cards has no single price to read.',
  header: 'PNG, JPG or WebP, up to 10MB. Crop to the band itself if the picture is a whole page.',
  panel: 'PNG, JPG or WebP, up to 10MB. Crop to the panel itself if the picture is a whole page.',
  footer: 'PNG, JPG or WebP, up to 10MB. Crop to the last row if the picture is a whole page.',
  'social-post': 'PNG, JPG or WebP, up to 10MB. One whole post, screenshotted square.',
}

type Result = {
  blockId: string
  structure: string
  confidence: 'high' | 'medium' | 'low'
  notes: string[]
  arrangements: Arrangement[]
  name: string
}

type Phase =
  | { at: 'choose'; error?: string }
  | { at: 'working' }
  /** The model looked and said this is not one offer card. Not a failure. */
  | { at: 'declined'; notes: string[] }
  | { at: 'done'; result: Result }

export function MagicBlockDialog({ open, onOpenChange, kit, credits, onCreated }: Props) {
  const [phase, setPhase] = React.useState<Phase>({ at: 'choose' })

  /**
   * What the owner says the picture is. An offer card until they say otherwise,
   * because it is the kind a shop uploads most and the one this feature was.
   */
  const [kind, setKind] = React.useState<MagicCategory>('offer-card')

  /**
   * Whether the page behind owes itself a re-read, deferred until this closes.
   *
   * **Refreshing while the dialog is open closes the dialog**, and the route
   * from one to the other is not obvious. `onCreated` is `router.refresh()`,
   * which re-renders the server tree; on `/brand/blocks` the new draft flips
   * the library from its empty state to a list, the `<dialog>` element is torn
   * down in that reconciliation, and a native dialog fires `close` when it goes
   * — which `Dialog` faithfully reports as `onOpenChange(false)`.
   *
   * `BlockImportDialog` never met this because it refreshes and closes in the
   * same breath. This one stays open to show the owner what it matched, which
   * is the whole point of it, so the refresh is what has to move.
   *
   * A ref rather than state: nothing renders differently because of it, and a
   * re-render here is exactly what is being avoided.
   */
  const pendingRefresh = React.useRef(false)

  // A dialog that reopens showing the last run's result would be reporting on
  // something the owner has already dealt with.
  React.useEffect(() => {
    if (open) {
      setPhase({ at: 'choose' })
      setKind('offer-card')
    }
  }, [open])

  /** The page behind catches up once it is visible again. */
  function change(next: boolean) {
    if (!next && pendingRefresh.current) {
      pendingRefresh.current = false
      onCreated()
    }
    onOpenChange(next)
  }

  const affordable = credits >= COST

  async function submit(file: File) {
    setPhase({ at: 'working' })

    try {
      const result = await matchCard(file, kind)
      if (result.kind === 'declined') {
        setPhase({ at: 'declined', notes: result.notes })
        return
      }

      setPhase({ at: 'done', result: result.block })
      // The block exists from here on, so the library behind owes itself a
      // re-read — but not yet. See `pendingRefresh`.
      pendingRefresh.current = true
    } catch (error) {
      setPhase({ at: 'choose', error: message(error) })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={change}
      size="lg"
      title="Match a design from a picture"
      description="Upload something you like — from a flyer, a post, or last year's print run. Say what kind of thing it is, and we work out which of our designs it matches and add it to your blocks, drawn in your own colours."
      {...(phase.at === 'done'
        ? { secondaryAction: { label: 'Try another picture', onClick: () => setPhase({ at: 'choose' }) } }
        : {})}
      {...(phase.at === 'declined'
        ? { secondaryAction: { label: 'Try another picture', onClick: () => setPhase({ at: 'choose' }) } }
        : {})}
    >
      <div className="flex flex-col gap-4 pb-2">
        {phase.at === 'choose' || phase.at === 'working' ? (
          <>
            {/*
             * The balance before the action, not after it — E8's frontend
             * notes, and the reason a shop owner at 11pm never meets a wall
             * they could have seen coming.
             */}
            <p className="font-ui text-body-sm text-secondary">
              Costs <span data-figure>{COST}</span> credits. You have{' '}
              <span data-figure>{credits}</span>.
            </p>

            {affordable ? null : (
              /*
               * A prompt, never a blocking error — E8 again. The owner can
               * still read what this does and decide it is worth topping up
               * for, which is not true of a dialog that refuses to render.
               */
              <div className="flex flex-col gap-2 rounded-block bg-sand p-4">
                <p className="font-ui text-body-sm text-secondary">
                  You need <span data-figure>{COST - credits}</span> more credits to match a
                  design.
                </p>
                <Link
                  href="/billing"
                  className="inline-flex h-control w-fit items-center rounded-pill border border-border-strong px-3 font-ui text-label text-primary hover:bg-stone-100"
                >
                  Top up credits
                </Link>
              </div>
            )}

            {/*
             * The kind, before the picture — because it decides what the model
             * is shown rather than labelling what came back, and an owner who
             * discovers the question after uploading has already spent nothing
             * and learned nothing. The row scrolls rather than wrapping, the
             * same as the import picker: five segments in one shell is the
             * control, and broken over two lines it stops reading as one.
             */}
            <div className="flex flex-col gap-2">
              {/* A visible heading; the control carries its own accessible name. */}
              <span className="font-ui text-label font-medium text-primary">
                What is in the picture?
              </span>
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <Segmented
                  label="What kind of thing is in the picture"
                  value={kind}
                  disabled={phase.at === 'working'}
                  options={MAGIC_CATEGORIES.map((category) => ({
                    value: category,
                    label: KIND_LABEL[category],
                  }))}
                  onChange={setKind}
                />
              </div>
              <p className="font-ui text-body-sm text-muted">{KIND_NOTE[kind]}</p>
            </div>

            {/* Artwork is earned here for the same reason the import's first
                step earns it: a prompt before anything exists, with nothing in
                progress behind it to be delayed. It stays put while the model
                reads — `ImportWizard` does the same, and a drawing that
                vanishes the moment the owner presses the button is a jump
                rather than a rule being applied. */}
            <FileDropzone
              label={`Picture of the ${KIND_LABEL[kind].toLowerCase()}`}
              illustration="magic-block-upload"
              accept={ACCEPT}
              hint={KIND_HINT[kind]}
              buttonLabel="Choose a picture"
              busy={phase.at === 'working'}
              disabled={!affordable}
              {...(phase.at === 'choose' && phase.error !== undefined
                ? { error: phase.error }
                : {})}
              onFile={(file) => void submit(file)}
            />

            {phase.at === 'working' ? (
              <p role="status" className="font-ui text-body-sm text-secondary">
                Reading your picture. This takes a few seconds.
              </p>
            ) : null}
          </>
        ) : null}

        {phase.at === 'declined' ? (
          <div className="flex flex-col gap-3">
            <p className="font-ui text-body text-primary">
              That does not look like {KIND_PHRASE[kind]}.
            </p>
            <Notes notes={phase.notes} />
            {/*
             * Said plainly, because the owner will assume otherwise. Credits
             * are consumed on success only — there is nothing to refund, which
             * is the version of this that cannot leak.
             */}
            <p className="font-ui text-body-sm text-secondary">
              You were not charged.{' '}
              {kind === 'offer-card'
                ? 'Try one card on its own — a single product with its price.'
                : `Try a picture of just the ${KIND_LABEL[kind].toLowerCase()}, or choose a different kind above.`}
            </p>
          </div>
        ) : null}

        {phase.at === 'done' ? (
          <div className="flex flex-col gap-4">
            {/*
             * Mandatory, and the reason is functional rather than visual: this
             * card is going onto a flyer that reaches thousands of a shop's
             * customers, and the owner must be able to tell a machine drew it.
             */}
            <MachineOutput label="Matched from your picture">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="overflow-hidden rounded-control border-hairline border-border-subtle bg-stone-0">
                  {/* Their palette and their typefaces, at the shape this kind
                      of block actually is. Nothing here is the picture they
                      uploaded — it is their own block. */}
                  <BlockPreview
                    arrangements={phase.result.arrangements}
                    kit={kit}
                    {...previewSize(kind, phase.result.arrangements)}
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="font-ui text-label font-medium text-primary">
                    {phase.result.name}
                  </span>
                  <Notes notes={phase.result.notes} />
                  {phase.result.confidence === 'high' ? null : (
                    <p className="font-ui text-body-sm text-secondary">
                      Not certain about this one — worth a look before you use it.
                    </p>
                  )}
                </div>
              </div>
            </MachineOutput>

            <p className="font-ui text-body-sm text-secondary">
              Saved to your blocks as a draft, so it stays out of new books until you
              publish it.
            </p>

            {/*
             * A Link rather than the dialog's `primaryAction`, because this
             * navigates: middle-click, open-in-new-tab and the status bar are
             * all worth keeping. Same reasoning as the library's Open control.
             */}
            <Link
              href={`/card-designer/${phase.result.blockId}`}
              className="inline-flex h-control w-fit items-center gap-2 rounded-pill bg-action-primary px-3 font-ui text-label text-action-primary-fg hover:bg-action-primary-hover"
            >
              <Sparkles className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Open in the designer
            </Link>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}

/**
 * The box the result is drawn in, at the proportions the design was drawn for.
 *
 * **The same reading `tileSize` makes in `BlockImportDialog` and `defaultShape`
 * makes in the designer**: a repeating card is shown at the shape a booklet cell
 * is, and a block placed once at the geometric mean of its own aspect range. A
 * footer really is a thin strip and a square post really is a square, and
 * letterboxing either into a portrait box is the one piece of information this
 * preview exists to carry, thrown away.
 */
const PREVIEW_WIDTH = 300
const PREVIEW_HEIGHT = 380

function previewSize(
  category: MagicCategory,
  arrangements: Arrangement[]
): { width: number; height: number } {
  const arrangement = arrangements[0]
  const natural =
    categoryRepeats(category) || arrangement === undefined
      ? 0.72
      : Math.min(6, Math.max(0.4, Math.sqrt(arrangement.aspectMin * arrangement.aspectMax)))

  return natural > PREVIEW_WIDTH / PREVIEW_HEIGHT
    ? { width: PREVIEW_WIDTH, height: Math.round(PREVIEW_WIDTH / natural) }
    : { width: Math.round(PREVIEW_HEIGHT * natural), height: PREVIEW_HEIGHT }
}

/** What the model read off the picture, so the owner can disagree with it. */
function Notes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null

  return (
    <ul className="flex flex-col gap-1">
      {notes.map((note) => (
        <li key={note} className="font-ui text-body-sm text-secondary">
          {note}
        </li>
      ))}
    </ul>
  )
}

// ─── The three calls ──────────────────────────────────────────────────────────

type Matched =
  | { kind: 'block'; block: Result }
  | { kind: 'declined'; notes: string[] }

/**
 * Presign, PUT, queue, poll.
 *
 * **The bytes never pass through a route.** The upload is a presigned PUT
 * straight into the bucket, which is the same path block artwork already takes
 * and for the same reason: a serverless function caps its body well below the
 * size a photograph legitimately reaches.
 */
async function matchCard(file: File, category: MagicCategory): Promise<Matched> {
  const presign = await json<{ uploadUrl: string; assetId: string }>(
    '/api/v1/blocks/artwork',
    { contentType: file.type, contentLength: file.size }
  )

  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
  })
  if (!put.ok) throw new Error('That upload did not finish. Check your connection and try again.')

  const queued = await json<{ jobId: string }>('/api/v1/blocks/magic', {
    sourceKey: presign.assetId,
    category,
  })

  return poll(queued.jobId)
}

/**
 * Wait for the worker.
 *
 * Polling rather than a socket, because that is the shape every long-running
 * operation in this product already has — `api-conventions.md`, and the export
 * job does the same. Two seconds is slower than the eye and far cheaper than a
 * connection held open for the thirty a vision call takes.
 */
async function poll(jobId: string): Promise<Matched> {
  const deadline = Date.now() + 3 * 60 * 1000

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error('That is taking longer than it should. Check your blocks in a minute.')
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))

    const job = await read<{
      status: string
      errorMessage: string | null
      result: {
        blockId?: string
        structure?: string
        confidence?: Result['confidence']
        notes?: string[]
      } | null
    }>(`/api/v1/ai/jobs/${jobId}`)

    if (job.status === 'failed') {
      // "Not one of these" is an answer rather than a fault, and the notes
      // carry the model's reason for it.
      if (job.errorMessage === 'no_match') {
        return { kind: 'declined', notes: job.result?.notes ?? [] }
      }
      throw new Error(
        job.errorMessage === 'unreadable_design'
          ? 'We could not read that picture. Try a clearer one, or crop it to the design itself.'
          : 'That did not finish. You were not charged — try again.'
      )
    }

    if (job.status !== 'complete') continue

    const blockId = job.result?.blockId
    if (blockId === undefined) throw new Error('That did not finish. You were not charged.')

    // The document itself comes from the block, not from the job: the job
    // reports what happened and the block is the artefact.
    const block = await read<{ name: string; arrangements: Arrangement[] }>(
      `/api/v1/blocks/${blockId}`
    )

    return {
      kind: 'block',
      block: {
        blockId,
        name: block.name,
        arrangements: block.arrangements,
        structure: job.result?.structure ?? '',
        confidence: job.result?.confidence ?? 'medium',
        notes: job.result?.notes ?? [],
      },
    }
  }
}

async function json<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return unwrap<T>(response)
}

async function read<T>(url: string): Promise<T> {
  return unwrap<T>(await fetch(url))
}

/**
 * `{ data, error }`, every route, including the errors — `api-conventions.md`.
 * The `message` is written for a shop owner to read, so it is shown rather than
 * replaced with something this file invented.
 */
async function unwrap<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as {
    data: T | null
    error: { code: string; message: string } | null
  } | null

  if (body?.error) throw new Error(body.error.message)
  if (body?.data === null || body?.data === undefined) {
    throw new Error('Something went wrong. Try again in a moment.')
  }

  return body.data
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again in a moment.'
}
