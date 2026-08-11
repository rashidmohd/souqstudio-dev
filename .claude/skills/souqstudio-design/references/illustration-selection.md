# Choosing an illustration

Catalog: `assets/illustration-catalog.json` — 385 entries, each with `id`, `filename`, `name`, `description`, `tags`.

Read this before placing any illustration. The first question is never *which one*, it is *whether one belongs at all*.

## Do not use an illustration here

Most screens are better without one. An illustration that appears where it is not earned makes the product feel slower and less serious, and a user who sees the same drawing every week stops seeing it entirely.

**No illustration when:**

| Situation | Use instead |
| --- | --- |
| A search or filter returned nothing | A sentence saying what was searched, and a control to widen it. The user has a specific goal and needs the query changed, not a drawing. |
| Content is loading | Skeleton placeholders matching the shape of the incoming content |
| A field failed validation | Inline message beneath the field |
| A confirm or destructive dialog | Nothing. An illustration delays a decision the user has already committed to. |
| Dense working screens — catalog, product tables, analytics with data | Nothing |
| Anywhere inside the editor | Nothing. The artboard needs every pixel and every bit of attention. |
| A state the user hits more than once per session | Nothing after the first time |
| A toast, banner or inline alert | An icon at most |

**Illustration is earned when:** a first-run empty state where the user has genuinely never created the thing; an onboarding or brand-setup step; a completed-onboarding or first-publish milestone; a full-page error or 404; a plan-comparison or upgrade screen.

**One illustration per screen, maximum.** Two means the screen has two focal points and should be split.

## What the catalog fields mean

`description` — **what the illustration depicts.** Product-neutral and reliable. This is the field to match on.

`souqUse` — **present on 35 curated entries only.** Hand-written guidance naming the SouqStudio screen the piece belongs on. When it is present, trust it over your own reading. When it is absent, match on `description` alone; that is the intended behaviour, not a gap to fill.

`tags` — a weak signal. 385 items carry over 600 unique tags and roughly half appear exactly once. Use them to break a tie between two otherwise equal candidates, never as the primary filter.

`filename` — an absolute URL on the assets CDN. All paths are `/light/`.

### Why the descriptions look truncated

They were written for a different product, one built around calls and sessions, and every entry carried a second sentence of guidance pointing at screens that do not exist here — *"Use for call assignment confirmation or session acceptance screens."* `scripts/retarget-catalog.py` stripped all 385 of those clauses and removed the foreign domain tags, keeping only the depiction.

Re-run that script after any catalog refresh, and add to its `SOUQ_USE` map as you review and adopt pieces. Do not write `souqUse` notes for artwork you have not looked at — inventing plausible use-cases for unseen pictures is how the wrong guidance got in originally.

## Selection procedure

1. Confirm from the table above that an illustration belongs at all. If not, stop.
2. Describe the screen's *moment* in plain words — not the feature name. "The owner has finished setting up their brand and is about to build their first book" is usable; "brand kit success screen" is not.
3. Check whether any entry carries a `souqUse` note for this screen. If one does, use it.
4. Otherwise scan `description` for a depiction that matches that moment literally. A person holding a phone matches a sharing screen. A person surrounded by charts matches analytics.
5. Prefer the literal over the metaphorical. `statistic-chart` beats `dreamer` for an analytics empty state, even though "dreamer" sounds more evocative — users read illustrations literally and metaphors read as filler.
6. Check the piece against the visual-consistency rule below.
7. Record the choice in `illustration-manifest.md`, and add a `souqUse` note for it in `scripts/retarget-catalog.py` so the same slot always resolves to the same file.

## Visual consistency

These 385 pieces were drawn to several different briefs. Passing the colour audit does not make two of them siblings — the rebrand script checks palette, not drawing style.

- **Keep figure count consistent within a flow.** If onboarding step one shows a single person, steps two and three should not show a crowd.
- **Do not mix figure and object illustrations in the same flow.** A person on one onboarding screen and a floating laptop on the next reads as two products.
- **Match crop and scale.** Some pieces are full-figure, some are waist-up, some are objects at desk scale. Placed adjacently the mismatch is obvious.
- **Check accent density.** Some pieces are 40% accent colour, some are 5%. Two extremes side by side look inconsistent even though both are compliant.

When in doubt, reuse a piece already in the manifest rather than introducing a new one. A set of fifteen pieces used well beats 385 used once each.

## Candidate mapping

These are the entries now carrying `souqUse` notes. **None of them have been viewed** — confirm each visually before committing it, and prefer a worse-named piece that looks right over a better-named one that does not.

| Slot | Candidates |
| --- | --- |
| `empty-offer-books` | `fill-the-blanks`, `empty`, `new-ideas` |
| `empty-analytics` | `statistic-chart`, `visual-data`, `analytics` |
| `empty-team` | `meet-the-team`, `good-team`, `founding-team` |
| `onboarding-brand` | `add-color`, `creative-designer`, `making-art` |
| `onboarding-shop` | `adjust-settings`, `preferences-popup`, `my-workspace` |
| `onboarding-first-book` | `ideation`, `writing-down-ideas`, `work-in-progress` |
| `feature-ai-character` | `select-character`, `professional-woman-avatar`, `virtual-assistant` |
| `feature-whatsapp-share` | `shared-workspace`, `work-chat`, `unread-messages` |
| `error-export-failed` | `upload-warning`, `warnings`, `connection-lost` |
| `error-generic` | `connection-lost`, `lost`, `problem-solving` |
| `billing-plan-upgrade` | `upgrade`, `wallet`, `enter-payment-info` |
| first-publish milestone | `celebration`, `successful`, `project-completed` |

`empty-catalog-search` has no entry, deliberately. A search returning nothing is a filtered-empty state — it gets a message and a way to widen the query, not a drawing.

## Implementation

- **All 385 paths are `/light/`.** There are no dark variants and there should not be. In dark mode the light artwork sits on a `--sq-illus-panel` surface — see the Illustrations section of `SKILL.md`.
- **Illustrations are decorative.** Ship them `alt=""` and `aria-hidden="true"`. The heading and body text carry the meaning; a screen reader announcing "person holding a checklist" adds nothing and interrupts.
- **Never render the catalog as a picker in product UI.** It is a build-time reference for choosing, not a runtime asset library. Reference the chosen file by URL; do not bundle or preload the set.
- **Lazy-load below the fold**, and give the container a fixed aspect ratio so the illustration arriving does not shift layout.
- **Illustrations do not mirror in RTL** unless they contain directional meaning — an arrow, a left-to-right reading order, a hand pointing. Most do not. Check before adding `scaleX(-1)`.
- **Cap display width around 320px.** These are unDraw-derived and go soft and weightless when scaled large.
