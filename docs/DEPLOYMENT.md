# Deployment

This project ships as three Docker containers behind nginx. Same image runs in dev, staging, and prod — environment variables vary, the container does not.

---

## Container Topology

```
┌──── frontend (nginx:1.27-alpine) ───┐
│ Port 80 → host                      │
│ Serves React bundle                 │
│ Proxies /api and /ws → backend      │
└──────────────┬──────────────────────┘
               │ internal docker network
┌──────────────▼──────────────────────┐
│ backend (node:22-alpine)            │
│ Port 8080 → NOT exposed to host     │
│ Runs prisma migrate deploy on start │
└──────────────┬──────────────────────┘
               │ internal docker network
┌──────────────▼──────────────────────┐
│ postgres (postgres:16-alpine)       │
│ Port 5432 → NOT exposed (prod)      │
│ Named volume: postgres_data         │
└─────────────────────────────────────┘
```

In **local dev**, `docker-compose.override.yml` exposes backend on `:8080` and postgres on `:5432` so you can `curl` and connect a GUI directly. In production you start with only the base compose file and those ports stay sealed.

---

## Environment Variables

Copy [`.env.example`](../.env.example) to `.env` at the repo root.

| Variable            | Required | Used by  | Example                       |
| ------------------- | -------- | -------- | ----------------------------- |
| `POSTGRES_DB`       | yes      | postgres | `chessclub`                   |
| `POSTGRES_USER`     | yes      | postgres | `chess`                       |
| `POSTGRES_PASSWORD` | yes      | postgres | _generate a strong password_  |
| `JWT_SECRET`        | yes      | backend  | _generate 64-byte hex string_ |
| `CORS_ORIGIN`       | no       | backend  | `https://yourdomain.com`      |
| `FRONTEND_PORT`     | no       | nginx    | `80`                          |

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Local Run (Docker)

```bash
cp .env.example .env
# edit .env

docker compose up --build
```

First run: ~3 minutes (downloads base images, runs `npm ci`, compiles TypeScript). Subsequent runs: ~10 seconds with build cache.

App is live at **http://localhost**.

---

## Day-to-Day Commands

```bash
# Start everything (detached)
docker compose up -d

# Stop
docker compose down

# Rebuild after code change
docker compose build backend && docker compose up -d

# Follow logs
docker compose logs -f
docker compose logs -f backend

# Open a shell inside the backend container
docker compose exec backend sh

# Prisma Studio (DB GUI) against the live postgres
docker compose exec backend npx prisma studio

# Wipe everything including the database
docker compose down --volumes
```

---

## Production Deployment

Production must skip the dev override file:

```bash
docker compose -f docker-compose.yml up -d --build
```

### Production checklist

- [ ] `.env` populated with real, strong secrets — never commit it
- [ ] `JWT_SECRET` rotated from the dev default
- [ ] `POSTGRES_PASSWORD` rotated from the dev default
- [ ] `CORS_ORIGIN` set to your real frontend domain (not `localhost`)
- [ ] TLS termination configured upstream (Cloudflare, ALB, or nginx with Let's Encrypt)
- [ ] PostgreSQL backups configured (e.g., `pg_dump` cron or managed service)
- [ ] Prometheus scraping `/metrics` on the backend
- [ ] Alerts wired on `/health/deep` returning 503
- [ ] Log aggregator capturing backend stdout (it's JSON in prod via Pino)

---

## Why These Docker Decisions

| Choice                               | Reason                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `node:22-alpine`                     | ~50 MB vs ~200 MB Debian. Smaller image → faster pulls and deploys.                                                                  |
| Multi-stage backend Dockerfile       | Builder stage has TypeScript + Prisma CLI (~500 MB); runner discards them, ships only `dist/` + production deps.                     |
| `dumb-init` as PID 1                 | Forwards SIGTERM correctly. Without it `docker stop` blocks for 10 s, killing in-flight DB writes.                                   |
| Non-root user (`appuser`)            | If the Node process is exploited, no root on the container. Defense in depth.                                                        |
| `npm ci --include=dev` in builder    | Forces devDependencies even if `NODE_ENV=production` leaks in. Without this, `tsc` is missing and build silently produces no output. |
| `npm ci --omit=dev` in runner        | Excludes ts-node, prisma CLI, @types/\*. Saves ~150 MB.                                                                              |
| `entrypoint.sh` runs migrations      | `prisma migrate deploy` is idempotent — safe on every boot, applies pending migrations, no-op if up to date.                         |
| nginx in front                       | Single host:port for the browser. Backend port not exposed → traffic must come through the proxy.                                    |
| `proxy_read_timeout 3600s` for `/ws` | Chess games can last an hour. nginx's default 60 s timeout would kill long games.                                                    |
| `VITE_API_URL=/api` baked in         | Relative URL — image works behind any domain without a rebuild.                                                                      |

---

## Rolling Update (Zero-downtime — caveats)

The backend uses in-memory game state, so a restart loses active games. Until Phase 5 (Redis-backed state) lands:

- **Bad time to deploy**: peak hours
- **Good time to deploy**: late night / off-peak
- **For true zero-downtime**: deploy when `/health/deep` shows `activeGames: 0`, or stand up a second backend instance and drain connections first

A `pre-stop` hook + 30-second grace timer in `SocketManager` give authenticated players a window to reconnect to the new instance — but only if game state has been moved to Redis first.
