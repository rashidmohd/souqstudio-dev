'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  CHARACTER_GENDERS,
  CHARACTER_LOOKS,
  CHARACTER_LOOK_NOTE,
  CHARACTER_STYLES,
  CHARACTER_STYLE_NOTE,
  type CharacterGender,
  type CharacterLook,
  type CharacterStyle,
} from '@souqstudio/engine'
import { Dialog } from '@/components/ui/dialog'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { MachineOutput } from '@/components/ui/machine-output'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'

/**
 * A branded character from a uniform photograph. E8-01.
 *
 * **The consent step is the first screen, not a checkbox on the last one.** The
 * photograph is of somebody's staff and it leaves this platform for a
 * third-party model. An owner has to be told that before they choose a file,
 * because afterwards the question is rhetorical — they have already found the
 * photo and the only thing left to do is agree. It is a separate step for the
 * same reason `(auth)` has one decision per screen.
 *
 * **What is sent onward is a sentence about a polo shirt.** A vision model
 * reduces the photograph to a description of the clothing — the schema it
 * answers against cannot carry a description of a face — and the image model is
 * given that description. The picture reaches one provider, once. The copy says
 * so, because it is the thing the owner is being asked to agree to.
 */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  credits: number
  onCreated: () => void
}

/** `CREDIT_COSTS.character_gen`, restated for a client bundle. */
const COST = 10

const ACCEPT = 'image/png,image/jpeg,image/webp'

type Variation = { url: string; key: string }

type Phase =
  | { at: 'consent' }
  | { at: 'choose'; error?: string }
  | { at: 'working' }
  | { at: 'declined'; notes: string[] }
  | { at: 'picking'; jobId: string; variations: Variation[]; notes: string[]; error?: string }
  | { at: 'saving'; jobId: string; variations: Variation[]; notes: string[]; index: number }

const STYLE_LABEL: Readonly<Record<CharacterStyle, string>> = {
  cartoon: 'Cartoon',
  'semi-realistic': 'Semi-realistic',
  flat: 'Flat',
  mascot: 'Mascot',
}

const GENDER_LABEL: Readonly<Record<CharacterGender, string>> = {
  male: 'Male',
  female: 'Female',
  both: 'Both',
}

