# Layout map

`SKILL.md` → "The five layout families" says what each family is. This file says which
files implement it, and — more importantly — **which layout a route must not inherit
from**.

Two of the five deliberately escape the app shell. In Next.js App Router, nesting is the
default: put a route in the wrong place and it silently inherits the left rail. Nothing
errors. It just looks wrong, and the artboard gets compressed.

---

## The map

| # | Family | Route | Layout file | Inherits shell? |
| --- | --- | --- | --- | --- |
| 1 | App shell | `(dashboard)/*` | `app/(dashboard)/layout.tsx` | — it *is* the shell |
| 2 | Offer book editor | `(dashboard)/editor/[id]` | `app/(dashboard)/editor/layout.tsx` | **No — must override** |
| 3 | Card designer | `(dashboard)/card-designer/[templateId]` | `app/(dashboard)/card-designer/layout.tsx` | **No — must override** |
| 4 | Onboarding | `(auth)/*` | `app/(auth)/layout.tsx` | No — separate route group |
| 5 | Public viewer | `o/[code]` | `app/o/layout.tsx` | No — separate surface entirely |

---

## 1 · App shell

`app/(dashboard)/layout.tsx`

Left rail, persistent, collapses to icons below 1024px.

**Persistent means sticky**, not merely always-rendered: `sticky top-0 h-dvh self-start`,
with `overflow-y-auto` so the rail scrolls inside itself on a short viewport instead of
dropping Account off the bottom. `self-start` is load-bearing — a flex child stretches to
the container's height by default, which leaves `sticky` no distance to travel and makes
it a no-op.

**At and above 1024px the owner collapses it too**, from a toggle in the rail's own
head. The choice is written to `sq_rail` by the client and read by the layout on the
server, so the rail renders at its remembered width instead of correcting itself after
hydration. The toggle is hidden below 1024px, where the breakpoint has already decided
and an expand control would promise something it cannot deliver. Neither state animates
its width — the design system permits opacity and transform only.

**The widths are `--sq-rail` (280px) and `--sq-rail-collapsed` (64px), and they are the
first widths the rail has ever had.** The markup said `w-16` and `lg:w-64`; this system
replaces Tailwind's spacing scale with 4/8/12/16/24/32/48, so neither class compiled to
anything and the rail was sized by its own content. Anything that needs a width off that
scale needs a token, not a number in a class name.

The mark sits at the head of the rail — `logo.svg` when the rail is wide *and* expanded,
`icon.svg` in every other case, since a 148px wordmark does not fit 64px. It is not a
link: `Offer books` is directly below it and already goes home.

The rail has **two scope zones separated by a hard divider**, because every screen belongs
to either the org or one shop and users get badly confused when those mix:

```
[shop switcher]
  Offer books        ← shop scope
  Catalog
  Brand kit
  Analytics
──────────────       ← hard divider
[org name]
  Organization       ← org scope
  Shops
  Team
  Billing
──────────────       ← pinned to the foot
  Account            ← user scope
```

**`Organization` was added by E2-01** and leads the org zone. The three entries below
it are each one *part* of the business — its branches, its people, its invoices — and
this one is the business itself: its name on an invoice, its VAT number, its country
and timezone, and the brand kit every shop inherits. It sits first because the others
are all scoped by it.

**There are three zones, not two.** Account was added by E1-03, which needed somewhere
for a person to manage how *they* sign in — two-factor, backup codes. That is neither org
scope nor shop scope: it follows the human, not the business, and putting it under the org
divider would imply an owner could reach it for someone else. It is pinned to the foot of
the rail rather than listed with the others, so it reads as "you" rather than as another
section of the product.

`/settings/account` is a plain member of family 1 and needs no layout of its own.

**The rail is a client component (`components/shared/dashboard-rail.tsx`), not
markup in the layout.** `NavItem` takes `icon: LucideIcon`, and a function cannot
be serialized across the server/client boundary — a server layout passing icons
down 500s every page under the shell. The rail imports its own icons and reads
`usePathname()` for the active state. Anything else the layout renders is subject
to the same rule.

**Every destination above is gated on `lib/features.ts`, and an unbuilt one is
omitted.** The diagram is the rail at completion, not the rail today: Catalog
waits on E5 and Analytics on E11, so neither is rendered yet. Both previously
shipped as ordinary enabled items pointing at routes that did not exist — the rail
404'd twice, in the one component every signed-in screen renders, against the
explicit rule in `apps/web/CLAUDE.md` that a link to a 404 is worse than no link.

Omitted rather than disabled-with-a-reason. Both are sanctioned, but the rail
collapses to 64px of icons below 1024px where a reason cannot be shown, and a
reason living only in a tooltip is barred — the product ships on tablets.

So this diagram and the code disagree on purpose, and the earlier instruction that
adding a destination means editing both still holds: add the entry here, add it
there, and flip its flag in the change that adds the route.

**A gate in this layout must never redirect to a route inside this group.** The
layout guards its own children, so such a redirect is an infinite loop. E1-03's
forced two-factor enrollment lives at `/two-factor-setup` in family 4 for exactly
this reason — pointing it at `/settings/account` produced that loop in testing.

