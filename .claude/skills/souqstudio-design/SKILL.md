---
name: souqstudio-design
description: The SouqStudio product design system — the chrome/canvas split, brand colour tokens with the ink-safe vs fill-only tiers, the 14px type scale on Host Grotesk and IBM Plex Sans Arabic, bilingual Arabic/RTL rules, the four layout families, user-selectable brand kit fonts, AI output marking, illustration rules and shadcn overrides. Use this skill whenever writing or reviewing any SouqStudio interface code, styling any component, choosing a colour, sizing type, laying out a screen, choosing or placing an illustration, working on the card designer or editor canvas, building a form, adding a loading or empty state, writing a transition, handling Arabic or RTL, or working on the offer book editor — including small changes. Picking a colour, radius or font size without consulting this skill will produce output that violates the system.
---

# SouqStudio Design System

Authoritative token file: `assets/souqstudio-tokens.css`. Never write a raw hex value in component code.

**This system is enforced, not just documented.** `packages/config/tailwind.config.ts`
replaces Tailwind's default palette, spacing and radius scales rather than extending
them, so off-system values do not resolve. `packages/config/eslint.design.cjs` errors on
physical properties, raw hex, arbitrary values, shadows, fill-only colours used as ink,
italics, blue fills and template tokens in chrome. Run `pnpm lint` before calling
anything done, and work through `references/consistency-checklist.md`.

Deeper detail lives alongside this file:

| Reference | Read before |
| --- | --- |
| `references/component-inventory.md` | **Before building any component.** File paths, prop signatures and build status for all 18. Prevents two sessions producing two APIs for the same component. |
| `references/layout-map.md` | **Before adding any route.** Which file implements which layout family, and which routes must override the shell rather than inherit it. |
| `references/consistency-checklist.md` | **Before calling any UI work done.** The automated checks, the thirteen manual ones, and what to do when prose and tokens disagree. |
| `references/brand-assets.md` | Referencing any SouqStudio mark — logo, icon, favicon, email or OG image |
| `references/brand-kit-fonts.md` | Touching the brand kit, the font picker, or any Fabric text object |
| `references/illustration-selection.md` | Placing any illustration |
| `references/illustration-manifest.md` | Checking illustration inventory and status |

## Scope

**This system governs the application interface only** — navigation, panels, forms, tables, buttons, dialogs, empty states, onboarding, analytics, the editor's own chrome.

It does **not** govern what a shop owner produces. Offer book content — the artboard, page grids, price bursts, promo bands, cover art — is styled by the shop's own brand kit, and nothing in this document constrains how their flyer looks. A shop may set 40px prices in a condensed display face on a red band; that is their brand working correctly, not a violation.

Two sections here deliberately cross that line, and both do so to define the boundary rather than to style content:

- The `--sq-tpl-*` tokens exist so the rule "template colours never appear in chrome" is enforceable. They are named here, not designed here.
- **Brand kit fonts** is the one section about the owner's typography rather than ours. It constrains the *picker* — which families are offered, how they load, how Fabric measures them — never the aesthetic result.

When a rule below could be read as applying to the artboard, it does not. Chrome only.

## The rule that shapes everything

**The app is a workshop. The offer book is the product.**

Every saturated colour on screen should belong to the shop owner's content, never to the chrome. If the interface competes with the artboard, the canvas stops reading as a canvas and the owner can no longer judge their own flyer.

This produces two token namespaces that must never cross:

| Namespace | Owns | Example |
| --- | --- | --- |
| `--sq-ui-*` | App chrome — nav, panels, buttons, tables, forms | `--sq-ui-action-primary-bg` |
| `--sq-tpl-*` | Offer book content — prices, bursts, bands | `--sq-tpl-offer-red` |

A template designer editing default price colours must never be able to repaint the toolbar. If you find yourself reaching for `--sq-tpl-offer-red` in a component, you want `--sq-critical-fg` instead — they look similar deliberately and mean completely different things.

## Colour

### The two tiers

This is the constraint broken most often. Three of the seven brand colours cannot carry text at any size, and one of those three cannot carry text *on* it either.

**Ink-safe** — may be text, icons, borders, fills, anything:

| Token | Value | On white |
| --- | --- | --- |
| `--sq-blue` | `#143CD2` | 8.06:1 |
| `--sq-navy` | `#052F72` | 12.68:1 |
| `--sq-charcoal` | `#323232` | 12.82:1 |

**Fill-only** — always a background with `--sq-charcoal` on top. Never text, never an icon, never a 1px border:

| Token | Value | On white | Charcoal on it | Carries text? |
| --- | --- | --- | --- | --- |
| `--sq-sand` | `#EBE6CE` | 1.25:1 | 10.22:1 | yes |
| `--sq-gold` | `#BDA25A` | 2.48:1 | 5.18:1 | yes |
| `--sq-sky` | `#3F9DD1` | 3.02:1 | 4.25:1 | **no — see below** |

