'use client'

import * as React from 'react'
import Link from 'next/link'
import { TYPE_MOOD_NOTE, type TypeMood } from '@souqstudio/engine'
import { Dialog } from '@/components/ui/dialog'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { Input } from '@/components/ui/input'
import { MachineOutput } from '@/components/ui/machine-output'
import { Segmented } from '@/components/ui/segmented'
import { fontsForMood } from '@/lib/brand-direction'

/**
 * Brand direction — colours and a type mood for a shop that has neither. E8-08.
 *
 * E4-02 pulls a palette out of an uploaded logo, which is a good answer for a
 * shop that has a logo and no answer at all for the shop that does not — and
 * that is most of a first week. Those owners are asked to pick a primary colour
 * from a wheel, and what they get is whatever they clicked.
 *
 * **Generating is free and keeping costs credits**, which is why this dialog has
 * a "Try again" that nobody has to think about before pressing. It is the one
 * place the product charges on acceptance rather than on completion: a palette
 * is meant to be re-rolled during setup, and a per-roll charge prices a shop out
 * of the step every other feature depends on.
 *
 * **What comes back is marked as machine output for as long as it is a
 * proposal, and stops being marked once it is accepted.** At that point it is
 * their palette, the same as one they picked by hand — the rule in the root
 * `CLAUDE.md` is that an owner can always tell what a machine wrote, not that a
 * choice they made carries a stamp forever.
 */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Spendable balance, so the cost is answerable before anything is spent. */
  credits: number
  /** Called once the kit has changed, so the page behind can re-read. */
  onAccepted: () => void
}

/** What keeping one costs. `CREDIT_COSTS.brand_direction`, for a client bundle. */
const COST = 3

const ACCEPT = 'image/png,image/jpeg,image/webp'

type Source = 'photo' | 'words'

type Proposal = {
  jobId: string
  palette: { name: string; hex: string; why: string }[]
  priceIndex: number
  mood: TypeMood
  notes: string[]
}

type Phase =
  | { at: 'choose'; error?: string }
  | { at: 'working' }
  /** The model looked and said there was no brand to read. Not a failure. */
  | { at: 'declined'; notes: string[] }
  | { at: 'proposed'; proposal: Proposal; error?: string }
  | { at: 'saving'; proposal: Proposal }

