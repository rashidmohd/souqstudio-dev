'use client'

import * as React from 'react'
import {
  MAX_FILL_BRIEF,
  MAX_FILL_LINES,
  fillSlots,
  type FillLine,
  type FreeTextElement,
} from '@souqstudio/engine'
import { Dialog } from '../ui/dialog'
import { Figure } from '../ui/figure'
import { MachineOutput } from '../ui/machine-output'
import { Textarea } from '../ui/textarea'
import { useDesignerHost } from '../../lib/designer-host'

/**
 * Generative fill: words for the text an owner would otherwise type, from a
 * short brief and the shop's profile.
 *
 * **Three screens in one dialog: ask, wait, review.** Nothing reaches the
 * block until the owner presses "Use this text", and then it lands as one
 * undo step. What comes back is shown under `MachineOutput`, and each line
 * keeps a machine mark on the block until the owner edits it.
 *
 * **The price is quoted before the owner commits**, from the same route that
 * starts the job, so the number here is the number charged.
 */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  blockId: string
  /** The free text the fill will write, in paint order. */
  targets: readonly FreeTextElement[]
  /** Whether `targets` came from a selection, for the sentence that says so. */
  fromSelection: boolean
  /** The open layout's aspect, which sizes each line's budget. */
  aspect: number
  onApply: (lines: readonly FillLine[]) => void
}

type Quote = { creditsCost: number; balance: number }

type Step = { kind: 'ask' } | { kind: 'working' } | { kind: 'review'; lines: FillLine[] }