**Sky carries no text, at any size.** Charcoal on sky is 4.25:1, under the 4.5:1 AA
floor for body copy. It is a decoration colour only: icon chips, illustration fills,
chart series. An *icon* on sky is fine — non-text contrast is judged at 3:1 (WCAG
1.4.11) and sky clears it — which is why a lint rule cannot make this call for you
and it appears in the consistency checklist instead.

`--sq-stone-300` and `--sq-stone-400` are **borders only, never text**. The lightest value permitted for body copy is `--sq-stone-600` (4.91:1 on the page).

### Where the brand blue goes

**Blue is the primary action.** `--sq-ui-action-primary-bg` resolves to `--sq-blue` — the mark's own colour, on the one button per region that matters. Blue also carries selection, focus rings, links, and active nav.

Charcoal held the CTA until it was measured: blue reached roughly 5% of pixels and every surface with visual weight was grey, so the logged-in product read as a greyscale app wearing a blue logo. The restraint that justified charcoal did not disappear, it moved — **one primary per screen region**. Blue earns its weight by being the single most important action on a screen, never by being sprinkled across it.

Reach for it through `bg-action-primary`, never `bg-blue`. The raw utility pins the light value and skips the dark-mode `#8AA1F1`, and lint blocks it.

Never: blue as a page background, a card fill, a large tinted panel, or a chart series adjacent to a status colour. The button is where blue goes solid — nothing larger.

### Gold, and the colour that is not in the brand

Gold does not appear in the application. It lives in print, marketing, and plan badges.

**There is no lime.** `--sq-lime` and `--sq-lime-tint` were in the token file and in
these rules for a time, but lime is not one of the seven colours in the brand palette —
it was never ours to spend. Both tokens are gone, along with their Tailwind classes.
If you find `bg-lime` or `lime-tint` in a branch, it is stale and will not resolve.

**Blue, charcoal and sand is the full working set, with sky as the second tint.**
Sand dominates; sky appears where a second tint genuinely distinguishes two things
side by side. Two tints on a screen is the ceiling — the tinted-card rule says so
independently, and with only two in the set it is now hard to break.

### Sand is load-bearing

`--sq-sand` on `--sq-ui-page` is what stops SouqStudio reading as generic blue SaaS, and it gestures at the region without any arabesque-pattern kitsch. Use it for every neutral chip, thumbnail placeholder, empty-state panel, and illustration fill. Reach for it before reaching for grey.

### Status

| Status | Foreground | Background |
| --- | --- | --- |
| Live / published | `--sq-positive-fg` | `--sq-positive-bg` |
| Failed / rejected | `--sq-critical-fg` | `--sq-critical-bg` |
| Needs attention | `--sq-caution-fg` | `--sq-caution-bg` |
| Draft | `--sq-stone-700` | `--sq-sand` |
| Archived | `--sq-stone-700` | `--sq-stone-100` |
| Generated by AI | `--sq-machine-label` | `--sq-machine-fill` |

## AI output must be visibly marked

SouqStudio generates staff characters and cover art with a model, and those images go out to thousands of customers on a shop's flyer. **The owner must never be unable to tell which parts of a page a machine authored.** Treat this as a functional requirement, not decoration.

Every block of model output — generated characters, generated covers, suggested product groupings, auto-written headlines — gets the `MachineOutput` component: `--sq-machine-fill` background, 2px inline-start `--sq-machine-rule` border, label above.

Never use this treatment as a button, and never as a background for anything the owner typed themselves.

## Typography

**Host Grotesk appears twice a screen at most** — page titles and empty states only. It has no Arabic and its letterspacing is tight below ~24px, so it can never carry interface text. IBM Plex Sans Arabic carries every interface surface. IBM Plex Mono takes every figure in the chrome.

**Base is 14px, not 16.** These are working screens with dense product tables.

| Role | Face | Size / line |
| --- | --- | --- |
| `display` | Host Grotesk SemiBold | 32 / 36 |
| `title` | Host Grotesk Medium | 24 / 30 |
| `heading` | Plex Sans Arabic SemiBold | 20 / 26 |
| `subhead` | Plex Sans Arabic SemiBold | 16 / 22 |
| `body` | Plex Sans Arabic Regular | 14 / 22 — default |
| `body-sm` | Plex Sans Arabic Regular | 13 / 20 |
| `label` | Plex Sans Arabic Medium | 12 / 16 |
| `eyebrow` | Plex Mono Regular | 11 / 16, caps |
| `data-lg` | Plex Mono Medium | 28 / 32, tabular |
| `data` | Plex Mono Regular | 14 / 20, tabular |
| `data-sm` | Plex Mono Regular | 12 / 18, tabular |

### The rules broken most often

