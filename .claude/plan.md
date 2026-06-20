# ChessClub — Development Plan

> Update this file at the end of every phase. Mark items with ✅ when done, 🔄 when in progress, ⏳ when pending.

---

## ✅ Phase 0 — Fix Existing Bugs
**Goal**: Get existing code to compile and run end-to-end.

- [x] Fixed `MessageType` enum import mismatch in `Game.ts` and `SocketManager.ts`
- [x] Fixed `Move` → `MovePayload` type naming in `Game.ts`
- [x] Fixed `ws.on('disconnect')` → `ws.on('close')` in `server.ts`
- [x] Added `gameId` (UUID) to `Game` class — games no longer identified by socket reference
- [x] Added `findGameById()` to `GameService`

**Test Gate** ✅ Two browsers can play a full game end-to-end.

---

## ✅ Phase 1 — Input Validation + Logging
**Goal**: Production-grade message handling — no crashes on bad input.

- [x] Installed `zod`, `pino`, `pino-pretty`, `dotenv`
- [x] `src/config/env.ts` — centralised env config with defaults
- [x] `src/shared/utils/logger.ts` — Pino structured logger (pretty in dev, JSON in prod)
- [x] `src/shared/errors/AppError.ts` — `AppError`, `ValidationError`, `GameError`
- [x] `src/shared/errors/errorHandler.ts` — `sendError()` and `handleWsError()`
- [x] `src/shared/schemas/message.schema.ts` — Zod schemas for all incoming WS messages
- [x] Wired Zod validation into `SocketManager` — invalid messages never crash the server
- [x] Replaced all `console.log` with structured `logger.*` calls
- [x] Created `.env` and `.env.example`

**Test Gate** ✅ Malformed JSON → server sends error, stays alive. Valid moves → structured JSON logs visible.

---

## 🔄 Phase 2 — Core Chess Features
**Goal**: Feels like a real chess app.

### Backend
- [x] `shared/constants/timeControls.ts` — BULLET, BLITZ_3, BLITZ_5, RAPID, CLASSICAL constants
- [x] `modules/game/chess-clock.ts` — server-authoritative clock with `start()`, `recordMove()`, `undoMove()`, `stop()`, `getSnapshot()`
- [x] `Game.ts` — integrated chess clock; game ends with `reason` field (checkmate, stalemate, draws, timeout)
- [x] `Game.ts` — `resign(socket)` → instant game over
- [x] `Game.ts` — `requestDraw / acceptDraw / rejectDraw` request flow
- [x] `Game.ts` — `requestTakeback / acceptTakeback / rejectTakeback` flow with `board.undo()`
- [x] Clock snapshot `{ white, black }` sent with every MOVE broadcast
- [x] `SocketManager.ts` — routes RESIGN, DRAW_*, TAKEBACK_* to Game methods

### Frontend
- [x] `src/shared/constants/messageTypes.ts` — mirrors backend enum (replaces `components/message.ts`)
- [x] `src/redux/gameSlice.ts` — added `winner`, `gameOverReason`, `pendingDrawRequest`, `pendingTakebackRequest`
- [x] `src/screens/Game.tsx` — handles DRAW_REQUEST, TAKEBACK_REQUEST, TAKEBACK_ACCEPT, DRAW_REJECT, TAKEBACK_REJECT
- [x] `src/components/ChessBoard/Chessboard.tsx` — turn enforcement: only own pieces selectable on own turn
- [x] `src/components/GameControls/index.tsx` — Resign / Offer Draw / Takeback buttons + accept/reject modals
- [x] Deleted deprecated `src/components/message.ts`

### Bug fixes (post-Phase 2)
- [x] Time control mismatch — frontend now sends `timeControlMs` in INIT_GAME; schema + matchmaking accept it
- [x] Game auto-cleanup via `onEnd` callback — stale entries removed, "can't move after restart" fixed
- [x] Disconnect notifies opponent — `SocketManager.removeUser` calls `game.resign(socket)`
- [x] `isWaiting` state — spinner shown while searching for opponent
- [x] Clock display — `clockWhiteMs` / `clockBlackMs` in Redux; live 100ms countdown in `Game.tsx`
- [x] UI redesign — navbar, player bars with clocks, right-side panel (time control + result)
- [x] Resign confirmation modal — clicking Resign opens "Are you sure?" popup before sending
- [x] Exit Game removed — Resign is the only way to leave an active game

**Test Gate** ✅ Both sides typecheck clean. Manually verify: checkmate, timeout, resignation, accepted draw, accepted takeback. Wrong-turn click does nothing.

