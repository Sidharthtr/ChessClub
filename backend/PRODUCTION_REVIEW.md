# ChessClub Backend — Production Readiness Review

> Staff-engineer-level audit of the full backend codebase.  
> Every finding references exact file names, class names, and line-level behaviour.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [WebSocket Design](#2-websocket-design)
3. [Matchmaking](#3-matchmaking)
4. [Game Lifecycle](#4-game-lifecycle)
5. [Reconnection](#5-reconnection)
6. [Reliability](#6-reliability)
7. [Database](#7-database)
8. [Security](#8-security)
9. [Performance](#9-performance)
10. [Production Readiness Scores](#10-production-readiness-scores)
11. [Priority Fix List](#11-priority-fix-list)

---

## 1. Architecture

### 1.1 Main Modules and Responsibilities

| File                                        | Primary Responsibility                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| `config/env.ts`                             | Centralised env-var loading with defaults                     |
| `modules/auth/AuthService.ts`               | Register, login, JWT sign/verify, bcrypt                      |
| `modules/auth/authMiddleware.ts`            | Express `requireAuth` middleware                              |
| `modules/auth/authRouter.ts`                | REST routes `/api/auth/*`                                     |
| `modules/game/Game.ts`                      | Chess domain entity — board, clock, all game flows            |
| `modules/game/GameService.ts`               | In-memory active-game registry                                |
| `modules/game/chess-clock.ts`               | Server-authoritative chess clock with increment               |
| `modules/game/types.ts`                     | Shared types (partially unused — see §1.6)                    |
| `modules/history/HistoryService.ts`         | Persist completed games + trigger Elo calculation             |
| `modules/history/historyRouter.ts`          | REST routes `/api/games/*` and `/api/users/:id/games`         |
| `modules/matchmaking/MatchmakingService.ts` | Per-time-control queues, expanding rating window              |
| `modules/rating/EloService.ts`              | Pure Elo calculation (stateless)                              |
| `modules/websocket/SocketManager.ts`        | WS lifecycle, auth extraction, message routing, grace periods |
| `shared/constants/messageTypes.ts`          | Single source of truth for all WS message type strings        |
| `shared/constants/timeControls.ts`          | Time control definitions and `tcKey()` helper                 |
| `shared/db/prisma.ts`                       | PrismaClient singleton                                        |
| `shared/errors/`                            | `AppError` hierarchy + `sendError`/`handleWsError` helpers    |
| `shared/schemas/message.schema.ts`          | Zod discriminated union for all incoming WS messages          |
| `shared/utils/logger.ts`                    | Pino instance (pretty dev / JSON prod)                        |
| `server.ts`                                 | HTTP + WS server bootstrap                                    |

### 1.2 Files with Multiple Responsibilities

**`modules/game/Game.ts`** — the heaviest offender:

- Chess board state (delegated to chess.js)
- Clock integration (delegates to `ChessClock`)
- Player identity and socket I/O (`safeSend`, `replaceSocket`)
- Draw / takeback / rematch negotiation flows
- Game-over detection and broadcasting
- DB persistence trigger (`historyService.saveGame(...)`)
- Rating update broadcasting back to sockets
- Reconnection support (`getResumePayload`)

That is at minimum **five distinct concerns** in one class.

**`modules/websocket/SocketManager.ts`**:

- WebSocket connection lifecycle management
- JWT extraction and validation from query string
- In-memory socket→user metadata mapping
- Message routing (switch statement across 12 message types)
- Grace period timer lifecycle
- Direct DB query (`prisma.user.findUnique`) inside `handleInitGameAsync`

**`modules/history/HistoryService.ts`**:

- Persisting completed games to DB
- Fetching user ratings, calling `calculateElo`, and updating user rows
  This is a **rating update service** bundled inside a history service.

**`modules/auth/authRouter.ts`**:

- Auth routes (register/login/me)
- Also exposes `GET /api/auth/games` — a history endpoint mounted on the auth router

### 1.3 Single Responsibility Violations

| Class / File        | Violation                                                  |
| ------------------- | ---------------------------------------------------------- |
| `Game.ts`           | Domain logic + socket I/O + DB save trigger + reconnection |
| `SocketManager.ts`  | Connection management + auth + routing + DB queries        |
| `HistoryService.ts` | Persistence + Elo business logic                           |
| `authRouter.ts`     | Auth routes + a game-history route                         |

### 1.4 God Classes

**`Game.ts`** is the clear god class. It owns approximately 280 lines and every game-related concept flows through it. Adding spectator mode, tournament support, or move annotations would all require touching `Game.ts`. This is the single biggest architectural risk for maintainability.

**`SocketManager.ts`** is approaching god-class territory. It currently has 215 lines but its responsibilities mean any change to auth, routing, reconnection logic, or grace period behaviour requires touching it.

### 1.5 Tight Couplings

- `Game.ts` directly imports `historyService` (module-level singleton). This makes `Game` impossible to unit test without a live Prisma client.
- `SocketManager.ts` directly imports `prisma` — bypassing the service layer entirely for a one-off DB read. The DB concern belongs in a service, not the connection manager.
- `authRouter.ts` imports `historyService` — auth module depends on history module, creating a cross-module coupling that will prevent independent extraction.
- `GameService.ts` wires the `onRematch` callback itself — creates self-referential callback closure that makes testing awkward.

### 1.6 Missing Abstractions

| Missing                                                   | Impact                                                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `PlayerSession` value object (socket + userId + username) | These three fields are passed together everywhere as separate params — 8-arg constructors in `Game.ts` and `GameService.ts` |
| `IGameRepository` / `IUserRepository`                     | No interfaces over persistence — impossible to swap or mock DB                                                              |
| `GameEventEmitter`                                        | Instead of callback props (`onEnd`, `onRematch`), an `EventEmitter` would decouple `Game` from `GameService`                |
| `RatingService` separate from `HistoryService`            | Elo logic is embedded inside save flow                                                                                      |
| Allowed time-control whitelist in Zod schema              | Currently `timeControlMs` is any positive integer — client can send arbitrary values                                        |
| `modules/game/types.ts`                                   | `Player`, `GameState` interfaces defined but **never used** — dead code                                                     |
| Metrics/health endpoint                                   | No way to observe active game count, queue depth, memory usage                                                              |

---

## 2. WebSocket Design

### 2.1 How Sockets Are Stored

| Store                           | Type                       | Lookup              |
| ------------------------------- | -------------------------- | ------------------- |
| `SocketManager.users`           | `WebSocket[]`              | O(n) linear scan    |
| `SocketManager.socketMeta`      | `WeakMap<WebSocket, meta>` | O(1)                |
| `Game.player1` / `Game.player2` | Direct socket reference    | Direct field access |

### 2.2 How Active Games Are Stored

`GameService.games: Game[]` — a flat array. All lookups are O(n).

### 2.3 Lookup Complexity

| Operation                  | Method                                 | Complexity              |
| -------------------------- | -------------------------------------- | ----------------------- |
| Find game by socket        | `GameService.findGame(socket)`         | **O(n)**                |
| Find game by userId        | `GameService.findGameByUserId(userId)` | **O(n)**                |
| Find game by gameId        | `GameService.findGameById(gameId)`     | **O(n)**                |
| Find queue entry by socket | `MatchmakingService.findEntryBySocket` | **O(queues × entries)** |
| Socket metadata            | `SocketManager.socketMeta.get(socket)` | O(1)                    |

At 100 concurrent games these are imperceptible. At 10,000+ they become the primary bottleneck. Fix: use `Map<string, Game>` keyed by gameId, `Map<WebSocket, Game>`, and `Map<string, Game>` keyed by userId for O(1) on all three.

### 2.4 Memory Leaks

**No confirmed leaks**, but three areas to watch:

1. **Matchmaking `setInterval`**: Each queued player holds an interval. The `dequeue()` method calls `clearInterval` before removing the entry — this is correct. But if `removePendingUser` is called while `tryMatch` is in progress (impossible in single-threaded Node.js, so safe), a double-clear would occur harmlessly.

2. **Grace period `setTimeout`**: Stored in `gracePeriods: Map<string, timeout>`. Cleared on reconnect and on expiry. If a user is in grace period AND the server restarts, the map is lost (no leak, just lost functionality).

3. **Completed `Game` objects with pending rematch**: After `endGame`, `onEnd()` removes the game from `GameService.games`. But callers with a reference to the `Game` object (e.g., sockets that triggered `requestRematch`) keep it alive until those sockets are GC'd. No actual leak — this is correct JS object lifetime.

### 2.5 Disconnected Sockets Remaining Referenced

During the grace period, `Game.player1` or `Game.player2` holds a **closed socket**. `safeSend` guards against this with `readyState === OPEN` check, so no crash. The reference is replaced when the user reconnects via `replaceSocket`. If grace expires, `resign` → `endGame` → `onEnd` removes the game from `games[]` and the `Game` object becomes GC-eligible.

**Verdict**: handled correctly. The closed-socket reference is never written to; it just sits there until replaced or the game ends.

### 2.6 Unexpected Socket Close

`server.ts` wires: `ws.on('close', () => socketManager.removeUser(ws))`. The `ws` library guarantees the `close` event fires on any termination (TCP drop, browser tab close, network timeout). `removeUser` handles cleanup. This is correct.

---

## 3. Matchmaking

### 3.1 Step-by-Step Flow

```
1. Client sends: { type: "init_game", timeControlMs: 600000, incrementMs: 5000 }
2. SocketManager.handleMessages → switch INIT_GAME
3. handleInitGameAsync fires (async):
   a. If authenticated: prisma.user.findUnique → fetch current rating
   b. If anonymous: use default rating 1200
4. matchmakingService.handleInitGame(socket, baseMs, incMs, userId, username, rating)
5. Checks: is this socket already in any queue? → sendError if yes
6. Computes key = tcKey(600000, 5000) = "600000_5000"
7. tryMatch(entry, key):
   - Searches the "600000_5000" queue for an opponent
   - Window starts at ±100 (no wait time yet)
   - Filters: not self, not same userId (if authenticated), within rating window
8a. Match found:
   - dequeue(entry), dequeue(opponent)
   - Randomly assign white/black
   - gameService.createGame(white.socket, black.socket, ...)
   → Game constructor sends INIT_GAME to both, starts clock
8b. No match:
   - Push entry to queue
   - setInterval(10s) → retry tryMatch with expanded window
   - Window grows: ±100 → ±150 → ±200 → ... → ±500 (capped)
```

### 3.2 Simultaneous Requests

Node.js is single-threaded. However, `handleInitGameAsync` is `async` and contains `await prisma.user.findUnique`. This means two players' async flows can interleave at the await point.

**Safe scenario**: Player A and B both send `INIT_GAME`. Both `handleInitGameAsync` calls start, both hit `await`. A's DB query returns first → A calls `handleInitGame` synchronously → A is added to queue or matched. B's query returns → B calls `handleInitGame` synchronously → either matches A or queues. No race because `handleInitGame` itself is synchronous.

**Double-queue scenario**: A single player opens two tabs and sends `INIT_GAME` from both sockets simultaneously. Both `handleInitGameAsync` calls start. Both hit `await` (socket A1 and socket A2 have the same userId). A1's query returns → `findEntryBySocket(A1)` returns undefined → A1 is queued. A2's query returns → `findEntryBySocket(A2)` returns undefined (A1 is in queue, A2 is a different socket). Both queue up. `tryMatch` has: `e.userId !== null && e.userId === entry.userId` guard — prevents self-match. A1 and A2 will never be matched to each other. But they'll both wait in queue indefinitely, and the opponent who eventually matches A1 will think A2 is a separate player. **This is a minor bug**: a user can occupy two queue slots with different sockets. Fix: add a `userId → QueueEntry` Map to detect duplicate userId in queue.

### 3.3 Race Conditions

None possible in the classic sense (single-threaded). The async interleaving at `await` points creates the double-queue scenario above, which is a logic bug rather than a data race.

### 3.4 Thread Safety

N/A — Node.js is single-threaded and the event loop serialises all synchronous code. No mutex or lock needed for in-memory structures.

### 3.5 Duplicate Games

Not possible: `tryMatch` dequeues both players (synchronously) **before** calling `createGame`. If `tryMatch` runs again before `createGame` returns (impossible in synchronous JS), dequeue would find neither player. No duplicates.

---

## 4. Game Lifecycle

### 4.1 Creation Flow

```
MatchmakingService.tryMatch
  → GameService.createGame(white.socket, black.socket, timeMs, incMs, ...)
    → new Game(player1, player2, timeMs, incMs, onEnd, onRematch, ...)
      → generates UUID gameId
      → creates Chess() board
      → creates ChessClock(timeMs, onTimeout, incMs)
      → sends INIT_GAME to player1 (white) with { color:'white', gameId, timeMs, incMs }
      → sends INIT_GAME to player2 (black)
      → clock.start() → lastMoveTime = Date.now(), scheduleTimeout()
  → games.push(game)
```

### 4.2 Move Processing Flow

```
Client → { type: "move", move: { from: "e2", to: "e4" } }
  → Zod validation (IncomingMessageSchema) — rejects if malformed
  → GameService.findGame(socket) → O(n) scan
  → Game.makeMove(socket, move):
    1. status === 'over'? → return (silent drop)
    2. Verify it's socket's turn (moveCount parity + socket identity)
    3. this.board.move(move) — chess.js validates legality, throws on illegal
    4. clock.recordMove():
       - elapsed = Date.now() - lastMoveTime
       - activeColor.time -= elapsed; activeColor.time += incrementMs
       - switch activeColor
       - lastMoveTime = Date.now()
       - clearTimeout(old); scheduleTimeout(new remaining)
    5. moveCount++
    6. Broadcast { type: "move", payload: { move, clock: snapshot } } to BOTH players
    7. board.isGameOver()? → getGameOverReason() → endGame(winner, reason)
```

### 4.3 Termination Flow

```
endGame(winner, reason):
  1. Guard: status === 'over'? return (prevents double-end)
  2. status = 'over'
  3. clock.stop() — clearTimeout
  4. Broadcast GAME_OVER to both players
  5. If any player authenticated:
     historyService.saveGame({ ... }) — async, .then(() => send RATING_UPDATE)
  6. onEnd() → GameService.removeGame(game)
```

**Risk**: Step 5 is fire-and-forget (`.then` with no `.catch` beyond the internal try/catch in `saveGame`). If `saveGame` returns `null` (DB error), ratings aren't updated but the game continues to close normally. This is intentional resilience — game outcome is not held hostage by DB availability. But it means rating updates can silently fail.

### 4.4 Cleanup Flow

```
GameService.removeGame(game):
  → this.games = this.games.filter(g => g !== game)
```

The `Game` object is then eligible for GC when no other live references exist (connected sockets, grace period closures).

**Note**: After a rematch, the old `Game` is removed from `games[]` but the rematch callback closure in `GameService.createGame` still holds a reference via `onRematch`. This reference lives as long as the new game is active. Minor but not a leak.

### 4.5 Server Crash During Game

- **All active game state is lost** — board position, clock, move history, pending requests
- The completed-game row is only written to DB when `endGame` fires. Mid-game crash = no DB record
- Players reconnecting after restart will see no active game (`findGameByUserId` returns undefined)
- Clock timeouts (`setTimeout` inside `ChessClock`) are OS-level timers — lost on crash
- Grace period timers in `SocketManager.gracePeriods` are lost
- **No recovery path exists** — this is the system's most significant reliability gap

---

## 5. Reconnection

### 5.1 Reconnect Flow

```
Client reconnects → WebSocket handshake with ?token=<JWT>
  → SocketManager.addUser(socket, req)
    → extractMeta(req): JWT verified → { userId, username }
    → gracePeriods.get(userId)? → clearTimeout, gracePeriods.delete (cancel resign timer)
    → gameService.findGameByUserId(userId) → O(n) lookup
    → if game found:
        game.replaceSocket(userId, socket) → updates player1 or player2
        socket.send(game.getResumePayload(userId)) → GAME_RESUME message
        notify opponent: GAME_ALERT "Opponent reconnected."
```

### 5.2 State Restored on Reconnect

| State                                                 | Restored? |
| ----------------------------------------------------- | --------- |
| Board position (FEN)                                  | ✅        |
| Player colour                                         | ✅        |
| Game ID                                               | ✅        |
| Clock snapshot (live remaining time for both players) | ✅        |
| Increment value                                       | ✅        |
| Opponent username                                     | ✅        |
| Move count                                            | ✅        |

### 5.3 State NOT Restored

| State                    | Not Restored | Impact                                                        |
| ------------------------ | ------------ | ------------------------------------------------------------- |
| Move history / PGN       | ✗            | Client shows no move list after reconnect                     |
| Pending draw request     | ✗            | If opponent offered draw before disconnect, client won't know |
| Pending takeback request | ✗            | Same                                                          |
| Captured pieces list     | ✗            | Client has to compute from FEN                                |

### 5.4 Wrong Game Reconnection

`findGameByUserId` returns the **first** game matching the userId. In the current model, a user can only be in one active game (they can't start a second while in one). However: if two `Game` objects somehow both reference the same userId (which shouldn't happen but has no enforcement guard), the first match wins. No cross-user contamination possible since userId comes from the verified JWT.

### 5.5 Duplicate Sockets

Not possible post-reconnect. The `close` event fires on the old socket **before** the new connection's `addUser` is called. `removeUser` removes the old socket from `users[]`. `replaceSocket` then updates `Game.player1`/`player2`. The old socket is removed from all live lookups.

---

## 6. Reliability

### 6.1 On Process Restart

Everything in memory is destroyed:

- All `GameService.games` → gone
- All `MatchmakingService.queues` → gone
- All `SocketManager.gracePeriods` timers → gone
- All `socketMeta` mappings → gone

Users connecting after restart get a fresh state. Their past **completed** games are intact in DB. Their Elo rating is intact. In-progress games are gone with no trace.

### 6.2 Data Lost on Restart

- All in-progress game state (board, clock, move history)
- Matchmaking queue membership
- Who had a pending grace period
- Pending draw / takeback / rematch negotiations

### 6.3 Features That Depend Entirely on Memory

- Active gameplay (all of it)
- Matchmaking
- Grace periods / reconnection within a server session
- Clock state
- Pending negotiation state (draw, takeback, rematch)

### 6.4 Features That Survive Restart

- User accounts (DB)
- Completed game history (DB)
- Elo ratings (DB)
- JWT validity (stateless — tokens issued before restart are still valid)

---

## 7. Database

### 7.1 Prisma Models

**`User`**
| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | Primary key |
| username | String | `@unique` |
| email | String | `@unique` |
| passwordHash | String | bcrypt |
| rating | Int | Default 1200 |
| gamesCount | Int | For K-factor calculation |
| createdAt | DateTime | |

**`Game`**
| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | Primary key |
| whitePlayerId | String? | FK → User, nullable (anonymous) |
| blackPlayerId | String? | FK → User, nullable |
| winner | String? | 'white'/'black'/null |
| reason | String | |
| pgn | String | Full PGN text |
| finalFen | String | |
| timeControlMs | Int | |
| startedAt | DateTime | |
| endedAt | DateTime | Default now() |

### 7.2 Fastest Growing Tables

`Game` — one row per completed game with two authenticated players. Grows at `concurrent_games × games_per_hour`. No archiving, partitioning, or TTL strategy. PGN strings can be 1–5 KB each.

`User` — grows with registrations. Much slower.

### 7.3 Missing Indexes

The `getUserGames` query (`HistoryService.ts`) uses:

```sql
WHERE whitePlayerId = ? OR blackPlayerId = ?
ORDER BY endedAt DESC
LIMIT 50
```

**Missing indexes:**

- `Game.whitePlayerId` — no explicit index. The FK generates one in PostgreSQL, but SQLite may not. Needs `@@index([whitePlayerId])`.
- `Game.blackPlayerId` — same.
- `Game.endedAt` — used in `orderBy`. No index. With millions of rows, this is a full table scan.

The `OR` condition across two nullable foreign keys is particularly bad: even with two separate indexes, most query planners will choose a full scan over a merge of two index results. A **covering composite index** or a separate `gameParticipant` join table would be more efficient at scale.

### 7.4 N+1 Query Risks

`getUserGames` uses `include: { whitePlayer: ..., blackPlayer: ... }`. Prisma generates a single JOIN query — **no N+1** here.

`HistoryService.saveGame` executes:

1. `prisma.game.create`
2. `Promise.all([findUnique(white), findUnique(black)])`
3. `Promise.all([update(white), update(black)])`

Four DB round-trips per game save. No N+1, but no transaction either — see §7.5.

### 7.5 Operations That Should Be Transactions

**`HistoryService.saveGame`** — currently:

1. Creates game row
2. Reads both user ratings
3. Computes new ratings
4. Updates both user rows

If the server crashes after step 1 but before step 4, the game is recorded but neither user's rating is updated. If one of the two user updates (step 4) fails, ratings become asymmetric (white updated, black not).

**Fix**:

```ts
await prisma.$transaction(async (tx) => {
  await tx.game.create({ ... });
  const [white, black] = await Promise.all([tx.user.findUnique(...), tx.user.findUnique(...)]);
  // compute Elo
  await Promise.all([tx.user.update(...), tx.user.update(...)]);
});
```

---

## 8. Security

### 8.1 JWT Vulnerabilities

| Issue                                              | Severity     | Location                                                                                                                                         |
| -------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default secret `'dev-secret-change-in-production'` | **Critical** | `config/env.ts` — if `JWT_SECRET` env var is not set in production, any attacker can forge tokens                                                |
| Token sent as query string `?token=JWT`            | High         | `SocketManager.ts extractMeta` + `useSocket.ts` on frontend — appears in server access logs, browser history, nginx/proxy logs, referrer headers |
| No token revocation / blacklist                    | Medium       | A stolen token is valid for 7 days with no kill switch                                                                                           |
| No token rotation                                  | Low          | Once issued, same token for full 7-day lifespan                                                                                                  |

### 8.2 Missing Validation

| Issue                                                                                              | Location                           |
| -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `timeControlMs` accepts **any positive integer** in Zod schema — client can request a 27-hour game | `shared/schemas/message.schema.ts` |
| `incrementMs` has no upper bound                                                                   | Same file                          |
| Move `from`/`to` validated as `length(2)` but not as valid square notation (a1–h8)                 | Same file — `MovePayloadSchema`    |
| Password policy: only `min(6)` — no complexity requirement                                         | `authRouter.ts RegisterSchema`     |
| No username sanitisation beyond regex — `admin`, `system` etc. can be registered                   | `authRouter.ts RegisterSchema`     |

**Fix for time control**: validate against the whitelist:

```ts
timeControlMs: z.number()
  .int()
  .refine((v) => TIME_CONTROLS.some((tc) => tc.baseMs === v), 'Invalid time control')
  .optional();
```

### 8.3 Missing Authorization Checks

| Endpoint                   | Issue                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/users/:id/games` | Requires auth, but **any** authenticated user can fetch **any** user's games — no `req.userId === req.params.id` check                       |
| `GET /api/games/:id`       | Returns full game data including both players' info to any authenticated user — no ownership check                                           |
| WS moves                   | Validated by socket identity (player1/player2), not by userId — correct post-reconnect, but relies on `replaceSocket` being called correctly |

### 8.4 WebSocket Attack Vectors

| Vector                                     | Risk                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| No message rate limiting                   | A client can send thousands of moves/messages per second, flooding the server                               |
| No max message size on `WebSocketServer`   | `new WebSocketServer({ server: httpServer })` with no `maxPayload` — large JSON payloads can exhaust memory |
| Token in query string                      | Logged by any proxy, load balancer, or CDN sitting in front                                                 |
| No origin check                            | WS doesn't use CORS, but no `verifyClient` hook checking `req.headers.origin`                               |
| Repeated `INIT_GAME` during async DB fetch | The duplicate-socket scenario in §3.2 — a user can occupy two queue slots                                   |

**Fix for max payload**:

```ts
new WebSocketServer({ server: httpServer, maxPayload: 4096 }); // 4 KB is plenty for chess messages
```

### 8.5 Abuse Scenarios

| Scenario                                                                                      | Mitigation Exists?                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Rating farming: create alt accounts, lose intentionally                                       | No — no abuse detection                                                         |
| Brute force login: no rate limiting on `POST /api/auth/login`                                 | No                                                                              |
| Brute force registration                                                                      | No                                                                              |
| Endless reconnect cycles: connect → disconnect → reconnect every 29s → opponent stuck forever | Partial — grace period only runs once per disconnect cycle; opponent is alerted |
| Slow-move stalling: valid moves made just before clock runs out each time                     | By design — clocks handle this                                                  |
| Two-tab double queue                                                                          | See §3.2 — possible                                                             |

---

## 9. Performance

### 9.1 Biggest Bottlenecks

1. **All game lookups are O(n) linear scans** — `findGame`, `findGameById`, `findGameByUserId` all iterate `GameService.games`. With 10,000 concurrent games, each move message triggers an O(n) scan.
2. **Missing DB indexes** on `Game(whitePlayerId, blackPlayerId, endedAt)` — `getUserGames` does a full table scan as the `Game` table grows.
3. **No horizontal scaling** — single-process; adding a second instance would split game state between processes.

### 9.2 O(n) Operations

| Operation           | Location                               | Data Structure              |
| ------------------- | -------------------------------------- | --------------------------- |
| Find game by socket | `GameService.findGame`                 | `Game[]`                    |
| Find game by userId | `GameService.findGameByUserId`         | `Game[]`                    |
| Find game by gameId | `GameService.findGameById`             | `Game[]`                    |
| Remove game         | `GameService.removeGame`               | `Game[]` filter             |
| Find queue entry    | `MatchmakingService.findEntryBySocket` | `Map<string, QueueEntry[]>` |
| tryMatch scan       | `MatchmakingService.tryMatch`          | `QueueEntry[]` per bucket   |
| Remove from users   | `SocketManager.removeUser`             | `WebSocket[]` filter        |

**Fix**: Replace `Game[]` with three Maps:

```ts
private gamesById:     Map<string,   Game> = new Map(); // O(1) by gameId
private gamesBySocket: Map<WebSocket, Game> = new Map(); // O(1) by socket
private gamesByUserId: Map<string,   Game> = new Map(); // O(1) by userId
```

### 9.3 Expensive DB Operations

| Operation                                  | Cost                                                        |
| ------------------------------------------ | ----------------------------------------------------------- |
| `saveGame`                                 | 4 separate DB round-trips (could be 1 transaction)          |
| `getUserGames` with JOIN                   | Single query but full scan without index                    |
| `handleInitGameAsync` on every `INIT_GAME` | 1 DB query per matchmaking attempt — acceptable for now     |
| `Promise.all` user updates in `saveGame`   | 2 concurrent UPDATE statements — fine but not transactional |

### 9.4 Memory Issues

- Each `Game` holds a `chess.js Chess` instance (~20–50KB including move history) + two `WebSocket` references + PGN string + metadata. Estimate ~100KB per active game.
- 10,000 concurrent games ≈ ~1 GB RAM just for game objects.
- One `setInterval` per queued player. 1,000 queued players = 1,000 intervals. Minor overhead but adds GC pressure.
- No limit on concurrent games or queue size.
- `SocketManager.users: WebSocket[]` — O(n) append and O(n) filter. With 20,000 connections, filter on disconnect is measurable.

---

## 10. Production Readiness Scores

### Architecture: **6 / 10**

**Strengths**: Clear module separation designed for future microservice extraction. Zod validation on all WS input. Single source of truth for message types. Pino structured logging. Server-authoritative clock. Modular monolith is the right pattern for this stage.

**Weaknesses**: `Game.ts` is a god class mixing domain logic, socket I/O, DB triggers, and reconnection. `SocketManager.ts` mixes auth, routing, and DB access. `HistoryService.ts` bundles Elo into persistence. Cross-module singleton imports (`historyService` imported directly into `Game.ts`) prevent clean extraction. `types.ts` has dead code.

---

### Reliability: **4 / 10**

**Strengths**: Reconnection grace period (30s) handles network hiccups. `safeSend` prevents crashes on closed sockets. `endGame` double-call guard.

**Weaknesses**: **A single process restart destroys all active games** — no Redis or external state store. `saveGame` is not transactional — crash mid-save can leave ratings inconsistent. DB errors in `saveGame` are silently swallowed (log + return null). No circuit breaker around DB calls. No health check that accounts for DB connectivity. Clock state is purely in-memory. This would be a critical issue in any production chess platform.

---

### Security: **4 / 10**

**Strengths**: JWT authentication. Zod validation prevents most injection paths. bcrypt password hashing at cost 10. Pino logs provide audit trail.

**Weaknesses**: JWT token in query string leaks to server/proxy logs. Default JWT secret in source code. No rate limiting anywhere (login brute force, WS message flood). No max WebSocket payload size. Any user can read any user's game history. `timeControlMs` / `incrementMs` accept arbitrary integers. No token revocation. These gaps are acceptable for a dev environment but are blockers for public production.

---

### Performance: **6 / 10**

**Strengths**: Server-authoritative clock eliminates client drift. Timestamp-based clock display (just implemented) is correct. Matchmaking expands window gradually rather than brute-force. Pino is a high-performance logger.

**Weaknesses**: All core lookups are O(n) linear scans over arrays. Missing DB indexes. `saveGame` is 4 round-trips without a transaction. No caching layer. With ~1,000 concurrent games the O(n) lookups are still fast enough (~0.1ms), but they're an invisible time bomb as load increases.

---

### Scalability: **2 / 10**

**Strengths**: Clean modular design means extraction to microservices is architecturally planned. SQLite is already abstracted behind Prisma (swap to PostgreSQL is a one-line change).

**Weaknesses**: Fundamentally a single-process, single-instance system. All game state is in process memory. No Redis for cross-instance state sharing. No sticky session support (a reconnecting user must hit the same server instance or the game is not found). No load balancer configuration. No horizontal pod autoscaling path. This is entirely appropriate for the current development stage but is **the entire scalability plan** — nothing exists yet.

---

## 11. Priority Fix List

Ranked by impact vs. effort:

### P0 — Critical (fix before public launch)

1. **JWT secret enforcement**: Add startup check — `if (config.jwtSecret === 'dev-secret...') throw Error(...)` in production
2. **Transactional `saveGame`**: Wrap `game.create` + `user.update` × 2 in `prisma.$transaction()`
3. **WebSocket max payload**: Add `maxPayload: 8192` to `WebSocketServer` constructor
4. **Rate limiting**: Add `express-rate-limit` on `/api/auth/login` and `/api/auth/register`

### P1 — High (fix within first sprint after launch)

5. **O(1) game lookups**: Replace `Game[]` with three `Map` structures in `GameService`
6. **DB indexes**: Add `@@index([whitePlayerId])`, `@@index([blackPlayerId])`, `@@index([endedAt])` to `Game` model
7. **Authorization check**: `GET /api/users/:id/games` should verify `req.userId === req.params.id` (or admin role)
8. **Time control whitelist**: Zod schema for `INIT_GAME` should validate `timeControlMs` against `TIME_CONTROLS` array
9. **Double-queue fix**: Add `userId → QueueEntry` Map in `MatchmakingService` to prevent same user occupying two queue slots

### P2 — Medium (next phase)

10. **Extract `RatingService`**: Move Elo logic out of `HistoryService` into `modules/rating/RatingService.ts`
11. **Remove direct `prisma` import from `SocketManager`**: Move the rating fetch into a method on `GameService` or a new `UserService`
12. **`PlayerSession` value object**: Consolidate (socket, userId, username) into a typed struct to reduce 8-arg constructors
13. **JWT in WS handshake body**: Change frontend to send token as first WS message, not query string
14. **Pending state in `getResumePayload`**: Include whether a draw/takeback offer is pending so client can restore correct UI state

### P3 — Deferred (Phase 5+)

15. **Redis for active game state**: Enables crash recovery, multiple instances, horizontal scaling
16. **PostgreSQL + connection pooling**: Required for production load (SQLite is single-writer)
17. **`GameEventEmitter`**: Replace `onEnd`/`onRematch` callbacks with an event emitter for cleaner decoupling
18. **Move history in resume payload**: Send full move list on `GAME_RESUME` so client can display move notation

---

_Review conducted against commit state as of 2026-06-21. Re-run after P0/P1 fixes are applied._