**Every figure in the chrome is Plex Mono with tabular figures on.** Prices in tables, view counts, percentages, invoice amounts, barcodes, dates. Wrap in `[data-figure]` or `.sq-figure`.

**Mono figures are chrome only.** On the artboard, prices use the shop's own brand kit price font at whatever size the grid calls for. A monospaced price on a retail flyer looks like a receipt.

**Sentence case on everything** — buttons, tabs, table headers, menu items, empty states. Title Case only for proper names: "Al Madina Hypermarket", "Federal Tax Authority".

**No italics.** Plex Sans Arabic has no true italic, and mixed-script screens must not emphasise differently by language. Use weight. The token file already neutralises `<em>`.

**Currency:** `AED 1,842.00` — code first, thin space, two decimals. Currency codes stay Latin in Arabic layouts.

## Bilingual and RTL

The app UI ships in English and Arabic at v1. The single most common failure will be a physical CSS property that looks fine in English.

**The artboard does not mirror with the UI.** Panels, toolbars and the catalog flip with the interface language. The offer book follows the *document's* own language, set per book. An owner working in an Arabic UI who is producing an English-layout flyer must get an English-layout flyer. `dir` is scoped, never global. Getting this wrong is a rewrite, not a bug fix.

**Fabric.js canvas coordinates stay LTR always.** Never let UI direction touch canvas maths.

**Logical properties only.** `ms-` `me-` `ps-` `pe-` `start-` `end-` `border-inline-start`. Never `ml-` `mr-` `pl-` `pr-` `left-` `right-` `border-left`. Lint the physical variants to error.

**Arabic sets one step larger.** Plex Sans Arabic has a smaller apparent x-height; matching by point size makes it read as secondary. Already handled by `html[lang='ar']` in the token file. Arabic line height is 1.7 to clear diacritics.

**Numerals stay Western (0–9) by default and do not mirror.** Amounts, barcodes and reference numbers must be bidi-isolated or they will visually reorder inside Arabic text — the `[data-figure]` rule does this. Use it on every interpolated value, not only in table cells.

Eastern Arabic-Indic numerals are a **per-shop brand kit toggle**, not a global setting, and only apply to offer book content — never to the chrome.

**Directional icons mirror** — back, forward, next, undo, redo, indent, trend arrows. Non-directional do not — search, close, download, settings.

**Test both directions on every screen before considering it done.** Arabic labels frequently run longer than English; check for clipping at real string lengths, not lorem.

## The five layout families

These are distinct. Conflating any two causes trouble later.

### 1. App shell

Left rail, persistent, collapses to icons below 1024px. Desktop and tablet.

The rail carries **two scope zones separated by a hard divider**, because every screen belongs to either the org or one shop and users get badly confused when those mix:

- **Shop scope** (below the shop switcher): Offer books · Catalog · Brand kit · Analytics
- **Org scope** (below the divider, labelled with the org name): Shops · Team · Billing

Single-shop accounts see the same structure with the switcher collapsed to a static label, so nothing is rebuilt when they add a second branch.

**Home is the offer books list, not a dashboard.** Owners arrive with one job — this week's flyer — and they arrive in a hurry. "Duplicate last week" sits beside the primary New button and is expected to be the most-used control in the product. Week 33 is week 32 with four products swapped and eleven prices changed.

### 2. Editor

Escapes the shell entirely. Own route, no left rail, full bleed. Three panes: offer tray (start), artboard (centre), properties (end).

The artboard sits on `--sq-ui-canvas-surround` so the offer book pops off the screen the way paper does on a desk. This is the only dark surface in the product.

Below 1024px, side panels **overlay** the canvas rather than compressing it. A squeezed artboard makes the whole product feel cramped.

**The artboard is engine output, not a drawing surface.** A layout engine composes the page from the shop's offers and its template; the owner picks offers, orders them, and nudges within a slot. They do not place cards, draw slots, or free-position anything. Every adjustment is a bounded delta the engine preserves when it re-runs — which is what makes next week's book an edit rather than a rebuild. See `docs/E6-offer-book-editor.md` §1.

Three consequences for anything built here:

- **The start pane is an offer tray, not a placement palette.** Search the catalog, add a product, and it becomes an offer — or a second item on an existing one, joined by *or*. Drag reorders; it does not position.
- **Price is not an owner-styled element.** One control, the promo tier. No font-size dropdown, no badge-text field. `PriceMark` owns the rest.
- **Density, language and shop variant are toolbar switches that re-run the engine live.** The language toggle renders the sibling edition inline — never make an owner publish to find out that the Arabic layout broke.

### 3. Onboarding and brand setup

Centred single column, no navigation, one decision per screen. The product is fully self-serve, so this flow is the entire sales team. Any nav visible here is an exit someone takes before reaching value.

### 4. Card designer

