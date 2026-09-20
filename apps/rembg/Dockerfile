# Rembg. The one service in this repo that is not Node, and therefore the one
# that cannot use Railpack — see `railway/rembg.json`.
#
# **The build context is the repository root**, like every other service here,
# because Railway's config-as-code does not follow Root Directory and the rest
# of the deployment doc depends on that field staying empty. Every COPY below is
# therefore written from the root.
FROM python:3.11-slim

# `libgomp1` is onnxruntime's OpenMP runtime. Without it the wheel imports and
# then dies with "libgomp.so.1: cannot open shared object file" on the first
# inference — a failure that looks like a model problem and is a missing .so.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libgomp1 \
  && rm -rf /var/lib/apt/lists/*

# Where rembg keeps model weights. Set before the install so the pre-download
# below lands inside the image rather than in a layer nothing keeps.
ENV U2NET_HOME=/models \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY apps/rembg/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# **The weights, at build time.** rembg downloads them from GitHub releases on
# first use otherwise, which makes the first cutout after every deploy slow and
# makes it depend on a third party being reachable from inside Railway. A
# 176MB layer is the right trade for a service whose whole failure mode is
# being unavailable.
ARG REMBG_MODEL=u2net
ENV REMBG_MODEL=${REMBG_MODEL}
RUN python -c "from rembg import new_session; new_session('${REMBG_MODEL}')"

COPY apps/rembg/main.py ./main.py

# Railway assigns PORT. The shell form is deliberate — the exec form would pass
# the literal string "$PORT" to uvicorn.
#
# One worker, because the model is loaded per process and a second would double
# the memory for throughput the queue does not ask for (`bg` runs at
# concurrency 2). Scale by raising replicas, not workers.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
