'use client'

import * as React from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import { Dialog } from '@/components/ui/dialog'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { MachineOutput } from '@/components/ui/machine-output'
import { BlockPreview } from '@/components/blocks/BlockPreview'

/**
 * Magic block — a picture of a card in, a block in the library out. E8-07.
 *
 * The owner photographs a card they want and gets one of their own, in their
 * colours, that reflows into any cell. What the model actually does is *match*:
 * it picks a structure from the same twenty-five the shipped library is built
 * from and says how it is skinned. That is why the result can be previewed here
 * rather than described — it is an ordinary block by the time this dialog sees
 * it.
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
    if (open) setPhase({ at: 'choose' })
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
      const result = await matchCard(file)
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
      title="Match a card from a picture"
      description="Upload a card you like — from a flyer, a post, or last year's print run. We work out which layout it is and add it to your blocks, drawn in your own colours."
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
                  card.
                </p>
                <Link
                  href="/billing"
                  className="inline-flex h-control w-fit items-center rounded-pill border border-border-strong px-3 font-ui text-label text-primary hover:bg-stone-100"
                >
                  Top up credits
                </Link>
              </div>
            )}

            <FileDropzone
              label="Picture of the card"
              accept={ACCEPT}
              hint="PNG, JPG or WebP, up to 10MB. One card rather than a whole page — a page of eight cards has no single price to read."
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
                Reading the card. This takes a few seconds.
              </p>
            ) : null}
          </>
        ) : null}

        {phase.at === 'declined' ? (
          <div className="flex flex-col gap-3">
            <p className="font-ui text-body text-primary">
              That does not look like a single offer card.
            </p>
            <Notes notes={phase.notes} />
            {/*
             * Said plainly, because the owner will assume otherwise. Credits
             * are consumed on success only — there is nothing to refund, which
             * is the version of this that cannot leak.
             */}
            <p className="font-ui text-body-sm text-secondary">
              You were not charged. Try one card on its own — a single product with its
              price.
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
                  {/* Their palette and their typefaces, at the shape a booklet
                      cell actually is. Nothing here is the picture they
                      uploaded — it is their own card. */}
                  <BlockPreview
                    arrangements={phase.result.arrangements}
                    kit={kit}
                    width={300}
                    height={380}
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
async function matchCard(file: File): Promise<Matched> {
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
      // "Not an offer card" is an answer rather than a fault, and the notes
      // carry the model's reason for it.
      if (job.errorMessage === 'not_an_offer_card') {
        return { kind: 'declined', notes: job.result?.notes ?? [] }
      }
      throw new Error(
        job.errorMessage === 'unreadable_design'
          ? 'We could not read that picture. Try a clearer one, or a single card rather than a page.'
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
