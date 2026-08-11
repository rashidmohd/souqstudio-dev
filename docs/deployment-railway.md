# Deploying to Railway

Five services in one Railway project, built from this monorepo:

```
Postgres     Railway plugin      DATABASE_URL
Redis        Railway plugin      REDIS_URL
web          apps/web            public domain — the shop owner app
admin        apps/admin          public domain — internal panel
worker       apps/worker         no public domain — BullMQ consumers
```

This reverses the split documented in the root `CLAUDE.md`, which puts `web` and `admin`
on Vercel and only `worker` on Railway. Everything here works, but two consequences are
worth knowing before you commit to it: Next.js image optimisation runs in your container
rather than on Vercel's edge, and you pay for two always-on containers that were specced
as serverless. Nothing in the code depends on Vercel.

---

Everything below is done in the Railway dashboard and GitHub. The Railway CLI is not used
at any point, and nothing here requires it.

---

## 0. Push the repo first

The working tree has **no commits and no remote**. Railway builds from a connected GitHub
repository, so nothing can deploy until this exists. Create an empty private repo on
GitHub — no README, no `.gitignore`, no licence, or the first push will conflict — then
push this tree to it, from VS Code's Source Control panel, GitHub Desktop, or the command
line.

Before pushing, confirm `.env`, `.env.local` and `packages/db/.env` are **not** in the
staged file list. `.gitignore` covers them, but they hold live secrets — a database
password and a Stripe key are in there right now, and a secret pushed to GitHub is burned
even if the next commit removes it.

---

## 1. Create the project and the data stores

In the Railway dashboard: **New Project → Empty Project**, name it `souqstudio`.

Inside it, **Create → Database → Add PostgreSQL**, then **Create → Database → Add Redis**.
Railway names them `Postgres` and `Redis` by default — keep those names exactly, because
the variable references in step 3 resolve by service name and silently produce an empty
string if the name does not match.

---

## 2. Create the three app services

For each of `web`, `admin` and `worker`: **Create → GitHub Repo → souqstudio**. The first
one will ask you to install the Railway GitHub App and grant it access to the repository.
Add all three from the same repo — Railway is happy to have several services watching one
repository, which is the whole point of the watch patterns below.

Rename each service after creating it (**Settings → Service Name**); all three arrive
named after the repo otherwise.

All three build from the **repository root**, not from `apps/*`. pnpm workspaces need the
root `pnpm-lock.yaml` and `pnpm-workspace.yaml` to resolve `workspace:*` dependencies, so
leave **Root Directory** empty. What differentiates the services is the config file:

| Service | Settings → Config-as-code → Path |
| --- | --- |
| `web` | `railway/web.json` |
| `admin` | `railway/admin.json` |
| `worker` | `railway/worker.json` |

Each file carries that service's build command, start command, healthcheck path and watch
patterns. `watchPatterns` is why a change under `apps/web/` does not rebuild the worker.

Set the config path and nothing else. Anything you type into the Build Command or Start
Command boxes in the UI **overrides the file** and then lives only in Railway's database,
where it is invisible to code review and lost on service recreation. If a build command
needs to change, change it in `railway/*.json` and push.

Give `web` and `admin` a public domain (**Settings → Networking → Generate Domain**). The
worker must not have one — it is a queue consumer, and its health server should not be
reachable from the internet. Railway still runs its healthcheck over the internal network.

---

## 3. Variables

### Shared references

Railway injects these by reference, so a rotated database password propagates on its own.
Set them on `web`, `admin` and `worker`. In each service, **Variables → New Variable**, or
use **Raw Editor** to paste a whole block at once:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}?family=0
```

Type those `${{...}}` references literally — Railway resolves them at deploy time. Do not
copy the expanded connection string out of the Postgres service and paste the value, or a
rotated password silently breaks three services.

The `?family=0` is not optional. Railway's private network is IPv6-only and ioredis
defaults to IPv4, so a bare internal Redis URL fails to connect with `ENOTFOUND`. ioredis
reads `family` off the query string, which is why this needs no code change.

### web

```bash
NEXTAUTH_SECRET=                      # openssl rand -base64 32
NEXTAUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
GOOGLE_CLIENT_ID=                     # optional — absent hides the Google button
GOOGLE_CLIENT_SECRET=                 # optional
STRIPE_SECRET_KEY=sk_
STRIPE_WEBHOOK_SECRET=whsec_
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=souqstudio
R2_PUBLIC_URL=https://assets.souqstudio.com
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
RESEND_API_KEY=re_
EMAIL_FROM=SouqStudio <send@updates.souqstudio.com>
OPENAI_API_KEY=sk-
ANTHROPIC_API_KEY=sk-ant-
REMBG_SERVICE_URL=
```

### worker

Same as `web` minus `NEXTAUTH_*`, `STRIPE_*` and the publishable key — the worker
authenticates nobody and charges nobody. It reads `PORT` from Railway automatically.

### admin

```bash
ADMIN_SESSION_SECRET=                 # openssl rand -base64 32 — must NOT equal NEXTAUTH_SECRET
ADMIN_IP_ALLOWLIST=                   # comma-separated; empty allows all
R2_PUBLIC_URL=https://assets.souqstudio.com
```

### Set every variable before the first deploy

`apps/web/lib/env.ts` and `apps/admin/lib/env.ts` are imported by server components and
route handlers, so Zod validation runs **during `next build`**, not just at boot. A missing
`STRIPE_SECRET_KEY` fails the build, not the first checkout. This is deliberate — see
`.claude/skills/souqstudio-technical/references/environment.md` — but it means a service
created with empty variables will not build at all.

`NEXTAUTH_URL` is the one chicken-and-egg: generate the domain first, then set the
variable, then deploy. `${{RAILWAY_PUBLIC_DOMAIN}}` resolves at deploy time and handles
this for you.

---

## 4. Migrations and seed — automatic

`railway/web.json` sets a **pre-deploy command** on the web service:

```
pnpm db:migrate && pnpm db:seed
```

Railway runs this in the newly built image after the build succeeds and *before* the new
container takes traffic. If it fails, the deployment is abandoned and the previous version
keeps serving — which is the behaviour you want from a failed migration.

Both halves are idempotent by design. `prisma migrate deploy` applies only what is
outstanding, and the seed upserts every grid and template against a hand-written stable id
precisely so a second run changes nothing (see the header comment in
`packages/db/prisma/seed.ts`). So there is no one-off command to run and nothing to
remember after the first deploy — which is why this works without the CLI.

Three migrations exist today: the baseline, E2 organization management, and E3 billing.

Two caveats. This runs on the **web** service only — do not add it to `admin` or `worker`,
or three containers race the same migration lock on every deploy. And keep `web` at one
replica while the pre-deploy command is doing schema work.

If you ever do need a one-off command against production without the CLI, the dashboard
route is to change the pre-deploy command, redeploy, and change it back. There is no
interactive shell.

---

## 5. Node version

`.nvmrc` pins Node 20. If Nixpacks picks something else, set `NIXPACKS_NODE_VERSION=20` as
a service variable. pnpm comes from the `packageManager` field in the root `package.json`.

---

## 6. Verify

Open `https://YOUR-WEB-DOMAIN/api/health` in a browser — it should return
`{"status":"ok"}`.

