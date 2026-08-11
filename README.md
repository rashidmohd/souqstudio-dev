# SouqStudio

AI-powered retail offer book creator for the UAE and GCC market.

## Quick start

```bash
pnpm install

cp apps/web/.env.example    apps/web/.env.local
cp apps/admin/.env.example  apps/admin/.env.local
cp apps/worker/.env.example apps/worker/.env
# fill in the values

pnpm db:generate
pnpm db:push
pnpm dev
```

## How this repo is organised

**`CLAUDE.md`** at the root carries the absolute rules and points at everything else.
It is short on purpose — it loads on every turn.

**`.claude/skills/`** carries the depth. Three skills, loaded on demand:

| Skill | Covers |
|---|---|
| `souqstudio-design` | UI/UX. Colour, type, layout, components, states, motion, icons, illustrations, RTL, both canvases. Plus tokens, illustration catalog, and the rebrand scripts. |
| `souqstudio-technical` | Architecture. Stack decisions, database and RLS, API conventions, background jobs, export pipeline, environment. |
| `project-structure` | Where files go, naming, imports, what is forbidden in which app. |

**`docs/`** carries the product. `project.md` plus thirteen epic specifications.

**Per-app `CLAUDE.md`** in `apps/web`, `apps/admin`, `apps/worker`, `packages/db`,
`packages/email` — load the one for the app you are in.

## Apps

| App | Port | Deploy to | Description |
|---|---|---|---|
| `apps/web` | 3000 | Vercel | Shop owner product + all API routes |
| `apps/admin` | 3002 | Vercel | Internal SouqStudio team panel |
| `apps/worker` | 3001 (health) | Railway | BullMQ workers — **never Vercel** |

## Packages

| Package | Description |
|---|---|
| `packages/db` | Prisma schema, client singleton, typed queue producers |
| `packages/email` | React Email templates — Base layout, Header/Footer, per-type templates |
| `packages/types` | Shared TypeScript types |
| `packages/config` | Shared tsconfig bases |

## Before writing any code

1. Read `CLAUDE.md`
2. Read the `CLAUDE.md` in the app you are working in
3. Read the relevant epic in `docs/`
4. Load `souqstudio-design` for UI work, `souqstudio-technical` for server work
5. Load `project-structure` before creating any file

## Known gaps

Tracked deliberately. See the Known gaps section of `CLAUDE.md`, and the per-skill
gap lists at the end of each `SKILL.md`.
