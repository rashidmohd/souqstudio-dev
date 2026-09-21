'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  CHARACTER_GENDERS,
  CHARACTER_LOOKS,
  CHARACTER_LOOK_NOTE,
  CHARACTER_STYLES,
  CHARACTER_STYLE_NOTE,
  CHARACTER_VARIATIONS,
  MAX_GOAL,
  MAX_UNIFORM_ANGLES,
  type CharacterGender,
  type CharacterLook,
  type CharacterStyle,
} from '@souqstudio/engine'
import { Button } from '@/components/ui/button'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { Input } from '@/components/ui/input'
import { MachineOutput } from '@/components/ui/machine-output'
import { Segmented } from '@/components/ui/segmented'
import { ImageViewer } from '@/components/brand/ImageViewer'
import { Select } from '@/components/ui/select'

/**
 * Making a character. E8-01.
 *
 * **A flow on its own screen, not a dialog.** It was a dialog first and that was
 * wrong in a way worth writing down: a dialog implies one decision, and this is
 * five — two of which are prerequisites the owner may have to leave and go and
 * do. A modal that tells somebody their shop profile is incomplete and then has
 * to be dismissed to fix it is a dead end with a close button on it.
 *
 * **Gated, and the gate is real.** A character that does not know what the shop
 * sells is four generic people: a butcher and an electronics shop do not want
 * the same picture. `POST /characters/generate` refuses on the same two
 * conditions, so the gate is not merely a screen a client could skip.
 *
 * **Two kinds of photograph, kept apart the whole way.** Uniform photographs go
 * to a vision model, which reduces them to a sentence about clothing, and stop
 * there. Photographs of the shop go to the image model as a *scene*. That
 * separation is the reason a generated person cannot resemble a real employee:
 * their picture is not in the drawing request at all.
 */

const COST = 10
const ACCEPT = 'image/png,image/jpeg,image/webp'

type Variation = { url: string; key: string }

type Props = {
  credits: number
  /** Resolved on the server — both are refused by the route as well. */
  profileComplete: boolean
  profileGaps: string[]
  brandComplete: boolean
  shopId: string
  /** The shop's own photographs, from its profile. Offered as a scene. */
  storePhotoUrls: string[]
  storePhotoKeys: string[]
  /** The brand kit's logo, offered as the one to wear. Null when there is none. */
  brandLogoUrl: string | null
  /**
   * A finished generation to reopen rather than start a new one.
   *
   * The bell in the rail links here with it. Everything before the picker is
   * skipped: the work is done and paid for, and asking somebody to answer five
   * screens again to reach images that already exist would be the same bug
   * wearing a different face.
   */
  resumeJobId?: string
}

type Step = 'uniform' | 'scene' | 'style' | 'consent'

type Phase =
  | { at: 'form'; step: Step; error?: string }
  | { at: 'working' }
  | { at: 'declined'; notes: string[] }
  | { at: 'picking'; jobId: string; variations: Variation[]; notes: string[]; error?: string }
  | { at: 'saving'; jobId: string; variations: Variation[]; notes: string[]; index: number }

const STYLE_LABEL: Readonly<Record<CharacterStyle, string>> = {
  cartoon: 'Cartoon',
  'semi-realistic': 'Semi-realistic',
  flat: 'Flat',
  mascot: 'Mascot',
  'photo-real': 'Photo',
}

const GENDER_LABEL: Readonly<Record<CharacterGender, string>> = {
  male: 'Male',
  female: 'Female',
  both: 'Both',
}

const STEPS: Step[] = ['uniform', 'scene', 'style', 'consent']

const STEP_TITLE: Readonly<Record<Step, string>> = {
  uniform: 'Your uniform',
  scene: 'Where they are, and what for',
  style: 'How they should look',
  consent: 'Before we send anything',
}

