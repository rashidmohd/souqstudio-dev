# apps/rembg

Python 3.11 / FastAPI. Background removal, and nothing else.
Not part of the pnpm workspace. Not a Node service. No database, no Redis, no R2.

---

## Why this exists as its own service

`rembg` wraps U^2-Net through onnxruntime and is Python-only. There is no Node
equivalent producing the same matte, and a second matting implementation is how
the printed page stops matching the screen. So it is a fourth deployable unit
rather than a module inside `apps/worker`.

It is also **the most fragile thing in the stack** — a separate deploy, a
separate language, a model that loads on boot — which is why every caller treats
it as optional rather than required. See "The unavailability contract" below
before changing any response code here.

---

## The contract

One caller: `apps/worker/src/lib/rembg.ts`. One endpoint.

```
POST /remove    multipart/form-data, field `file`    →  200 image/png
GET  /health                                          →  200 {"status","model"}
```

- **The field is named `file`.** Renaming it breaks the worker silently — FastAPI
  answers 422, the worker reads any non-2xx as "unavailable", and cutouts simply
  stop happening with nothing in the product to say so.
- **The response is PNG bytes**, RGBA, **at the source's dimensions**. Never
  resize: `image_assets.bboxTight` is recorded in these pixels and the layout
  engine places cards by optical weight, so a resize invalidates a database
  column with no error anywhere.
- **60 seconds.** The worker abandons the request at 60s.

---

## The unavailability contract

`handleBgRemove` treats **every non-2xx, every connection failure and every
empty body** as `RembgUnavailableError`, which resolves the job rather than
failing it: the product keeps its original photo, the card carries a visible
`fallback-image` flag, and **nobody is charged**. That is deliberate — a shop
owner in Dubai at 11pm cannot restart a microservice.

The cost of it is that **a refusal here is invisible in the product**. A 413 for
an oversized image and a service that is down are the same event to every screen
in the app. So:

- Every refusal path in `main.py` logs. The log is the only place that
  distinction exists.
- Do not add a refusal that an owner could trigger by ordinary use and would
  need to act on. There is no channel to tell them.

---

## Rules

- **`onnxruntime`, never `onnxruntime-gpu`.** Railway has no GPU and the GPU
  wheel does not fall back — it fails at import and the service never boots.
- **The model is loaded once at import and baked into the image.** A session per
  request reloads ~176MB of weights. A lazily created one makes the first
  request after every deploy slow and makes it depend on GitHub releases being
  reachable from inside Railway.
- **Inference is serialised behind a lock.** One onnxruntime session is not safe
  to run concurrently, and `bg` feeds this at `concurrency: 2`. Throughput is
  the model's, not the server's — scale with replicas, not workers or threads.
- **One uvicorn worker per container.** A second doubles memory for throughput
  the queue does not ask for.
- `REMBG_MODEL` selects the model. `u2net` is the default and the most
  exercised; `isnet-general-use` cuts cleaner edges on some packshots and is the
  first thing to try if mattes come back haloed. Changing it means re-running
  the affected images, not just redeploying.

---

## Running it locally

```bash
cd apps/rembg
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000          # matches REMBG_SERVICE_URL in apps/worker/.env
```

The first start downloads the model to `~/.u2net` (a minute or so, once). Or
build the image the way Railway does, from the repository root:

```bash
docker build -f apps/rembg/Dockerfile -t souqstudio-rembg .
docker run -p 8000:8000 souqstudio-rembg
```

Check it:

```bash
curl localhost:8000/health
curl -f -o /tmp/cutout.png -F 'file=@/path/to/packshot.jpg' localhost:8000/remove
```

---

## Deployment

`railway/rembg.json`. **`builder` is `DOCKERFILE`, not `RAILPACK`** — Railpack
reads the repository root, finds a pnpm workspace and tries to build this as a
Node service. It is the only service here that does not use Railpack, and the
`dockerfilePath` is relative to the repository root because Railway's config
file does not follow Root Directory.

**A build log naming Railpack is a settings problem, not a code one.** It means
Railway never read `railway/rembg.json` and fell back to auto-detection; the
symptom is `Detected Node` followed by `No start command detected`, because this
directory has no `package.json` for it to find. There is nothing in here to fix
when that happens.

So this service carries `RAILWAY_DOCKERFILE_PATH=apps/rembg/Dockerfile` as a
variable *as well as* the config path — it is read before auto-detection, so the
builder does not depend on the config file being found. The config path is still
set, because the healthcheck, restart policy, replica count and watch patterns
come from the file. `docs/deployment-railway.md` §2a.

**No public domain.** The worker reaches it over Railway's private network. A
background-removal endpoint on the open internet is free CPU for anyone who
finds it.

**`PORT` is pinned to 8000 on the service** rather than left to Railway, because
the worker names it in `REMBG_SERVICE_URL`. The two are one setting written in
two places; change either and change both.

Full procedure: `docs/deployment-railway.md` §2a.