export function BrandDirectionDialog({ open, onOpenChange, credits, onAccepted }: Props) {
  const [phase, setPhase] = React.useState<Phase>({ at: 'choose' })
  const [source, setSource] = React.useState<Source>('photo')
  const [described, setDescribed] = React.useState('')

  // A dialog that reopens showing the last run's proposal would be offering
  // something the owner has already turned down.
  React.useEffect(() => {
    if (open) {
      setPhase({ at: 'choose' })
      setSource('photo')
      setDescribed('')
    }
  }, [open])

  const affordable = credits >= COST

  async function fromPhoto(file: File) {
    setPhase({ at: 'working' })
    try {
      setPhase(await run(() => start({ file })))
    } catch (error) {
      setPhase({ at: 'choose', error: message(error) })
    }
  }

  async function fromWords() {
    setPhase({ at: 'working' })
    try {
      setPhase(await run(() => start({ described })))
    } catch (error) {
      setPhase({ at: 'choose', error: message(error) })
    }
  }

  async function accept(proposal: Proposal) {
    setPhase({ at: 'saving', proposal })
    try {
      await json('/api/v1/brand/direction/accept', { jobId: proposal.jobId })
      onAccepted()
      onOpenChange(false)
    } catch (error) {
      setPhase({ at: 'proposed', proposal, error: message(error) })
    }
  }

  const canDescribe = described.trim().length >= 10

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Find colours for your shop"
      description="Show us your shop — a photo of the front, your signage, or a sentence about what you sell — and we propose a palette and a set of typefaces. Nothing is saved until you keep it."
      {...(phase.at === 'proposed' || phase.at === 'declined'
        ? {
            secondaryAction: {
              label: 'Try again',
              onClick: () => setPhase({ at: 'choose' }),
            },
          }
        : {})}
    >
      <div className="flex flex-col gap-4 pb-2">
        {phase.at === 'choose' || phase.at === 'working' ? (
          <>
            {/*
             * **Free, and said so before anything happens.** The balance-first
             * rule in E8's frontend notes is about never meeting a wall you
             * could have seen coming; here the useful fact is the opposite one,
             * that looking costs nothing and only keeping does.
             */}
            <p className="font-ui text-body-sm text-secondary">
              Looking is free. Keeping a palette costs <span data-figure>{COST}</span> credits —
              you have <span data-figure>{credits}</span>.
            </p>

            <div className="flex flex-col gap-2">
              <span className="font-ui text-label font-medium text-primary">
                What can you show us?
              </span>
              <Segmented
                label="What can you show us"
                value={source}
                disabled={phase.at === 'working'}
                options={[
                  { value: 'photo' as const, label: 'A photo' },
                  { value: 'words' as const, label: 'A sentence' },
                ]}
                onChange={setSource}
              />
            </div>

            {source === 'photo' ? (
              <FileDropzone
                label="A photo of your shop"
                accept={ACCEPT}
                onFile={fromPhoto}
                hint="PNG, JPG or WebP. The front of the shop, your signage, or a shelf — whatever shows the colours you already use."
                busy={phase.at === 'working'}
                {...(phase.at === 'choose' && phase.error !== undefined
                  ? { error: phase.error }
                  : {})}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <Input
                  label="What does your shop sell?"
                  hint="A sentence is enough. “Family grocery in Sharjah, mostly fresh produce and bread.”"
                  value={described}
                  maxLength={300}
                  disabled={phase.at === 'working'}
                  onChange={(event) => setDescribed(event.target.value)}
                  {...(phase.at === 'choose' && phase.error !== undefined
                    ? { error: phase.error }
                    : {})}
                />
                <button
                  type="button"
                  disabled={!canDescribe || phase.at === 'working'}
                  onClick={fromWords}
                  className="inline-flex h-control w-fit items-center rounded-pill bg-action-primary px-3 font-ui text-label text-action-primary-fg hover:bg-action-primary-hover disabled:opacity-50"
                >
                  {phase.at === 'working' ? 'Looking…' : 'Propose a palette'}
                </button>
              </div>
            )}

            {affordable ? null : (
              /*
               * A prompt, never a blocking error — E8's frontend notes. It is
               * softer here than on magic block, because an owner with no
               * credits can still generate and look; what they cannot do is
               * keep it. Saying so now is kinder than saying it after.
               */
              <div className="flex flex-col gap-2 rounded-block bg-sand p-4">
                <p className="font-ui text-body-sm text-secondary">
                  You can still look. Keeping one needs{' '}
                  <span data-figure>{COST - credits}</span> more credits.
                </p>
                <Link
                  href="/billing"
                  className="inline-flex h-control w-fit items-center rounded-pill border border-border-strong px-3 font-ui text-label text-primary hover:bg-stone-100"
                >
                  Top up credits
                </Link>
              </div>
            )}
          </>
        ) : null}

        {phase.at === 'declined' ? (
          <div className="flex flex-col gap-3">
            <p className="font-ui text-body text-primary">
              We could not read a brand off that.
            </p>
            <Notes notes={phase.notes} />
            <p className="font-ui text-body-sm text-muted">
              You were not charged. A photo of the shopfront in daylight usually works better
              than one of a shelf — or describe the shop in a sentence instead.
            </p>
          </div>
        ) : null}

        {phase.at === 'proposed' || phase.at === 'saving' ? (
          <Proposed
            proposal={phase.proposal}
            saving={phase.at === 'saving'}
            cost={COST}
            affordable={affordable}
            {...(phase.at === 'proposed' && phase.error !== undefined
              ? { error: phase.error }
              : {})}
            onAccept={accept}
          />
        ) : null}
      </div>
    </Dialog>
  )
}