export function CharacterFlow({
  credits,
  profileComplete,
  profileGaps,
  brandComplete,
  shopId,
  storePhotoUrls,
  storePhotoKeys,
  brandLogoUrl,
  resumeJobId,
}: Props) {
  const router = useRouter()
  const [phase, setPhase] = React.useState<Phase>(
    resumeJobId === undefined ? { at: 'form', step: 'uniform' } : { at: 'working' }
  )

  const [mainFile, setMainFile] = React.useState<File | null>(null)
  const [angleFiles, setAngleFiles] = React.useState<File[]>([])
  const [useScene, setUseScene] = React.useState(false)
  const [goal, setGoal] = React.useState('')
  /** Whose logo goes on the uniform: none, the brand kit's, or an upload. */
  const [logoSource, setLogoSource] = React.useState<'none' | 'brand' | 'upload'>('none')
  const [logoFile, setLogoFile] = React.useState<File | null>(null)
  /** Which variation is open large, if any. Viewing is not choosing. */
  const [viewing, setViewing] = React.useState<number | null>(null)
  const [style, setStyle] = React.useState<CharacterStyle>('cartoon')
  const [gender, setGender] = React.useState<CharacterGender>('both')
  const [look, setLook] = React.useState<CharacterLook>('unspecified')

  /**
   * Seconds since the drawing started.
   *
   * **Keyed on the phase**, so one interval exists while the work does and is
   * cleared the moment it ends — including when an owner navigates away
   * mid-draw, which does not cancel the job. The same clock the cover dialog
   * runs, for the same reason: a minute with no number on it is a minute
   * somebody assumes is broken.
   */
  const [elapsed, setElapsed] = React.useState(0)
  React.useEffect(() => {
    if (phase.at !== 'working') return
    setElapsed(0)
    const ticking = setInterval(() => setElapsed((was) => was + 1), 1000)
    return () => clearInterval(ticking)
  }, [phase.at])

  const ready = profileComplete && brandComplete
  const affordable = credits >= COST

  /**
   * Reopening a finished generation.
   *
   * **It polls rather than reading once**, because the bell is not the only way
   * in: a link shared or a tab reopened while the job is still running should
   * wait for it rather than reporting that nothing is there. `poll` already
   * returns immediately for a job that is complete.
   */
  React.useEffect(() => {
    if (resumeJobId === undefined) return
    let live = true

    void (async () => {
      try {
        const outcome = await poll(resumeJobId)
        if (!live) return
        setPhase(
          outcome.kind === 'declined'
            ? { at: 'declined', notes: outcome.notes }
            : {
                at: 'picking',
                jobId: resumeJobId,
                variations: outcome.variations,
                notes: outcome.notes,
              }
        )
      } catch (error) {
        if (live) setPhase({ at: 'form', step: 'uniform', error: message(error) })
      }
    })()

    return () => {
      live = false
    }
  }, [resumeJobId])

  if (!ready) return <NotReady gaps={profileGaps} brandComplete={brandComplete} shopId={shopId} />

  async function generate() {
    if (mainFile === null) {
      setPhase({ at: 'form', step: 'uniform', error: 'Add a photo of your uniform first.' })
      return
    }

    setPhase({ at: 'working' })

    try {
      const sourceKey = await upload(mainFile)
      const angleKeys = await Promise.all(angleFiles.map(upload))

      const logoKey =
        logoSource === 'upload' && logoFile !== null ? await upload(logoFile) : undefined

      const queued = await json<{ jobId: string }>('/api/v1/characters/generate', {
        sourceKey,
        angleKeys,
        style,
        gender,
        look,
        consent: true,
        ...(useScene && storePhotoKeys.length > 0 ? { sceneKeys: storePhotoKeys } : {}),
        ...(goal.trim() === '' ? {} : { goal: goal.trim() }),
        ...(logoKey === undefined ? {} : { logoKey }),
        ...(logoSource === 'brand' ? { useBrandLogo: true } : {}),
      })

      const outcome = await poll(queued.jobId)
      setPhase(
        outcome.kind === 'declined'
          ? { at: 'declined', notes: outcome.notes }
          : {
              at: 'picking',
              jobId: queued.jobId,
              variations: outcome.variations,
              notes: outcome.notes,
            }
      )
    } catch (error) {
      setPhase({ at: 'form', step: 'consent', error: message(error) })
    }
  }

  async function keep(indexes: number[]) {
    if (phase.at !== 'picking') return
    const { jobId, variations, notes } = phase
    // `index` on the phase is only what the button says "Saving…" under; a
    // keep-all has no single one, and -1 is never a variation position.
    setPhase({ at: 'saving', jobId, variations, notes, index: indexes.length === 1 ? (indexes[0] as number) : -1 })

    try {
      await json('/api/v1/characters', { jobId, indexes })
      router.push('/brand')
      router.refresh()
    } catch (error) {
      setPhase({ at: 'picking', jobId, variations, notes, error: message(error) })
    }
  }

  if (phase.at === 'working') {
    return (
      /*
        **A progress screen, not a sentence.**

        This was one line of text on an otherwise empty panel for a minute of
        third-party image generation — no spinner, no clock, nothing that moved.
        A screen that does not move is a screen an owner reads as broken, and
        this one costs ten credits before it starts. The cover dialog was fixed
        first and this is the same treatment: something turning, placeholders in
        the shape of what is coming so nothing jumps when the faces land, and a
        count of the seconds so a slow provider is visibly slow rather than
        indistinguishable from a hung one.
      */
      <Panel title="Drawing">
        <div className="flex flex-col gap-4" role="status" aria-live="polite" aria-busy="true">
          <div className="flex items-center gap-2">
            <Loader2
              className="size-4 animate-spin text-secondary"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="font-ui text-body text-primary">
              Drawing <span data-figure>{CHARACTER_VARIATIONS}</span> characters…
            </p>
          </div>

          {/* The same grid the picker uses, at the same square each face is
              drawn at, so the four land in the boxes they were sitting in. */}
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: CHARACTER_VARIATIONS }, (_, slot) => (
              <li
                key={slot}
                aria-hidden="true"
                className="aspect-square w-full animate-pulse rounded-block bg-stone-100"
              />
            ))}
          </ul>

          <p className="font-ui text-body text-secondary">
            This takes up to a minute — <span data-figure>{elapsed}s</span> so far. Leaving this
            page cancels nothing: the characters will be waiting in your brand kit.
          </p>
        </div>
      </Panel>
    )
  }

  if (phase.at === 'declined') {
    return (
      <Panel title="We could not make a character from that">
        <Notes notes={phase.notes} />
        <p className="font-ui text-body-sm text-muted">
          You were not charged. A photo of the shirt or apron on its own, filling most of the
          frame, works best.
        </p>
        <Button
          type="button"
          variant="primary"
          onClick={() => setPhase({ at: 'form', step: 'uniform' })}
        >
          Try again
        </Button>
      </Panel>
    )
  }

  if (phase.at === 'picking' || phase.at === 'saving') {
    return (
      <MachineOutput label="Drawn from your uniform and your shop">
        <div className="flex flex-col gap-4">
          <Notes notes={phase.notes} />

          {/*
           * **The picture opens it; the button keeps it.** These were one
           * control and that was the bug: the only way to see a character
           * properly was to commit to it, and four faces at thumbnail size is
           * not a choice anybody can make.
           */}
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {phase.variations.map((variation, index) => (
              <li key={variation.key} className="flex flex-col gap-2 rounded-block border border-border-strong p-2">
                <button
                  type="button"
                  onClick={() => setViewing(index)}
                  aria-label={`See character ${index + 1} larger`}
                  className="rounded-chip focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={variation.url}
                    alt={`Character ${index + 1}`}
                    className="aspect-square w-full rounded-chip object-contain transition-transform duration-fast ease-sq hover:scale-105"
                  />
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={phase.at === 'saving'}
                  onClick={() => void keep([index])}
                >
                  {phase.at === 'saving' && phase.index === index ? 'Saving…' : 'Keep this'}
                </Button>
              </li>
            ))}
          </ul>

          <ImageViewer
            images={phase.variations.map((variation, index) => ({
              url: variation.url,
              label: `Character ${index + 1} of ${phase.variations.length}`,
            }))}
            index={viewing}
            onIndexChange={setViewing}
            // Keeping from inside the viewer, so somebody who opened one to look
            // properly does not have to close it, find the tile again and press
            // a second button.
            action={(index) => (
              <Button
                type="button"
                variant="primary"
                disabled={phase.at === 'saving'}
                onClick={() => {
                  setViewing(null)
                  void keep([index])
                }}
              >
                Keep this one
              </Button>
            )}
          />

          {phase.at === 'picking' && phase.error !== undefined ? (
            <p className="font-ui text-body-sm text-critical-fg">{phase.error}</p>
          ) : null}

          {/*
           * **Keeping all of them costs nothing extra**, and saying so matters:
           * the set is already paid for, and an owner who assumes otherwise
           * throws three away and pays again next month for one of them. A shop
           * that wants a man and a woman on the shelf wanted both all along.
           */}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={phase.at === 'saving'}
              onClick={() => void keep(phase.variations.map((_, index) => index))}
            >
              {phase.at === 'saving' && phase.index === -1
                ? 'Saving…'
                : `Keep all ${phase.variations.length}`}
            </Button>
            <p className="font-ui text-body-sm text-muted">
              Keeping all of them costs no extra credits — you have already paid for the
              set. Anything you do not keep is discarded.
            </p>
          </div>
        </div>
      </MachineOutput>
    )
  }

  const { step, error } = phase
  const at = STEPS.indexOf(step)

  function go(next: Step) {
    setPhase({ at: 'form', step: next })
  }

  return (
    <div className="flex flex-col gap-6">
      <Steps current={at} />

      <Panel title={STEP_TITLE[step]}>
        {step === 'uniform' ? (
          <>
            <p className="font-ui text-body-sm text-secondary">
              One clear photo of the uniform. On a hanger is fine — and avoids photographing
              anyone.
            </p>
            <FileDropzone
              label="The main photo"
              accept={ACCEPT}
              onFile={setMainFile}
              hint="PNG, JPG or WebP."
              {...(error === undefined ? {} : { error })}
            >
              {mainFile === null ? null : (
                <p className="font-ui text-body-sm text-secondary">{mainFile.name}</p>
              )}
            </FileDropzone>

            <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
              <span className="font-ui text-label font-medium text-primary">
                More angles — optional
              </span>
              <p className="font-ui text-body-sm text-muted">
                A back, a sleeve, the logo close up. Up to{' '}
                <span data-figure>{MAX_UNIFORM_ANGLES}</span>. They help us read the uniform
                instead of guessing it.
              </p>
              {angleFiles.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {angleFiles.map((file, index) => (
                    <li key={file.name} className="flex items-center gap-2">
                      <span className="font-ui text-body-sm text-secondary">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setAngleFiles((files) => files.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {angleFiles.length < MAX_UNIFORM_ANGLES ? (
                <FileDropzone
                  label="Another angle"
                  accept={ACCEPT}
                  onFile={(file) => setAngleFiles((files) => [...files, file])}
                  hint="Optional."
                />
              ) : null}
            </div>

            <Button type="button" variant="primary" disabled={mainFile === null} onClick={() => go('scene')}>
              Continue
            </Button>
          </>
        ) : null}

        {step === 'scene' ? (
          <>
            {storePhotoUrls.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="font-ui text-label font-medium text-primary">
                  Show them inside your shop?
                </span>
                <p className="font-ui text-body-sm text-muted">
                  Uses the photos on your shop&apos;s profile as the background. Leave it off
                  and you get a character on a plain background, which is easier to place on a
                  page.
                </p>
                <ul className="grid grid-cols-4 gap-2">
                  {storePhotoUrls.map((url, index) => (
                    <li key={url}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`The shop, ${index + 1}`}
                        className="aspect-square w-full rounded-chip border border-border-subtle object-cover"
                      />
                    </li>
                  ))}
                </ul>
                <Segmented
                  label="Show the character inside your shop"
                  value={useScene ? 'yes' : 'no'}
                  options={[
                    { value: 'no', label: 'Plain background' },
                    { value: 'yes', label: 'Inside my shop' },
                  ]}
                  onChange={(value) => setUseScene(value === 'yes')}
                />
              </div>
            ) : (
              <p className="font-ui text-body-sm text-secondary">
                You have no photos of the shop yet. Add some in{' '}
                <Link href={`/settings/shops/${shopId}`} className="text-action-primary underline">
                  this shop&apos;s settings
                </Link>{' '}
                if you want the character shown standing inside it.
              </p>
            )}

            <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
              <span className="font-ui text-label font-medium text-primary">
                A logo on the uniform?
              </span>
              <p className="font-ui text-body-sm text-muted">
                We put it where a logo sits on the uniform you photographed.{' '}
                <strong className="font-medium text-secondary">
                  Expect it to be approximate
                </strong>{' '}
                — a drawing service redraws a logo rather than pasting it, and one with
                words in it usually comes back with the letters wrong.
              </p>

              <Segmented
                label="Which logo goes on the uniform"
                value={logoSource}
                options={[
                  { value: 'none' as const, label: 'No logo' },
                  ...(brandLogoUrl === null
                    ? []
                    : [{ value: 'brand' as const, label: 'My brand logo' }]),
                  { value: 'upload' as const, label: 'Upload one' },
                ]}
                onChange={setLogoSource}
              />

              {logoSource === 'brand' && brandLogoUrl !== null ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={brandLogoUrl}
                  alt="Your brand logo"
                  className="aspect-square w-chip rounded-chip border border-border-subtle object-contain"
                />
              ) : null}

              {logoSource === 'upload' ? (
                <FileDropzone
                  label="The logo to put on the uniform"
                  accept={ACCEPT}
                  onFile={setLogoFile}
                  hint="PNG with a transparent background works best."
                >
                  {logoFile === null ? null : (
                    <p className="font-ui text-body-sm text-secondary">{logoFile.name}</p>
                  )}
                </FileDropzone>
              ) : null}
            </div>

            <Input
              label="What do you want it for?"
              hint="Optional. “Weekend offers on WhatsApp”, “our Ramadan flyer”. It sets the mood, nothing more."
              value={goal}
              maxLength={MAX_GOAL}
              onChange={(event) => setGoal(event.target.value)}
            />

            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                // Choosing "upload" and then continuing without one is the only
                // way to reach the end of this flow expecting a logo and get
                // none, so it is stopped here rather than explained later.
                disabled={logoSource === 'upload' && logoFile === null}
                onClick={() => go('style')}
              >
                Continue
              </Button>
              <Button type="button" variant="ghost" onClick={() => go('uniform')}>
                Back
              </Button>
            </div>
          </>
        ) : null}

        {step === 'style' ? (
          <>
            <div className="flex flex-col gap-2">
              <span className="font-ui text-label font-medium text-primary">Style</span>
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <Segmented
                  label="Which style of character"
                  value={style}
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
              options={CHARACTER_LOOKS.map((value) => ({
                value,
                label: CHARACTER_LOOK_NOTE[value],
              }))}
              onChange={(event) => setLook(event.target.value as CharacterLook)}
            />

            <div className="flex gap-2">
              <Button type="button" variant="primary" onClick={() => go('consent')}>
                Continue
              </Button>
              <Button type="button" variant="ghost" onClick={() => go('scene')}>
                Back
              </Button>
            </div>
          </>
        ) : null}

        {step === 'consent' ? (
          <>
            {/*
             * Last, because by here the owner knows exactly what they are
             * agreeing to send — and first would have been a wall of text before
             * they knew whether they wanted the feature. The four facts are in
             * the order they matter: what leaves, where, what is kept, whose
             * permission.
             */}
            <ul className="flex flex-col gap-2">
              <li className="font-ui text-body-sm text-secondary">
                Your uniform photos are sent to an outside AI service, outside the UAE, and
                read once — for the clothing only.
              </li>
              <li className="font-ui text-body-sm text-secondary">
                <strong className="font-medium text-primary">
                  The character is an invented person.
                </strong>{' '}
                Your photos are never sent to the part that draws, so the result cannot look
                like anyone in them.
              </li>
              {logoSource === 'none' ? null : (
                <li className="font-ui text-body-sm text-secondary">
                  Your logo <em>is</em> sent to the drawing service, so it can be put on the
                  uniform. It comes back redrawn rather than exact.
                </li>
              )}
              {useScene ? (
                <li className="font-ui text-body-sm text-secondary">
                  Your shop photos <em>are</em> sent to the drawing service, as the
                  background. Check there is nobody in them you would not want sent.
                </li>
              ) : null}
              <li className="font-ui text-body-sm text-secondary">
                We do not keep the uniform photos. We keep the description of the uniform and
                the character.
              </li>
              <li className="font-ui text-body-sm text-secondary">
                If your staff are in the photos, it is up to you to have their permission.
              </li>
            </ul>

            <p className="font-ui text-body-sm text-secondary">
              Costs <span data-figure>{COST}</span> credits for{' '}
              <span data-figure>4</span> characters. You have{' '}
              <span data-figure>{credits}</span>.
            </p>

            {affordable ? null : (
              <div className="flex flex-col gap-2 rounded-block bg-sand p-4">
                <p className="font-ui text-body-sm text-secondary">
                  You need <span data-figure>{COST - credits}</span> more credits.
                </p>
                <Link
                  href="/billing"
                  className="inline-flex h-control w-fit items-center rounded-pill border border-border-strong px-3 font-ui text-label text-primary hover:bg-stone-100"
                >
                  Top up credits
                </Link>
              </div>
            )}

            {error === undefined ? null : (
              <p className="font-ui text-body-sm text-critical-fg" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                disabled={!affordable}
                onClick={() => void generate()}
              >
                I agree — make the characters
              </Button>
              <Button type="button" variant="ghost" onClick={() => go('style')}>
                Back
              </Button>
            </div>
          </>
        ) : null}
      </Panel>
    </div>
  )
}

/** The gate. Not a disabled button — the fixes are elsewhere and are linked. */
function NotReady({
  gaps,
  brandComplete,
  shopId,
}: {
  gaps: string[]
  brandComplete: boolean
  shopId: string
}) {
  return (
    <Panel title="Two things first">
      <p className="font-ui text-body text-secondary">
        A character is drawn from what your shop actually is. Without these we can only make
        a generic person, and you would have paid for it.
      </p>

      <ul className="flex flex-col gap-3">
        {gaps.length > 0 ? (
          <li className="flex flex-col gap-1">
            <span className="font-ui text-label font-medium text-primary">
              Tell us {gaps.join(' and ')}
            </span>
            <Link
              href={`/settings/shops/${shopId}`}
              className="inline-flex h-control w-fit items-center rounded-pill bg-action-primary px-3 font-ui text-label text-action-primary-fg hover:bg-action-primary-hover"
            >
              Open shop settings
            </Link>
          </li>
        ) : null}

        {brandComplete ? null : (
          <li className="flex flex-col gap-1">
            <span className="font-ui text-label font-medium text-primary">
              Finish your brand kit
            </span>
            <Link
              href="/brand"
              className="inline-flex h-control w-fit items-center rounded-pill border border-border-strong px-3 font-ui text-label text-primary hover:bg-stone-100"
            >
              Open brand kit
            </Link>
          </li>
        )}
      </ul>
    </Panel>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-border-subtle p-6">
      <h2 className="font-display text-heading text-primary">{title}</h2>
      {children}
    </section>
  )
}

/** Where they are, out of four. A list, not a progress bar — the steps are named. */
function Steps({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1">
      {STEPS.map((step, index) => (
        <li
          key={step}
          aria-current={index === current ? 'step' : undefined}
          className={
            index === current
              ? 'font-ui text-label font-medium text-primary'
              : 'font-ui text-label text-muted'
          }
        >
          <span data-figure>{index + 1}</span>. {STEP_TITLE[step]}
        </li>
      ))}
    </ol>
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
  | { kind: 'variations'; variations: Variation[]; notes: string[] }
  | { kind: 'declined'; notes: string[] }

/** Presigned PUT straight into the bucket — the bytes never pass through a route. */
async function upload(file: File): Promise<string> {
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

  return presign.assetId
}

async function poll(jobId: string): Promise<Outcome> {
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
      if (job.errorMessage === 'no_uniform') {
        return { kind: 'declined', notes: job.result?.notes ?? [] }
      }
      if (job.errorMessage === 'image_refused') {
        return {
          kind: 'declined',
          notes: [
            'The drawing service would not work from that. A photo of the uniform on its own, with nobody in it, usually goes through.',
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

    return { kind: 'variations', variations, notes: job.result?.notes ?? [] }
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
