# E4 — what is still pending

Working note against `docs/E4-brand-setup.md`. Last updated 13 August 2026, after
E4-05 shipped.

**Status: E4-01 through E4-05 are built and reachable.** `pnpm lint`, `pnpm typecheck`,
`pnpm build` and 190 tests pass. What follows is what is *not* done, why, and where to
pick it up.

---

## 1. The open question: one organization, several brands

Raised by the product owner while reviewing E4-05, and the largest outstanding item in
this epic. **Do not build more on top of the current model before settling it.**

### The shape today

```
Organization ── brandKit (the default every shop inherits)
     └── Shop ── brandKit + brandOverride (inherit | logo | colors | full)
```

`organizations.brandKit` was added by E2-05 so that a second branch inherits the brand
rather than starting blank. It assumes **one brand per organization.**

### Why that is wrong

An organization is a *billing* entity — the root `CLAUDE.md` is explicit that billing
attaches to the org and operations to the shop. In the GCC a retail group commonly holds
**several trade licences, each with its own trade name and brand**: one company running a
hypermarket, a pharmacy and a lifestyle store is three brands, not three branches of one.

The current model cannot express that. A group with three brands across fifteen branches
has to set `full` override on fourteen shops and configure each by hand, and there is then
no way to restyle one brand's five branches in a single action — which is precisely what
the organization kit was invented to do, just scoped to the wrong thing.

It also produces the behaviour `/brand` has to warn about in a caution banner: editing an
inheriting shop's brand silently edits the *organization's*. That banner is a symptom of
the model, not a UX problem to write better copy for.

### Recommended shape

Put a brand between the two:

```
Organization ── logoUrl (the company mark: invoices, transactional email)
     └── Brand ── name, logoUrl, brandKit          ← one per trade licence
           └── Shop ── brandId, plus brandOverride for a one-off branch
```

- `Brand { id, organizationId, name, logoUrl, brandKit Json }`.
- `Shop.brandId` FK. `shops.brandKit` and `brandOverride` stay, and mean what they
  already mean — one branch deviating from its brand.
- **`organizations.brandKit` goes; `organizations.logoUrl` stays.** This is the useful
  half of "an organization doesn't need branding": it does not need a *retail* brand, but
  it does need a company mark for invoices and email, and those are different objects that
  the current schema conflates.

What this buys:

- Change a brand once, every branch on that licence follows — correctly scoped.
- Editing a brand edits that brand. The caution banner goes away because the surprise does.
- E4-05's reset becomes "reset to the brand's defaults", which is what an owner would
  have called it anyway.
- It answers `E2-pending.md` §6 Q5 (no override level for grid, template or fonts) without
  a fifth level: most shops point at a brand and need no override at all.
- Brand count is a natural plan limit, alongside the shop add-on billing E3 already has.

### Cost, and why now is the cheapest it will be

- Migration: create `brands`, backfill one row per organization from
  `organizations.brandKit`, point every shop at it, promote each `full`-override shop to
  its own brand.
- `lib/brand-inheritance.ts` keeps its facet model unchanged — `BrandLevel` becomes
  `'brand' | 'shop'` instead of `'org' | 'shop'`. The rule and its tests survive.
- `lib/brand-kit.ts`, `GET/PATCH /api/v1/brand`, `/brand` and `BrandOverrideField` follow
  the level rename. **E4-05's screen, fields and reset survive largely intact.**
- No RLS policy has been written yet, so `brands` can be born with one instead of needing
  one retrofitted.

E5–E13 are unstarted and the editor does not exist. Every epic from here adds a reader of
the brand kit, so this gets more expensive monotonically. **Decide before E6.**

What not to do: add a fifth `brandOverride` level, or more facets. That patches the
symptom and makes the eventual migration harder.

---

## 2. Brand setup is not actually enforced

E1-04 says guided setup is "triggered automatically on first login. Cannot be skipped —
required to unlock the editor." Neither half is true today:

- Nothing gates completeness. `middleware.ts` and `(dashboard)/layout.tsx` check the
  session, not the kit. The only push into the wizard is
  `components/auth/VerifyEmailForm.tsx:32`, once, straight after email verification.
- The editor that was meant to enforce it is unbuilt (`EDITOR_BUILT = false`).

So an owner who closed the tab mid-wizard landed on home with no route back. Two of the
three organizations in the development database are in exactly that state.

**E4-05 half-closes this:** `/brand` redirects an incomplete kit to `/onboarding`, so the
rail item is now a way back in. A brand is created in the wizard and managed on `/brand`,
one creation path each way, and `/onboarding` already redirects home once the kit is
complete so the two cannot bounce off each other.

