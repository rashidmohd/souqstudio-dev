# Consistency checklist

The rest of this skill describes the system. This file is how you verify you followed
it. Run it before calling any UI work done — including a one-line change.

Documentation alone does not produce consistency. Two sessions reading the same
paragraph will disagree about what it meant. What produces consistency is a fixed set
of checks that either pass or fail.

---

## Why this exists

The design skill contradicted its own token file in four places at one point — inputs
described as 6px when the token said 8px, dialogs as 8px when the token said 12px.
Nobody noticed, because nothing checked. That is the failure mode this file and the
lint configs exist to prevent.

**The token file is authoritative.** When prose and `souqstudio-tokens.css` disagree,
the token file is right and the prose is stale. Fix the prose and say so.

---

## Automated — run these, do not eyeball them

```bash
pnpm typecheck     # types
pnpm lint          # design system rules — see below for what it catches
pnpm build         # unresolvable Tailwind classes fail here
```

`pnpm lint` is not a style nag. The rules in `packages/config/eslint.design.cjs` each
map to a stated rule in this skill:

| Caught | Rule it enforces |
| --- | --- |
| `ml-` `pr-` `text-left` `border-l` … | Logical properties only — the app ships in Arabic |
| `#143CD2` in a component | Tokens only, never a raw hex |
| `p-[13px]` | The spacing scale is 4/8/12/16/24/32/48 |
| `rounded-md` `rounded-lg` | shadcn defaults contradict the radius scale |
| `shadow-sm` `shadow` | There is no elevation in this system |
| `text-sand` `border-lime` `text-stone-300` | Fill-only tier used as ink |
| `italic` | Plex Sans Arabic has no true italic |
| `bg-blue` | Blue is never a button or panel fill |
| `--sq-tpl-*` in a chrome component | Template tokens are offer book content only |
| `process.env` | Import the validated env module |
| `@prisma/client` | Import `prisma` from `@souqstudio/db` |

Tailwind's default palette, spacing and radius scales are **replaced, not extended**, in
`packages/config/tailwind.config.ts`. `bg-blue-500` and `p-[13px]` do not resolve to
anything — a violation fails the build rather than silently shipping an off-system value.

If you find yourself wanting to disable a rule, you are disabling the design system.
Raise it instead.

---

## Manual — the machine cannot check these

Twelve questions. If any answer is no, the work is not done.

### Structure

1. **Does every recurring element on this screen already exist in Components?** If a
   screen seems to need a variant that is not listed, that is a signal to raise it, not
   to add one.
2. **Is there exactly one primary action per screen region?** Two primaries means the
   screen asks two questions and should be split.
3. **Does every hover-revealed affordance have a persistent equivalent?** The editor
   ships on tablet. Long-press drag is unreliable on iPad; tap-then-tap must be a
   first-class path, not a fallback.
4. **Is this the right layout family?** Five exist and they are distinct. Conflating two
   causes trouble later.

### Type and figures

5. **Is every figure wrapped in `[data-figure]`?** Prices, counts, percentages, invoice
   amounts, barcodes, dates. Not only in table cells — every interpolated value.
   Unwrapped numerals visually reorder inside Arabic text.
6. **Does Host Grotesk appear at most twice?** Page title and empty state only. It has
   no Arabic and cannot carry interface text.
7. **Is all UI text sentence case?** Buttons, tabs, table headers, menu items, empty
   states. Title Case only for proper names.

### Bilingual

8. **Have you rendered this screen in Arabic?** Not translated strings in an LTR layout —
   actually `dir="rtl"` with real Arabic strings at real lengths. Arabic labels routinely
   run longer than English and clip.
9. **Do directional icons mirror and non-directional ones not?** Back, forward, next,
   undo, redo, trend arrows mirror. Search, close, download, settings do not.
10. **On canvas work: are Fabric coordinates still LTR?** UI direction must never touch
    canvas maths. And the artboard follows the document's language, not the interface's.

### Content and state

11. **Does every state exist?** Empty, loading, error, and the populated one. An empty
    state is an invitation with a verb CTA, never "Nothing here yet."
12. **Is machine-generated content visibly marked?** Generated characters, covers,
    suggested groupings and auto-written copy get the `MachineOutput` treatment. The
    owner must always be able to tell what a model authored. This is a functional
    requirement, not decoration.

---

## Before adding a component

Read `component-inventory.md` first — it carries the file path and prop signature for
every component, which `SKILL.md` deliberately does not.

Then ask in this order, stopping at the first yes:

1. Is it in the inventory? → import it, or build it to the signature listed
2. Is it a variant of one in the inventory? → **raise it, do not add a variant value**
3. Genuinely new? → raise it, get it into `SKILL.md` → Components and the inventory, then build

Update the inventory status after building. A component added without going through it is
one the next session builds differently — that is the entire failure mode.

## Before adding a route

Read `layout-map.md`. Two of the five layout families deliberately escape the app shell,
and in App Router nesting is the default — a route in the wrong place silently inherits
the left rail. Nothing errors; the artboard just gets compressed.

---

## Before adding a token

Do not. Almost every apparent need for a new token is one of:

- A value that already exists under a different name — check the whole file first
- An arbitrary value that should snap to an existing scale step
- A design decision that has not been made yet, being made silently in a component

If it survives all three, raise it. Tokens are the vocabulary; growing it casually is how
a system becomes a swatch book.

---

## When prose and tokens disagree

1. The token file wins.
2. Fix the prose in the same change.
3. Say what you changed, so nobody assumes the token moved.

Never "fix" a token to match stale prose. The token is what ships.
