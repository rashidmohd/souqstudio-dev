# Component inventory

The Components section of `SKILL.md` says what each component looks like. This file says
what each one is **called**, where it **lives**, and what **props** it takes.

Without it, two sessions both correctly following the spec produce `<Button variant>`,
`<Button kind>` and `<Button primary>`. All three satisfy every visual rule. All three
lint clean. And the product now has three button APIs.

---

## How to use this file

**Before building any UI:** find the component here. If it exists, import it. If it is
listed but not built, build it to the signature below — do not invent a different one.

**After building one:** change its status to `built` and confirm the signature matches.
If you had to deviate, say so explicitly; a silent deviation is the divergence this file
exists to prevent.

**If what you need is not listed:** stop. See "Adding a component" at the bottom.

---

## Conventions

Every component follows the same shape, matching shadcn since that is the base:

- `variant` — visual treatment. Never `kind`, `type`, `appearance` or a boolean.
- `size` — dimension. Never `large`, `small` as separate booleans.
- Booleans read as adjectives and default false: `loading`, `disabled`, `selected`.
- Named export, PascalCase, one component per file.
- `className` passthrough on every component, merged with `cn()`.
- Forward refs on anything focusable.
- Never `style={{ }}` — the design token is the styling mechanism.

---

## Inventory

Status: `spec` — specified, not built · `built` — implemented · `verified` — built and checked against the consistency checklist in both directions.

### Buttons

| | |
| --- | --- |
| File | `components/ui/button.tsx` |
| Status | `built` — apps/web only. Not yet in apps/admin. |
| Governs | SKILL.md → Components → Buttons |

```tsx
type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'
  size?: 'default' | 'lg'          // 32px / 40px, auto 44/48 on coarse pointers
  loading?: boolean                 // replaces label with spinner, HOLDS WIDTH
  iconOnly?: boolean                // circular, requires aria-label
  disabled?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>
```

- Default `variant` is `secondary`, not `primary`. A primary must be chosen deliberately —
  one per screen region.
- `danger-solid` is **only** valid as the confirm inside a dialog. Lint cannot catch this;
  it is on review.
- `iconOnly` without `aria-label` is a defect.

### Input

| | |
| --- | --- |
| File | `components/ui/input.tsx` |
| Status | `built` — apps/web only. Not yet in apps/admin. |
| Governs | SKILL.md → Components → Inputs, and → Forms |

```tsx
type InputProps = {
  label: string                     // REQUIRED — never placeholder-as-label
  hint?: string
  error?: string                    // renders below, with border colour
  required?: boolean                // asterisk + the legend must exist on the form
  figure?: boolean                  // mono, tabular, aligned inline-end — prices/quantities
  size?: 'default' | 'lg'           // 32px / 40px — 44/48 on coarse pointers
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>
```

`label` is required in the type, not optional-with-a-warning. That is the enforcement.

`size` uses the same words as Button on purpose — two components carrying `size`
must not disagree about what the values mean. `lg` is for screens where a single
field is the whole task: login, signup, code entry. Dense screens stay on the
default. The native `size` attribute is omitted so it cannot collide.

### OtpInput

| | |
| --- | --- |
| File | `components/auth/OtpInput.tsx` |
| Status | `built` — apps/web only |
| Governs | E1-01 / E1-02 code entry |

```tsx
type OtpInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  length?: number                   // 6
  error?: boolean
  autoFocus?: boolean
  disabled?: boolean
}
```

**Six boxes, one input.** The boxes are presentational; a single transparent
input sits over them and holds the value. Six real inputs is the obvious build
and the wrong one — it reimplements focus shuffling, cross-box backspace and
paste-splitting, and still tends to defeat iOS and Android autofill, which target
one field carrying `autocomplete="one-time-code"`.

Boxes are 48px squares (`size-12`), figures mono and tabular. Digits only; a
pasted code with spaces or dashes still lands.