**Still open:** whether an incomplete owner should be *forced* into the wizard from
anywhere in the dashboard. That is a gate in the shared layout and was deliberately not
added under E4-05 — it changes every route, including ones later epics add. If it is
wanted, it belongs in `(dashboard)/layout.tsx` beside `requireCompliantSession()`, and the
warning in `layout-map.md` family 1 applies: the redirect target must live outside the
group or the gate guards its own destination.

---

## 3. Fonts are typed and unimplemented

`BrandKit` carries `fontDisplay`, `fontPrice` and `fontBody`, and
`lib/brand-inheritance.ts` puts them in the `layout` facet, so inheritance already handles
them. Nothing reads or writes them, and there is no picker.

Deliberately out of scope for E4-05, and there is **no placeholder section** on `/brand` —
an empty section invites someone to fill it badly.

A real picker needs, in order: the curated OFL families mirrored into R2, subset to the
two or three weights each role uses; the picker filtered by the shop's languages, never
the full Google Fonts library; and `document.fonts.load()` before any Fabric text object
is instantiated, or every bounding box is wrong. See
`souqstudio-design → references/brand-kit-fonts.md`.

E6 will notice first: the editor has no shop-chosen typeface to load.

---

## 4. Deliberate compromises

| Thing | What shipped | Why |
| --- | --- | --- |
| Grid and template | One "Layout" section, one save | They are one facet and one inheritance level. Two sections would imply they can be inherited separately, which `LEVELS` says they cannot. |
| Reset confirmation | A `Dialog` | The design system prefers undo, and `Toast` still has no mounting mechanism (`E2-pending.md` §3). This is also genuinely irreversible, so a dialog is right regardless. |
| Deleted logos | R2 objects left in place | `lib/r2.ts` has no delete, keys are deterministic, and a later upload overwrites at the same path. Nulling `logoUrl` is what stops the old mark being used. Object lifecycle is a separate question. |
| Link from shop settings to `/brand` | Not added | `/brand` is scoped to the *active* shop; `/settings/shops/[shopId]` can be showing any shop. The link would edit a different brand. The rail's shop switcher (`E2-pending.md` §2) is what makes it safe. |
| Character library | Absent from the kit card | E8 is unbuilt, and a placeholder box where artwork belongs is barred. |

---

## 5. Things found wrong along the way

- **`docs/E4-brand-setup.md` claimed there was no shop-level override.** False — E2-05
  built `shops.brandOverride`, the resolution rule, and `BrandOverrideField`. Corrected in
  place, since that paragraph is a status line.
- **A reset that clears the kit must write `brandOverride` in the same statement.**
  `resolveBrandKit` is facet-level with no per-field fallback, so a cleared kit on a shop
  still set to `full` resolves to *no brand at all* — `isBrandSetupComplete` goes false and
  the editor gate closes. `resetShopBrandToOrg` does both writes and
  `brand-inheritance.test.ts` asserts the stranded case directly.
- **A reset must keep the `progress` facet.** Dropping `onboardingStep` would tell the
  owner their setup was unfinished and send them back through the wizard for a brand they
  had just chosen to inherit. Verified live as well as in tests.
- **`font-display text-heading` is used for section headings in 21 places across 10
  files.** The type scale says `heading` is Plex Sans Arabic SemiBold, and
  `consistency-checklist.md` item 6 says Host Grotesk appears at most twice per screen —
  page title and empty state only. Every settings screen already breaks this, including
  `/settings/shops/[shopId]`. E4-05 matched the surrounding code rather than diverging on
  one screen. **Fixing it is a 21-site sweep and needs a decision, not a unilateral edit.**

---

## 6. Not verified

E4-05 was exercised end to end against the development database — route gating, saves at
both levels, the full-override path, reset, the 409 on an already-inheriting shop, and the
progress facet surviving. Not covered:

- **Arabic and RTL at real string lengths.** `consistency-checklist.md` item 8, which
  `E2-pending.md` §1 already flags as a repeat miss.
- **Browser interaction** — the colour picker, the confirm dialog and the save buttons were
  verified as server-rendered markup and API calls, not as clicks.
- **The manager 403 gate**, which needs a second user through the invite flow.
- **Logo upload**, which needs R2 credentials.
- **API route tests.** No route in the repo has one. `POST /api/v1/brand/reset` is the
  highest-value candidate — owner gate, the `nothing_to_reset` 409, and the
  `brandOverride` write.
