---
name: project-structure
description: Where every file goes in the SouqStudio monorepo — the apps and packages layout, which directory a new page, API route, component, store, email template, database model or background job belongs in, naming conventions, import path rules, and which kinds of code are forbidden in which app. Use this skill before creating any new file, directory or package, and whenever unsure which app or package a piece of code belongs in.
---

# SouqStudio project structure

Answers one question: where does this file go, and what is it called?

For *how* things are built, see the `souqstudio-technical` skill. For how they look, see
`souqstudio-design`.

---

## Layout

```
souqstudio/
├── CLAUDE.md                          # Global conventions — always loaded
├── README.md
├── turbo.json                         # Turborepo pipeline
├── pnpm-workspace.yaml
├── package.json                       # Root scripts only, no app dependencies
│
├── .claude/skills/
│   ├── souqstudio-design/             # UI/UX system
│   ├── souqstudio-technical/          # Architecture
│   └── project-structure/             # This skill
│
├── apps/
│   ├── web/       CLAUDE.md           # Next.js — shop owner app + all API routes
│   ├── admin/     CLAUDE.md           # Next.js — internal team panel
│   └── worker/    CLAUDE.md           # Node.js — BullMQ workers
│
├── packages/
│   ├── db/        CLAUDE.md           # Prisma schema, client, queue producers
│   ├── email/     CLAUDE.md           # React Email templates
│   ├── types/                         # Shared TypeScript types
│   └── config/                        # Shared tsconfig bases
│
└── docs/
    ├── project.md                     # Product overview
    └── E1-*.md … E13-*.md             # Epic specifications
```

Each app and the two significant packages carry their own `CLAUDE.md`. Load the one for
the app you are working in. Do not edit across app boundaries in a single task unless
asked to.

---

## Where does a new file go?

### Pages

| What | Where |
| --- | --- |
| Shop-owner page | `apps/web/app/(dashboard)/[feature]/page.tsx` |
| Auth / onboarding page | `apps/web/app/(auth)/[page]/page.tsx` |
| Offer book editor | `apps/web/app/(dashboard)/editor/[id]/page.tsx` |
| Card designer | `apps/web/app/(dashboard)/card-designer/[templateId]/page.tsx` |
| Public offer book viewer | `apps/web/app/o/[code]/page.tsx` |
| Admin page | `apps/admin/app/[feature]/page.tsx` |

### Code

| What | Where | Notes |
| --- | --- | --- |
| API route | `apps/web/app/api/v1/[resource]/route.ts` | File is always `route.ts`. Export `GET`, `POST`, `PATCH`, `DELETE`. |
| Feature component | `apps/web/components/[feature]/Name.tsx` | PascalCase file, named export, one component per file |
| Design system primitive | `apps/web/components/ui/name.tsx` | **kebab-case**, matching shadcn. The file path and prop signature are owned by `souqstudio-design` → `references/component-inventory.md` — build to the signature there, never invent one. |
| Untouched shadcn output | `apps/web/components/ui/` | If the CLI's component is used as-is, do not hand-edit it. Fix it through the shadcn bridge in `souqstudio-tokens.css`. |
| Zustand store | `apps/web/stores/[feature]-store.ts` | Export as `use[Feature]Store` |
| Utility / client | `apps/web/lib/[thing].ts` | |
| Email template | `packages/email/src/templates/[category]/Name.tsx` | Must use `Base.tsx`. Typed props. |
| Email block or primitive | `packages/email/src/components/{blocks,primitives}/` | |
| Database model | `packages/db/prisma/schema.prisma` | One file. Never split. Then `pnpm db:generate`. |
| Reference-data seed | `packages/db/prisma/seed.ts` | Small, idempotent, needed by every environment. Hand-written ids so a re-run upserts. |
| Bulk data script | `packages/db/scripts/[name].ts` | A one-off run against a dataset held elsewhere. Add a `package.json` script for it. Kept out of `seed.ts` so `pnpm db:seed` stays something you can run without thinking. |
| Pure logic a script and an app share | `packages/db/src/[name].ts` | Tested with `pnpm --filter @souqstudio/db test`. No Prisma import, or it stops being testable without a database. |
| Shared type | `packages/types/src/[feature].ts` | Re-export from `src/index.ts` |
| Pure logic the browser *and* a script need | `packages/types/src/[feature].ts` | `types` is the only package with no dependencies, so it is the only one a client bundle and a CLI can both import. `packages/db` would pull Prisma and BullMQ into the browser. `barcode.ts` is the case that forced this. |
| Worker handler | `apps/worker/src/jobs/[queue].job.ts` | Register in `src/workers/[queue].worker.ts` |
| Queue producer | `packages/db/src/queue-client.ts` | Payload type + typed enqueue function |

