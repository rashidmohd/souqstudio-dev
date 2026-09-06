# SouqStudio

AI-powered retail offer book creator for the UAE and GCC market.

Shop owners search a pre-built product catalog, set their prices, and the platform
generates a professional branded offer book ready to share on WhatsApp, Instagram, or
download as a print-ready PDF. Target customers are grocery, pharmacy and electronics
chains. WhatsApp is the primary distribution channel.

Fully self-served — no manual provisioning by the SouqStudio team, ever. Every flow must
work for a shop owner in Dubai at 11pm on a Friday with nobody to ask.

Product spec: `docs/project.md` · Epics: `docs/E1-*.md` through `docs/E13-*.md`

---

## Skills — read the relevant one before starting

Detail lives in skills, not in this file. Load them.

| Skill | Read before |
| --- | --- |
| `souqstudio-design` | **Any UI work.** Colour, type, spacing, layout, components, states, forms, motion, icons, illustrations, RTL, the editor and card designer canvases. |
| `souqstudio-technical` | **Any server-side work.** API routes, database, migrations, jobs, export pipeline, Stripe, auth, deployment. |
| `project-structure` | **Creating any new file.** Where it goes, what it is called, which app it belongs in. |

Picking a colour, a radius, a font size, a file location or a queue name without reading
the relevant skill will produce output that violates the system.

**The design system is enforced mechanically.** Tailwind's default palette, spacing and
radius scales are replaced rather than extended, so `bg-blue-500` and `p-[13px]` do not
resolve. ESLint errors on physical properties, raw hex, shadows, fill-only colours used
as text, italics, blue fills and `--sq-tpl-*` in chrome.

Before building a component, read
`.claude/skills/souqstudio-design/references/component-inventory.md` — it carries the file
path and prop signature for each one, so two sessions cannot produce two APIs for the same
component. Before adding a route, read `references/layout-map.md`.

Run `pnpm lint` and work through `references/consistency-checklist.md` before calling any
UI work done. It carries the thirteen checks a linter cannot make — Arabic rendering at
real string lengths, one primary action per region, every state present, machine output
marked.

---

## Absolute rules

These apply everywhere and are not negotiable per-task.

- **TypeScript strict.** No `any`. No type assertion without a comment explaining why.
- **No raw hex values in component code.** Tokens only, from
  `.claude/skills/souqstudio-design/assets/souqstudio-tokens.css`.
- **`--sq-ui-*` is app chrome. `--sq-tpl-*` is offer book content.** They never cross. If
  you reach for `--sq-tpl-offer-red` in a component, you want `--sq-critical-fg`.
- **No shadows anywhere in chrome.** Separation is hairline borders and surface tone.
  shadcn ships shadows on cards, popovers, dropdowns and dialogs — strip them.
- **Every button is a full pill.** Cards and dialogs 12px, inputs and chips 8px, tinted
  blocks 16px, artboard elements 3px.
- **Blue is the button colour.** `--sq-ui-action-primary-bg` is `--sq-blue`, alongside
  selection, focus, links and active nav. Always `bg-action-primary`, never `bg-blue` —
  the raw utility skips the dark-mode value. One primary per screen region.
- **Logical CSS properties only.** `ms-` `me-` `ps-` `pe-` `border-inline-start`. Never
  `ml-` `mr-` `pl-` `pr-` `left-` `right-`. The app ships in Arabic.
- **Every figure gets `[data-figure]`** — prices, counts, percentages, dates. Mono,
  tabular, bidi-isolated so it cannot reorder inside Arabic text.
- **Sentence case everywhere.** Buttons, labels, table headers, empty states. Title Case
  only for proper names.
- **Never read `process.env` directly.** Import the validated `env` module.
- **Never import `@prisma/client` directly.** Import `prisma` from `@souqstudio/db`.
- **Never trust a client-sent `organizationId`.** Read it from the session.
- **AI output must be visibly marked.** Generated characters, covers and copy get the
  `MachineOutput` treatment. The owner must always be able to tell what a machine wrote.