Where a shop builds the offer card that every product will pour into. **Not the offer book editor** — one card on a canvas, no page grid, no product selection, no pagination.

Three panes: component palette (start), card canvas (centre), properties (end). Same shell rules as the editor — no left rail, own route, panels overlay rather than compress below 1024px.

A template is bound to one language, set at creation. Direction is a segmented control in the designer chrome, defaulting from that language and governing anchoring and text flow. Numerals are never affected by it — see Bilingual and RTL.

### 5. Public offer book viewer

Mobile-first, zero chrome, and **architecturally a separate surface** — not a route inside the main app.

This gets seen thousands of times per book while the editor is seen once. It arrives via a WhatsApp forward, on a mid-range Android phone, on a poor connection, from someone who has never heard of SouqStudio. Constraints are entirely different: aggressive image optimisation, fast first paint, no render-blocking fonts, and analytics fired reliably before anyone scrolls away.

## Controls

| Property | Value |
| --- | --- |
| Control height | 32px, 44px on coarse pointers — handled by the token file |
| Corner radius | 8px chips and inputs, 12px cards and dialogs, 16px tinted blocks, full pill on every button, 3px artboard elements |
| Spacing scale | 4 / 8 / 12 / 16 / 24 / 32 / 48 |
| Focus ring | 2px `--sq-ui-border-focus`, 2px offset |
| Disabled | 40% opacity |
| Hover | One ramp step darker |
| Borders | 0.5px hairline `--sq-ui-border-subtle`; `--sq-ui-border-strong` on inputs |

**Every hover-revealed affordance needs a persistent equivalent**, because the editor ships on tablet where hover does not exist. Drag-from-catalog-to-cell must have tap-product-then-tap-cell as a first-class path, not a fallback — long-press drag is unreliable on iPad.

## Components

Every recurring element is specified here. Do not invent a variant — if a screen seems to need one that is not listed, that is a signal to raise it, not to add it.

### No elevation

**There are no shadows in this system.** Separation comes from hairline borders and surface tone. shadcn ships shadows on cards, popovers, dropdowns and dialogs; strip them. No gradients either, anywhere in chrome.

### Buttons

**Buttons are pills. Inputs are 6px rectangles.** The shape carries the affordance — a pill says press, a rectangle says type. This is why `--sq-radius-pill` and `--sq-radius-control` are separate tokens.

| Variant | Fill | Text | Border | Use |
| --- | --- | --- | --- | --- |
| Primary | `--sq-ui-action-primary-bg` | `--sq-ui-action-primary-fg` | none | The one main action |
| Secondary | transparent | `--sq-ui-text-primary` | 1px `--sq-ui-border-strong` | Supporting actions |
| Ghost | transparent | `--sq-ui-text-secondary` | none | Toolbars, row actions, tertiary |
| Danger | transparent | `--sq-ui-action-danger-fg` | 1px `--sq-critical-fg` | Destructive, outside dialogs |
| Danger solid | `--sq-critical-fg` | white | none | Destructive, **only** as the confirm inside a dialog |

- **Primary is blue, through the token.** `bg-action-primary`, never `bg-blue` — the raw utility pins the light value and skips the dark-mode `#8AA1F1`. Lint blocks it.
- **One primary per screen region.** Two primaries means the screen asks two questions and should be split.
- Height 32px, 44px on coarse pointers — from the token file, never hardcoded. Inline padding 12px at 32, 16px at 44.
- Icon-only buttons are circular at the full control height — a 20px glyph padded to 32 or 44, never a 20px target. Always an `aria-label`, and see Icons for where icon-only is permitted at all.
- **Loading replaces the label with a spinner and holds the button's width.** A button that resizes mid-action moves everything beside it.
- Disabled is 40% opacity. If a button is disabled, the reason must be visible on the screen — never tooltip-only, which is unreachable on tablet.

### Inputs

- 6px radius, 1px `--sq-ui-border-strong`, same heights as buttons.
- **Label above the field, always.** Placeholder-as-label disappears the moment someone types and fails every accessibility check.
- Placeholder shows a real example of valid input, not the label repeated: `AED 12.90`, not `Price`.
- Focus: 2px `--sq-ui-border-focus`, 2px offset. Never remove the outline without replacing it.
- Error: `--sq-critical-fg` border plus a message below the field. Never colour alone.
- Price and quantity fields use `--sq-font-figure` with tabular figures, and align to the inline-end so decimal points stack.

### Cards

`--sq-radius-card`, `--sq-ui-surface`, 0.5px `--sq-ui-border-subtle`, no shadow. Padding 12px compact, 16px default. A card inside a card is a sign the hierarchy is wrong.

### Tinted content cards

