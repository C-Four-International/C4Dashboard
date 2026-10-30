# ── Stage 1: Build Frontend and Sebuf Gateway ────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install system build dependencies if needed
RUN apk add --no-cache python3 make g++

COPY package*.json ./
# Use npm ci with fallback to npm install if lockfile has slight version mismatch
RUN npm ci || npm install

COPY . .

# Build sebuf RPC gateway bundle (api/[domain]/v1/[rpc].js)
RUN npm run build:sidecar-sebuf

# Build Vite frontend assets (dist/)
RUN npm run build

# Prune devDependencies to keep production image lean
RUN npm prune --omit=dev

# ── Stage 2: Production Runner ───────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    RELAY_PORT=3004 \
    HOST=0.0.0.0

# Copy pre-installed production node_modules from builder (already pruned)
COPY --from=builder /app/node_modules ./node_modules

# Copy prebuilt artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/api ./api
COPY package*.json ./
COPY server ./server
COPY scripts ./scripts

# Create non-root user for security hardening
RUN addgroup -g 10001 -S worldmonitor && \
    adduser -u 10001 -S worldmonitor -G worldmonitor && \
    chown -R worldmonitor:worldmonitor /app

USER worldmonitor

EXPOSE 3000 3004

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "scripts/start-all.mjs"]