---

## ✅ Phase 3 — Persistence + Auth
**Goal**: Users have persistent identity; games are stored in a database.

- [x] Install Prisma (v5, SQLite for dev — swap `provider` to `postgresql` for prod)
- [x] `prisma/schema.prisma` — User, Game models; `prisma migrate dev --name init` applied
- [x] `shared/db/prisma.ts` — PrismaClient singleton
- [x] `modules/auth/AuthService.ts` — register (bcrypt), login, verifyToken (JWT 7d)
- [x] `modules/auth/authMiddleware.ts` — `requireAuth` Express middleware
- [x] `modules/auth/authRouter.ts` — `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- [x] `modules/history/HistoryService.ts` — saveGame, getGame, getUserGames
- [x] `modules/history/historyRouter.ts` — `GET /api/games/:id`, `GET /api/users/:id/games`
- [x] `server.ts` — Express + WebSocket on same port (HTTP upgrade); CORS for localhost:5173
- [x] `Game.ts` — accepts whiteUserId/blackUserId; saves to DB in endGame if any player authenticated
- [x] `SocketManager.ts` — extracts JWT from WS query param `?token=`, maps socket → userId
- [x] `MatchmakingService.ts` — passes userId through to Game creation
- [x] Frontend: `authSlice` (token + user in Redux + localStorage)
- [x] Frontend: `api/client.ts` — axios instance with auto Bearer token
- [x] Frontend: `screens/Login.tsx`, `screens/Register.tsx`
- [x] Frontend: `components/ProtectedRoute.tsx` — redirects to /login if no token
- [x] Frontend: `App.tsx` — `/login`, `/register` routes; `/game` is protected
- [x] Frontend: `useSocket.ts` — appends `?token=...` to WS URL when logged in
- [x] Frontend: `Game.tsx` navbar — shows username + rating + Sign Out button

**Test Gate** ✅ Both sides typecheck clean. Register → login → play game → check `GET /api/users/:id/games` returns the completed game.

---

## ⏳ Phase 4 — Smart Matchmaking + Reconnection
**Goal**: Production-quality matchmaking; no more lost games on disconnect.

- [ ] Elo rating calculation (after each game result)
- [ ] Rating-based matchmaking queue — per time control, expanding ±window over time
- [ ] Reconnection: 30s grace period — server holds game state, client reconnects with gameId + JWT
- [ ] Rematch flow — either player can request after game ends
- [ ] Frontend: Lobby screen with time control selector
- [ ] Frontend: reconnection logic in `useSocket.ts`

**Test Gate**: Close browser tab mid-game, reopen — game resumes from correct position.

---

## ⏳ Phase 5 — Redis + Horizontal Scaling
**Goal**: Multi-instance ready; stateless servers.

- [ ] Move active game state to Redis (`game:{gameId}` → JSON)
- [ ] Redis Pub/Sub for cross-instance WS message routing
- [ ] Run 2 backend instances behind Nginx (`ip_hash` sticky sessions)
- [ ] `GET /health` endpoint

**Test Gate**: Two backend instances running; players on different instances play the same game.

---

## ⏳ Phase 6 — Spectators + Leaderboard
**Goal**: Discovery and audience features.

- [ ] Spectator mode — join any live game read-only
- [ ] `GET /games/live` — list all in-progress games
- [ ] `GET /leaderboard` — top players by rating
- [ ] Frontend: leaderboard screen, "Watch" button on live games

---

## ⏳ Phase 7 — Docker + Kubernetes
**Goal**: Deployable, demonstrates production systems knowledge.

- [ ] `backend/Dockerfile`
- [ ] Root `docker-compose.yml` — server + PostgreSQL + Redis
- [ ] `infra/k8s/` — Deployment, Service, Ingress, ConfigMap, Secret manifests
- [ ] Run on minikube locally
- [ ] `.github/workflows/ci.yml` — lint → typecheck → test → build Docker image
- [ ] README with architecture diagram and "how I'd scale this" section

**Test Gate**: `kubectl apply -f infra/k8s/` on minikube — full stack comes up, game playable.

---

## ⏳ Phase 8 — Extract First Microservice (Optional)
**Goal**: Real microservice boundary on resume.

- [ ] Move `modules/matchmaking/` into its own repo / deployable
- [ ] Inter-service communication via gRPC or Redis events
- [ ] Deploy as separate Kubernetes service
- [ ] Document trade-offs (latency, ops complexity) in README

**Test Gate**: Two services deployed independently; players still match correctly.