A soft full-bleed tint block with charcoal text and a secondary button inside. `--sq-radius-block`, no border. Backgrounds: `--sq-sand`, `--sq-sand-tint`, `--sq-sky-tint`. Sky-tint takes charcoal safely; full-strength `--sq-sky` does not and is not a tinted-card ground.

**These are for prompts, not content** — onboarding next-steps, feature introductions, upgrade nudges. General content lives on white cards. Use more than two on a screen and the page turns into a quilt; the restraint is what makes them read as prompts at all.

Never put a primary button inside one. The tint already carries the emphasis, and a solid fill on a tint block fights it. Blue on sand is 6.43:1, so this is not a contrast objection and going blue does not lift it.

**`--sq-ui-text-muted` is not available on a tint.** Its 4.91:1 rating is measured
against `--sq-ui-page`; on sand it drops to 4.19:1 and on sky-tint to 4.26:1, both
under the AA floor. Inside a tinted card the lightest permitted ink is
`--sq-ui-text-secondary` (6.13:1 on sand). The same caution applies anywhere a tint
becomes the ground — icon chips are exempt only because they carry no text.

### Icon chips

A `--sq-radius-chip` square, 28px (32px on coarse pointers), holding one 16px stroked SVG icon. Background from the tint set, icon inheriting `--sq-charcoal` via `currentColor`. See Icons below — never emoji.

Used at the top of stat cards, beside list items, and in tinted cards. **Decorative only** — a chip is never the tap target. If the icon needs to be pressable it is an icon button, which is circular.

### Stat cards

Icon chip, then `label` type for the name, then `data-lg` in `--sq-font-figure` for the figure. White card, no shadow. Deltas use `--sq-positive-fg` or `--sq-critical-fg` with an arrow, never colour alone.

### Usage meters

A labelled bar showing consumption against an allowance — credits used this month, shops
against the plan, seats against the plan. Added by E3, which requires the billing screen
to show "clear usage meters".

Track `--sq-stone-100`, fill `--sq-charcoal`, `--sq-radius-pill` on both, 4px tall — one
step on the spacing scale, not an off-scale value chosen by eye. The
fill turns `--sq-caution-fg` at 80% and `--sq-critical-fg` at 100%, and the figure beside
it always states the numbers — **the colour is a second signal, never the only one.** A
meter with no number is a decoration.

**Never a percentage on its own.** "180 of 200" is what a shop owner can act on; "90%"
makes them do the arithmetic to find out how many are left. Both figures go through
`Figure` so they are mono, tabular and bidi-isolated.

An unlimited allowance has no meter. Render the count and the word — a bar that can never
fill is a bar that means nothing.

### Tabs

Underline active state, 2px `--sq-ui-border-focus` beneath the active label, hairline rule beneath the row. Active label `--sq-ui-text-primary`, rest `--sq-ui-text-secondary`. No pill tabs, no boxed tabs — one tab style in the product.

In RTL the underline follows the label; the row order reverses with the layout.

### Status pills

Pill radius, `label` type, 2px by 7px padding, foreground and background from the Status table. Text always — never a bare coloured dot, which is unreadable to anyone who cannot distinguish the hues.

### Tables

- `body` type for cells, `label` for headers, `--sq-font-figure` for every numeric column.
- Horizontal hairline dividers only. No vertical rules, no zebra striping.
- Numeric columns align to the inline-end, text columns to the inline-start.
- Row height 44px minimum wherever rows are tappable.
- Sticky header on any table that scrolls.
- Row actions are ghost buttons, visible on tablet rather than hover-revealed.

### Dialogs

8px radius, no shadow, no illustration. One primary and one secondary action, primary at the inline-end. Destructive confirms use Danger solid and name the object being destroyed in the button label — "Delete week 32", not "Confirm".

### Toasts and inline alerts

Single line, icon plus text, no illustration, anchored bottom inline-start so RTL places it correctly. Errors that need a decision belong in a dialog, not a toast.

### Navigation items

Active: `--sq-ui-selected-bg` with `--sq-ui-selected-fg`. Hover: `--sq-stone-100`. Rest: `--sq-ui-text-secondary`. The background here is the pale `--sq-blue-50`, not the solid blue of the primary button, so an active nav item and a CTA never read as the same object.

## States

Every interactive element ships default, hover, focus-visible, active, disabled and loading. Every data view ships loading, empty, zero-results, error and loaded. **A screen is not done until all of them exist** — the missing state is always the one a real shop owner hits first.

### Loading

| Duration | Treatment |
| --- | --- |
| Under 400ms | Nothing. An indicator that flashes makes the action feel slower than silence. |
| 400ms–1s | Inline spinner on the control that was pressed. Page stays put. |
| Over 1s, first load | Skeletons |

**Skeletons mirror the shape of the incoming content** — same row heights, same column widths, same card grid, same number of rows you typically return. A generic grey block that resolves into a table is worse than nothing, because the layout jumps.

