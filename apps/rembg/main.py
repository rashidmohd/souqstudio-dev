"""
Rembg — the background removal service. E4-01 for logos, E5 §3 for catalog cutouts.

**Python because rembg is Python.** It wraps U^2-Net through onnxruntime, and
there is no Node equivalent that produces the same matte — which is the whole
reason this is a fourth deployable unit rather than a module in `apps/worker`.
`souqstudio-technical` → "Rembg as a Python microservice" is the original
argument; this file is that service.

**The contract is `apps/worker/src/lib/rembg.ts` and nothing else.** One caller,
one endpoint:

    POST /remove   multipart/form-data, field `file`   →   image/png bytes

Three things that file decides, which this one may not quietly change:

1. **Any non-2xx is "Rembg is unavailable" to the caller**, which means the
   product keeps its original photo and nobody is charged. A refusal here is
   therefore never an error a shop owner reads — it is a cutout that silently
   did not happen. That is the right default for a dependency this fragile, and
   it is why every refusal below also logs: the log is the only place the
   difference between "down" and "refused that image" exists.
2. **An empty body is unavailable too.** Returning 200 with nothing is worse
   than returning 500.
3. **60 seconds.** A request still running at 60s has already been abandoned.

**Nothing here resizes.** The worker records `bboxTight` in the returned
image's own pixels and the layout engine places cards by optical weight, so a
resize on this side silently invalidates a column in the database. Same rule as
the worker's own "never resize a cutout".
"""

from __future__ import annotations

import io
import logging
import os
import threading
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from PIL import Image
from rembg import new_session, remove

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("rembg")

# ── Limits ────────────────────────────────────────────────────────────────────

# Refused rather than decoded. `apps/web` already caps an upload well below
# this; a request over it is a crafted one or a bug, and either way this process
# holds the decoded bitmap in memory and is the wrong place to find out.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# A 50MP guard on the *decoded* image, which is the number that matters: a 4MB
# PNG can decode to gigabytes. Pillow's own decompression-bomb check is a
# warning by default, so this is the one that refuses.
MAX_PIXELS = 50_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

# `u2net` is rembg's default and the most exercised. `isnet-general-use` cuts
# cleaner edges on some packshots and is the first thing to try if mattes come
# back haloed — it is a variable rather than an edit because changing it means
# re-running the images, not re-reading the code.
MODEL = os.environ.get("REMBG_MODEL", "u2net")

# ── The model ─────────────────────────────────────────────────────────────────

# **Loaded once, at import, and baked into the image at build time.** A session
# created per request reloads ~176MB of weights every time; a session created
# lazily makes the first request after every deploy the slow one, and if the
# weights are not already on disk it also makes that request depend on GitHub
# releases being reachable. The Dockerfile pre-downloads them for that reason.
_session = new_session(MODEL)

# **Inference is serialised.** One onnxruntime session is not safe to run
# concurrently, and the queue that feeds this holds `concurrency: 2`, so the
# second request waits a few seconds rather than racing the first through shared
# state. Throughput here is the model's, not the server's — parallelism would
# only move the queue somewhere less visible.
_lock = threading.Lock()

app = FastAPI(title="SouqStudio Rembg", docs_url=None, redoc_url=None)


@app.get("/health")
def health() -> JSONResponse:
    """
    Railway's healthcheck, and the one thing to curl when a cutout does not
    appear. It reports the model because a service answering with the wrong one
    is indistinguishable from a service answering correctly until somebody looks
    at a matte.

    It does not run inference: a healthcheck that costs three seconds of CPU is
    a healthcheck that fails under the load it exists to detect.
    """
    return JSONResponse({"status": "ok", "model": MODEL})


@app.post("/remove")
def remove_background(file: UploadFile = File(...)) -> Response:
    """
    One image in, one transparent PNG out, at the same dimensions.

    A plain `def` rather than `async def` on purpose: FastAPI runs it in a
    threadpool, so the several seconds of CPU this spends do not block the
    event loop and the healthcheck keeps answering while a matte is running.
    """
    started = time.monotonic()

    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        log.warning("refused an empty upload")
        raise HTTPException(status_code=400, detail="empty upload")

    if len(data) > MAX_UPLOAD_BYTES:
        log.warning("refused an upload over %d bytes", MAX_UPLOAD_BYTES)
        raise HTTPException(status_code=413, detail="image too large")

    try:
        source = Image.open(io.BytesIO(data))
        source.load()
    except Exception:
        # Not `except Image.UnidentifiedImageError` alone: a truncated file, a
        # decoder bomb and an unsupported format all arrive differently and all
        # mean the same thing to the caller.
        log.warning("refused an upload Pillow could not decode", exc_info=True)
        raise HTTPException(status_code=415, detail="not a decodable image")

    if source.width * source.height > MAX_PIXELS:
        log.warning("refused a %dx%d image", source.width, source.height)
        raise HTTPException(status_code=413, detail="image has too many pixels")

    # RGBA in, so a palette or greyscale source cannot produce a matte with no
    # alpha channel to analyse. The worker reads the alpha plane directly and an
    # RGB result would score as fully opaque — a cutout that looks like a
    # failure of the model rather than of the conversion.
    source = source.convert("RGBA")

    try:
        with _lock:
            cutout = remove(source, session=_session)
    except Exception:
        # A 500 tells the caller "unavailable", which is honest: the image was
        # acceptable and we could not matte it. The retry is worth having.
        log.exception("inference failed")
        raise HTTPException(status_code=500, detail="inference failed")

    buffer = io.BytesIO()
    # PNG because a matte is alpha by definition, and no optimisation pass: the
    # worker re-encodes through sharp anyway, so anything spent here is spent
    # twice and thrown away once.
    cutout.save(buffer, format="PNG")
    body = buffer.getvalue()

    log.info(
        "cut out %dx%d in %.2fs — %d bytes in, %d out",
        source.width,
        source.height,
        time.monotonic() - started,
        len(data),
        len(body),
    )

    return Response(content=body, media_type="image/png")
