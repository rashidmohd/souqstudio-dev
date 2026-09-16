'use client'

import * as React from 'react'
import { MachineOutput } from '@/components/ui/machine-output'
import { ImageViewer, type ViewerImage } from '@/components/brand/ImageViewer'

/**
 * The characters this shop has, and their poses. E8-01 and E8-02.
 *
 * **It exists because keeping one had nowhere to land.** The flow ended with
 * "1 saved" on a card and no picture — an owner spent ten credits, chose between
 * four faces, and then could not look at the one they chose. Generating
 * something the product will not show you back is the worst version of a paid
 * feature.
 *
 * **Marked as machine output, and it stays marked.** Unlike a palette — which
 * stops being a proposal the moment it is accepted and becomes the shop's own
 * colours — a character *is* a generated image for its whole life. The root
 * `CLAUDE.md` rule is that an owner can always tell what a machine wrote, and
 * here that never stops being true of the artefact itself.
 */

export type CharacterPose = {
  id: string
  poseType: string
  imageUrl: string
  customLabel: string | null
}

export type Character = {
  id: string
  baseImageUrl: string
  style: string
  gender: string
  poses: CharacterPose[]
}

const STYLE_LABEL: Readonly<Record<string, string>> = {
  cartoon: 'Cartoon',
  'semi-realistic': 'Semi-realistic',
  flat: 'Flat',
  mascot: 'Mascot',
  'photo-real': 'Photo',
}

const POSE_LABEL: Readonly<Record<string, string>> = {
  waving: 'Waving',
  holding: 'Holding a product',
  announcing: 'Announcing',
  'thumbs-up': 'Thumbs up',
  celebrating: 'Celebrating',
  speech: 'Speech bubble',
  running: 'Running',
  custom: 'Custom',
}

export function CharacterGallery({ characters }: { characters: Character[] }) {
  /**
   * Every image in the card, flattened, so the viewer steps through the lot.
   *
   * **One list rather than one per character**, because what an owner is doing
   * here is looking through what they have — a base character and its poses are
   * the same kind of thing to them, and stopping the arrow keys at the end of
   * each character would be the product enforcing a distinction nobody is
   * thinking about.
   */
  const images: ViewerImage[] = characters.flatMap((character) => [
    { url: character.baseImageUrl, label: label(character) },
    ...character.poses.map((pose) => ({
      url: pose.imageUrl,
      label: poseLabel(pose),
    })),
  ])

  const [viewing, setViewing] = React.useState<number | null>(null)

  /** Where a given image sits in the flattened list. */
  const positionOf = (url: string) => images.findIndex((image) => image.url === url)

  if (characters.length === 0) return null

  return (
    <MachineOutput label="Generated characters">
      <ul className="flex flex-col gap-4">
        {characters.map((character) => (
          <li key={character.id} className="flex flex-col gap-2">
            {/*
             * A grid of equal cells rather than fixed widths. The width scale
             * here is semantic — `w-pane`, `w-chip` — and has no numeric steps,
             * which is the design system saying that a thumbnail grid should
             * size from its container rather than from a number somebody picked.
             * It is also what makes this work at phone width.
             */}
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              <figure className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setViewing(positionOf(character.baseImageUrl))}
                  aria-label={`See ${label(character)} larger`}
                  className="rounded-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={character.baseImageUrl}
                    alt={label(character)}
                    className="aspect-square w-full rounded-block border border-border-subtle object-contain transition-transform duration-fast ease-sq hover:scale-105"
                  />
                </button>
                <figcaption className="font-ui text-body-sm text-secondary">
                  {STYLE_LABEL[character.style] ?? character.style}
                </figcaption>
              </figure>

              {character.poses.length > 0 ? (
                <>
                  {character.poses.map((pose) => (
                    <figure key={pose.id} className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setViewing(positionOf(pose.imageUrl))}
                        aria-label={`See ${poseLabel(pose)} larger`}
                        className="rounded-chip focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pose.imageUrl}
                          alt={poseLabel(pose)}
                          className="aspect-square w-full rounded-chip border border-border-subtle object-contain transition-transform duration-fast ease-sq hover:scale-105"
                        />
                      </button>
                      <figcaption className="font-ui text-body-sm text-muted">
                        {pose.customLabel ?? POSE_LABEL[pose.poseType] ?? pose.poseType}
                      </figcaption>
                    </figure>
                  ))}
                </>
              ) : (
                <p className="col-span-2 self-center font-ui text-body-sm text-muted sm:col-span-5">
                  No poses yet. A pose library is generated from this character — it is built
                  and has no screen of its own yet.
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <ImageViewer images={images} index={viewing} onIndexChange={setViewing} />
    </MachineOutput>
  )
}

const label = (character: Character) =>
  `${STYLE_LABEL[character.style] ?? character.style} character`

const poseLabel = (pose: CharacterPose) =>
  pose.customLabel ?? POSE_LABEL[pose.poseType] ?? pose.poseType
