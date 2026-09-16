'use client'

import * as React from 'react'
import {
  CAMPAIGNS,
  CAMPAIGN_COPY,
  COVER_SHAPE_NOTE,
  type Campaign,
  type CoverShape,
} from '@souqstudio/engine'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { RadioCards } from '@/components/ui/radio-cards'
import { Textarea } from '@/components/ui/textarea'

/**
 * Generate a page ground. E8-04.
 *
 * **What comes back is a background, and this dialog is careful to say so.**
 * The worker draws paper — a Ramadan ground, a clearance ground — and the shop's
 * name, logo and character are composited on top afterwards. A model asked to
 * render a shop's name produces misspelled text in a typeface nobody chose, so
 * `coverPrompt` says twice that it must not try. An owner told "generate a
 * cover" and handed a background with no name on it would read that as a
 * failure, which is why the words here are about the page behind the cards.
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

type Phase =
  | { at: 'asking'; error?: string }
  | { at: 'drawing' }
  | { at: 'picking'; options: Option[] }

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
  const [described, setDescribed] = React.useState('')
  const [phase, setPhase] = React.useState<Phase>({ at: 'asking' })
  const shape = shapeFor(aspect)

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
      const queued = await post<{ jobId: string }>('/api/v1/covers/generate', {
        campaign,
        shape,
        ...(campaign === 'custom' ? { described: described.trim() } : {}),
      })
      const options = await poll(queued.jobId)
      setPhase({ at: 'picking', options })
    } catch (error) {
      setPhase({ at: 'asking', error: message(error) })
    }
  }

  const ready = campaign !== 'custom' || described.trim().length >= 3

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate a page ground"
      description="A background drawn in your colours. Your name and logo go on top in the editor, not in the picture."
      size="lg"
    >
      {phase.at === 'picking' ? (
        <div className="flex flex-col gap-3">
          <p className="font-ui text-body-sm text-secondary">
            Three grounds, {COVER_SHAPE_NOTE[shape].toLowerCase()}. Choose one to put behind this
            page.
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
      ) : (
        <div className="flex flex-col gap-4">
          <RadioCards
            label="What is this for?"
            value={campaign}
            columns={2}
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