- **Spelling is American.** `organization`, matching the Prisma model and field name.
- **Conventional Commits.** `feat:` `fix:` `chore:` `docs:` `refactor:` `test:`.

---

## The three deployable units

```
apps/web      Next.js 14   Railway    Shop owner UI + every API route
apps/admin    Next.js 14   Railway    Internal team panel
apps/worker   Node.js      Railway    BullMQ workers — NEVER Vercel
```

The web app never does long-running work. It queues a job and returns a job ID. The
worker does the work. The client polls.

All three run on Railway, alongside Railway-managed Postgres and Redis. The original plan
put the two Next.js apps on Vercel with Neon and Upstash behind them; consolidating on one
platform was chosen over that. Nothing in the code depends on either choice. Procedure and
per-service configuration: `docs/deployment-railway.md` and `railway/*.json`.

Each app has its own `CLAUDE.md` — load it when working in that app.

---

## Decisions that must not be silently reversed

One line each. Full reasoning in the `souqstudio-technical` skill.

- **Fabric.js, not Konva** — only Fabric exports SVG, which the print pipeline requires.
- **SVG → Playwright for PDF** — vector output, one source of truth, no template drift.
- **Playwright, not Puppeteer** — ~3ms warm render, smaller files.
- **No separate backend framework** — Next.js routes plus a worker process is enough.
- **Resend, not SES** — instant production access. Revisit above 500K emails/month.
- **RLS at the database level** — application filtering alone is not a tenancy control.
- **Zustand, not Redux** — Context re-renders too broadly for canvas update frequency.
- **Organization → Shop → User** — billing at org, operations at shop. Load-bearing.
- **Our own session layer; next-auth for Google OAuth only** — next-auth cannot
  issue a database session for a password login, and revocability is why database
  sessions were chosen. Session tokens are hashed in the table, never stored raw.

---

## Commands

```bash
pnpm dev           # All apps
pnpm build
pnpm lint
pnpm typecheck
pnpm test

pnpm db:generate
pnpm db:push       # DEVELOPMENT ONLY
pnpm db:migrate    # CI and production
pnpm db:seed       # plans, blocks, catalog categories, promo-tier backfill — idempotent
pnpm db:studio

pnpm --filter @souqstudio/db catalog:import-off -- --url --dry-run --limit 500
                   # E5 — seed the universal catalog from Open Food Facts
```

Run `pnpm typecheck` after each meaningful change. Fix before continuing.

---

## Known gaps

Tracked, not forgotten. Raise rather than inventing an answer.

- **Illustrations** — four are `ready` and in use; the rest wait on their epic. The
  artwork on `assets.souqstudio.com` is already recoloured, and
  `assets/illustration-catalog.json` carries `souqUse` assignments on 35 of its 385
  entries, so selection is largely done — read it before choosing anything new. One slot
  was struck as unfillable: `empty-catalog-search` is a *zero-results* state, and the
  system permits an illustration only on `empty`. See
  `.claude/skills/souqstudio-design/references/illustration-manifest.md`.
- **Worker handlers** — `email` and `bg` are implemented, `bg` now for both logos and
  catalog cutouts. `pdf`, `ai` and `enrich` are still stubs that throw. **`enrich` is the
  one that now bites**: the Open Food Facts export has no Arabic column, so every seeded
  universal product has a null `nameAr`, and E5 §2 makes that a publish-time blocker for
  Arabic editions. Until `enrich` lands the shared catalog is English-only.
- **Brand kit fonts are pickable but not self-hosted.** `/brand` now has a picker:
  `lib/brand-fonts.ts` carries the curated catalog — ten OFL families, every one
  covering Arabic and Latin, filtered per slot — and `TypographyFields` writes
  `fontHeadline`, `fontDisplay`, `fontPrice` and `fontBody` through
  `PATCH /api/v1/brand`, which validates against the catalog. `resolveScale()`
  builds the full h1–h6 scale from those four slots; any level may be re-bound to
  any slot, so a hero band is a different voice rather than a bigger product name. **Chrome loads those faces from Google's CDN for
  the specimen, and the render path must not.** Playwright cannot depend on an
  external network on a critical path, PDF embedding needs the real font file,
  and subsetting is what stops a bilingual book shipping every Arabic glyph
  twice. Mirroring the files into R2 is still required before export ships —
  `souqstudio-design → references/brand-kit-fonts.md`. E6 also has to
  `await document.fonts.load()` for every family and weight *before* creating any
  Fabric text object, or every bounding box is measured against the fallback.