Single-shop accounts get the same structure with the switcher collapsed to a static
label — nothing is rebuilt when they add a second branch.

**Home is `app/(dashboard)/page.tsx` and it is the offer books list, not a dashboard.**
Owners arrive with one job and they arrive in a hurry. "Duplicate last week" sits beside
the primary New button and is expected to be the most-used control in the product.

Built by E1-05, which needed somewhere for the getting-started checklist to live —
and found that `/` had no page at all, so three finished flows were redirecting to
a 404. The list is empty for everyone until E6 ships an editor that can create an
offer book, and both New and Duplicate are disabled with the reason on screen
rather than pointed at a route that does not exist. `apps/web/lib/features.ts`
holds those flags; flip one in the change that adds its route.

---

## 2 · Offer book editor

`app/(dashboard)/editor/[id]/page.tsx` with `app/(dashboard)/editor/layout.tsx`

**The layout file exists solely to escape the shell.** It sits under `(dashboard)` for
auth and org context, then renders full-bleed without the rail.

```
┌────────────────────────────────────────────────┐
│ header: title · format · share · export        │
├───────────┬────────────────────┬───────────────┤
│  catalog  │      artboard      │  properties   │
│  (start)  │   (centre, dark    │    (end)      │
│           │    surround)       │               │
└───────────┴────────────────────┴───────────────┘
```

- Artboard sits on `--sq-ui-canvas-surround`. **The only dark surface in the product.**
- Below 1024px side panels **overlay** the canvas — never compress it. A squeezed artboard
  makes the whole product feel cramped.
- Nothing on the artboard animates. Direct manipulation.
- No illustrations anywhere in here.

---

## 3 · Card designer

`app/(dashboard)/card-designer/[templateId]/page.tsx` with its own `layout.tsx`

Same escape pattern, same three-pane geometry, **different content**. This is not the
offer book editor: one card on a canvas, no page grid, no product selection, no
pagination.

```
┌────────────────────────────────────────────────┐
│ header: template name · language · direction   │
├───────────┬────────────────────┬───────────────┤
│  palette  │    card canvas     │  properties   │
│  (start)  │  + stress preview  │    (end)      │
└───────────┴────────────────────┴───────────────┘
```

- **Canvas parity with family 2 is a hard requirement.** Identical padding, zoom controls,
  selection outline and handle treatment. A shop moving between designing a card and
  building a book must not feel they changed application.
- Stress preview is a persistent panel, never behind a tab.
- Template language is bound at creation; direction is a segmented control in the chrome.
  Numerals are never affected by it.

See `SKILL.md` → Design surfaces, and the addendum in `docs/E7-template-grid-management.md`.

---

## 4 · Onboarding and brand setup

`app/(auth)/layout.tsx`

Centred single column, **no navigation**, one decision per screen.

The product is fully self-serve, so this flow is the entire sales team. **Any nav visible
here is an exit someone takes before reaching value.** No rail, no header links, no
"skip to dashboard".

Illustrations are permitted — and this is one of the few places they are earned. Keep
figure count consistent across steps; see `illustration-selection.md`.

Routes in this family: `login`, `login/2fa`, `signup`, `verify-email`,
`forgot-password`, `reset-password`, `two-factor-setup`, `onboarding`.

**The measure belongs to the page, not the layout.** `app/(auth)/layout.tsx` used
to pin every child to `max-w-md`. That is right for a login form and wrong for
brand setup, where a live preview sits beside the choices — so the layout now
centres its children and each page sets its own width. The single-column forms
say `w-full max-w-md`; onboarding says `max-w-4xl`. "No nav, one decision per
screen" was never meant to also mean one fixed column width.

The two E1-03 additions belong here rather than under the shell for the same
reason as the rest: one decision, no exits.

- `login/2fa` — the second factor. Reached with a challenge cookie and **no
  session**, which is why it is in middleware's public list.
- `two-factor-setup` — forced enrollment where the organization requires
  two-factor. It must stay outside `(dashboard)`; see the warning in family 1.
  It has no cancel, because there is nowhere to cancel to — the escape offered
  is logging out.

---

## 5 · Public offer book viewer

`app/o/[code]/page.tsx` with `app/o/layout.tsx`

**Architecturally a separate surface, not a route inside the app.** It shares the repo and
nothing else.

This is seen thousands of times per book while the editor is seen once. It arrives via a
WhatsApp forward, on a mid-range Android, on a poor connection, from someone who has never
heard of SouqStudio. The constraints are different in kind:

- SSR, no auth, no session
- Aggressive image optimisation, fast first paint
- **No render-blocking fonts** — this surface does not load the chrome typefaces the way
  the app does
- Analytics fired reliably before anyone scrolls away
- Zero chrome. The shop's logo in the header; SouqStudio once, small, in the footer

Do not import app shell components here. If a component is needed on both, it belongs in
`components/shared/` and must be checked against this surface's performance budget.

---

## Adding a route

1. Which family? If none fits, that is a fifth-family conversation, not a new folder.
2. Does it escape the shell? If yes, it needs its own `layout.tsx` that does not render
   the rail — and put it in this table.
3. Editor or card designer work? Read the canvas parity rule first.
4. Public viewer? Check the performance budget before adding any dependency.