Skeletons shimmer slowly. They never pulse in scale or bounce. Never put a full-page spinner over content that has already rendered.

### Long jobs

PDF export runs through BullMQ and can outlive the page. **Never block the editor behind a modal spinner.** Show the job in a persistent status area, let the owner keep working, notify on completion, and make the finished file reachable from the offer books list if they navigated away. An owner who closed the tab must not lose the export.

### Empty, zero-results and error are three different screens

| State | Means | Gets |
| --- | --- | --- |
| Empty | Never created one | Invitation, primary action, illustration permitted |
| Zero results | Search or filter matched nothing | What was searched, control to widen it, **no illustration** |
| Error | Something failed | What happened, what to do, retry that preserves input |

Collapsing these into one component is the most common empty-state mistake. "No products found" after a search is not the same message as "you have no products yet".

### Optimistic updates

Price edits and product add or remove apply immediately and reconcile in the background. An owner changing eleven prices must never wait on a round trip per field. On failure, revert that one field and name it — never discard the batch.

### Autosave

The editor autosaves. Show a quiet persistent status — Saved, Saving, Unsaved changes — never a toast per save, and never a Save button that implies work is lost without it.

## Forms

- **Mark required fields with an asterisk and a visible legend.** An asterisk with no "* Required" key means nothing to a screen reader user or to someone reading in their third language. If nearly every field is required, mark the optional ones instead and drop the asterisks entirely.
- The asterisk follows the label and uses `--sq-critical-fg`.
- **Validate on blur, not on keystroke.** Once a field has errored, re-validate on change so the error clears as it is fixed rather than persisting until the next blur.
- **Never disable submit to enforce validation.** A disabled button with no explanation is a dead end. Let them submit, then show the errors and move focus to the first one.
- Preserve everything they typed when the server rejects it.
- One message per field, below it, alongside the border colour. Colour alone never carries meaning.

## Motion

- `--sq-dur-fast` (120ms) for hover, focus and colour. `--sq-dur-base` (200ms) for panels, dialogs and expansion. Nothing exceeds 300ms.
- **Animate `opacity` and `transform` only.** Width, height, top and left force layout and stutter on the mid-range tablets these shops actually use.
- Buttons transition colour on hover and take a `scale(0.98)` on press. No bounce, no overshoot.
- Dialogs and panels fade with a small translate from their anchor edge. Overlays fade only.
- **Nothing on the artboard animates.** Canvas work is direct manipulation; a transition between a drag and its result makes the editor feel imprecise.
- `prefers-reduced-motion: reduce` drops every transition to 1ms and removes translation, keeping opacity. This is a requirement, not an enhancement.

## Keyboard and focus

- Escape closes the topmost layer. Enter submits a focused form. The editor intercepts Cmd/Ctrl+S and maps it to save rather than the browser dialog.
- Focus is visible on every interactive element. `outline: none` without a replacement is a defect.
- Dialogs trap focus and return it to the trigger on close.
- Tab order follows visual order. In RTL that means the DOM order must be right — never patch it with `tabindex`.

## Destructive actions

**Prefer undo over confirm.** A toast with an Undo action beats a confirmation dialog for anything reversible — archiving a book, removing a product, clearing a cell. Reserve dialogs for the genuinely irreversible: deleting a shop, cancelling a subscription, removing a user.

When a dialog is warranted, the button names the object: "Delete week 32", not "Confirm".

## Content limits

- Truncate to one line in tables, two on cards, and expose the full string with `title`.
- **Never truncate a price or any figure.**
- Arabic product names routinely run longer than their English equivalents. Test truncation in both languages before considering a table done.

## Icons

**Library: `lucide-react`.** It ships with shadcn/ui, so the components already reference it, and every glyph is drawn on the same 24px grid at the same stroke weight. One library, no exceptions — a second set introduces two stroke weights and two corner treatments that no amount of sizing will reconcile.

**Never emoji.** They render as a different glyph on every platform, ignore `currentColor` so they cannot be themed or inverted for dark mode, carry baked-in colours that violate the fill-only tier, shift line height with their own metrics, and are announced by screen readers with their Unicode name.

### Sizing and colour

| Size | Use | Stroke |
| --- | --- | --- |
| 16px | Inline with `body` or `body-sm` text, inside chips | 1.75 |
| 20px | Default — buttons, nav, table row actions | 2 |
| 24px | Empty-state headers, large touch targets | 2 |

The lighter stroke at 16px is optical compensation; 2px at that size reads noticeably heavier than 2px at 20px. Pass `strokeWidth` explicitly rather than accepting the default everywhere.

**Always `currentColor`.** Never a hardcoded `stroke` or `fill`. An icon that does not inherit its parent's colour breaks in dark mode and in every inverted context.

### Labels

