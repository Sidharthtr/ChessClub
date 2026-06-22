# ─── Stage 1: prod-deps ──────────────────────────────────────────────────────
# Install ONLY production dependencies once.
# This stage's node_modules is reused by both the builder and the runner —
# we never reinstall the same packages twice.
#
# --no-audit / --no-fund: skip slow npm registry side-calls (saves ~30 s)
# --prefer-offline:       use cache when available, fall back to network
FROM node:22-alpine AS prod-deps

# Prisma's engine binary is dynamically linked against libssl. Alpine ships
# without it by default in newer node:22-alpine images. Install openssl so
# Prisma's binary detection succeeds — without this, prisma migrate hangs
# silently on the first run.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma

RUN npm config set fetch-timeout 600000 \
 && npm config set fetch-retries 5 \
 && npm ci --omit=dev --no-audit --no-fund --prefer-offline


# ─── Stage 2: builder ────────────────────────────────────────────────────────
# Reuses prod-deps' node_modules, then adds ONLY the two build-time tools we
# need: typescript (for tsc) and prisma (for generate).
#
# We deliberately do NOT install vitest, supertest, eslint, or any test/lint
# tooling here — those run in CI, not inside Docker. Skipping them shaves
# ~300 MB and ~3–5 minutes off the install on a slow connection.
FROM node:22-alpine AS builder

# Same reason — Prisma needs openssl during `prisma generate` too.
RUN apk add --no-cache openssl

WORKDIR /app

# Bring in the already-installed production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package*.json ./
COPY --from=prod-deps /app/prisma ./prisma

# Install only the two build tools we actually need. Versions match
# devDependencies in package.json. --no-save keeps package.json untouched.
RUN npm install --no-save --no-audit --no-fund --prefer-offline \
      typescript@~5.7 \
      prisma@~5.22

# Generate the Prisma client — must run before tsc because compiled code
# imports @prisma/client and the generated artefacts live in node_modules/.prisma
RUN npx prisma generate

# Copy source and compile TypeScript → dist/
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc


# ─── Stage 3: runner ─────────────────────────────────────────────────────────
# Minimal production image. No npm install happens here — node_modules is
# copied from prod-deps wholesale, and the Prisma client is copied from builder.
FROM node:22-alpine AS runner

WORKDIR /app

# dumb-init: forwards SIGTERM correctly so `docker stop` is clean.
# openssl:   required by Prisma engine binary at runtime.
RUN apk add --no-cache dumb-init openssl

# Non-root user. If the Node process is exploited, attacker has no root.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Bring in the production node_modules from stage 1.
# --chown=appuser:appgroup makes appuser the owner so Prisma can write to
# node_modules at runtime if it ever needs to (engine fallback download).
COPY --from=prod-deps --chown=appuser:appgroup /app/node_modules ./node_modules

# Bring in the Prisma-generated client from the builder
COPY --from=builder --chown=appuser:appgroup /app/node_modules/.prisma ./node_modules/.prisma

# Bring in the Prisma CLI itself + its symlink in .bin so the entrypoint's
# `npx prisma migrate deploy` works without downloading at container start.
# (prisma is a devDependency in package.json, so prod-deps doesn't have it.)
COPY --from=builder --chown=appuser:appgroup /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=appuser:appgroup /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=appuser:appgroup /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Manifests + Prisma schema (entrypoint runs `prisma migrate deploy`)
COPY package*.json ./
COPY prisma/ ./prisma/

# Compiled application
COPY --from=builder /app/dist ./dist

# Startup script — runs migrations then `node dist/server.js`
COPY scripts/entrypoint.sh ./scripts/entrypoint.sh
RUN chmod +x ./scripts/entrypoint.sh

USER appuser

ENV NODE_ENV=production
EXPOSE 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["./scripts/entrypoint.sh"]