Lives in `components/auth/` rather than `components/ui/` — it is one feature's
control, not a design system primitive. Promote it if a second feature needs it.

E1-03 reuses it unchanged for the six-digit authenticator code at login. The
alphanumeric backup code needed a sibling instead — see CodeInput.

### CodeInput

| | |
| --- | --- |
| File | `components/auth/CodeInput.tsx` |
| Status | `built` — apps/web only |
| Governs | E1-03 backup code entry |

```tsx
type CodeInputProps = {
  label: string
  value: string                     // bare, no hyphens — grouping is presentation
  onChange: (value: string) => void
  length?: number                   // 12
  hint?: string
  error?: boolean
  autoFocus?: boolean
  disabled?: boolean
}
```

**A sibling of OtpInput, not a mode of it.** OtpInput strips every non-digit on
input, which is right for a six-digit emailed code and fatal for `A7K2-M9PQ-R4XT`.
Adding an `alphabet` prop would mean changing a primitive that verify-email and
reset-password already depend on, to serve a control with different ergonomics:
one wide field, because twelve boxes is a wall.

One field, mono and tabular. Normalizes as you type — uppercases, applies
Crockford transcription (`I`/`L`→1, `O`→0) and drops everything outside the
alphabet — so what is on screen is exactly what gets checked. Grouped in fours
for display only. `autoComplete="off"`, deliberately not `one-time-code`: that
hint makes the platform offer the emailed code, which is the *other* field on
the same screen.

### OfferPreview — **deleted**

Was a miniature offer book page in the shop's colours, rendered as inline SVG, shown
beside the colour step and on the brand kit screen.

**Removed, not replaced.** It existed to preview a chosen grid and template, and a
brand kit holds neither — a book picks its own layout, per
`docs/composition-model.md` §2. Once the choice was gone the component was drawing an
invented page, which was worse than drawing nothing: it implied the kit decided a
layout it does not decide, and said nothing about what the same colours do on a hero
band or a header.

What replaced it is a **legend, not a mock-up** — `RoleLegend` inside `ColorFields`,
showing each colour doing its job at the smallest scale that makes the job legible. A
real preview needs the block renderer and belongs to E6.

### ColorField