- **The layout engine runs, but nothing in the apps calls it.** `packages/engine` carries
  track resolution, span geometry with RTL mirroring, arrangement selection, grid
  validation, the flow engine and the seeded block library, all tested. The tables exist
  (`blocks`, `block_versions`, `page_grids`, `book_pins`, migrated 5 September) and
  `pnpm db:seed` fills `blocks` with four published blocks — offer card, hero band, footer,
  message. `pnpm --filter @souqstudio/engine harness` renders sample pages to SVG from
  **those same rows**, which is how the model is checked and is not the real renderer.
  `/brand` draws those blocks for real — `components/blocks/BlockPreview.tsx` renders
  them in the shop's palette and typefaces through the engine, computing no geometry
  itself. What is still missing is the **editor**: Fabric for the interactive canvas,
  and the offers to put on it. `catalog_products` and `offer_books` are both empty,
  so E5 is the real blocker downstream of here. See `docs/composition-model.md` §12. The engine lives in `packages/` because web and worker
  must share one implementation — two would drift, and drift means the PDF does not match
  the screen.
- **Email logo not yet on R2.** `apps/web/public/brand/email/logo-dark.png` must be
  uploaded to `https://assets.souqstudio.com/email/logo-dark.png` before any email is
  sent, or every message renders with a broken image at the top.
- **Wordmark casing is unreconciled.** The mark reads *Souqstudio*; every string in this
  repo says *SouqStudio*. Decide before launch copy or any trademark filing. The mark
  also carries a ® — confirm registration territories.
- **OG cards are provisional** — logo centred on the brand ground. Fine as a default,
  not a designed card.
- **Dark mode** — surfaces and text only. Status, machine fill, selection, charts and the
  fill-only tier are unverified at dark contrast. The light-mode pass in September found
  three failures nobody had noticed, so assume the dark set has its own.
- **`global-error.tsx` does not exist.** `app/error.tsx` and `app/not-found.tsx` now do,
  but an exception thrown by the root layout itself escapes both — that needs a boundary
  shipping its own `<html>` and `<body>`.
- **Card designer** — a fifth layout family in the design system with no epic covering
  it. See the addendum in `docs/E7-template-grid-management.md`.
- **Rate limiting** — unspecified, including on public tracking endpoints. `POST
  /api/v1/auth/2fa/enroll` runs bcrypt unthrottled behind a valid session.
- **Token encryption key management** — undecided. Blocks E10. Also decides
  whether `users.twoFactorSecret` gets encrypted; it ships plaintext behind the
  version seam in `apps/web/lib/two-factor-secret.ts`, so the switch is one file
  plus a backfill.
- **No RLS policy has been written.** The baseline migration exists (E2 added it,
  E3 added a third), so this line's original claim that the migrations directory
  is empty no longer holds — but the policies `references/database.md` describes
  still do not exist, and tenancy today rests on `apps/web/lib/authz.ts` alone,
  which is application filtering rather than a control. Write the first RLS
  migration before anything is deployed. See `docs/E2-pending.md` §1.
- **Billing has never touched a real Stripe account.** E3 is built end to end —
  subscribe, change plan, cancel, top up credits, webhook — and every path is
  untested against Stripe because this environment has no key. Nothing should be
  deployed on the assumption it works. See `docs/E3-pending.md` §1 for the
  order to exercise it in.
- **A 2FA lockout has no recovery for an owner.** An org owner can reset a
  teammate's two-factor, but an owner who loses both their device and their
  backup codes needs a Super Admin action that E13-01 does not have. Manual
  database edit until then, which contradicts the self-served promise above.
- **No security-alert email.** Enabling, disabling or resetting two-factor
  notifies nobody. E12 specifies no such template.
