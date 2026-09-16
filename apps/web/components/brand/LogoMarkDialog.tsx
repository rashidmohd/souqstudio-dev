'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  drawMark,
  logoChoiceSchema,
  skinFrom,
  type LogoChoice,
  type LogoStructure,
} from '@souqstudio/engine'
import type { BrandKit } from '@souqstudio/types'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MachineOutput } from '@/components/ui/machine-output'
import { resolveFont } from '@/lib/brand-fonts'
import { resolvePalette } from '@/lib/brand-palette'

/**
 * Logo marks — four to choose from, for a shop that has none. E8-09.
 *
 * E4-01 takes an upload and removes its background, which assumes the owner
 * already has a logo file. A shop without one is not a shop with a worse offer
 * book — it is a shop that cannot finish onboarding, because every header,
 * footer and cover in the product reads `logoUrl`.
 *
 * **Matched, not drawn.** A model picks one of four hand-drawn structures and
 * says how to set it; the engine assembles the SVG. So there is no diffusion
 * provider to choose, no photograph of anybody leaving the region, and what
 * comes out is a vector that prints at A3.
 *
 * **Each candidate is drawn here rather than loaded as an image**, through the
 * same `drawMark` the worker used to write the file. An SVG loaded through
 * `<img>` is an isolated document that cannot see this page's webfonts, so a
 * mark previewed that way would show the right structure in the wrong typeface —
 * and the typeface is half of what the owner is choosing between. Same rule the
 * block library follows: one painter, every surface.
 */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kit: BrandKit
  /** Spendable balance, so the cost is answerable before anything is spent. */
  credits: number
  /** Called once the logo is set, so the page behind can re-read. */
  onAdopted: () => void
}

/** What it costs. `CREDIT_COSTS.logo_gen`, restated for a client bundle. */
const COST = 10

type Mark = {
  structure: LogoStructure
  setAs: string
  why: string
  url: string
  choice: LogoChoice
}

type Phase =
  | { at: 'choose'; error?: string }
  | { at: 'working' }
  /** The model looked at the name and said no mark can be made from it. */
  | { at: 'declined'; notes: string[] }
  | { at: 'picking'; jobId: string; marks: Mark[]; notes: string[]; error?: string }
  | { at: 'saving'; jobId: string; marks: Mark[]; notes: string[]; index: number }

