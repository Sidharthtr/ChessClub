# ChessClub — Agent Context

This file is loaded into every Claude session. It tells the agent how the codebase is laid out and what conventions to follow. Detailed docs live in [docs/](docs/).

---

## What This Project Is

Real-time multiplayer chess platform. **Modular monolith** — single deployable, organized for future microservice extraction. The backend owns all game logic; the frontend is a thin renderer.

## Tech

| Layer         | Tech                                                                 |
| ------------- | -------------------------------------------------------------------- |
| Backend       | Node.js + TypeScript · WebSocket (`ws`) · Express                    |
| Chess         | `chess.js` (validation, FEN, game-over detection)                    |
| Validation    | `zod` — every incoming WS message                                    |
| Logging       | `pino` (JSON in prod, pretty in dev)                                 |
| DB            | PostgreSQL · Prisma                                                  |
| Auth          | JWT (`?token=` in WS URL or `Authorization: Bearer` header) · bcrypt |
| Observability | `prom-client` (`/metrics`), `/health`, `/health/deep`                |
| Frontend      | React 18 · Vite · Redux Toolkit · Tailwind                           |
| Tests         | Vitest + supertest                                                   |
| Infra         | Docker · docker-compose · nginx                                      |

## Repo Layout (at a glance)

```
ChessClub/
├── README.md
├── CLAUDE.md                            ← you are here
├── docs/                                ← all detailed docs live here
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── CONTRIBUTING.md
│   ├── PROTOCOL.md
│   └── OBSERVABILITY.md
├── docker-compose.yml                   ← production-representative
├── docker-compose.override.yml          ← local dev overrides (ports, hot reload)
├── .github/workflows/ci.yml             ← lint, typecheck, test, build
├── backend/
│   ├── Dockerfile
│   ├── prisma/                          ← schema + migrations
│   ├── scripts/entrypoint.sh            ← runs `prisma migrate deploy` then `node dist/server.js`
│   └── src/
│       ├── server.ts                    ← http.Server + WebSocketServer + listen
│       ├── app.ts                       ← Express app (no listen — supertest-friendly)
│       ├── config/env.ts                ← all process.env reads
│       ├── modules/
│       │   ├── websocket/SocketManager.ts
│       │   ├── game/{Game,GameService,chess-clock}.ts
│       │   ├── matchmaking/MatchmakingService.ts
│       │   ├── auth/{AuthService,authRouter,authMiddleware}.ts
│       │   ├── history/{HistoryService,historyRouter}.ts
│       │   ├── rating/EloService.ts
│       │   ├── health/healthRouter.ts
│       │   └── metrics/{metrics,metricsRouter}.ts
│       ├── shared/{constants,schemas,errors,utils,db}/
│       └── __tests__/{unit,integration}/
└── frontend/
    ├── Dockerfile
    ├── nginx.conf                       ← proxies /api and /ws to backend
    └── src/
        ├── App.tsx
        ├── api/client.ts                ← axios with JWT interceptor
        ├── hooks/useSocket.ts           ← WebSocket connection manager
        ├── redux/{authSlice,gameSlice}.ts
        ├── screens/{Game,Login,Register}.tsx
        ├── components/{ChessBoard,GameControls,ProtectedRoute}/
        └── shared/constants/messageTypes.ts  ← mirrors backend enum
```

For module responsibilities and request flows see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Conventions (Strict)

- **All WS messages validated via Zod** before any processing — invalid → `sendError()`, server never crashes
- **Structured logging only**: `logger.info({ gameId, event }, 'event_name')` — context object FIRST, message string SECOND. No `console.log`.
- **Game identified by UUID**, never by socket reference — `GameService.findGameById()` and `findGameByUserId()` are reconnection-safe
- **Server-authoritative clock** — client never controls time. `ChessClock` uses `Date.now()` deltas
- **No silent failures** — every bad client message gets an explicit `MessageType.ERROR` reply
- **Single source of truth for message types** — backend enum + frontend `as const` object must match exactly
- **Tests under `src/__tests__/`**, mirroring the module tree

## Running the Project

```bash
# Docker (recommended)
cp .env.example .env
docker compose up --build
# App at http://localhost
```

For local dev without Docker see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md#running-locally-without-docker).

## Current Phase

→ See [.claude/plan.md](.claude/plan.md) for phase tracking.

**Implemented**: Phases 0–4 (gameplay, auth, persistence, reconnection, rematch, rating) + Docker infra + health checks + Prometheus metrics + 119 tests + CI pipeline.

**Not yet**: Redis-backed game state for multi-instance horizontal scaling (Phase 5), spectator mode + leaderboard (Phase 6), Kubernetes (was in Phase 7 — Docker is done; K8s manifests pending).