export function GenerativeFillDialog({
  open,
  onOpenChange,
  blockId,
  targets,
  fromSelection,
  aspect,
  onApply,
}: Props) {
  const { fillUrl } = useDesignerHost()
  const [brief, setBrief] = React.useState('')
  const [step, setStep] = React.useState<Step>({ kind: 'ask' })
  const [quote, setQuote] = React.useState<Quote | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // A fresh quote each time it opens: the balance moves as other jobs finish.
  // The brief survives, because an owner reopening to try again has usually
  // only closed the dialog to look at the block.
  React.useEffect(() => {
    if (!open || fillUrl === null) return
    setStep({ kind: 'ask' })
    setError(null)
    let live = true
    void read<Quote>(fetch(fillUrl))
      .then((next) => {
        if (live) setQuote(next)
      })
      .catch(() => {
        if (live) setQuote(null)
      })
    return () => {
      live = false
    }
  }, [open, fillUrl])

  if (fillUrl === null) return null

  const writable = targets.slice(0, MAX_FILL_LINES)
  const cost = quote?.creditsCost ?? null
  const short = quote !== null && quote.creditsCost > quote.balance

  async function write() {
    if (fillUrl === null) return
    setStep({ kind: 'working' })
    setError(null)

    try {
      const started = await read<{ jobId: string }>(
        fetch(fillUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ blockId, brief, slots: fillSlots(writable, aspect) }),
        })
      )
      const lines = await poll(started.jobId)
      setStep({ kind: 'review', lines })
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not finish. Try again.')
      setStep({ kind: 'ask' })
    }
  }

  const byId = new Map(writable.map((element) => [element.id, element]))

  if (step.kind === 'review') {
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        size="lg"
        title="Generative fill"
        description="Check the words before you use them. You can edit any line afterwards."
        primaryAction={{
          label: 'Use this text',
          onClick: () => {
            onApply(step.lines)
            onOpenChange(false)
          },
        }}
        secondaryAction={{ label: 'Write again', onClick: () => void write() }}
      >
        <MachineOutput label="Written by AI">
          <ul className="flex flex-col gap-4">
            {step.lines.map((line) => {
              const was = byId.get(line.id)?.source.textEn ?? ''
              return (
                <li key={line.id} className="flex flex-col gap-1">
                  {was === '' ? null : (
                    <span className="font-ui text-body-sm text-muted">Replaces: {was}</span>
                  )}
                  <span className="font-ui text-body text-primary">{line.textEn}</span>
                  <span className="font-ui text-body text-primary" dir="rtl" lang="ar">
                    {line.textAr}
                  </span>
                </li>
              )
            })}
          </ul>
        </MachineOutput>
        {step.lines.length < writable.length ? (
          <p className="pt-3 font-ui text-body-sm text-secondary">
            <Figure value={writable.length - step.lines.length} size="data-sm" /> of the lines came
            back empty and keep their current text.
          </p>
        ) : null}
      </Dialog>
    )
  }

  const working = step.kind === 'working'

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Generative fill"
      description="Writes English and Arabic for the text you type yourself, using your shop profile. Text that shows your shop, brand or book details is left as it is."
      primaryAction={
        writable.length === 0
          ? undefined
          : {
              label: 'Write text',
              loading: working,
              onClick: () => {
                if (!working && !short) void write()
              },
            }
      }
    >
      <div className="flex flex-col gap-4">
        {writable.length === 0 ? (
          <p className="font-ui text-body text-secondary">
            {fromSelection
              ? 'Nothing you selected is text you type yourself. Select a text layer that shows "Text you type", or clear the selection to fill every one.'
              : 'This block has no text you type yourself. Add a text layer, or switch one to "Text you type".'}
          </p>
        ) : (
          <>
            <p className="font-ui text-body text-secondary">
              Fills <Figure value={writable.length} size="data-sm" />{' '}
              {writable.length === 1 ? 'text layer' : 'text layers'}
              {fromSelection ? ' you selected.' : ' in this block, in every layout.'}
              {targets.length > MAX_FILL_LINES
                ? ` Only the first ${MAX_FILL_LINES} are filled at a time.`
                : ''}
            </p>

            <Textarea
              label="What is this for?"
              rows={3}
              value={brief}
              maxLength={MAX_FILL_BRIEF}
              disabled={working}
              placeholder="Weekend offers on fresh fruit and vegetables"
              hint="Optional. A few words about the offer or the occasion help."
              onChange={(event) => setBrief(event.target.value)}
            />

            {cost === null ? null : (
              <p className="font-ui text-body-sm text-secondary">
                {cost === 0 ? (
                  'Free.'
                ) : (
                  <>
                    Costs <Figure value={cost} size="data-sm" /> {cost === 1 ? 'credit' : 'credits'}.
                    You have <Figure value={quote?.balance ?? 0} size="data-sm" />.
                  </>
                )}
              </p>
            )}

            {short ? (
              <p className="font-ui text-body-sm text-critical-fg" role="alert">
                You do not have enough credits for a fill. Top up to carry on.
              </p>
            ) : null}

            {working ? (
              <p className="font-ui text-body-sm text-secondary" role="status">
                Writing. This usually takes under a minute.
              </p>
            ) : null}

            {error === null ? null : (
              <p className="font-ui text-body-sm text-critical-fg" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  )
}

/**
 * Wait for the worker, polling the one AI job route every feature shares.
 * Two seconds, three minutes: the same shape as magic block.
 */
async function poll(jobId: string): Promise<FillLine[]> {
  const deadline = Date.now() + 3 * 60 * 1000

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error('That is taking longer than it should. Try again in a minute.')
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))

    const job = await read<{
      status: string
      errorMessage: string | null
      result: { lines?: FillLine[] } | null
    }>(fetch(`/api/v1/ai/jobs/${jobId}`))

    if (job.status === 'failed') {
      throw new Error(
        job.errorMessage === 'declined'
          ? 'The model would not write this. Try a different brief. You were not charged.'
          : 'That did not finish. You were not charged. Try again.'
      )
    }

    if (job.status !== 'complete') continue

    const lines = job.result?.lines ?? []
    if (lines.length === 0) throw new Error('That came back empty. Try again.')
    return lines
  }
}

/**
 * `{ data, error }`, every route. The `message` is written for a shop owner,
 * so it is shown rather than replaced.
 */
async function read<T>(request: Promise<Response>): Promise<T> {
  const response = await request
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
