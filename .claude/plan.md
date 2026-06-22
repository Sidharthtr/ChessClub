# ChessClub — Development Plan

> Update at the end of every phase. Status: ✅ done · 🔄 in progress · ⏳ pending.

---

## ✅ Phase 0 — Fix Existing Bugs

- [x] `MessageType` enum import mismatches in `Game.ts`, `SocketManager.ts`
- [x] `Move` → `MovePayload` type naming
- [x] `ws.on('disconnect')` → `ws.on('close')`
- [x] Games identified by UUID (`gameId`), not socket reference
- [x] `findGameById()` added to `GameService`

**Test Gate** ✅ Two browsers play a full game end-to-end.

---

## ✅ Phase 1 — Input Validation + Logging

- [x] `zod`, `pino`, `pino-pretty`, `dotenv` installed
- [x] `src/config/env.ts` — centralized env config
- [x] `src/shared/utils/logger.ts` — Pino logger (pretty in dev, JSON in prod)
- [x] `src/shared/errors/AppError.ts` + `errorHandler.ts`
- [x] `src/shared/schemas/message.schema.ts` — Zod discriminated union
- [x] Zod validation wired into `SocketManager.handleMessages()`
- [x] All `console.log` replaced with structured `logger.*`
- [x] `.env` and `.env.example` created

**Test Gate** ✅ Bad JSON → server replies with error and stays alive.

---

## ✅ Phase 2 — Core Chess Features

- [x] `shared/constants/timeControls.ts` — 10+0, 10+5, 15+10 presets
- [x] `modules/game/chess-clock.ts` — server-authoritative clock with Fischer increment
- [x] `Game.ts` — clock integration, game-over with `reason` field
- [x] Resign, draw request/accept/reject, takeback request/accept/reject
- [x] Clock snapshot embedded in every MOVE broadcast
- [x] Frontend Redux state for all game flows; turn enforcement on the board
- [x] Resign confirmation modal

**Test Gate** ✅ Checkmate, timeout, resignation, draw, takeback all work end-to-end.

---

## ✅ Phase 3 — Persistence + Auth

- [x] Prisma + PostgreSQL — `User` and `Game` models with proper indexes
- [x] `AuthService` — register (bcrypt), login, JWT issue, verifyToken
- [x] `requireAuth` middleware + auth router (`/api/auth/*`)
- [x] `HistoryService` + history router (`/api/games/:id`, `/api/users/:id/games`)
- [x] Express HTTP + WebSocket on same port (HTTP upgrade)
- [x] `Game.ts` accepts whiteUserId/blackUserId, saves to DB on game end
- [x] `SocketManager` extracts JWT from WS query param `?token=`
- [x] Frontend: `authSlice`, `api/client.ts` (axios + JWT), Login/Register screens, `ProtectedRoute`

**Test Gate** ✅ Register → login → play → `/api/users/:id/games` returns the completed game.

---

## ✅ Phase 4 — Smart Matchmaking + Reconnection

- [x] `EloService.ts` — FIDE K-factor (K=40/<30, K=20/<100, K=10/stable), min rating 100
- [x] `HistoryService.saveGame()` returns `{ ratingUpdates }` after Elo calc
- [x] Rated matchmaking queue with widening rating window (±100 → ±500 over 100 s)
- [x] Random color assignment, self-match prevention
- [x] `Game.replaceSocket()` + `getResumePayload()` → `GAME_RESUME` message
- [x] `SocketManager` 30-second grace period for authenticated players
- [x] Anonymous disconnect → immediate resign
- [x] Rematch flow with color swap
- [x] Frontend handles `GAME_RESUME`, `RATING_UPDATE`, rematch modal, opponent-disconnected overlay

**Test Gate** ✅ Close tab mid-game, reopen, game resumes. Ratings update post-game. Rematch creates a new game with swapped colors.

---

## ✅ Phase 5 — Infrastructure (partial — see below)

### Done

- [x] **Docker** — multi-stage backend Dockerfile, nginx-based frontend, PostgreSQL container
- [x] `docker-compose.yml` (prod-representative) + `docker-compose.override.yml` (local dev)
- [x] `entrypoint.sh` — runs `prisma migrate deploy` before starting Node
- [x] Non-root container user, `dumb-init` PID 1 for signal handling
- [x] **Health checks** — `GET /health` (shallow) + `GET /health/deep` (DB + WS + matchmaking)
- [x] **Prometheus metrics** — 8 metrics + Node defaults, isolated registry, `/metrics` endpoint
- [x] **Tests** — Vitest + supertest, 119 tests across unit + integration
- [x] **CI** — GitHub Actions: lint, typecheck, test, build on every PR
- [x] **Docs restructure** — split into `docs/` (ARCHITECTURE, DEPLOYMENT, CONTRIBUTING, PROTOCOL, OBSERVABILITY)

### Not yet (originally Phase 5)

- [ ] Redis-backed active game state (multi-instance horizontal scaling)
- [ ] Redis Pub/Sub for cross-instance WS message routing
- [ ] Run multiple backend instances behind nginx (`ip_hash` sticky sessions)

**Test Gate (for Redis work)**: Two backend instances; players on different instances play the same game.

---

## ⏳ Phase 6 — Spectators + Leaderboard

- [ ] Spectator mode — join any live game read-only
- [ ] `GET /api/games/live` — list in-progress games
- [ ] `GET /api/leaderboard` — top players by rating
- [ ] Frontend: leaderboard screen, "Watch" button on live games

---

## ⏳ Phase 7 — Kubernetes

Docker is done; K8s manifests still pending.

- [ ] `infra/k8s/` — Deployment, Service, Ingress, ConfigMap, Secret
- [ ] Run on minikube locally
- [ ] HPA on backend CPU/connection count
- [ ] PostgreSQL via Bitnami chart or managed service

**Test Gate**: `kubectl apply -f infra/k8s/` on minikube — full stack comes up, game playable.

---

## ⏳ Phase 8 — Extract First Microservice (Optional)

- [ ] Move `modules/matchmaking/` into its own repo
- [ ] Inter-service comms via Redis events or gRPC
- [ ] Deploy as separate K8s service
- [ ] Document trade-offs in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