/** The proposal, marked as machine output for as long as it is one. */
function Proposed({
  proposal,
  saving,
  cost,
  affordable,
  error,
  onAccept,
}: {
  proposal: Proposal
  saving: boolean
  cost: number
  affordable: boolean
  error?: string
  onAccept: (proposal: Proposal) => void
}) {
  const fonts = fontsForMood(proposal.mood)

  return (
    <div className="flex flex-col gap-4">
      <MachineOutput label="Proposed from what you showed us">
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {proposal.palette.map((color, index) => (
              <li key={color.hex} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1 size-8 shrink-0 rounded-chip border border-border-strong"
                  // The shop's own colour, not a design decision, so it cannot
                  // come from a token — the same exemption `ColorFields` uses.
                  style={{ backgroundColor: color.hex }}
                />
                <span className="flex flex-col">
                  <span className="font-ui text-label text-primary">
                    {color.name}
                    {index === proposal.priceIndex ? (
                      <span className="text-secondary"> · prices</span>
                    ) : null}
                  </span>
                  <span className="font-ui text-body-sm text-secondary">{color.why}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1">
            <span className="font-ui text-label text-primary">
              Typefaces — {TYPE_MOOD_NOTE[proposal.mood]}
            </span>
            <span className="font-ui text-body-sm text-secondary">
              {fonts.headline} for headlines, {fonts.display} for product names, {fonts.price}{' '}
              for prices, {fonts.body} for the small print.
            </span>
          </div>

          <Notes notes={proposal.notes} />
        </div>
      </MachineOutput>

      {error === undefined ? null : (
        <p className="font-ui text-body-sm text-critical-fg">{error}</p>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={saving || !affordable}
          onClick={() => onAccept(proposal)}
          className="inline-flex h-control w-fit items-center rounded-pill bg-action-primary px-3 font-ui text-label text-action-primary-fg hover:bg-action-primary-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : `Keep these — ${cost} credits`}
        </button>
        <p className="font-ui text-body-sm text-muted">
          You can change any of it afterwards. Nothing here is locked in.
        </p>
      </div>
    </div>
  )
}

/** What the model read, so the owner can disagree with it. */
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

// ─── The calls ────────────────────────────────────────────────────────────────

/** Queue a proposal, from a picture or from a sentence. */
async function start(input: { file?: File; described?: string }): Promise<string> {
  if (input.described !== undefined) {
    const queued = await json<{ jobId: string }>('/api/v1/brand/direction', {
      described: input.described,
    })
    return queued.jobId
  }

  const file = input.file
  if (file === undefined) throw new Error('Choose a picture first.')

  /**
   * **The bytes never pass through a route.** A presigned PUT straight into the
   * bucket, the same path block artwork and magic block already take: a
   * serverless function caps its body well below the size a phone photograph
   * legitimately reaches.
   */
  const presign = await json<{ uploadUrl: string; assetId: string }>('/api/v1/blocks/artwork', {
    contentType: file.type,
    contentLength: file.size,
  })

  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
  })
  if (!put.ok) throw new Error('That upload did not finish. Check your connection and try again.')

  const queued = await json<{ jobId: string }>('/api/v1/brand/direction', {
    sourceKey: presign.assetId,
  })
  return queued.jobId
}

/** Start, then wait, and turn the outcome into the next phase. */
async function run(begin: () => Promise<string>): Promise<Phase> {
  const jobId = await begin()
  const outcome = await poll(jobId)

  return outcome.kind === 'declined'
    ? { at: 'declined', notes: outcome.notes }
    : { at: 'proposed', proposal: { ...outcome.proposal, jobId } }
}

type Outcome =
  | { kind: 'proposal'; proposal: Omit<Proposal, 'jobId'> }
  | { kind: 'declined'; notes: string[] }

/**
 * Wait for the worker. Two seconds, the same as every other long operation in
 * this product — `api-conventions.md`, and magic block does the same.
 */
async function poll(jobId: string): Promise<Outcome> {
  const deadline = Date.now() + 3 * 60 * 1000

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error('That is taking longer than it should. Try again in a minute.')
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))

    const job = await read<{
      status: string
      errorMessage: string | null
      result: Partial<Omit<Proposal, 'jobId'>> | null
    }>(`/api/v1/ai/jobs/${jobId}`)

    if (job.status === 'failed') {
      /**
       * Three of these are answers rather than faults, and none of them charged
       * anything. `no_usable_direction` is the contrast gate: the model proposed
       * twice and both palettes had a price colour white type cannot be read on.
       * Telling an owner that in those words would be telling them about our
       * arithmetic; what they can act on is a different picture.
       */
      if (job.errorMessage === 'unreadable_shop') {
        return { kind: 'declined', notes: job.result?.notes ?? [] }
      }
      if (job.errorMessage === 'no_usable_direction') {
        return {
          kind: 'declined',
          notes: [
            'The colours we found would not carry a readable price. A brighter or more contrasted picture usually helps.',
          ],
        }
      }
      throw new Error(
        job.errorMessage === 'unusable_direction'
          ? 'We could not read that picture. Try a clearer one.'
          : 'That did not finish. You were not charged — try again.'
      )
    }

    if (job.status !== 'complete') continue

    const { palette, priceIndex, mood, notes } = job.result ?? {}
    if (palette === undefined || priceIndex === undefined || mood === undefined) {
      throw new Error('That did not finish. You were not charged — try again.')
    }

    return { kind: 'proposal', proposal: { palette, priceIndex, mood, notes: notes ?? [] } }
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

/** `{ data, error }`, every route, including the errors — `api-conventions.md`. */
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