### Adding a background job — four places, in order

1. Payload type in `packages/db/src/queue-client.ts`
2. Typed enqueue function in the same file
3. Handler in `apps/worker/src/jobs/[queue].job.ts`
4. Register in `apps/worker/src/workers/[queue].worker.ts`

Skipping step 1 means the web app and worker disagree about the payload shape, and
nothing catches it until runtime.

---

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| React component | PascalCase | `OfferBookCard.tsx` |
| Hook | camelCase, `use` prefix | `useEditorStore.ts` |
| Non-component file | kebab-case | `queue-client.ts`, `brand-store.ts` |
| API route file | always `route.ts` | `app/api/v1/shops/route.ts` |
| Prisma model | PascalCase | `OfferBook`, `CatalogProduct` |
| Prisma field | camelCase | `organizationId`, `createdAt` |
| Database table | snake_case via `@@map` | `offer_books` |
| Queue name | lowercase | `pdf`, `ai`, `email` |
| Job name | dot-separated | `pdf.render`, `ai.character` |
| Environment variable | SCREAMING_SNAKE | `STRIPE_SECRET_KEY` |
| CSS custom property | `--sq-` prefix | `--sq-ui-action-primary-bg` |

**Spelling: American throughout.** `organization`, not `organisation`. The Prisma model
is `Organization` and the field is `organizationId`; prose and route paths match the code
rather than the other way round.

---

## Imports

Across package boundaries, use the workspace name:

```typescript
import { prisma, enqueuePdf } from '@souqstudio/db'
import { WelcomeEmail } from '@souqstudio/email'
import type { OfferBookFormat } from '@souqstudio/types'
```

Never reach across with a relative path:

```typescript
// wrong
import { prisma } from '../../../packages/db/src/client'
```

Within an app, use the `@/` alias:

```typescript
import { EditorCanvas } from '@/components/editor/EditorCanvas'
import { useEditorStore } from '@/stores/editor-store'
import { env } from '@/lib/env'
```

---

## What is forbidden where

| | `apps/web` | `apps/worker` | `apps/admin` |
| --- | --- | --- | --- |
| Playwright | forbidden | required | forbidden |
| BullMQ `Worker` instances | forbidden | required | forbidden |
| Fabric.js canvas | required | forbidden | forbidden |
| HTTP route handlers | required | forbidden* | required |
| Direct Resend send (no queue) | forbidden | required | forbidden |
| AI provider keys | forbidden | required | forbidden |
| `--sq-tpl-*` tokens in chrome | forbidden | n/a | forbidden |
| Shop-owner session auth | required | forbidden | forbidden |
| Admin auth (`admin_users`) | forbidden | forbidden | required |

\* the worker exposes a health check on port 3001 and nothing else.

**Never deploy `apps/worker` to Vercel.** It needs a persistent process for the browser
pool and long-running AI jobs.

---

## Turborepo

`apps/*` depend on `packages/db`, which must build first because the Prisma client is
generated. The pipeline in `turbo.json` handles ordering via `dependsOn: ["^build"]`.

`db:generate`, `db:push` and `db:migrate` are marked `cache: false` — they touch external
state and caching them produces confusing results.

---

## Starting a task

1. Read the relevant epic in `docs/` (E1–E13)
2. Read the `CLAUDE.md` for the app you are working in
3. Read `souqstudio-design` before any UI work
4. Read `souqstudio-technical` before any server-side work
5. Confirm placement using this skill
6. `pnpm typecheck` after each meaningful change — fix before continuing
7. `pnpm lint` before committing