**An icon that carries meaning needs a visible text label.** Icon comprehension depends on prior exposure, and almost no icon is universal — the same glyph reads differently to an owner in Deira and a manager in Sharjah, and differently again across the four languages in the catalog.

**Never reveal a label on hover.** The editor ships on tablet, where hover does not exist, so a hover-only label is no label at all.

Icon-only controls are permitted in two places: the editor toolbar, and table row actions. Both require an `aria-label`, both require the same action to be reachable with a visible label elsewhere, and neither may be the only route to a destructive operation.

Decorative icons — chips, stat card glyphs, illustration accents — carry `aria-hidden="true"` and no label. The adjacent text is the label.

### Targets

WCAG 2.2 SC 2.5.8 sets the floor at 24×24 CSS pixels for any pointer target at Level AA; 44×44 is the AAA criterion. Our 32px and 44px control heights clear both, but **a 16px icon is not a 16px button** — pad it to the full control height. Icon buttons are where this criterion is usually failed.

### RTL

Directional icons mirror: back, forward, next, previous, undo, redo, indent, outdent, trend arrows in a sequence, send. Non-directional icons do not: search, close, download, settings, calendar, check, user, chart. Mirroring a magnifier or a clock is a bug, not a localisation.

### When not to use an icon

If a word is clearer, use the word. This matters more here than in most products — icon conventions are learned, and a shop owner reading in their third language will parse "Duplicate" faster than a glyph they have to interpret. Icons earn their place by making a labelled target easier to find, not by replacing the label.

## Design surfaces

The card designer and the offer book editor are two canvases in one product. These rules keep them feeling like one tool.

### Canvas parity

Both artboards sit on `--sq-ui-canvas-surround` with identical padding, zoom controls, selection outline and handle treatment. A shop moving between designing a card and building a book must not feel they changed application. Divergence here is the fastest way to make the product feel assembled from parts.

### Bound and static components

Two classes of thing live on a card canvas and **must be distinguishable at a glance**:

- **Bound** — pulls live product data. Image, brand, name, variant, price, offer price, offer type, discount badge, unit.
- **Static** — identical on every card. Shapes, rules, fixed copy, flashes.

A shop that cannot tell which is which cannot predict what their card does across twelve products. Mark bound components consistently in all three places they appear: a `--sq-ui-selected-ring` outline on canvas, a leading indicator in the layer list, and a grouped section in the palette. Never rely on the properties panel alone — that requires selecting each one to find out.

Bound components render sample data on the canvas, never their field name. `Samsung` and `1,449.00`, not `{brand}` and `{price}`. A card designed against placeholder tokens looks balanced and then collapses on real content.

### Stress preview

A persistent panel in the card designer showing the card under worst-case data drawn from the shop's own catalog — longest product name, absent brand, longest price, transparent-background image.

**Always visible, never behind a tab.** Its whole value is that the shop sees the failure while they are causing it. A shop designing against a short name and discovering the overflow after a customer has seen the flyer is the failure mode this exists to prevent.

Render it at the same scale as the canvas so the comparison is honest.

### Overflow is declared, not discovered

Every bound component carries an overflow policy set in the properties panel: shrink-to-fit with a floor, clamp to N lines, or truncate. The properties panel must surface it as a first-class control, not bury it — it is the setting that determines whether a template survives contact with the catalog.

The price floor is never zero and never editable down to illegibility.

## Brand kit fonts

**Scope exception.** Shop owners pick their own typefaces for their offer books. The rules governing which families the picker offers, how they are self-hosted, and how Fabric.js must measure them before instantiating text live in `references/brand-kit-fonts.md`. Read it before touching the brand kit, the font picker, or any Fabric text object.

Two rules from it are load-bearing enough to repeat here:

- **Never expose the full Google Fonts library.** Filter by the template's language. Most of the library has no Arabic.
- **`await document.fonts.load()` for every family and weight before instantiating Fabric text objects.** Fabric caches metrics at creation; a late-resolving webfont means every bounding box is wrong and the exported SVG does not match what the owner saw.

## Illustrations

Used for empty states, onboarding steps, and feature explainers.

**Before placing any illustration, read `references/illustration-selection.md`.** Most screens are better without one, and the catalog's own `Use for…` guidance was written for a different product and will point you at the wrong screen. That file carries the do-not-use table, the selection procedure, and the slot mapping. The catalog itself is `assets/illustration-catalog.json` — 385 entries.

The set is recoloured from unDraw artwork with `scripts/rebrand-svgs.py`, which applies the palette and then audits the result — run it with `--strict` in CI so a stray colour fails the build rather than reaching a screen. Inventory and status live in `references/illustration-manifest.md`.

What makes a collected set look commissioned is constraint, not craft:

