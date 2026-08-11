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
- [ ] Two fills maximum, from `--sq-sand` / `--sq-lime` / `--sq-sky`, sand dominant
- [ ] No gradients, shadows, textures or embedded raster
- [ ] No gold, no brand blue
- [ ] Optimised SVG, `currentColor` on strokes where practical
- [ ] Mirroring behaviour decided (default: does not mirror)

## Inventory

| Key | Where it appears | Status | File |
| --- | --- | --- | --- |
| `empty-offer-books` | Offer books list, first run | `todo` | — |
| `empty-catalog-search` | Catalog, no results | `todo` | — |
| `empty-analytics` | Analytics, before first publish | `todo` | — |
| `empty-team` | Team, single user | `todo` | — |
| `onboarding-brand` | Brand kit setup step | `todo` | — |
| `onboarding-shop` | Shop details step | `todo` | — |
| `onboarding-first-book` | First offer book prompt | `todo` | — |
| `feature-ai-character` | AI character creation intro | `todo` | — |
| `feature-whatsapp-share` | Sharing step | `todo` | — |
| `error-export-failed` | PDF export failure | `todo` | — |
| `error-generic` | Unhandled error boundary | `todo` | — |
| `billing-plan-upgrade` | Plan comparison | `todo` | — |

Add rows as needs emerge. Do not ship a screen with a placeholder box where an illustration belongs — an empty state with type alone is better than an inconsistent drawing.

## Notes

Existing artwork to be recoloured is held outside this repo. When a piece lands, record the source so licence provenance stays traceable — the same standard applied to catalog imagery.
