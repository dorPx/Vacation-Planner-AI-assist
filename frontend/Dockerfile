# syntax=docker/dockerfile:1

# ---- builder ----------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY frontend/package*.json frontend/
RUN npm ci --prefix frontend

# shared/ must sit alongside frontend/ — frontend code imports ../shared.
COPY shared shared
COPY frontend frontend

WORKDIR /app/frontend

# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time, not
# read at container runtime — they must arrive as build args, not `environment:`.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

RUN npm run build

# ---- runner -------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app/frontend

ENV NODE_ENV=production
ENV PORT=3000

# Requires next.config.js to set output: 'standalone' and pin
# outputFileTracingRoot to the frontend dir (see DOCKER_SETUP.md) — that
# keeps server.js at the top of .next/standalone with no extra nesting,
# which is what the COPY lines and CMD below assume.
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static
COPY --from=builder /app/frontend/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
