'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import type { ApiResult } from '@souqstudio/types'
import { MachineOutput } from '@souqstudio/designer/components/ui/machine-output'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/input'
import { ErrorState } from '@/components/ui/states'

type Option = { value: string; label: string }

type Phase =
  | { at: 'idle' }
  | { at: 'working'; step: string }
  | {
      at: 'done'
      blockId: string
      confidence: string | null
      notes: string[]
    }
  | { at: 'declined'; notes: string[] }

const ACCEPT = 'image/png,image/jpeg,image/webp'
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Start a library draft from a picture. E13-04, the admin half of E8-07.
 *
 * Presign, PUT, queue, poll, the same four steps as the shop app's dialog: the
 * bytes go straight to R2, the worker reads them, and the result is a draft.
 * Here the draft is SouqStudio's, and nothing is charged.
 *
 * **The result is marked as machine output**, as everywhere a model's work is
 * shown: the team must be able to tell the layout was matched by a model before
 * it becomes a block in every shop's library.
 */
export function MagicBlockForm({ kinds }: { kinds: readonly Option[] }) {
  const file = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState(kinds[0]?.value ?? 'offer-card')
  const [phase, setPhase] = useState<Phase>({ at: 'idle' })
  const [error, setError] = useState<string | null>(null)

  async function json<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init)
    const body = (await response.json()) as ApiResult<T>
    if (body.error !== null) throw new Error(body.error.message)
    return body.data
  }

  async function run() {
    const chosen = file.current?.files?.[0]
    if (chosen === undefined) {
      setError('Choose a picture first.')
      return
    }
    if (chosen.size > MAX_BYTES) {
      setError('That picture is over 10 MB. Use a smaller one.')
      return
    }
    setError(null)

    try {
      setPhase({ at: 'working', step: 'Uploading the picture' })
      const presign = await json<{ uploadUrl: string; assetId: string }>(
        '/api/v1/admin/blocks/artwork',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contentType: chosen.type, contentLength: chosen.size }),
        }
      )
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': chosen.type },
        body: chosen,
      })
      if (!put.ok) throw new Error('The upload did not finish. Check the connection and try again.')

      setPhase({ at: 'working', step: 'Reading the design' })
      const queued = await json<{ jobId: string }>('/api/v1/admin/blocks/magic', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceKey: presign.assetId, category: kind }),
      })

      // Two seconds is slower than the eye and far cheaper than a connection
      // held open for the thirty a vision call takes.
      const deadline = Date.now() + 3 * 60 * 1000
      for (;;) {
        if (Date.now() > deadline) {
          throw new Error('That is taking longer than it should. Check the drafts in a minute.')
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
        const job = await json<{
          status: string
          errorMessage: string | null
          result: { blockId?: string; confidence?: string; notes?: string[] } | null
        }>(`/api/v1/admin/blocks/magic/${queued.jobId}`)

        if (job.status === 'failed') {
          if (job.errorMessage === 'no_match') {
            setPhase({ at: 'declined', notes: job.result?.notes ?? [] })
            return
          }
          throw new Error(
            job.errorMessage === 'unreadable_design'
              ? 'The picture could not be read. Try a clearer one, cropped to the design.'
              : 'That did not finish. Try again.'
          )
        }
        if (job.status !== 'complete') continue

        const blockId = job.result?.blockId
        if (blockId === undefined) throw new Error('That did not finish. Try again.')
        setPhase({
          at: 'done',
          blockId,
          confidence: job.result?.confidence ?? null,
          notes: job.result?.notes ?? [],
        })
        return
      }
    } catch (problem) {
      setPhase({ at: 'idle' })
      setError(problem instanceof Error ? problem.message : 'That did not finish. Try again.')
    }
  }

  const working = phase.at === 'working'

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-subhead text-primary">From a picture</h2>
        <p className="text-body-sm text-secondary">
          Upload a photo or screenshot of a card, header or panel. A model matches it to a layout
          the library already draws and saves it as a draft in the library colours. Nothing is
          charged.
        </p>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          void run()
        }}
      >
        <Field label="What the picture shows" htmlFor="magic-kind" required>
          <Select
            id="magic-kind"
            value={kind}
            disabled={working}
            onChange={(event) => setKind(event.target.value)}
          >
            {kinds.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Picture" htmlFor="magic-file" required hint="PNG, JPG or WebP, up to 10 MB.">
          <input
            ref={file}
            id="magic-file"
            type="file"
            accept={ACCEPT}
            required
            disabled={working}
            className="text-body-sm text-primary"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" loading={working}>
            Read the picture
          </Button>
          {working ? (
            <span role="status" className="text-body-sm text-secondary">
              {phase.step}. This takes up to a minute.
            </span>
          ) : null}
        </div>
      </form>

      {phase.at === 'done' ? (
        <MachineOutput label="Matched from your picture">
          <div className="flex flex-col gap-2">
            {phase.confidence === 'high' ? null : (
              <p className="text-body-sm text-secondary">
                The model was not certain about this one. Check it in the designer before
                publishing.
              </p>
            )}
            {phase.notes.length === 0 ? null : (
              <ul className="flex list-disc flex-col gap-1 ps-4 text-body-sm text-secondary">
                {phase.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
            <p className="text-body-sm text-secondary">
              Saved as a library draft. Shops see nothing until it is published.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={`/blocks/${phase.blockId}/edit`} className="text-body text-link underline">
                Open in designer
              </Link>
              <Link href={`/blocks/${phase.blockId}`} className="text-body text-link underline">
                See the draft
              </Link>
            </div>
          </div>
        </MachineOutput>
      ) : null}

      {phase.at === 'declined' ? (
        <div className="flex flex-col gap-2 rounded-block bg-sand p-3">
          <p className="text-body text-charcoal">
            That picture did not match any layout of this kind, so no draft was made.
          </p>
          {phase.notes.length === 0 ? null : (
            <MachineOutput label="The model's reason">
              <ul className="flex list-disc flex-col gap-1 ps-4 text-body-sm text-secondary">
                {phase.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </MachineOutput>
          )}
        </div>
      ) : null}

      {error === null ? null : <ErrorState title="Not done" body={error} />}
    </Card>
  )
}