export function CharacterDialog({ open, onOpenChange, credits, onCreated }: Props) {
  const [phase, setPhase] = React.useState<Phase>({ at: 'consent' })
  const [style, setStyle] = React.useState<CharacterStyle>('cartoon')
  const [gender, setGender] = React.useState<CharacterGender>('both')
  const [look, setLook] = React.useState<CharacterLook>('unspecified')

  React.useEffect(() => {
    if (open) {
      setPhase({ at: 'consent' })
      setStyle('cartoon')
      setGender('both')
      setLook('unspecified')
    }
  }, [open])

  const affordable = credits >= COST

  async function submit(file: File) {
    setPhase({ at: 'working' })
    try {
      const outcome = await generate(file, { style, gender, look })
      setPhase(
        outcome.kind === 'declined'
          ? { at: 'declined', notes: outcome.notes }
          : {
              at: 'picking',
              jobId: outcome.jobId,
              variations: outcome.variations,
              notes: outcome.notes,
            }
      )
    } catch (error) {
      setPhase({ at: 'choose', error: message(error) })
    }
  }

  async function keep(index: number) {
    if (phase.at !== 'picking') return
    const { jobId, variations, notes } = phase
    setPhase({ at: 'saving', jobId, variations, notes, index })

    try {
      await json('/api/v1/characters', { jobId, index })
      onCreated()
      onOpenChange(false)
    } catch (error) {
      setPhase({ at: 'picking', jobId, variations, notes, error: message(error) })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Make a character"
      description="A cartoon shop worker wearing your own uniform, for the covers and banners of your offer books. Made once and reused everywhere."
      {...(phase.at === 'picking' || phase.at === 'declined'
        ? { secondaryAction: { label: 'Start again', onClick: () => setPhase({ at: 'choose' }) } }
        : {})}
    >
      <div className="flex flex-col gap-4 pb-2">
        {phase.at === 'consent' ? (
          <div className="flex flex-col gap-3">
            <p className="font-ui text-body text-primary">
              We need a photo of your staff uniform.
            </p>
            {/*
             * Said plainly, and said before the file picker opens. The three
             * facts an owner needs to decide are what leaves, where it goes, and
             * what is kept — in that order, because that is the order they
             * matter.
             */}
            <ul className="flex flex-col gap-2">
              <li className="font-ui text-body-sm text-secondary">
                The photo is sent to an outside company&apos;s AI service, outside the UAE, to
                be read.
              </li>
              <li className="font-ui text-body-sm text-secondary">
                It is read once, for the clothing only — the colour, the type, where a logo
                sits. Nothing about the people in it is recorded or passed on.
              </li>
              <li className="font-ui text-body-sm text-secondary">
                We do not keep the photo. What we keep is the description of the uniform and
                the character drawn from it.
              </li>
              <li className="font-ui text-body-sm text-secondary">
                If your staff are in the photo, it is up to you to have their permission
                first.
              </li>
            </ul>

            <button
              type="button"
              onClick={() => setPhase({ at: 'choose' })}
              className="inline-flex h-control w-fit items-center rounded-pill bg-action-primary px-3 font-ui text-label text-action-primary-fg hover:bg-action-primary-hover"
            >
              I understand — choose a photo
            </button>
            <p className="font-ui text-body-sm text-muted">
              You can photograph the uniform on a hanger instead. It works just as well.
            </p>
          </div>
        ) : null}

        {phase.at === 'choose' || phase.at === 'working' ? (
          <>
            <p className="font-ui text-body-sm text-secondary">
              Costs <span data-figure>{COST}</span> credits for{' '}
              <span data-figure>4</span> characters. You have{' '}
              <span data-figure>{credits}</span>.
            </p>

            <div className="flex flex-col gap-2">
              <span className="font-ui text-label font-medium text-primary">Style</span>
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <Segmented
                  label="Which style of character"
                  value={style}
                  disabled={phase.at === 'working'}
                  options={CHARACTER_STYLES.map((value) => ({
                    value,
                    label: STYLE_LABEL[value],
                  }))}
                  onChange={setStyle}
                />
              </div>
              <p className="font-ui text-body-sm text-muted">{CHARACTER_STYLE_NOTE[style]}</p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-ui text-label font-medium text-primary">Who</span>
              <Segmented
                label="Male, female or both"
                value={gender}
                disabled={phase.at === 'working'}
                options={CHARACTER_GENDERS.map((value) => ({
                  value,
                  label: GENDER_LABEL[value],
                }))}
                onChange={setGender}
              />
            </div>

            <Select
              label="Look"
              hint="Guides the face and skin tone. Leave it unspecified if you would rather not choose."
              value={look}
              disabled={phase.at === 'working'}
              options={CHARACTER_LOOKS.map((value) => ({
                value,
                label: CHARACTER_LOOK_NOTE[value],
              }))}
              onChange={(event) => setLook(event.target.value as CharacterLook)}
            />

            <FileDropzone
              label="A photo of your uniform"
              accept={ACCEPT}
              onFile={submit}
              hint="PNG, JPG or WebP. On a hanger is fine — and avoids photographing anyone."
              busy={phase.at === 'working'}
              disabled={!affordable}
              {...(phase.at === 'choose' && phase.error !== undefined
                ? { error: phase.error }
                : {})}
            />

            {affordable ? null : (
              <div className="flex flex-col gap-2 rounded-block bg-sand p-4">
                <p className="font-ui text-body-sm text-secondary">
                  You need <span data-figure>{COST - credits}</span> more credits to make a
                  character.
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
              We could not find a uniform in that photo.
            </p>
            <Notes notes={phase.notes} />
            <p className="font-ui text-body-sm text-muted">
              You were not charged. A photo of the shirt or apron on its own, filling most of
              the frame, works best.
            </p>
          </div>
        ) : null}

        {phase.at === 'picking' || phase.at === 'saving' ? (
          <MachineOutput label="Drawn from your uniform">
            <div className="flex flex-col gap-4">
              <Notes notes={phase.notes} />

              <ul className="grid grid-cols-2 gap-3">
                {phase.variations.map((variation, index) => (
                  <li key={variation.key}>
                    <button
                      type="button"
                      disabled={phase.at === 'saving'}
                      onClick={() => void keep(index)}
                      aria-label={`Keep character ${index + 1}`}
                      className="flex w-full flex-col gap-2 rounded-block border border-border-strong p-2 hover:bg-stone-100 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={variation.url}
                        alt={`Character ${index + 1}`}
                        className="aspect-square w-full rounded-chip object-contain"
                      />
                      <span className="font-ui text-label text-primary">
                        {phase.at === 'saving' && phase.index === index ? 'Saving…' : 'Keep this'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {phase.at === 'picking' && phase.error !== undefined ? (
                <p className="font-ui text-body-sm text-critical-fg">{phase.error}</p>
              ) : null}

              <p className="font-ui text-body-sm text-muted">
                Keep one and it joins your brand kit. The others are discarded.
              </p>
            </div>
          </MachineOutput>
        ) : null}
      </div>
    </Dialog>
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
  | { kind: 'variations'; jobId: string; variations: Variation[]; notes: string[] }
  | { kind: 'declined'; notes: string[] }

/**
 * Presign, PUT, queue, poll — the same four steps magic block takes, and the
 * bytes never pass through a route for the same reason.
 *
 * `consent: true` is sent because the owner passed the consent step to get here.
 * The route requires the literal, so a client that skipped the screen is refused
 * rather than defaulted.
 */
async function generate(
  file: File,
  choice: { style: CharacterStyle; gender: CharacterGender; look: CharacterLook }
): Promise<Outcome> {
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

  const queued = await json<{ jobId: string }>('/api/v1/characters/generate', {
    sourceKey: presign.assetId,
    ...choice,
    consent: true,
  })

  return poll(queued.jobId)
}

async function poll(jobId: string): Promise<Outcome> {
  // Longer than the other features' three minutes: four image generations is
  // the slowest thing this product asks a provider for.
  const deadline = Date.now() + 5 * 60 * 1000

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error('That is taking longer than it should. Check your brand kit in a minute.')
    }

    await new Promise((resolve) => setTimeout(resolve, 2500))

    const job = await read<{
      status: string
      errorMessage: string | null
      result: { variations?: Variation[]; notes?: string[] } | null
    }>(`/api/v1/ai/jobs/${jobId}`)

    if (job.status === 'failed') {
      // Two of these are answers rather than faults, and neither charged.
      if (job.errorMessage === 'no_uniform') {
        return { kind: 'declined', notes: job.result?.notes ?? [] }
      }
      if (job.errorMessage === 'image_refused') {
        return {
          kind: 'declined',
          notes: [
            'The drawing service would not work from that photo. A picture of the uniform on its own, with nobody in it, usually goes through.',
            ...(job.result?.notes ?? []),
          ],
        }
      }
      throw new Error(
        job.errorMessage === 'unreadable_uniform'
          ? 'We could not read that photo. Try a clearer one.'
          : 'That did not finish. You were not charged — try again.'
      )
    }

    if (job.status !== 'complete') continue

    const variations = job.result?.variations ?? []
    if (variations.length === 0) throw new Error('That did not finish. You were not charged.')

    return { kind: 'variations', jobId, variations, notes: job.result?.notes ?? [] }
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
