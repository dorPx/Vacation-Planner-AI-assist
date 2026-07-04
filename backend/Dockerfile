# syntax=docker/dockerfile:1

# ---- builder ----------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Only exercised as a fallback if no prebuilt binary matches this platform
# (better-sqlite3 is a native module).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install deps first so this layer caches independently of source changes.
COPY backend/package*.json backend/
RUN npm ci --prefix backend

# Bring in the rest of the source. shared/ must sit alongside backend/ here
# because backend/tsconfig.json uses rootDir: ".." to pull in ../shared.
COPY shared shared
COPY backend backend

WORKDIR /app/backend
RUN npm run build
# Verified emitted layout: dist/backend/src/index.js, dist/shared/types.js
# (matches the local `npx tsc` check — rootDir ".." preserves the sibling
# shared/ path inside dist/). If you later change tsconfig, re-verify this
# path before touching the CMD below.

RUN npm prune --omit=dev

# ---- runner -------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app/backend

# Runtime libraries @sparticuz/chromium needs to launch headless Chromium.
# This list covers the common case; if puppeteer fails to launch inside the
# container, the error message will name the missing .so file — add it here.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package*.json ./

EXPOSE 4000
CMD ["node", "dist/backend/src/index.js"]