export function LogoMarkDialog({ open, onOpenChange, kit, credits, onAdopted }: Props) {
  const [phase, setPhase] = React.useState<Phase>({ at: 'choose' })
  const [trade, setTrade] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setPhase({ at: 'choose' })
      setTrade('')
    }
  }, [open])

  const palette = React.useMemo(() => resolvePalette(kit).map((color) => color.hex), [kit])
  const family = resolveFont(kit, 'headline')
  const affordable = credits >= COST

  async function generate() {
    setPhase({ at: 'working' })
    try {
      const queued = await json<{ jobId: string }>('/api/v1/brand/logo/generate', {
        ...(trade.trim() === '' ? {} : { trade: trade.trim() }),
      })
      const outcome = await poll(queued.jobId)

      setPhase(
        outcome.kind === 'declined'
          ? { at: 'declined', notes: outcome.notes }
          : { at: 'picking', jobId: queued.jobId, marks: outcome.marks, notes: outcome.notes }
      )
    } catch (error) {
      setPhase({ at: 'choose', error: message(error) })
    }
  }

  async function adopt(index: number) {
    if (phase.at !== 'picking') return
    const { jobId, marks, notes } = phase
    setPhase({ at: 'saving', jobId, marks, notes, index })

    try {
      await json('/api/v1/brand/logo/generated', { jobId, index })
      onAdopted()
      onOpenChange(false)
    } catch (error) {
      setPhase({ at: 'picking', jobId, marks, notes, error: message(error) })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Make a logo"
      description="We draw a few marks from your shop's name and your own colours. Pick one and it becomes your logo — you can replace it with a real file any time."
      {...(phase.at === 'picking' || phase.at === 'declined'
        ? { secondaryAction: { label: 'Start again', onClick: () => setPhase({ at: 'choose' }) } }
        : {})}
    >
      <div className="flex flex-col gap-4 pb-2">
        {phase.at === 'choose' || phase.at === 'working' ? (
          <>
            <p className="font-ui text-body-sm text-secondary">
              Costs <span data-figure>{COST}</span> credits for{' '}
              <span data-figure>4</span> marks. You have <span data-figure>{credits}</span>.
            </p>

            {palette.length === 0 ? (
              <p className="font-ui text-body-sm text-critical-fg">
                Choose your colours first — the mark is drawn in them.
              </p>
            ) : (
              <>
                <Input
                  label="What does your shop sell?"
                  hint="Optional, and it helps. “A pharmacy” and “a bakery” do not want the same mark."
                  value={trade}
                  maxLength={200}
                  disabled={phase.at === 'working'}
                  onChange={(event) => setTrade(event.target.value)}
                  {...(phase.at === 'choose' && phase.error !== undefined
                    ? { error: phase.error }
                    : {})}
                />

                <button
                  type="button"
                  disabled={phase.at === 'working' || !affordable}
                  onClick={generate}
                  className="inline-flex h-control w-fit items-center rounded-pill bg-action-primary px-3 font-ui text-label text-action-primary-fg hover:bg-action-primary-hover disabled:opacity-50"
                >
                  {phase.at === 'working' ? 'Drawing…' : 'Draw some marks'}
                </button>
              </>
            )}

            {affordable ? null : (
              /* A prompt, never a blocking error — E8's frontend notes. */
              <div className="flex flex-col gap-2 rounded-block bg-sand p-4">
                <p className="font-ui text-body-sm text-secondary">
                  You need <span data-figure>{COST - credits}</span> more credits to make a
                  logo.
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
              We could not make a mark from that name.
            </p>
            <Notes notes={phase.notes} />
            <p className="font-ui text-body-sm text-muted">
              You were not charged. A shorter shop name usually works — or upload a logo file
              instead.
            </p>
          </div>
        ) : null}

        {phase.at === 'picking' || phase.at === 'saving' ? (
          <MachineOutput label="Drawn from your name and your colours">
            <div className="flex flex-col gap-4">
              <Notes notes={phase.notes} />

              <ul className="grid grid-cols-2 gap-3">
                {phase.marks.map((mark, index) => (
                  <li key={mark.url}>
                    <button
                      type="button"
                      disabled={phase.at === 'saving'}
                      onClick={() => adopt(index)}
                      aria-label={`Use the ${mark.structure} mark`}
                      className="flex w-full flex-col gap-2 rounded-block border border-border-strong p-3 text-start hover:bg-stone-100 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                    >
                      <MarkPreview mark={mark} palette={palette} family={family} />
                      <span className="font-ui text-label text-primary">
                        {phase.at === 'saving' && phase.index === index
                          ? 'Saving…'
                          : LABEL[mark.structure]}
                      </span>
                      <span className="font-ui text-body-sm text-secondary">{mark.why}</span>
                    </button>
                  </li>
                ))}
              </ul>

              {phase.at === 'picking' && phase.error !== undefined ? (
                <p className="font-ui text-body-sm text-critical-fg">{phase.error}</p>
              ) : null}

              <p className="font-ui text-body-sm text-muted">
                Pick one to use it. You can upload a real logo file over it whenever you have
                one.
              </p>
            </div>
          </MachineOutput>
        ) : null}
      </div>
    </Dialog>
  )
}

/** The structures in the owner's words. `LOGO_STRUCTURE_NOTE` is the hint. */
const LABEL: Readonly<Record<LogoStructure, string>> = {
  wordmark: 'Your name',
  monogram: 'Initials',
  badge: 'A badge',
  lockup: 'A symbol',
}

/**
 * One candidate, drawn here through the engine.
 *
 * `dangerouslySetInnerHTML` over a string this component just produced from a
 * pure function in `@souqstudio/engine` — not over anything fetched. The model's
 * strings reach it through `drawMark`, which XML-escapes every one of them, and
 * the choice is re-validated against the schema before it is drawn at all.
 */
function MarkPreview({
  mark,
  palette,
  family,
}: {
  mark: Mark
  palette: string[]
  family: string
}) {
  const svg = React.useMemo(() => {
    const parsed = logoChoiceSchema.safeParse(mark.choice)
    if (!parsed.success) return null

    const skin = skinFrom(palette, parsed.data)
    return skin === null ? null : drawMark(parsed.data, skin, family)
  }, [mark.choice, palette, family])

  if (svg === null) {
    // A mark this build cannot draw still exists as a file, so it is shown as
    // one rather than hidden — the typeface will be the fallback, which is worth
    // more than an empty square.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={mark.url} alt={`${mark.structure} mark`} className="aspect-square w-full" />
    )
  }

  return (
    <span
      aria-hidden="true"
      className="block aspect-square w-full [&>svg]:size-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

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

type Outcome =
  | { kind: 'marks'; marks: Mark[]; notes: string[] }
  | { kind: 'declined'; notes: string[] }

/** Wait for the worker. Two seconds, as every long operation in this product. */
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
      result: { marks?: Mark[]; notes?: string[] } | null
    }>(`/api/v1/ai/jobs/${jobId}`)

    if (job.status === 'failed') {
      // "This name will not make a mark" is an answer, not a fault, and it
      // charged nothing.
      if (job.errorMessage === 'no_mark') {
        return { kind: 'declined', notes: job.result?.notes ?? [] }
      }
      throw new Error('That did not finish. You were not charged — try again.')
    }

    if (job.status !== 'complete') continue

    const marks = job.result?.marks ?? []
    if (marks.length === 0) throw new Error('That did not finish. You were not charged.')

    return { kind: 'marks', marks, notes: job.result?.notes ?? [] }
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
