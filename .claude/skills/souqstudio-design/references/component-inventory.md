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

### OfferPreview

| | |
| --- | --- |
| File | `components/brand/OfferPreview.tsx` |
| Status | `built` — apps/web only |
| Governs | E4-03 / E4-04 grid and template choice previews |

```tsx
type OfferPreviewProps = {
  grid: GridConfig
  template: TemplateConfig
  colors: { primary: string; secondary: string; accent: string }
  shopName?: string
  className?: string
}
```

A miniature offer book page in the shop's own colours, as **inline SVG**. E4's
notes call for a mini Fabric canvas; that still holds for E7's admin template
builder, and does not here — see the deviation recorded in `docs/E4-brand-setup.md`.

**Paints in `--sq-tpl-*`, never `--sq-ui-*`.** It is a picture of what the shop
will print, so it belongs to the content namespace. This is one of the few
components legitimately excluded from the chrome token rules, alongside the
editor and card designer.

Placeholder blocks are ink at low opacity rather than named greys, so they read
correctly on a light, dark or brand-coloured ground. The header label is centre
anchored on purpose: SVG resolves `text-anchor: start` against inherited
direction, which would move it under an Arabic ancestor.

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
| Status | `spec` |
| Governs | SKILL.md → Components → Tinted content cards |

```tsx
type TintedCardProps = {
  tint: 'sand' | 'lime' | 'sky'
} & React.HTMLAttributes<HTMLDivElement>
```

For prompts, not content. Never a primary button inside. Max two per screen.

### IconChip

| | |
| --- | --- |
| File | `components/ui/icon-chip.tsx` |
| Status | `spec` |
| Governs | SKILL.md → Components → Icon chips |

```tsx
type IconChipProps = {
  icon: LucideIcon                  // the component, not a string name
  tint?: 'sand' | 'lime' | 'sky'
}
```

**Decorative only — never the tap target.** No `onClick`. If it needs to be pressable it
is a `Button` with `iconOnly`, which is circular. The absent `onClick` is the enforcement.

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
dropdown or combobox at all, and E2 needed one in four places. Two questions it would
have forced, still open: whether the shop switcher uses this or is its own component
with its own affordance (a native select in the rail reads as a form field in a
navigation column), and whether it needs `Input`'s `size: 'default' | 'lg'` — without it
a select beside a `size="lg"` input will not line up.

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
  collapsed?: boolean               // icon only, below 1024px
}
```

The only place blue appears as a background in the shell. The label becomes the
`aria-label` — it does not disappear.

**`collapsed` forces icon-only at every width; it is not how the responsive
collapse works.** A breakpoint cannot be a boolean without measuring the viewport
in JavaScript, which flashes the wrong state on first paint, so the rail collapses
below 1024px through CSS and the label is hidden with `hidden lg:inline`.
`aria-label` and `title` are set at every width, collapsed or not.

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

---

## Adding a component

1. **Is it here?** Use it as specified.
2. **Is it a variant of one here?** Raise it. Do not add a `variant` value.
3. **Genuinely new?** Raise it, get it into `SKILL.md` → Components, add a row here, then
   build.

A component added without going through this file is one the next session builds
differently. That is the whole failure mode.
