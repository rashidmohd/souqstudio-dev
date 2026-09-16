'use client'

import * as React from 'react'
import { MachineOutput } from '@/components/ui/machine-output'

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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={character.baseImageUrl}
                  alt={`The shop's ${STYLE_LABEL[character.style] ?? character.style} character`}
                  className="aspect-square w-full rounded-block border border-border-subtle object-contain"
                />
                <figcaption className="font-ui text-body-sm text-secondary">
                  {STYLE_LABEL[character.style] ?? character.style}
                </figcaption>
              </figure>

              {character.poses.length > 0 ? (
                <>
                  {character.poses.map((pose) => (
                    <figure key={pose.id} className="flex flex-col gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pose.imageUrl}
                        alt={pose.customLabel ?? POSE_LABEL[pose.poseType] ?? pose.poseType}
                        className="aspect-square w-full rounded-chip border border-border-subtle object-contain"
                      />
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
    </MachineOutput>
  )
}
