# ChessClub — Project Context

## Overview
Real-time multiplayer chess application. Backend is a **modular monolith** designed so each module (`game`, `matchmaking`, `auth`, `rating`) can be extracted into a standalone microservice later. Frontend is React + Redux + WebSocket.

## Tech Stack
| Layer | Technology |
|---|---|
| Backend runtime | Node.js + TypeScript, `ts-node` |
| WebSocket | `ws` library |
| Chess engine | `chess.js` (move validation, FEN, game-over detection) |
| Validation | `zod` (all incoming WS messages) |
| Logging | `pino` (JSON in prod, pretty in dev) |
| Frontend | React 18, Vite, Tailwind CSS |
| State | Redux Toolkit |
| Future DB | PostgreSQL + Prisma (Phase 3) |
| Future cache | Redis (Phase 5) |
| Future infra | Docker + Kubernetes (Phase 7) |

## Running the Project
```bash
# Backend — starts on ws://localhost:8080
cd backend && npm install && npm start

# Frontend — starts on http://localhost:5173
cd frontend && npm install && npm run dev
```

## Backend Architecture

### Entry & Config
- `src/server.ts` — creates WebSocketServer, hands connections to SocketManager
- `src/config/env.ts` — all env vars with defaults (PORT, NODE_ENV, JWT_SECRET)

### Modules (each = future microservice boundary)
- `modules/websocket/SocketManager.ts` — manages all WS connections, parses + validates messages with Zod, routes to services
- `modules/game/Game.ts` — domain entity: chess board (chess.js), clock, move logic, resign/draw/takeback
- `modules/game/GameService.ts` — owns the active `Game[]` list; `findGame(socket)` and `findGameById(id)`
- `modules/game/chess-clock.ts` — server-authoritative chess clock per game
- `modules/matchmaking/MatchmakingService.ts` — pairs waiting players into Games

### Stubs (empty, implemented in later phases)
- `modules/auth/` — Phase 3: JWT auth
- `modules/rating/` — Phase 4: Elo rating
- `modules/history/` — Phase 4: game history + PGN export

### Shared
- `shared/constants/messageTypes.ts` — `MessageType` enum — **single source of truth** for all WS message type strings
- `shared/constants/timeControls.ts` — time control presets (BULLET, BLITZ, RAPID, CLASSICAL)
- `shared/schemas/message.schema.ts` — Zod discriminated union for every valid incoming message
- `shared/errors/AppError.ts` — `AppError`, `ValidationError`, `GameError`
- `shared/errors/errorHandler.ts` — `sendError(socket, msg)` and `handleWsError(socket, err)`
- `shared/utils/logger.ts` — Pino instance (pretty in dev, JSON in prod)
- `shared/utils/generateGameId.ts` — `crypto.randomUUID()` wrapper

## Frontend Architecture
- `src/hooks/useSocket.ts` — creates and manages the WebSocket connection
- `src/redux/gameSlice.ts` — all game state: FEN, colour, gameOver, winner, gameOverReason, pendingDraw, pendingTakeback
- `src/screens/Game.tsx` — main screen; handles all WS messages, dispatches to Redux
- `src/components/ChessBoard/Chessboard.tsx` — renders board; enforces turn (only own pieces clickable on own turn)
- `src/components/GameControls/` — Resign / Offer Draw / Request Takeback buttons + accept/reject modals
- `src/shared/constants/messageTypes.ts` — mirrors backend enum values (plain `as const` object)

## WebSocket Protocol
All messages: `JSON.stringify({ type: MessageType.X, ...payload })`

| Type | Direction | Payload |
|---|---|---|
| `init_game` | C→S | _(none)_ |
| `init_game` | S→C | `{ color, gameId, timeMs }` |
| `move` | C→S | `{ move: { from, to, promotion? } }` |
| `move` | S→C | `{ payload: { move, clock: { white, black } } }` |
| `game_over` | S→C | `{ winner: 'white'\|'black'\|null, reason }` |
| `game_alert` | S→C | `{ payload: string }` |
| `resign` | C→S | _(none)_ |
| `draw_request` | C→S | _(none)_ |
| `draw_request` | S→C | _(forwarded to opponent)_ |
| `draw_accept` | C→S | _(none)_ |
| `draw_reject` | C→S / S→C | _(none)_ |
| `takeback_request` | C→S | _(none)_ |
| `takeback_request` | S→C | _(forwarded to opponent)_ |
| `takeback_accept` | C→S | _(none)_ |
| `takeback_accept` | S→C | `{ fen, moveCount }` |
| `takeback_reject` | C→S / S→C | _(none)_ |
| `error` | S→C | `{ message: string }` |

## Conventions
- **All WS messages validated via Zod** before any processing — invalid shape → `sendError()`, server never crashes
- **Structured logging**: `logger.info({ gameId, event }, 'event_name')` — always attach context object first
- **Game identified by UUID**, not socket reference — `GameService.findGameById(id)` is reconnection-safe
- **Server-authoritative clock** — client never controls time; clock in `Game.ts` uses `Date.now()` deltas
- **No silent failures** — every bad message gets an explicit `MessageType.ERROR` response back to the client
- **Single source of truth for message types** — backend uses `MessageType` enum; frontend mirrors same strings as `as const` object

## Current Phase
→ See [.claude/plan.md](.claude/plan.md) for phase tracking with checkmarks
