# ─── Stage 1: builder ────────────────────────────────────────────────────────
# Uses the full Node image so we have access to `tsc` and the Prisma CLI.
# This stage is thrown away — nothing from it except the compiled output goes
# into the final image.
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first so Docker layer-caches the npm install step.
# The install only re-runs when package.json or package-lock.json changes.
COPY package*.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma

# Install ALL dependencies (devDependencies included — we need tsc and prisma CLI).
RUN npm ci

# Generate the Prisma client for the target platform.
# Must run before tsc because compiled code imports @prisma/client.
RUN npx prisma generate

# Copy source and compile TypeScript → dist/
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build


# ─── Stage 2: runner ─────────────────────────────────────────────────────────
# Minimal image — only what the Node process needs at runtime.
FROM node:22-alpine AS runner

WORKDIR /app

# dumb-init: runs as PID 1 and correctly forwards OS signals (SIGTERM, SIGINT)
# to the Node process. Without it, `docker stop` sends SIGTERM to PID 1 (which
# is node or sh), and Node may ignore it — Docker then waits 10 s and kills
# forcefully, losing in-flight requests and DB writes.
RUN apk add --no-cache dumb-init

# Create a non-root user. Running as root inside a container is a security risk
# because a breakout would give the attacker root on the host.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install ONLY production dependencies. --omit=dev skips tsc, prisma CLI, etc.
# `npm cache clean` keeps the layer small.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy Prisma schema + migration files (needed by `prisma migrate deploy`)
COPY prisma/ ./prisma/

# Copy the Prisma-generated client from the builder stage.
# The runner stage did `npm ci --omit=dev` which skips the prisma CLI, so
# `prisma generate` never ran. We copy the pre-built client directly instead.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy the compiled application
COPY --from=builder /app/dist ./dist

# Copy and permission the startup script
COPY scripts/entrypoint.sh ./scripts/entrypoint.sh
RUN chmod +x ./scripts/entrypoint.sh

# Drop to non-root user for all subsequent operations
USER appuser

ENV NODE_ENV=production
EXPOSE 8080

# dumb-init as the entrypoint ensures clean signal propagation.
ENTRYPOINT ["dumb-init", "--"]
CMD ["./scripts/entrypoint.sh"]
