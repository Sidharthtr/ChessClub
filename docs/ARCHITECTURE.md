# Architecture

ChessClub is a **modular monolith** — a single deployable, but organized so each module can be lifted out into a microservice later without rewrites.

---

## System Diagram

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTPS (REST + WS upgrade)
       ▼
┌─────────────────────────────────────┐
│         nginx  (port 80)            │  ◄─── frontend container
│  ┌───────────────────────────────┐  │       serves React SPA bundle
│  │ /         → index.html (SPA)  │  │       proxies /api and /ws
│  │ /api/*    → backend:8080      │  │
│  │ /ws       → backend:8080      │  │
│  └───────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      backend  (port 8080)           │
│                                     │
│  Express HTTP server                │
│   ├─ /api/auth/*  (authRouter)      │
│   ├─ /api/games/* (historyRouter)   │
│   ├─ /health      (healthRouter)    │
│   └─ /metrics     (metricsRouter)   │
│                                     │
│  WebSocketServer (path /ws)         │
│   └─ SocketManager                  │
│        ├─ GameService               │
│        │    └─ Game[]               │
│        │         └─ ChessClock      │
│        └─ MatchmakingService        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   PostgreSQL  (port 5432, internal) │
│   users · games                     │
└─────────────────────────────────────┘
```

---

## Module Layout

Each top-level directory under `backend/src/modules/` is a candidate microservice boundary. They communicate only through their public exports.

```
backend/src/
├── server.ts                      Process entry — http.Server + WebSocketServer + listen
├── app.ts                         Express app factory (no listen — supertest-friendly)
├── config/
│   └── env.ts                     All process.env reads in one place
├── modules/
│   ├── websocket/
│   │   └── SocketManager.ts       Owns every WS connection; parses, validates, routes
│   ├── game/
│   │   ├── Game.ts                Domain entity — chess.js board + clock + move logic
│   │   ├── GameService.ts         In-memory registry of active Games
│   │   └── chess-clock.ts         Server-authoritative clock with Fischer increment
│   ├── matchmaking/
│   │   └── MatchmakingService.ts  Per-time-control queues with widening rating window
│   ├── auth/
│   │   ├── AuthService.ts         register / login / verifyToken
│   │   ├── authRouter.ts          /api/auth/register, /login, /me, /games
│   │   └── authMiddleware.ts      requireAuth — JWT Bearer guard
│   ├── history/
│   │   ├── HistoryService.ts      Persists finished games + updates Elo
│   │   └── historyRouter.ts       /api/games/:id, /api/users/:id/games
│   ├── rating/
│   │   └── EloService.ts          Pure function — FIDE K-factor Elo
│   ├── health/
│   │   └── healthRouter.ts        /health (shallow) + /health/deep
│   └── metrics/
│       ├── metrics.ts             prom-client registry + 8 metrics
│       └── metricsRouter.ts       /metrics endpoint
└── shared/
    ├── constants/                 messageTypes, timeControls
    ├── schemas/                   Zod validation for WS messages
    ├── errors/                    AppError + WS error helpers
    ├── utils/                     logger (Pino), generateGameId
    └── db/
        └── prisma.ts              PrismaClient singleton
```

---

## Request Flows

### 1. New Game — two clients matched

```
Browser A                  SocketManager        MatchmakingService     GameService          Game
   │                            │                      │                   │                 │
   │── WS connect (/ws?token) ─▶│                      │                   │                 │
   │── { type: INIT_GAME } ────▶│                      │                   │                 │
   │                            │── handleInitGame ───▶│                   │                 │
   │                            │                      │  (waits in queue) │                 │
Browser B                       │                      │                   │                 │
   │── WS connect ─────────────▶│                      │                   │                 │
   │── { type: INIT_GAME } ────▶│                      │                   │                 │
   │                            │── handleInitGame ───▶│                   │                 │
   │                            │                      │── createGame ────▶│── new Game ────▶│
   │                            │                      │                   │                 │── INIT_GAME to A
   │◀── INIT_GAME (color=white) ──────────────────────────────────────────────────────────────│
   │                            │                                                            │── INIT_GAME to B
```

### 2. Move

```
Browser              SocketManager              Game             ChessClock
   │                      │                       │                  │
   │── { MOVE, e2e4 } ───▶│                       │                  │
   │                      │── findGame(socket) ──▶│                  │
   │                      │── makeMove(...) ─────▶│                  │
   │                      │                       │── board.move()   │
   │                      │                       │── recordMove() ─▶│
   │                      │                       │◀── snapshot ─────│
   │◀── MOVE + clock ─────────────────────────────│ (broadcast both) │
```

### 3. Reconnection (30-second grace)

```
Browser              SocketManager      GameService
   │ (tab closed)        │                    │
   ▼                     │── 30-second timer starts
                         │
   │                     │
   │ (new tab, same token, within 30 s)
   │                     │
   │── WS connect ─────▶│
   │                     │── findGameByUserId(uid) ─▶│
   │                     │◀── Game ─────────────────│
   │                     │── replaceSocket(uid, ws) ▶ (cancels grace timer)
   │◀── GAME_RESUME ─────│
```

---

## Key Design Decisions

### Server-authoritative chess clock

The client never controls time. [`chess-clock.ts`](../backend/src/modules/game/chess-clock.ts) uses `Date.now()` deltas. Every `MOVE` broadcast embeds the latest `{ white, black }` snapshot so the UI just renders what the server says.

### Game identified by UUID, not socket

`Game.gameId` is a `crypto.randomUUID()`. Socket references are mutable (reconnection) — UUIDs are not. `GameService.findGameByUserId(uid)` is what makes resume-after-disconnect possible.

### Zod validation at the boundary

Every WS message is parsed through `IncomingMessageSchema.safeParse()` in [SocketManager.ts](../backend/src/modules/websocket/SocketManager.ts) before any game logic. Invalid shape → `MessageType.ERROR` reply, server stays alive.

### Single source of truth for message types

[`shared/constants/messageTypes.ts`](../backend/src/shared/constants/messageTypes.ts) is the enum. The frontend mirrors the same strings in an `as const` object. Changing one without the other breaks the protocol — caught immediately by typecheck.

### App.ts / server.ts split

[`app.ts`](../backend/src/app.ts) creates the Express app with no `listen()` call. [`server.ts`](../backend/src/server.ts) imports it and wraps it in `http.createServer()`. Integration tests can `import { app }` and hand it to supertest without binding a port.

### HealthStatsProvider interface

[`healthRouter.ts`](../backend/src/modules/health/healthRouter.ts) doesn't import `SocketManager`. It depends on an interface `{ getStats(): {...} }` that `SocketManager` happens to satisfy. Tests pass a plain object — no real WS stack needed.

---

## Microservice Extraction Path

If you needed to scale a single module out of the monolith, the order would be:

1. **Matchmaking** — stateless, easy first split. Talk to Game via Redis events.
2. **History/Ratings** — read-heavy, separate DB connection pool.
3. **Auth** — separate JWT issuer; backend just validates.
4. **Game** — last. Active game state would need to move to Redis (see Phase 5 in [`.claude/plan.md`](../.claude/plan.md)).
