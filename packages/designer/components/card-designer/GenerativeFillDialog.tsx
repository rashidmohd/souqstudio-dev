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
import { clearFill, read, startFill, useFillJobs } from '../../lib/fill-jobs'

/**
 * Generative fill: words for the text an owner would otherwise type, from a
 * short brief and the shop's profile.
 *
 * **Three screens in one dialog: ask, wait, review.** The wait can be left:
 * the job belongs to `lib/fill-jobs.ts`, so closing this mid-write keeps it
 * running, and the designer says when it is ready. Nothing reaches the
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
  /** For the notice that reports the job if the owner has moved on. */
  blockName: string
  /** The free text the fill will write, in paint order. */
  targets: readonly FreeTextElement[]
  /** Whether `targets` came from a selection, for the sentence that says so. */
  fromSelection: boolean
  /** The open layout's aspect, which sizes each line's budget. */
  aspect: number
  onApply: (lines: readonly FillLine[]) => void
}

type Quote = { creditsCost: number; balance: number }

export function GenerativeFillDialog({
  open,
  onOpenChange,
  blockId,
  blockName,
  targets,
  fromSelection,
  aspect,
  onApply,
}: Props) {
  const { fillUrl } = useDesignerHost()
  const [brief, setBrief] = React.useState('')
  const [quote, setQuote] = React.useState<Quote | null>(null)
  /**
   * The step is the job's, not the dialog's. It lives in `fill-jobs` so that
   * closing this, or the designer window, does not drop a job the worker is
   * still running and will charge for.
   */
  const job = useFillJobs((state) => state.jobs[blockId])

  // A fresh quote each time it opens: the balance moves as other jobs finish.
  // The brief survives, because an owner reopening to try again has usually
  // only closed the dialog to look at the block.
  React.useEffect(() => {
    if (!open || fillUrl === null) return
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
  const error = job?.state === 'failed' ? job.error : null

  function write() {
    if (fillUrl === null) return
    void startFill({
      fillUrl,
      blockId,
      blockName,
      payload: { blockId, brief, slots: fillSlots(writable, aspect) },
    })
  }

  const byId = new Map(writable.map((element) => [element.id, element]))

  if (job?.state === 'ready') {
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
            onApply(job.lines)
            clearFill(blockId)
            onOpenChange(false)
          },
        }}
        secondaryAction={{ label: 'Write again', onClick: write }}
      >
        <MachineOutput label="Written by AI">
          <ul className="flex flex-col gap-4">
            {job.lines.map((line) => {
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
        {job.lines.length < writable.length ? (
          <p className="pt-3 font-ui text-body-sm text-secondary">
            <Figure value={writable.length - job.lines.length} size="data-sm" /> of the lines came
            back empty and keep their current text.
          </p>
        ) : null}
      </Dialog>
    )
  }

  const working = job?.state === 'working'

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
                if (!working && !short) write()
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
                Writing. This usually takes under a minute. You can close this and keep
                designing, and we will tell you when the text is ready.
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
