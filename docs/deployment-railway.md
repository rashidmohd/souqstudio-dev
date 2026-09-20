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

## 2. Create the three Node services

For each of `web`, `admin` and `worker`: **Create → GitHub Repo → souqstudio**. The
fourth service, `rembg`, is Python and is §2a. The first
one will ask you to install the Railway GitHub App and grant it access to the repository.
Add all three from the same repo — Railway is happy to have several services watching one
repository, which is the whole point of the watch patterns below.

Rename each service after creating it (**Settings → Service Name**); all three arrive
named after the repo otherwise.

All three build from the **repository root**, not from `apps/*`. Leave **Root Directory**
empty on every service. This is the one setting a monorepo makes you want to get wrong,
and setting it to `apps/web` breaks two things at once:

Railway's own words for what the field does: *"Setting this means that Railway will only
pull down files from that directory when creating new deployments."* Set it to `apps/web`
and the build never sees `pnpm-lock.yaml`, `pnpm-workspace.yaml` or `.nvmrc`, because all
three live at the root. The builder then finds an app `package.json` with no lockfile
beside it, falls back to npm, and npm does not understand the `workspace:` protocol at
all. The signature is:

```
copy package.json                       ← one file, no lockfile
npm install
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:*
```

A second tell in the same log is the Node version: it will show Railpack's LTS default
rather than the 20 in `.nvmrc`, for the same reason — the file is out of scope.

Railway's monorepo guide splits these into two cases. An *isolated* monorepo — unrelated
apps that each install independently — uses Root Directory. A *shared* monorepo, which is
what a pnpm workspace is, does not: everything installs once from the root and the
services are distinguished by their build and start commands instead. That is exactly what
`railway/*.json` does, and it is why the field must stay empty here.

**The config-as-code path is the exception and does not follow Root Directory.** Railway's
docs are explicit: *"The Railway Config File does not follow the Root Directory path. You
have to specify the absolute path."* So `railway/web.json` will load and its build and
start commands will appear in the deploy log even while Root Directory is still wrong —
seeing your own commands in the log is **not** evidence that this field is fixed. The
install step is the one to read, because Railpack chooses it from the build context and no
config file can override it.

What differentiates the services is the config file:

| Service | Settings → Config-as-code → Path |
| --- | --- |
| `web` | `railway/web.json` |
| `admin` | `railway/admin.json` |
| `worker` | `railway/worker.json` |

Each file carries that service's build command, start command, healthcheck path and watch
patterns. `watchPatterns` is why a change under `apps/web/` does not rebuild the worker.

Each build command goes through Turborepo — `pnpm exec turbo build --filter=@souqstudio/web`
rather than `pnpm --filter @souqstudio/web build`. The difference matters on a fresh clone:
`packages/email` publishes `main: ./dist/index.js` and its `dist/` is gitignored, so it does
not exist until something builds it. `pnpm --filter` runs one package's own script and stops;
turbo honours `dependsOn: ["^build"]` and builds the workspace dependencies first. Without
it the worker installs and builds cleanly, then dies on boot with `Cannot find module
'.../@souqstudio/email/dist/index.js'` — a failure that cannot reproduce locally, because a
developer's `dist/` was built weeks ago and never removed.

Set the config path and nothing else. Anything you type into the Build Command or Start
Command boxes in the UI **overrides the file** and then lives only in Railway's database,
where it is invisible to code review and lost on service recreation. If a build command
needs to change, change it in `railway/*.json` and push.

Give `web` and `admin` a public domain (**Settings → Networking → Generate Domain**). The
worker must not have one — it is a queue consumer, and its health server should not be
reachable from the internet. Railway still runs its healthcheck over the internal network.

---

## 2a. Create the `rembg` service

**Create → GitHub Repo → souqstudio** again, rename it `rembg`, and leave **Root
Directory** empty like the others. Then **Settings → Config-as-code → Path**:

| Service | Path |
| --- | --- |
| `rembg` | `railway/rembg.json` |

Two things differ from the three Node services, and both are load-bearing:

- **Its builder is `DOCKERFILE`, not `RAILPACK`.** Railpack inspects the repository root,
  finds `pnpm-workspace.yaml` and builds it as a Node service — it has no reason to guess
  that this one service is Python. `railway/rembg.json` names `apps/rembg/Dockerfile`,
  whose path is relative to the repository root, because the config file does not follow
  Root Directory.
- **It gets no public domain and almost no variables.** Not `DATABASE_URL`, not
  `REDIS_URL`, not R2. It receives an image on the private network and returns one; it
  reads nothing and writes nothing. Set exactly one:

  ```bash
  PORT=8000
  ```

  **Pinned rather than left to Railway**, which is the opposite of what the other three
  services do — and the reason is that the worker has to name this port in a URL. Railway
  assigns one otherwise, the private address becomes something you have to look up in the
  dashboard, and a service recreated later comes back on a different one with nothing to
  say so. `REMBG_MODEL` is the only other variable it understands and the default is
  correct.

