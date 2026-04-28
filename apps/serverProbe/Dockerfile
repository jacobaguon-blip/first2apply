# syntax=docker/dockerfile:1.6
#
# Multi-stage Dockerfile for first2apply server probe.
# Build context = repo root. Build with:
#   docker buildx build --platform linux/arm64 \
#     -t f2a-server-probe:test -f apps/serverProbe/Dockerfile .
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- Stage 1: builder ----------
FROM ${NODE_IMAGE} AS builder

ENV PNPM_HOME=/pnpm \
    CI=1
ENV PATH=$PNPM_HOME:$PATH

# python3/make/g++ needed for native postinstalls (@parcel/watcher) pulled in
# transitively via the workspace; ca-certificates+wget for electron postinstall
# binary download. None of this leaks into the runtime stage.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Copy whole workspace; .dockerignore excludes node_modules/dist/build.
# pnpm install with --frozen-lockfile requires every workspace package.json,
# so we copy everything rather than enumerating each apps/* and libraries/*.
COPY . .

# Install only the dependency closure for serverProbe + its transitive libs.
# This skips desktopProbe/electron-forge/contentlayer/etc. which we don't need.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter "first2apply-server-probe..." \
      --filter "@first2apply/scraper..." \
      --filter "@first2apply/core..."

# Build the three packages we ship.
RUN pnpm --filter @first2apply/core build \
 && pnpm --filter @first2apply/scraper build \
 && pnpm --filter first2apply-server-probe build

# ---------- Stage 2: runtime ----------
FROM ${NODE_IMAGE} AS runtime

# Xvfb + Chromium runtime deps. dumb-init is PID 1 to forward signals to Xvfb
# and Electron correctly so SIGTERM from `docker stop` doesn't get swallowed.
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    libgtk-3-0 libnotify4 libnss3 libxss1 libasound2 \
    libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libsecret-1-0 \
    fonts-liberation wget ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm \
    CI=1
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Copy the entire built workspace from builder. pnpm uses symlinks into
# .pnpm/ which only resolve correctly when the layout is preserved, so we
# copy /app whole rather than cherry-picking files.
COPY --from=builder /app /app

COPY apps/serverProbe/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV DISPLAY=:99
ENV PATH=/app/apps/serverProbe/node_modules/.bin:/app/node_modules/.bin:$PATH

EXPOSE 7878

# start-period covers cold-start (Electron + Xvfb boot, JobScanner first scan).
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=300s \
  CMD wget -qO- http://127.0.0.1:7878/healthz || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/entrypoint.sh"]
