# Illustration manifest

Inventory of the SouqStudio illustration set. The rules live in `SKILL.md` under **Illustrations** — this file only tracks which pieces exist, where they live, and whether they have been brought into compliance.

## Status key

| Status | Meaning |
| --- | --- |
| `todo` | Identified as needed, no artwork yet |
| `sourced` | Original artwork exists, not yet recoloured |
| `recoloured` | Palette applied, not yet reviewed |
| `ready` | Compliant and in use |

## Compliance checklist

Before marking any piece `ready`, confirm:

- [ ] Single line colour `--sq-charcoal`, no secondary greys
- [ ] One stroke weight, correct at ship size
- [ ] Two fills maximum, from `--sq-sand` / `--sq-sky`, sand dominant
- [ ] No gradients, shadows, textures or embedded raster
- [ ] No gold, no brand blue
- [ ] Optimised SVG, `currentColor` on strokes where practical
- [ ] Mirroring behaviour decided (default: does not mirror)

## Inventory

| Key | Where it appears | Status | File |
| --- | --- | --- | --- |
| `empty-offer-books` | Offer books list, first run | `ready` | `public/illustrations/fill-the-blanks.svg` |
| `error-not-found` | 404, full page | `ready` | `public/illustrations/lost.svg` |
| `error-generic` | Unhandled error boundary | `ready` | `public/illustrations/problem-solving.svg` |
| `import-upload` | Spreadsheet import, the choose-a-file step | `ready` | `public/illustrations/add-file.svg` |
| `empty-team` | Team, single user | `recoloured` | `public/illustrations/meet-the-team.svg` |
| `empty-analytics` | Analytics, before first publish | `todo` | `statistic-chart` — waits on E11 |
| `onboarding-brand` | Brand kit setup step | `todo` | `creative-designer` — waits on a slot in the wizard |
| `onboarding-first-book` | First offer book prompt | `todo` | `new-ideas` — waits on E6 |
| `feature-ai-character` | AI character creation intro | `todo` | `select-character` — waits on E8 |
| `feature-whatsapp-share` | Sharing step | `todo` | `work-chat` — waits on E10 |
| `billing-plan-upgrade` | Plan comparison | `todo` | `upgrade` — billing exists, no slot for it yet |
| `error-export-failed` | PDF export failure | `todo` | `upload-warning` — waits on E9, and on the surface question below |
| `onboarding-shop` | Shop details step | `blocked` | no such step exists; shop details live in settings |
| ~~`empty-catalog-search`~~ | ~~Catalog, no results~~ | `struck` | **cannot be filled — see below** |

**`empty-catalog-search` is struck, not pending.** "Catalog, no results" is a
*zero-results* state, and SKILL.md permits an illustration only on `empty`.
`EmptyState` enforces it in the type: `{ kind: 'zero-results' | 'error';
illustration?: never }`. The slot asked for something the system forbids. If the
catalog wants warmth on a failed search, it needs a different device.

**`error-*` slots need a full-page surface, not `EmptyState`.** The same type
rule blocks an illustration on `kind="error"`, deliberately: inside a screen,
artwork above a failure delays a decision. A full-page boundary is different —
nothing is in progress to delay — which is why `app/error.tsx` and
`app/not-found.tsx` render their own markup rather than reusing the component.
`error-export-failed` is an in-screen failure, so it stays blocked until someone
decides which surface it belongs on.

**The catalog already carries the assignments.** 35 of the 385 entries in
`assets/illustration-catalog.json` have a `souqUse` field naming the screen they
were picked for. Read it before choosing anything new; most of this work is done.

Add rows as needs emerge. Do not ship a screen with a placeholder box where an illustration belongs — an empty state with type alone is better than an inconsistent drawing.

**`import-upload` is permitted where `empty-catalog-search` was not.** Both are
on the catalog, so the difference is worth stating: the import's first step is a
*prompt before anything exists*, which is the `empty` case, while "no results"
is a question that was asked and answered. Nothing is in progress at the
dropzone, so artwork there delays no decision. The mapping and review steps that
follow it get none, for exactly the reason the `error-*` slots are blocked
in-screen.

Object-led rather than figure-led, and the import flow carries no other
illustration — so the "do not mix object-led into a flow that uses figures" note
on `My Workspace` does not bite here.

## The checklist and the shipped set disagree about brand blue

Worth resolving, and **not resolved by the change that added `add-file.svg`.**

The compliance checklist above says "No gold, no brand blue". Every one of the
four files already checked in contains `#143CD2`, and it is the accent in all of
them — `fill-the-blanks.svg` has seven instances, `problem-solving.svg` five,
`lost.svg` three. The compliance notes below record remapping *greys and
near-blacks* and say nothing about blue, so the rule appears to have been written
and then not applied.

`add-file.svg` was audited against the shipped set rather than against the
checklist line, and carries four instances of `#143CD2` unchanged. Remapping it
alone would have made it the one illustration in the product that looks
different, which is the opposite of what an inventory is for.

So one of the two is wrong and a human should say which: either the checklist
line goes, or all five files need the blue remapped to `--sq-sky` in one pass.
Do not fix them one at a time.

## Compliance notes on what shipped

All four checked-in files were audited against the checklist above. Three needed
a remap on the way in — the CDN copies are not perfectly clean:

| File | Found | Remapped to | Why |
| --- | --- | --- | --- |
| `lost.svg` | `#CACACA` on one fill | `#DCD5B4` sand shade | Secondary grey. The sand ramp's deep step is what carries neutral structure. |
| `meet-the-team.svg` | `#707070` on one fill | `#DCD5B4` sand shade | Same. |
| `problem-solving.svg` | `#010102` on two fills | `#323232` charcoal | Near-black where the single line colour belongs. |
| `add-file.svg` | — | — | Needed no remap. Charcoal line, sand at both ramp steps, white paper, brand blue accent — the same palette as the three above. No figures, so no skin tones to preserve. It is 33KB against 5–13KB for the others: a more detailed drawing, not an unoptimised one, but worth a pass if the set is ever run through a minifier. |

Skin tones are preserved rather than remapped, per the dark-mode rule in
SKILL.md: unDraw uses one navy for both outlines and hair, so recolouring
figures turns everyone grey-haired.

`meet-the-team.svg` is `recoloured` rather than `ready` because the team screen
has no empty state to put it in — `TeamList` ships loaded and loading only, which
`E2-pending.md` §1 already lists. Worth noting the slot may be wrong anyway: a
team always has at least the owner in it, so "Team, single user" is a prompt to
invite somebody, which is a tinted card rather than an empty state.

## Notes

Existing artwork to be recoloured is held outside this repo. When a piece lands, record the source so licence provenance stays traceable — the same standard applied to catalog imagery.