**Set `RAILWAY_DOCKERFILE_PATH` on this service as well as the config path**, which the
other three do not need:

```bash
RAILWAY_DOCKERFILE_PATH=apps/rembg/Dockerfile
```

**Because the cost of the config file not being read is different here.** On `web` or
`worker`, an unread config means Railpack builds a Node service with defaults — wrong
commands, but a recognisable build. On `rembg` it means Railpack inspects the repository
root, finds `pnpm-workspace.yaml`, decides this Python service is Node, and stops at:

```
↳ Detected Node
↳ Found workspace with 8 packages
✖ No start command detected.
```

That message names Node and reads like a problem with the application. It is not — it is
Railway never having read `railway/rembg.json`, and there is nothing in `apps/rembg` to
fix. This variable is read *before* auto-detection, so the builder no longer depends on
the setting being right.

**Set the config path too.** The variable only decides the builder; the healthcheck,
restart policy, replica count and watch patterns all still come from the file, and without
it `rembg` rebuilds on every push to the repository instead of only its own changes.

A build that is reading the file says `Using detected Dockerfile` and does not name
Railpack at all. **Saving either setting does not rebuild on its own — redeploy.**

**The first build is slow — five to ten minutes — and that is expected.** It installs
onnxruntime and downloads the U^2-Net weights into the image, about 176MB. That is
deliberate: the alternative is downloading them on the first request after every deploy,
from GitHub, from inside Railway. `healthcheckTimeout` is 300 in the config for the same
reason.

Then point the worker at it. In the **worker** service:

```bash
REMBG_SERVICE_URL=http://rembg.railway.internal:8000
```

**`http`, not `https`, and the internal hostname.** Railway's private network terminates no
TLS and the service has no public domain. The hostname is `SERVICE-NAME.railway.internal`,
so it follows whatever you named the service — if you called it something other than
`rembg`, this changes with it. The `:8000` is the `PORT` pinned above; the two are one
setting in two places and they move together.

**A wrong value here fails silently and looks exactly like success.** The worker refuses to
boot on a missing `REMBG_SERVICE_URL` but cannot tell a wrong one from a service that is
down — both raise `RembgUnavailableError`, which by design keeps the original photo, writes
no row and charges nobody. So verify it (§6) rather than assuming it.

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
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com   # bare — see the warning below
RESEND_API_KEY=re_
EMAIL_FROM=SouqStudio <send@updates.souqstudio.com>
OPENAI_API_KEY=sk-
ANTHROPIC_API_KEY=sk-ant-
```

**`R2_ENDPOINT` must not contain the bucket, in either form it can hide.** Not
`https://ACCOUNT_ID.r2.cloudflarestorage.com/souqstudio` and not
`https://souqstudio.ACCOUNT_ID.r2.cloudflarestorage.com`. The SDK is handed `Bucket`
separately and builds the host from it, so an endpoint already carrying the bucket writes
every object somewhere `publicUrl()` cannot address — and **nothing about that is visible
from the app**: the presign succeeds, the PUT returns 200, and only the rendered image is
missing. This shape sat in the dev deployment for over a week. `lib/env.ts` →
`withEndpointCheck` now refuses both forms at startup, so the cost of getting it wrong is a
service that will not boot rather than uploads that vanish. `docs/STATUS.md` §2 has the
history.

### worker

Same as `web` minus `NEXTAUTH_*`, `STRIPE_*` and the publishable key — the worker
authenticates nobody and charges nobody. It reads `PORT` from Railway automatically.

Plus the one variable only the worker has:

```bash
REMBG_SERVICE_URL=http://rembg.railway.internal:8000   # §2a — matches PORT pinned on that service
```

### admin

```bash
ADMIN_SESSION_SECRET=                 # openssl rand -base64 32 — must NOT equal NEXTAUTH_SECRET
ADMIN_IP_ALLOWLIST=                   # comma-separated; empty allows all
R2_PUBLIC_URL=https://assets.souqstudio.com
```

### Set every variable before the first deploy

**Corrected 15 September: validation does *not* run during the build.** This section used
to say it did. `apps/web/lib/env.ts` and `apps/admin/lib/env.ts` are imported by server
components and route handlers, so Zod validation would run during `next build` — except
both build scripts set `SKIP_ENV_VALIDATION=1`, and deliberately: Railway injects service
variables into the container that *runs* the app, and a build machine is not a deploy
machine, so a build that demands a Stripe key it will never call fails for the wrong
reason.

What this means when a variable is wrong or missing:

- **The build passes.**
- **The pre-deploy command passes** — `db:migrate && db:seed` does not load this module.
- **The start command throws**, the healthcheck at `/api/health` never answers, and
  `restartPolicyMaxRetries: 5` burns through five restarts.

So Railway reports a **deploy or healthcheck failure, never a config error**, and the
thrown message naming the offending variables is in the *Deploy Logs*. Look there first.
This is the same trap as the `validateBlock` incident on 10 September, where Railway said
"build failed" when the build had passed.

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

## 5. Builder, Node and pnpm

All three configs set `"builder": "RAILPACK"` — Railway's current default builder, which
installs its toolchain through mise. `NIXPACKS` is still accepted and would also work, but
it is the legacy path; there is no reason to pin a new project to it.

`.nvmrc` pins Node 20, which Railpack reads. If it picks something else, set
`RAILPACK_NODE_VERSION=20` as a service variable — note the prefix follows the builder, so
the `NIXPACKS_`-prefixed variables do nothing here.

pnpm comes from the `packageManager` field in the root `package.json`. Do not add a
`package-lock.json` or `yarn.lock` anywhere in the repo; a second lockfile is the other
common way a builder ends up choosing the wrong package manager.

---

## 5a. Apply the bucket's CORS policy — once per environment

**A deploy does not carry this and no variable expresses it.** Every upload in the product
is a cross-origin PUT from a browser against a presigned URL — the logo, a product photo,
artwork dropped on the designer canvas — so every one of them sends an `OPTIONS` first, and
a bucket with no policy answers:

```
403 Forbidden
<Error><Code>Unauthorized</Code><Message>CORS not configured for this bucket</Message></Error>
```

**A perfectly correct presigned URL cannot be used by a browser against a bucket with no
policy**, which is why the endpoint fix above changes nothing on its own.

```bash
pnpm --filter @souqstudio/web r2:cors
```

It takes its origins from `APP_ORIGINS`, applies the policy, and **reads it back rather than
trusting the write**. A script rather than a dashboard click on purpose: a manual step
nobody records is a manual step that is wrong in the next environment. It is idempotent, so
running it to find out what a bucket currently has is safe.

Status: **applied on dev (15 September). Never applied on production.** Run it against the
production bucket before production has a user.

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
Prisma's migration output there, and that is where a migration failure will be visible — and
where a bad environment variable names itself, since validation runs at start rather than at
build.

**Then check `rembg`, because nothing else will.** Its deploy log should end with
uvicorn's startup line, and the first request is what actually proves it. From the
**worker** service's shell (**Deployments → ⋮ → Shell**, so the request crosses the same
private network the real one does):

```bash
curl -s $REMBG_SERVICE_URL/health
# {"status":"ok","model":"u2net"}
```

If that answers, the wiring is right. If it hangs or refuses, the hostname or the port in
`REMBG_SERVICE_URL` is wrong — and **no screen in the product will ever tell you**, because
an unreachable Rembg is a cutout that silently does not happen.

**Then upload something.** `/brand` → the logo field is the shortest path. Three independent
faults on that path were each enough to break it and only one was visible from the code, so
a green healthcheck says nothing about whether an owner can put an image in their book. If
the picture does not render afterwards, the object went somewhere unaddressable: check
`R2_ENDPOINT` first, then §5a. If it renders **with its background still on**, the
upload worked and the cutout did not: read the worker's log for `[bg]`. One of two lines is
there — `Rembg is unavailable: …` names the wiring, and `cutout for … quality …` means it
worked and the problem is downstream.

## 7. Ongoing deploys

Push to `main`. Railway rebuilds whichever services have watch patterns matching the
changed files — a change under `apps/web/` will not rebuild the worker, but a change under
`packages/` rebuilds all three Node services, because all three depend on it. **`rembg`
watches only `apps/rembg/` and shares nothing**, so it sits out every deploy but its own.

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
- ~~**`REMBG_SERVICE_URL` needs a real service.**~~ **Built 20 September** — `apps/rembg`,
  deployed by §2a. It had never existed, so every `bg` job since the feature shipped
  returned `kept_original`: logos kept their backgrounds, catalog cutouts never appeared,
  and the manual background removal in the editor queued, completed and changed nothing,
  charging nobody, with one `console.warn` in the worker log as the only trace. Nothing in
  the product said so, which is the part worth remembering — see §6.
- **The email logo is not on R2.** Every email renders with a broken image until
  `apps/web/public/brand/email/logo-dark.png` is uploaded to
  `https://assets.souqstudio.com/email/logo-dark.png`.
- **`apps/admin` has no pages.** Its route directories are empty; the build produces a 404
  and a health endpoint. The config file is here and correct, but creating the service now
  buys an always-on container that serves nothing. Create it when admin has screens.
- **When the PDF handler lands, the worker needs a different builder.** Playwright browsers
  do not install under the builder's default Node image. That service moves to a Dockerfile
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