- **One line colour: `--sq-charcoal`.** No exceptions, no lighter greys for secondary strokes.
- **One stroke weight**, consistent at the size it ships. Do not scale artwork and inherit a different apparent weight.
- **Maximum two hues per illustration: the sand ramp, plus one accent.** Sand dominates and carries form — its three steps (`--sq-sand-tint`, `--sq-sand`, and the deeper `#DCD5B4`) are one hue, not three fills. The accent is `--sq-blue` by default, `--sq-sky` where blue would fight something nearby. Skin tones on figures are preserved and do not count against this.
- **No gradients, no shadows, no textures.** Any inherited piece carrying these needs flattening before it can sit alongside the rest.
- **Never `--sq-gold`** — it does not appear in the application.
- **Brand blue is the default accent.** Illustrations are interface furniture — welcome screens, empty states, onboarding — and are where brand expression belongs. The one restriction: no blue shape at control scale *and* control shape, so an illustration never contains something that reads as a tappable pill.
- SVG, currentColor on strokes where possible, no embedded raster.
- Illustrations do not mirror in RTL unless they contain directional meaning (an arrow, a reading order, a hand pointing).

### Dark mode

**Do not use inverted illustration variants for artwork containing people.** unDraw uses one dark navy for both outlines and for hair and clothing. Inverting it so outlines stay visible turns every figure grey-haired and white-trousered, and no colour map can tell the difference because the hex carries no shape semantics.

Instead, in dark mode the light artwork sits on a raised `--sq-illus-panel` surface. The illustration becomes a bounded object in both themes, there is one artwork to maintain rather than two, and sand rather than white keeps the panel from glaring on a dark page.

The `dark/` output from the rebrand script is for **object-only illustrations** — charts, files, devices, boxes with no people in them — where inversion is safe. Check every one before using it.

**Empty states are an invitation, not an apology.** Host Grotesk title naming the space ("No offer books yet"), one line of body, one verb CTA. Never "Nothing here yet."

## shadcn/ui

shadcn does not ship correct for this system. Fix two things on every component pulled in:

1. **Radius.** The bridge sets `--radius` to 6px, but check any component with hardcoded `rounded-md` or `rounded-lg` in its class list and strip it.
2. **Colour variables.** The bridge block at the bottom of `souqstudio-tokens.css` maps shadcn's variables onto SouqStudio tokens. If a component looks wrong, check whether it uses a variable the bridge does not cover before adding an override.

Never restyle a shadcn component with arbitrary Tailwind colour classes. Extend the bridge instead.

## Voice

Sentence case, contractions, active voice, verb first. "Create offer book", not "Offer book creation".

Skip "successfully", "please", "simply", "just", "easy". Errors say what happened then what to do, in one sentence, with no first person and no raw exception strings. Placeholders show a real example of valid input, not the field label repeated.

Shop owners are frequently working in their second or third language. Short sentences beat clever ones.

## Known gaps

Raise these rather than inventing values:

- **Four radius values in this document are stale** and contradict the token file, left
  over from the radius scale change. The token file is authoritative. Buttons section
  says inputs are "6px rectangles" and the Inputs section says "6px radius" —
  `--sq-radius-control` is **8px**. The Dialogs section says "8px radius" —
  `--sq-radius-card` is **12px**. The shadcn section says the bridge sets `--radius` to
  6px — it maps to `--sq-radius-card`, **12px**. The Controls table is correct. Fix the
  prose; do not move the tokens.

- **The brand blue is settled, and the token file is right.** The printed brand palette
  gives `#143CD2`, matching the token file and everything committed under
  `apps/web/public/brand/`. Exports from the design tool keep emitting `#153CD0` — a
  hair off, imperceptible, and still wrong. **Correct the export, never the token.**
  Check the blue on every new export; this has now come back twice.

  The palette was verified against the token file colour by colour: blue, navy,
  charcoal, sand, sky, gold and the `#F8F7F3` page ground all match exactly. The
  token file is not a paraphrase of the brand — it is the brand.
- **Wordmark casing.** The mark reads *Souqstudio*, lowercase `s` in `studio`. Every string in the codebase writes *SouqStudio*. Unchanged so far — a logo's treatment does not automatically dictate prose casing — but reconcile before launch copy or a trademark filing. The mark carries a ®; confirm the registration territories.
- **Illustration inventory** is not yet complete. See `references/illustration-manifest.md`.
- **Chart typography** — use `label` for axis and legend, `data-sm` for value annotations, and flag it as open rather than inventing a scale.
- **Dark mode is now a commitment, not an open item**, because illustrations ship light and dark. The token file carries dark surfaces and text only. Every other role — status backgrounds, machine-output fill, selection tint, chart series, the fill-only tier — still needs review at dark contrast before any screen ships dark. Do not infer those values; raise them.
- **Print stylesheet** for invoices and exported analytics, where the machine-output marker must survive as rule weight rather than colour.
- **High-contrast accessibility theme**, increasingly required in GCC public-sector tenders.