For the worker, open the service in the dashboard and read the **Deploy Logs** tab. A
healthy boot prints, in order:

```
[worker] Starting SouqStudio workers...
[worker] All workers running.
[worker] Health: http://localhost:8080/health
```

The port will be whatever Railway assigned. The worker has no public domain, so its health
endpoint is not reachable from a browser by design — the deploy status badge and these log
lines are how you confirm it.

Check the web service's **Deploy Logs** too on the first deploy: the pre-deploy step prints
Prisma's migration output there, and that is where a migration failure will be visible.

## 7. Ongoing deploys

Push to `main`. Railway rebuilds whichever services have watch patterns matching the
changed files — a change under `apps/web/` will not rebuild the worker, but a change under
`packages/` rebuilds all three, because all three depend on it.

Deploy history, rollback to a previous deployment, and per-deploy logs are all in each
service's **Deployments** tab.

---

## What is not ready for real traffic

Deploying is not the same as launching. These are open, and each one is documented in the
root `CLAUDE.md` under Known gaps:

- **No RLS policy has been written.** Tenancy today rests on `apps/web/lib/authz.ts`, which
  is application filtering, not a database control. One missing `where` clause is a
  cross-tenant leak. Write the first RLS migration before real customer data exists.
- **Billing has never touched a real Stripe account.** Every path in E3 is untested. Use
  test keys until you have exercised the order in `docs/E3-pending.md` §1.
- **Three of five worker handlers are stubs that throw** — `pdf`, `ai` and `enrich`. The
  worker will start, accept those jobs, fail them, and exhaust retries.
- **`REMBG_SERVICE_URL` needs a real service.** Background removal is implemented and calls
  it. It is a separate Python/FastAPI deployment that does not exist yet; the worker will
  not boot without the variable set to something URL-shaped, and `bg` jobs fail without
  something real behind it.
- **The email logo is not on R2.** Every email renders with a broken image until
  `apps/web/public/brand/email/logo-dark.png` is uploaded to
  `https://assets.souqstudio.com/email/logo-dark.png`.
- **`apps/admin` has no pages.** Its route directories are empty; the build produces a 404
  and a health endpoint. The config file is here and correct, but creating the service now
  buys an always-on container that serves nothing. Create it when admin has screens.
- **When the PDF handler lands, the worker needs a different builder.** Playwright browsers
  do not install under Nixpacks' default Node image. That service moves to a Dockerfile
  based on `mcr.microsoft.com/playwright`, and the `builder` field in
  `railway/worker.json` changes to `DOCKERFILE`.

---

## Notes on how this is wired

**The worker runs TypeScript directly in production.** `pnpm start` is `tsx src/index.ts`,
not `node dist/index.js`. This is not laziness: `@souqstudio/db`, `@souqstudio/email` and
`@souqstudio/types` all publish `main: src/index.ts`, so a `tsc`-compiled `dist/index.js`
emits `require("@souqstudio/db")` and Node hits a `.ts` file it cannot load —
`ERR_UNKNOWN_FILE_EXTENSION` on the first job, or an outright resolution failure at boot.
The Next.js apps never hit this because their bundler transpiles workspace sources; a plain
Node process has no bundler.

The alternatives were to give every shared package a build step and a `dist` main, or to
bundle the worker with esbuild. Both are defensible and both are larger changes that touch
how `web` and `admin` resolve their imports. `tsx` costs a few hundred milliseconds of
startup transpile on a process that runs for weeks.

`apps/worker/package.json` `build` is therefore `tsc --noEmit` — type checking only. It no
longer produces a `dist/`, because a `dist/` that looks runnable and is not is a trap.

**`packages/db/src/queue-client.ts` reads `process.env.REDIS_URL!` directly**, against the
convention. It works, but the non-null assertion means a missing variable surfaces as a
confusing ioredis error rather than a Zod message naming the variable. Worth a validated
env module in that package.
