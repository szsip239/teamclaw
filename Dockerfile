# ── Stage 1: Install dependencies ──────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm config set registry https://registry.npmmirror.com/ && \
    npm ci --ignore-scripts

# ── Stage 2: Build application ─────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# INTERNAL_API_URL must be available at build time so Next.js rewrites()
# can embed the correct destination in the standalone routes manifest.
# Default to http://localhost:3200 for local dev without Docker Compose.
ARG INTERNAL_API_URL=http://localhost:3200
ENV INTERNAL_API_URL=$INTERNAL_API_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js (standalone output)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: DB init ─────────────────────────────────
# The Go API (api service) handles schema migration via GORM AutoMigrate
# and seeds the default admin user on first run.
# This init stage only needs to wait for Postgres — it is a no-op placeholder
# kept for docker-compose dependency ordering.
FROM alpine:3.20 AS init
CMD ["echo", "Init complete — Go API handles migration and seeding on startup."]

# ── Stage 4: Production runner ─────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 -G nodejs nextjs

# Install clawhub CLI for skill pull functionality
RUN npm install -g clawhub@latest 2>/dev/null || true

# Copy standalone server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema (for reference only, migrations run in init stage)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma

# Copy key generation script
COPY --from=builder /app/scripts/generate-keys.mjs ./scripts/generate-keys.mjs

# Create writable data directories for the nextjs user
# /app/data/skills — skill file storage (TEAMCLAW_SKILLS_DIR default)
# /data/teamclaw  — instance data storage (TEAMCLAW_DATA_DIR default)
RUN mkdir -p /app/data/skills /data/teamclaw && \
    chown -R nextjs:nodejs /app/data /data/teamclaw

USER nextjs

EXPOSE 3100

ENV PORT=3100
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