| | |
| --- | --- |
| File | `components/ui/color-field.tsx` |
| Status | `built` — apps/web only |
| Governs | SKILL.md → Components → Inputs (shares the input's shape rules) |

```tsx
type ColorFieldProps = {
  label: string
  value: string
  onChange: (hex: string) => void
  hint?: string
  error?: string
  onActivate?: () => void          // fired on focus anywhere in the row
  size?: 'default' | 'lg'          // same vocabulary as Input and Button
  id?: string
}
```

A swatch fused to a hex field inside one bordered shell. They were two separate
widgets — a small square beside an input — which read as unrelated and left the
shop's colour rattling inside a form field it did not fill.

**A native `<input type="color">`, not a popover picker.** shadcn/ui ships no colour
picker; the community ones (Kibo UI, shadcnblocks) are built on Popover and Slider,
neither of which is in this inventory, and both arrive with shadows this system does
not have. Native gives the platform picker on a phone with its own accessibility
tree — the same trade `Select` makes, for the same stated reason.

`.sq-swatch` in `styles/globals.css` strips the vendor pseudo-elements so the swatch
fills its tile edge to edge. It lives in CSS rather than as Tailwind arbitrary
variants, which the design system forbids — same reasoning as `.sq-wordmark`.

**`size` matches `Input` and defaults to the same value**, so a colour field beside a
text field lines up with no hand-tuned offset. This file raised that exact problem
against `Select` — *"without it a select beside a `size='lg'` input will not line
up"* — and it was shipped here once before being caught. **Any control that sits in a
row beside `Input` needs this prop.** `Select` still does not have it.

**Added without going through this file first is not what happened here** — it is
recorded before use.

### LogoField · ColorFields · TypographyFields

| | |
| --- | --- |
| File | `components/brand/{LogoField,ColorFields,TypographyFields}.tsx` |
| Status | `built` — apps/web only |
| Governs | E4-01 / E4-02 / E4, in both the wizard and the brand kit screen |

```tsx
type LogoFieldProps = {
  variant?: 'primary' | 'secondary'   // treatment of the upload button
  children?: React.ReactNode          // rendered beside it
}

// ColorFields takes no props — it reads and writes the brand store.
// Its validation is exported separately and is pure:
function firstInvalidColorSlot(kit: BrandKit): { key: string; label: string } | null

// TypographyFields takes no props either, same reason. A read-only list of
// styles; editing happens in a `Dialog`. `lib/brand-typography.ts` owns the
// defaults, the bounds and the patch.
```

**`ChoiceGrid` and `ChoiceStep` are deleted**, along with `BrandKitSummary`. They
existed to pick a grid and a template, and a brand kit carries neither — a book
chooses its own layout, per `docs/composition-model.md` §2. The summary card went
with them: the brand kit screen is now one card per facet and each card states
what is set, so a card restating all of it at the top was saying it twice.

`BrandCard` — icon, title, description, current state, control — is local to
`BrandKitScreen.tsx`, the same way `Section` was before it. It is a composition
of `Card` and `IconChip`, not a new primitive. If a second screen ever wants it,
it comes through this file first.

**The typography list shows the result; a `Dialog` does the editing.** A text
style has six properties, and eight styles inline was forty-eight controls
stacked in one card — a wall to scroll past rather than a guideline to read.
Each row instead draws the style *as itself*, at its own weight, face and
colour, over a plain-language summary ("Cairo · 1.25× · 700 · Deep blue"), so
what an owner set is legible without decoding a form. This is `Dialog`'s first
use as an edit surface rather than a confirmation; the "prefer undo over
confirm" note above still governs destructive actions and is untouched.

`ColorFields` stays inline — a colour row is a name and a swatch, and a dialog
for two fields is friction with nothing to show for it.

**Both edit open-ended lists, not fixed slots.** `ColorFields` is the palette page
of a brand guideline and `TypographyFields` is the type page: named entries the
shop invents, each carrying its own properties. A text style holds a typeface,
size, weight, italic and a colour drawn from the palette.

`MIN_STYLES` is 5 — the smallest set that can render a page: a headline, a
product name, a price, supporting text and small print. A style a seeded block
binds to cannot be deleted and says so, because deleting it would leave that
block with nothing to set a product name in.

**Italic is offered and warned about, never blocked.** Of the ten catalog
families only Rubik ships a true italic; Arabic has no italic convention, so the
rest get a synthesised slant and the hint says which. `eslint.design.cjs` exempts
these two files from `no-restricted-syntax` — the rule governs chrome, and this
is the owner's typography, which the design skill's own scope note excludes.

**ColorFields edits an open-ended palette, not three fixed slots.** It was three
rows labelled Primary, Secondary and Accent with a legend underneath explaining
which was for headers and which for prices. That was two limitations wearing one
coat: a brand capped at three colours, and a product telling an owner what their
own colours are for. A brand kit is a **guideline — it defines colours and does
not place them**; where a colour lands is the block's decision, and the same
colour is a hero ground in one block and a price chip in another.

Rows are name plus `ColorField`, add and remove, bounded by `MIN_PALETTE` (3, what
setup completion and the seeded block slots need) and `MAX_PALETTE` (8, a product
judgement — nothing breaks at twenty, but twenty is not an identity). The three
`TokenRef` slots a seeded block names bind to the first three entries;
`lib/brand-palette.ts` owns that and the legacy mirror.

**The three brand choices, without any navigation around them.** Each was
extracted from the wizard step of the same name when E4-05 needed the same
control on a settings screen. The steps — `LogoStep`, `ColorsStep`, `ChoiceStep`
— keep their signatures and are now a heading, one of these, and their own
Continue/Back footer.

The alternative was a `footer` slot or a `mode: 'wizard' | 'settings'` prop on
each step, which is a second API for one component and is what this file exists
to prevent. Validation left with the body as a pure function precisely so that
the wizard's Continue and the settings screen's Save cannot drift apart on what
counts as a colour.

`LogoField` has no save: `POST /api/v1/brand/logo` has already written the logo
through by the time the upload resolves. `ColorFields` and `ChoiceGrid` write
only to the store; persisting is the caller's.

### Card

| | |
| --- | --- |
| File | `components/ui/card.tsx` |
| Status | `built` — apps/web only |
| Governs | SKILL.md → Components → Cards |

```tsx
type CardProps = {
  padding?: 'compact' | 'default'   // 12px / 16px
} & React.HTMLAttributes<HTMLDivElement>
```

A card inside a card means the hierarchy is wrong. Not enforceable in types — review catch.

### TintedCard

| | |
| --- | --- |
| File | `components/ui/tinted-card.tsx` |
| Status | `built` — apps/web only |
| Governs | SKILL.md → Components → Tinted content cards |

```tsx
type TintedCardProps = {
  tint: 'sand' | 'sand-tint' | 'sky-tint'
} & React.HTMLAttributes<HTMLDivElement>
```

For prompts, not content. Never a primary button inside. Max two per screen.

**`text-muted` is unavailable inside one.** It is rated against the page ground and
falls to 4.19:1 on sand, under the AA floor. `text-secondary` is the lightest ink a
tint may carry. First use: the getting-started checklist on home.

### IconChip

| | |
| --- | --- |
| File | `components/ui/icon-chip.tsx` |
| Status | `built` — apps/web only |
| Governs | SKILL.md → Components → Icon chips |

```tsx
type IconChipProps = {
  icon: LucideIcon                  // the component, not a string name
  tint?: 'sand' | 'sand-tint' | 'sky-tint'
}
```

**Decorative only — never the tap target.** No `onClick`. If it needs to be pressable it
is a `Button` with `iconOnly`, which is circular. The absent `onClick` is the enforcement.

Sized by `--sq-size-chip` (28px, 32px on coarse pointers). That token was added when this
was built — the skill specified the size and nothing carried it, so a chip could not be
built without a raw value. `aria-hidden` is set internally; the adjacent text is the label.

Sky is safe here despite carrying no text: an icon is judged at the 3:1 non-text floor
(WCAG 1.4.11), which sky clears.

### StatCard

| | |
| --- | --- |
| File | `components/analytics/stat-card.tsx` |
| Status | `spec` |
| Governs | SKILL.md → Components → Stat cards |

```tsx
type StatCardProps = {
  icon: LucideIcon
  label: string
  value: string | number            // rendered through Figure
  delta?: { value: number; direction: 'up' | 'down' }
}
```

`delta` renders an arrow plus colour — never colour alone.

### UsageMeter

| | |
| --- | --- |
| File | `components/ui/usage-meter.tsx` |
| Status | `built` — apps/web only, E3 |
| Governs | SKILL.md → Components → Usage meters |

```tsx
type UsageMeterProps = {
  label: string
  used: number
  limit: number | null              // null = unlimited: no bar, count only
  unit?: string                     // 'shops', 'credits' — for the screen reader text
}
```

`limit: null` is a real state, not a missing value — an Enterprise plan has unlimited
shops, and a bar that can never fill would be noise. The component renders the count and
"unlimited" instead of a track.

Thresholds are the component's, not the caller's: caution at 80%, critical at 100%. A
`variant` or a `color` prop would let two screens disagree about when a shop owner should
worry.

**Deviation, stated rather than slipped in:** this is the one component that sets
`style`. The fill's inline size is a data value — the fraction consumed — not a design
value, and the alternatives are an arbitrary Tailwind class (barred, and it would need
one class per percentage) or 101 utility classes. Every colour, radius and dimension
still comes from a token.

### Tabs

| | |
| --- | --- |
| File | `components/ui/tabs.tsx` |
| Status | `spec` |
| Governs | SKILL.md → Components → Tabs |

```tsx
type TabsProps = {
  items: Array<{ value: string; label: string }>
  value: string
  onValueChange: (value: string) => void
}
```

**No `variant` prop.** One tab style in the product — underline. Pill tabs and boxed tabs
do not exist, so there is nothing to choose between.

### StatusPill

| | |
| --- | --- |
| File | `components/ui/status-pill.tsx` |
| Status | `spec` |
| Governs | SKILL.md → Components → Status pills, and → Colour → Status |

```tsx
type StatusPillProps = {
  status: 'live' | 'failed' | 'attention' | 'draft' | 'archived' | 'generated'
}
```

The label is derived from `status`, not passed in — that is what keeps the wording
consistent across every screen. Text always; never a bare coloured dot.

**Open — this enum cannot express E2's states.** E2-02 puts an active/paused badge on
the shop list and E2-03 a pending/expired one on the team list. `archived` fits a removed
shop; nothing here fits the other four, and `attention` would be a lie. E2 shipped those
as plain coloured text rather than add values to this signature unilaterally, so both
lists currently disagree with "status badge" as the spec words it. The proposal is
`+ 'active' | 'paused' | 'pending' | 'expired'`, and a separate `RoleBadge` rather than
overloading status with identity — owner/manager/editor/viewer is who someone *is*, not
what state a thing is in. Decide before a third screen invents a fourth treatment.

### Select

| | |
| --- | --- |
| File | `components/ui/select.tsx` |
| Status | `built` — apps/web only, E2 |
| Governs | SKILL.md → Components → Inputs (shares the input's shape rules) |

```tsx
type SelectOption = { value: string; label: string; disabled?: boolean }

type SelectProps = {
  label: string                     // required, like Input
  options: SelectOption[]
  hint?: string
  error?: string
  required?: boolean
  placeholder?: string              // non-selectable first option when value is empty
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'size'>
```

A native `<select>` under a styled shell, not a listbox built from divs. On the phone a
shop owner is actually holding, native gives the platform picker, its scroll physics and
its accessibility tree for free. Matches `Input`: label above always, 8px rectangle
rather than a pill, error supersedes hint, `aria-invalid` and `aria-describedby` wired.

**Added by E2 without going through this file first** — the inventory listed no select,
dropdown or combobox at all, and E2 needed one in four places. Of the two questions it
would have forced, one is now answered: the shop switcher is its own component and does
*not* use this one — see `ShopSwitcher` below. Still open: whether this needs `Input`'s
`size: 'default' | 'lg'` — without it a select beside a `size="lg"` input will not line up.

### ShopSwitcher

| | |
| --- | --- |
| File | `components/shop/ShopSwitcher.tsx` |
| Status | `built` — apps/web only, E2 |
| Governs | layout-map.md → App shell → the rail's shop zone |

```tsx
type ShopSwitcherProps = {
  shops: ShopOption[]               // { id, name } from lib/shops.ts
  activeShopId: string | null
  collapsed: boolean                // matches NavItem's
}
```

**A bare native `<select>` laid transparently over our own row, not `Select`.** The
objection to `Select` here was that it reads as a form field in a navigation column —
true of its label-above-a-rectangle shell, not of the element. This keeps the platform
picker, its scroll physics and its accessibility tree, and still looks like a nav row.
The visible markup is `aria-hidden`; the select carries the accessible name, so the row
is announced once, as one control.

**One shop renders no control**, not a disabled one: a disabled switcher's reason cannot
be shown in a 280px column, and a reason living only in a tooltip is barred.

The shop's mark is a `--sq-radius-chip` square on `--sq-sky-tint`, deliberately against
the account row's sand circle. A shop is a thing and a person is a person, and the two
sit at opposite ends of the same rail.

### DataTable

| | |
| --- | --- |
| File | `components/ui/data-table.tsx` |
| Status | `built` — apps/web only, E2 |
| Governs | SKILL.md → Components → Tables |

```tsx
type Column<T> = {
  key: keyof T & string
  header: string
  align?: 'start' | 'end'           // logical, never left/right
  figure?: boolean                  // mono + tabular + inline-end
}

type DataTableProps<T> = {
  columns: Column<T>[]
  rows: T[]
  rowActions?: (row: T) => React.ReactNode   // ghost buttons, always visible
  stickyHeader?: boolean
  onRowClick?: (row: T) => void              // forces 44px min row height
}
```

`align` takes `start`/`end`, not `left`/`right`. The type makes the RTL rule unbreakable.

### Dialog

| | |
| --- | --- |
| File | `components/ui/dialog.tsx` |
| Status | `built` — apps/web only |
| Governs | SKILL.md → Components → Dialogs, and → Destructive actions |

```tsx
type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  primaryAction: { label: string; onClick: () => void; destructive?: boolean }
  secondaryAction?: { label: string; onClick: () => void }
}
```

Exactly one primary and one optional secondary — the shape prevents a third. No
`illustration` prop; dialogs never carry one. For destructive, `label` must name the
object: "Delete week 32", not "Confirm".

**Prefer undo over confirm.** Reserve dialogs for the genuinely irreversible.

Built on the native `<dialog>` element with `showModal()`, so focus containment,
background inerting and Escape come from the platform rather than a
reimplementation. `primaryAction` also accepts `loading`, added when E1-03 needed
a confirm that waits on the server; the inventory signature is otherwise unchanged.

**Open gap — no scrim token.** `::backdrop` is left unstyled, so the browser
default stands. The system defines no overlay colour: the only dark surface is
`--sq-ui-canvas-surround`, which is the editor artboard surround and opaque, and
an alpha modifier (`bg-stone-900/40`) cannot work because the palette is bare
`var()` values with no `<alpha-value>` placeholder for Tailwind to compose onto.
Adding `--sq-ui-scrim` is a token decision, not something to inline. Raised, not
worked around.

### Toast

| | |
| --- | --- |
| File | `components/ui/toast.tsx` |
| Status | `spec` |
| Governs | SKILL.md → Components → Toasts, and → Destructive actions |

```tsx
type ToastProps = {
  message: string                   // single line
  tone?: 'default' | 'positive' | 'critical' | 'caution'
  action?: { label: string; onClick: () => void }   // this is where Undo lives
}
```

Anchored bottom inline-start. Errors needing a decision belong in a dialog.

### NavItem

| | |
| --- | --- |
| File | `components/shared/nav-item.tsx` |
| Status | `built` — apps/web only |
| Governs | SKILL.md → Components → Navigation items |

```tsx
type NavItemProps = {
  icon: LucideIcon
  label: string
  href: string
  active?: boolean
  collapsed?: boolean               // icon only — the owner's collapse
  leading?: ReactNode               // replaces the icon; the account row's avatar
}
```

The active background is the pale `--sq-blue-50`, never the solid blue the primary
button carries. The label becomes the `aria-label` — it does not disappear.

**`collapsed` is the owner's choice, not the breakpoint's.** The rail's toggle
sets it and `sq_rail` remembers it. A breakpoint cannot be a boolean without
measuring the viewport in JavaScript, which flashes the wrong state on first
paint, so the sub-1024px collapse stays in CSS and hides the label with
`hidden lg:inline`. The two compose. `aria-label` and `title` are set at every
width, collapsed or not.

**Every row's leading element occupies the same 28px box**, whatever it holds — a 20px
glyph, the account avatar, the switcher's chip. Three different box widths put the labels
in two columns 8px apart and centre the glyphs on two axes once the rail collapses. The
box is the column; what sits in it is not.

**`leading` replaces the glyph, and `icon` stays required anyway.** The account row
passes an `Avatar` because it is a person, not a destination. Making `icon`
optional alongside it would allow a row with neither, and the rail would have two
item shapes instead of one.

---

### Avatar

| | |
| --- | --- |
| File | `components/ui/avatar.tsx` |
| Status | `built` — apps/web only |
| Governs | SKILL.md → Colour → the fill-only tier |

```tsx
type AvatarProps = {
  name: string | null               // users.name is nullable
  email: string                     // the fallback initial comes from here
  className?: string
}
```

**Initials, not an image.** `users` has no avatar column and no upload path, so this
is not a placeholder waiting for a photo — it is the component. `--sq-size-chip`
(28px, 32px coarse), circular, `--sq-sand` with `--sq-charcoal` on it at 10.22:1,
which is the icon-chip pairing and keeps it inside the fill-only tier's one rule.

`aria-hidden` always: it sits inside a control that already carries an accessible
name, and two letters read aloud as letters is noise, not identity. Initials come
from `lib/initials.ts` — first and last word of the name, else the email's local
part, never the domain, and split by code point so an Arabic or astral first letter
survives.

---

## Components implied by the spec but not in the Components section

Each is required by a rule elsewhere in `SKILL.md`. Raise if any signature looks wrong
before building it.

### Figure

| | |
| --- | --- |
| File | `components/ui/figure.tsx` |
| Status | `built` — apps/web only, E2 |
| Governs | SKILL.md → Typography → figures; Bilingual → numerals |

```tsx
type FigureProps = {
  value: string | number
  currency?: string                 // 'AED' — code first, thin space, 2dp
  size?: 'data-sm' | 'data' | 'data-lg'
}
```

Emits `data-figure`, so it is mono, tabular and bidi-isolated. **Every price, count,
percentage, date and barcode in the chrome goes through this.** Having one component makes
the rule mechanical instead of remembered.

### MachineOutput

| | |
| --- | --- |
| File | `components/ui/machine-output.tsx` |
| Status | `spec` |
| Governs | SKILL.md → AI output must be visibly marked |

```tsx
type MachineOutputProps = {
  label: string                     // "Generated cover", "Suggested grouping"
  children: React.ReactNode
}
```

Machine fill, 2px inline-start rule, label above. **Never a button. Never wrapping
something the owner typed.** This is a functional requirement, not decoration.

### EmptyState

| | |
| --- | --- |
| File | `components/shared/empty-state.tsx` |
| Status | `built` — apps/web only |
| Governs | SKILL.md → States → Empty, zero-results and error are three different screens |

```tsx
type EmptyStateProps = {
  kind: 'empty' | 'zero-results' | 'error'
  title: string                     // Host Grotesk, names the space
  body: string
  action: { label: string; onClick: () => void }   // one verb CTA
  illustration?: string             // ONLY valid when kind === 'empty'
  retryPreservesInput?: boolean     // kind === 'error'
}
```

`kind` is required and has no default. Collapsing empty and zero-results into one
component is the most common mistake in this area — the type refuses to let it happen.
Illustration on `zero-results` or `error` is a defect; see `illustration-selection.md`.

The illustration rule is enforced by the type, not by review: `illustration` is
reachable only on the `empty` member of a discriminated union, so the compiler
refuses it on the other two. Same idiom as Button's `iconOnly`/`aria-label`.

**Deviation, stated rather than slipped in:** `action` also accepts `disabled`
and `disabledReason`. E1-05 needed the offer books empty state before E6's
editor existed, and both alternatives were worse — a CTA that navigates to a
404, or an empty state with no action at all. The design system already requires
a disabled control to show its reason on screen; this makes that the only way to
express one. `disabledReason` is what renders it.

Nothing renders `illustration` yet: all twelve manifest slots are `todo` and a
placeholder box is barred. The prop exists so callers are written correctly now.

### Skeleton

| | |
| --- | --- |
| File | `components/ui/skeleton.tsx` |
| Status | `built` — apps/web only, E2 |
| Governs | SKILL.md → States → Loading |

```tsx
type SkeletonProps = {
  shape: 'text' | 'card' | 'row' | 'chip'
  count?: number                    // match the count you typically return
}
```

Skeletons mirror the shape of incoming content. Slow shimmer, never pulse or bounce.

### JobStatus

| | |
| --- | --- |
| File | `components/shared/job-status.tsx` |
| Status | `spec` |
| Governs | SKILL.md → States → Long jobs |

```tsx
type JobStatusProps = {
  jobs: Array<{ id: string; label: string; status: JobStatus; fileUrl?: string }>
}
```

Persistent status area for PDF exports and AI generation. **Never a modal spinner over the
editor.** The owner keeps working; the finished file stays reachable from the offer books
list if they navigated away.

### SaveIndicator

| | |
| --- | --- |
| File | `components/editor/save-indicator.tsx` |
| Status | `spec` |
| Governs | SKILL.md → States → Autosave |

```tsx
type SaveIndicatorProps = {
  state: 'saved' | 'saving' | 'unsaved'
  savedAt?: Date
}
```

Quiet and persistent. Never a toast per save. There is no Save button.

### PriceMark

| | |
| --- | --- |
| File | `components/editor/price-mark.tsx` |
| Status | `spec` |
| Governs | `docs/E6-offer-book-editor.md` §3 |

```tsx
type PriceMarkProps = {
  mark: PriceMark                   // from @souqstudio/types
  /** Artboard scale. The mark never re-derives its own sizing from the DOM. */
  scale?: number
}
```

**Artboard content, not chrome.** It is the one component that legitimately uses
`--sq-tpl-*` tokens, because it renders inside the offer book rather than around it. The
colour comes from the offer's `PromoTier.tokenRef`; the component never takes a colour prop
and never a hex.

The single element that decides whether output reads as a real offer book. Everything is
derived — from the offer and the template — and **exactly one authoring control exists
anywhere in the product: the tier.** If a screen offers a font size or a badge-text field
for a price, that screen is wrong.

Rules the component owns, not its callers:

- Minor digits raise to the major's cap height. Never baseline-aligned.
- The tier label is an attached tab. Tab and mark never separate, at any scale.
- KWD, OMR and BHD are three-decimal and take a distinct minor treatment.
  `THREE_DECIMAL_CURRENCIES` is exported from `@souqstudio/types`.
- **Always LTR with Western numerals, including in AR editions.** The rest of the card
  mirrors; this does not.
- Never shrinks below the template floor. A too-small price mark defeats the artefact.

### OfferCard

| | |
| --- | --- |
| File | `components/editor/offer-card.tsx` |
| Status | `spec` |
| Governs | `docs/E6-offer-book-editor.md` §4, §5, §7 |

```tsx
type OfferCardProps = {
  offer: OfferForRender             // offer + items + chips, resolved for one shop
  variant: CardVariant
  density: DensityProfile['id']
  language: 'en' | 'ar'
  flags?: QualityFlag[]
  selected?: boolean
}
```

One card, N products, one price. Item 0 supplies the brand lockup and the primary image;
later items render name and spec prefixed by the localised connector.

**Design it at `DENSE` and bilingual first** — the worst case. Built the other way round it
works at showcase density and collapses the first time a chain loads a full week.

Layer order is fixed, bottom to top: group surface → card surface → image cutout → text
block → price mark → chips. Chips may overhang the card by up to half their own width, so
the card **renders unclipped**; the engine reserves that bleed in the slot gap.

The fit ladder is the card's, not the engine's: tighten leading, drop one type step,
truncate spec, then escalate to a `QualityFlag`. Name and price never shrink below the
template floor and spec is the only thing that truncates.

Cutout images never flip in RTL. Mirrored packaging text is an instant tell.

---

## Adding a component

1. **Is it here?** Use it as specified.
2. **Is it a variant of one here?** Raise it. Do not add a `variant` value.
3. **Genuinely new?** Raise it, get it into `SKILL.md` → Components, add a row here, then
   build.

A component added without going through this file is one the next session builds
differently. That is the whole failure mode.
