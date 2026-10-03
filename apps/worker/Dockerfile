# The worker. Moved off Railpack on 3 October 2026 because it now launches
# Chromium: block thumbnails are captured in a headless browser, and the PDF
# export will be too. Railpack's Node image has no browser and none of the
# system libraries one needs. See `railway/worker.json` and
# `docs/deployment-railway.md`.
#
# **The build context is the repository root**, like every service here,
# because Railway's config-as-code does not follow Root Directory. The root
# `.dockerignore` keeps node_modules, build output and env files out of it.
#
# **Node 20 plus `playwright install --with-deps`, not Microsoft's Playwright
# image.** That image would change the Node version under the worker, and its
# tag has to be bumped by hand to match the `playwright` package exactly or
# the browser it ships is the wrong build. Installing from the package that is
# actually in the lockfile cannot disagree with it.
FROM node:20-bookworm-slim

# Where the browser lands. Inside the image and outside node_modules, so the
# path is the same at build and at run time.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production

# OpenSSL for Prisma: its query engine is chosen by the libssl it finds when
# the client is generated, and the slim image has none, so generation would
# guess and the worker would fail at its first query. CA certificates for the
# HTTPS the worker speaks to R2, Resend and the model providers.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# The pnpm version `packageManager` in the root package.json names.
RUN corepack enable

WORKDIR /app
COPY . .

# Only the worker and the workspace packages it depends on. Dev dependencies
# stay in: `start` runs TypeScript through tsx, and `db:generate` needs the
# Prisma CLI. `apps/worker/CLAUDE.md` says why `start` is not compiled output.
RUN pnpm install --frozen-lockfile --filter "@souqstudio/worker..." --prod=false

# The db package's own script, not the root's: the root one runs through
# turbo, which is a root dev dependency the filtered install above leaves out.
RUN pnpm --filter @souqstudio/db db:generate

# Chromium, and the shared libraries it needs from apt. `--with-deps` is why
# this is a Dockerfile: it installs system packages, which a buildpack cannot.
RUN pnpm --filter @souqstudio/worker exec playwright install --with-deps chromium

CMD ["pnpm", "--filter", "@souqstudio/worker", "start"]
