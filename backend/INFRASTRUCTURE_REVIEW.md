# ChessClub Backend — Infrastructure Readiness Review

> Principal-engineer-level audit covering logging, monitoring, containerisation, Redis, scaling, and failure modes.  
> Companion to `PRODUCTION_REVIEW.md` (architecture/security/performance).  
> All findings reference exact files and classes.

---

## Table of Contents

1. [Logging](#1-logging)
2. [Monitoring](#2-monitoring)
3. [Docker](#3-docker)
4. [Redis](#4-redis)
5. [Scaling Analysis](#5-scaling-analysis)
6. [Failure Scenarios](#6-failure-scenarios)
7. [Operational Readiness](#7-operational-readiness)
8. [Prioritised Roadmap](#8-prioritised-roadmap)

---

## 1. Logging

### 1.1 What Is Currently Logged

All logging goes through `shared/utils/logger.ts` (Pino). The following events are instrumented:

| Event                              | Level    | File                                    | Fields                                              |
| ---------------------------------- | -------- | --------------------------------------- | --------------------------------------------------- |
| Server started                     | info     | `server.ts`                             | `port`, `env`                                       |
| User connected                     | info     | `SocketManager.addUser`                 | `totalUsers`, `authenticated`                       |
| User disconnected                  | info     | `SocketManager.removeUser`              | `totalUsers`                                        |
| Grace period started               | info     | `SocketManager.removeUser`              | `gameId`, `userId`                                  |
| Grace period cancelled (reconnect) | info     | `SocketManager.addUser`                 | `userId`                                            |
| Grace period expired → resign      | info     | `SocketManager` timeout callback        | `gameId`, `userId`                                  |
| Game resumed (reconnect)           | info     | `SocketManager.addUser`                 | `gameId`, `userId`                                  |
| Player queued                      | info     | `MatchmakingService.handleInitGame`     | `baseTimeMs`, `incrementMs`, `rating`, `userId`     |
| Matchmaking success                | info     | `MatchmakingService.tryMatch`           | `baseTimeMs`, `incrementMs`, `ratingDiff`, `window` |
| Pending user removed on disconnect | info     | `MatchmakingService.removePendingUser`  | `userId`                                            |
| Game created                       | info     | `Game` constructor                      | `gameId`, `timeControlMs`                           |
| Move made                          | info     | `Game.makeMove`                         | `gameId`, `move`, `moveCount`                       |
| Invalid move                       | warn     | `Game.makeMove`                         | `gameId`, `move`, `error`                           |
| Player resigned                    | info     | `Game.resign`                           | `gameId`, `winner`                                  |
| Draw requested                     | info     | `Game.requestDraw`                      | `gameId`                                            |
| Draw rejected                      | info     | `Game.rejectDraw`                       | `gameId`                                            |
| Takeback requested                 | info     | `Game.requestTakeback`                  | `gameId`                                            |
| Takeback accepted                  | info     | `Game.acceptTakeback`                   | `gameId`, `moveCount`                               |
| Takeback rejected                  | info     | `Game.rejectTakeback`                   | `gameId`                                            |
| Rematch requested                  | info     | `Game.requestRematch`                   | `gameId`                                            |
| Rematch rejected                   | info     | `Game.rejectRematch`                    | `gameId`                                            |
| Game ended                         | info     | `Game.endGame`                          | `gameId`, `winner`, `reason`                        |
| Game saved to DB                   | info     | `HistoryService.saveGame`               | `gameId`                                            |
| Ratings updated                    | info     | `HistoryService.saveGame`               | `gameId`, `whiteChange`, `blackChange`              |
| Game save failed                   | error    | `HistoryService.saveGame`               | `err`, `gameId`                                     |
| Invalid message shape              | warn     | `SocketManager.handleMessages`          | `errors` (Zod issues)                               |
| Init game error                    | error    | `SocketManager.handleInitGameAsync`     | `err`                                               |
| Invalid JSON                       | implicit | `SocketManager.handleMessages`          | none (via `sendError`)                              |
| WS error (game method throws)      | error    | `errorHandler.handleWsError`            | `error`                                             |
| User registered                    | info     | `authRouter.ts`                         | `userId`, `username`                                |
| User logged in                     | info     | `authRouter.ts`                         | `userId`                                            |
| Register/login errors              | error    | `authRouter.ts`                         | `err`                                               |
| Game cleaned up                    | info     | `GameService.createGame` onEnd callback | `gameId`                                            |

### 1.2 What Should Be Logged (Missing)

#### Business Events

| Missing Event                                                  | Why It Matters                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Login failure** (wrong password)                             | Brute-force detection; currently only success is logged                              |
| **Token verification failure** (bad/expired JWT on WS connect) | Security audit trail; currently the `catch {}` in `extractMeta` is completely silent |
| **Anonymous vs authenticated game started**                    | Needed to track engagement quality                                                   |
| **Game duration** (startedAt → endedAt delta)                  | P50/P95 game length is a key product metric                                          |
| **Draw/takeback/rematch outcome** (accepted vs rejected)       | Understanding player behaviour                                                       |
| **Rating change per game**                                     | Useful at `debug` level for audit                                                    |
| **Matchmaking wait time** (enqueuedAt → matched delta)         | Primary UX metric for matchmaking health                                             |
| **Queue depth per time control**                               | Operations visibility into player demand                                             |
| **User logout / token expiry**                                 | Session hygiene                                                                      |
| **Concurrent active games count** (periodic)                   | Server health snapshot                                                               |
| **Memory usage** (periodic)                                    | Ops baseline                                                                         |

#### Operational Events

| Missing Event                                        | Why It Matters                                         |
| ---------------------------------------------------- | ------------------------------------------------------ |
| **DB connection established/lost**                   | First thing on-call checks                             |
| **DB query latency > threshold**                     | Slow query alerting                                    |
| **WS connection rejected** (max payload, rate limit) | Attack detection                                       |
| **Grace period count** (concurrent disconnects)      | Flood detection                                        |
| **Process startup duration**                         | Deployment health                                      |
| **Unhandled promise rejection**                      | Would currently crash silently if no top-level handler |

#### What `process.on('unhandledRejection')` Currently Emits

Nothing — there is no global handler in `server.ts`. An unhandled rejection in a `.then` chain will emit a warning (Node 15+) or silently swallow (older Node). Add:

```ts
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'unhandled_promise_rejection');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught_exception');
  process.exit(1);
});
```

### 1.3 Structural Logging Gaps

**Missing request ID / correlation ID**: There is no `requestId` or `correlationId` threaded through a game's lifecycle. When a bug report arrives for `gameId: X`, you can grep the logs — but there is no way to trace a single user's full session (connect → queue → game → moves → disconnect) as a unified trace without manually correlating `gameId` and `userId` across multiple log lines.

**Log levels are not well-calibrated**:

- Every move is logged at `info` — on a busy server this is thousands of lines/minute of noise. Moves should be `debug`.
- Takeback/draw/rematch negotiation at `info` — should be `debug`.
- Auth endpoints log at `info` for success — correct.
- `logger.error(err, 'login_error')` in `authRouter` has the **wrong argument order** for Pino: it should be `logger.error({ err }, 'login_error')`. The current form passes the error as the message object and the string as a second arg, which Pino accepts but the structured fields are lost.

---

## 2. Monitoring

### 2.1 Metrics That Should Exist

#### Infrastructure Metrics (from the OS/runtime)

- **CPU usage** — % per process, % per core
- **Memory** — heap used, heap total, RSS, external
- **Event loop lag** — P50/P95/P99 milliseconds (critical for Node.js: tells you when the event loop is blocked)
- **Active handles / requests** — Node.js internals
- **GC pause duration** — P95 milliseconds

#### Application Metrics

| Metric                        | Type      | Labels                                    |
| ----------------------------- | --------- | ----------------------------------------- |
| `ws_connections_total`        | Counter   | `authenticated: bool`                     |
| `ws_connections_active`       | Gauge     |                                           |
| `games_active`                | Gauge     |                                           |
| `games_created_total`         | Counter   | `time_control`                            |
| `games_ended_total`           | Counter   | `reason` (checkmate/resign/timeout/draw…) |
| `game_duration_seconds`       | Histogram | `time_control`                            |
| `moves_total`                 | Counter   |                                           |
| `matchmaking_queue_depth`     | Gauge     | `time_control`                            |
| `matchmaking_wait_seconds`    | Histogram | `time_control`                            |
| `matchmaking_rating_diff`     | Histogram | `time_control`                            |
| `reconnects_total`            | Counter   |                                           |
| `grace_periods_active`        | Gauge     |                                           |
| `grace_periods_expired_total` | Counter   |                                           |
| `db_query_duration_seconds`   | Histogram | `operation`                               |
| `auth_attempts_total`         | Counter   | `result: success/failure`                 |
| `rating_updates_total`        | Counter   |                                           |

### 2.2 Metrics Currently Available

**None** — there is no metrics endpoint, no Prometheus exporter, no StatsD client, no APM agent. The only observability signal is structured log output to stdout.

Pino logs provide raw data that _could_ be extracted by a log aggregator (e.g., Loki + promtail), but there are no explicit metric counters, gauges, or histograms anywhere in the codebase.

### 2.3 Dashboards That Should Be Created

**Dashboard 1 — Server Health**

- Active WS connections (gauge, over time)
- Event loop lag P95 (line chart — alert if > 50ms)
- Memory RSS (line chart — alert if > 80% of container limit)
- CPU % (line chart)
- Unhandled rejections / uncaught exceptions (counter — alert on any)

**Dashboard 2 — Game Activity**

- Active games (gauge)
- Games started / ended per minute (rate)
- Game end reason breakdown (pie: checkmate/resign/timeout/draw)
- Move rate (moves/min — sudden drop = problem)
- Average game duration by time control (histogram P50/P95)

**Dashboard 3 — Matchmaking**

- Queue depth per time control (gauge, stacked)
- Matchmaking wait time P50/P95 (line chart)
- Rating difference at match (histogram — high diff = queue expanding too fast)
- Match success rate (% of queued players matched within 60s)

**Dashboard 4 — Reliability**

- Grace periods active (gauge)
- Reconnect success rate (reconnects where game was resumed / all reconnects)
- DB query latency P95 by operation
- DB errors (counter — alert on any)

**Dashboard 5 — User Activity**

- Registrations per hour
- Logins per hour
- Failed logins per hour (alert if spike → brute force)
- Unique users with active games

**Recommended stack**: Prometheus (metrics scrape) + Grafana (dashboards) + Loki (log aggregation) + Alertmanager (paging). Add `prom-client` (Node.js) for instrumentation.

---

## 3. Docker

### 3.1 Is Docker Present?

**No.** There is no `Dockerfile`, no `docker-compose.yml`, no `.dockerignore`, no container registry configuration anywhere in the repository.

### 3.2 Missing Containerisation

**Backend `Dockerfile`** (minimum viable):

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npx tsc --outDir dist

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

**Missing items:**

- No `Dockerfile` (backend)
- No `Dockerfile` (frontend — Nginx serving Vite build)
- No `.dockerignore` — `node_modules`, `.env`, `*.db` files would be included in the build context
- No multi-stage build to separate builder from runtime
- No non-root user (`USER node`) — container runs as root, security risk
- No health check instruction (`HEALTHCHECK CMD curl -f http://localhost:8080/api/health || exit 1`)
- `ts-node` is used as the start command (`npm start`) — compiling TypeScript at runtime in production is wasteful and fragile

### 3.3 Missing Compose Setup

A production-representative `docker-compose.yml` should include:

```yaml
services:
  backend:
    build: ./backend
    ports: ['8080:8080']
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://chess:chess@postgres:5432/chessclub
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }

  frontend:
    build: ./frontend
    ports: ['80:80']
    depends_on: [backend]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: chessclub
      POSTGRES_USER: chess
      POSTGRES_PASSWORD: chess
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U chess']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --save 60 1 --loglevel warning
    volumes: [redis_data:/data]
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

  prometheus:
    image: prom/prometheus
    volumes: [./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml]

  grafana:
    image: grafana/grafana
    ports: ['3000:3000']

volumes:
  postgres_data:
  redis_data:
```

**Missing items in current repo:**

- No `docker-compose.yml`
- No `docker-compose.override.yml` (dev overrides with hot reload)
- No `monitoring/prometheus.yml` scrape config
- No Grafana dashboard JSON exports
- No `.env.example` for Docker-specific vars (DATABASE_URL pointing to postgres container, not `file:./dev.db`)
- No Prisma migration entrypoint — migrations must run before the app starts; no `migrate-and-start.sh` script
- No graceful shutdown handler — `SIGTERM` from Docker will kill the process mid-game

**Missing graceful shutdown** (critical for Docker):

```ts
// server.ts
process.on('SIGTERM', async () => {
  logger.info('sigterm_received_shutting_down');
  // Stop accepting new WS connections
  wss.close();
  // Close HTTP server (stop accepting new HTTP)
  httpServer.close(async () => {
    // Disconnect Prisma
    await prisma.$disconnect();
    logger.info('graceful_shutdown_complete');
    process.exit(0);
  });
});
```

Without this, `docker stop` sends SIGTERM, Node ignores it (default), Docker waits 10s, then sends SIGKILL — abrupt termination mid-transaction.

---

## 4. Redis

### 4.1 Would Redis Help?

**Yes, significantly** — Redis solves the three biggest architectural gaps in one go:

1. **Game state persistence across restarts**
2. **Horizontal scaling across multiple backend instances**
3. **Shared matchmaking queue across instances**

### 4.2 Which Features Benefit from Redis

| Feature                            | Current                                   | With Redis                                                 |
| ---------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| Active game state                  | In process memory — lost on restart       | Persisted in Redis HASH — survives restart                 |
| Matchmaking queue                  | In process memory — single instance       | Redis LIST/SORTED SET — shared across instances            |
| Grace periods / reconnection       | `setTimeout` in process — lost on restart | Redis key with TTL — persists across instances             |
| Session/token blacklist            | Not implemented                           | Redis SET with TTL per token                               |
| Rate limiting (login, WS messages) | Not implemented                           | Redis + `rate-limiter-flexible` library                    |
| Pub/Sub for game events            | Not applicable for single instance        | Redis Pub/Sub enables WebSocket broadcast across instances |
| Clock checkpoint                   | In process — lost on restart              | Redis HASH with last snapshot timestamp                    |

**Redis data model for active games:**

```
HASH chess:game:{gameId}
  fen           "rnbqkbnr/pppppppp/..."
  whiteUserId   "clx..."
  blackUserId   "clx..."
  whiteClock    "543210"        ← ms remaining
  blackClock    "598000"
  activeColor   "white"
  lastMoveAt    "1718960400000" ← epoch ms
  incrementMs   "5000"
  moveCount     "12"
  status        "active"
  pgn           "1. e4 e5 2. ..."
  TTL → 2 hours (auto-expire abandoned games)

SET chess:user:{userId}:activeGame → {gameId}  (TTL 2h)
SET chess:grace:{userId} → {gameId}  (TTL 30s)
```

### 4.3 Is Redis Currently Necessary?

**Not yet — for a single-server deployment under ~1,000 concurrent users.** The current in-memory approach works perfectly for one instance. Redis becomes necessary when:

- You need **more than one backend instance** (load balancing)
- You need **crash recovery** for active games
- You need **rate limiting** (security requirement for production)
- You need **token blacklisting** (user account security)

**Redis is not optional for production at scale.** It is optional for the current development/MVP stage.

---

## 5. Scaling Analysis

### 5.1 At 100 Concurrent Users

**Fully handled by current architecture.**

- ~50 active games at a time
- `Game[]` linear scans: 50 iterations = ~5µs, imperceptible
- SQLite handles read/write load easily
- Single process, single core is sufficient
- Memory: ~5MB for games, minimal DB size
- No bottlenecks

**What to watch:** Nothing breaks. This is comfortable headroom.

---

### 5.2 At 1,000 Concurrent Users

**Strains begin to appear — most are manageable.**

| Concern                                      | Impact                                                                                                                                        | Severity   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `GameService.games[]` linear scan            | ~500 games → each move triggers O(500) scan. At 10 moves/sec across all games = 5,000 scans/sec. ~0.5ms total CPU. Acceptable but measurable. | Medium     |
| SQLite single writer                         | Concurrent `saveGame` calls (game ends) queue behind single writer lock. At 50 concurrent game ends, some wait up to ~500ms.                  | Medium     |
| `SocketManager.users[]` filter on disconnect | ~1,000 sockets, O(1000) filter per disconnect. With 10 disconnects/sec = 10,000 iterations/sec. Measurable but not critical.                  | Low–Medium |
| `setInterval` per queued player              | ~100 queued players = 100 active intervals. Minor GC pressure.                                                                                | Low        |
| Memory                                       | ~500 games × 100KB = ~50MB. Node default heap limit is 1.4GB. Fine.                                                                           | Low        |
| Pino logging every move at `info`            | ~5,000 log lines/sec at peak. stdout I/O becomes a bottleneck if piped to a synchronous consumer. Use async Pino transport.                   | Medium     |

**First thing to fix at 1,000 users:**

1. Replace `Game[]` with Maps (O(1) lookups)
2. Switch SQLite → PostgreSQL
3. Move `info`-level move logs to `debug`

---

### 5.3 At 10,000 Concurrent Users

**Multiple things break simultaneously.**

| What Breaks                                  | Why                                                                                                                                            | Fix                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Single process saturates one CPU core**    | Node.js is single-threaded. At ~5,000 games, message processing, clock callbacks, and matchmaking scans share one core. Event loop lag spikes. | Cluster mode (`node:cluster`) or multiple instances behind a load balancer |
| **O(n) lookups become critical**             | 5,000 games × O(n) per move = unacceptable latency. Move processing P99 > 100ms.                                                               | Map-based lookups (O(1)) — this fix alone buys a lot of headroom           |
| **SQLite collapses**                         | SQLite has no connection pooling and a single writer. At 10,000 users, concurrent writes are serialised. P99 write latency > 1 second.         | PostgreSQL + PgBouncer                                                     |
| **Single instance is a SPOF**                | One server crash = 5,000 games lost simultaneously                                                                                             | Multiple instances + Redis for shared state                                |
| **Matchmaking queue degrades**               | With 500 queued players per time control, `tryMatch` O(queue) runs every 10s per player. = 250,000 comparisons/sec at peak.                    | Index queue by rating range (sorted set)                                   |
| **Memory**                                   | 5,000 games × 100KB = 500MB. Close to container limits if provisioned at 1GB.                                                                  | Increase container memory limit; also reduces garbage in Game objects      |
| **`setInterval` pollution**                  | 500 queued players × 3 time controls = 1,500 intervals. Minor but contributes to GC pause.                                                     | Replace expansion intervals with a global matchmaking ticker               |
| **Log volume**                               | 50,000+ log lines/sec at peak. stdout is a bottleneck.                                                                                         | Async Pino transport + log sampling for debug-level events                 |
| **Missing indexes devastate `getUserGames`** | As `Game` table reaches millions of rows, unindexed `WHERE whitePlayerId OR blackPlayerId` → full table scan. History page becomes unusable.   | Add indexes immediately                                                    |

**What breaks first at 10,000 users, in order:**

1. Single-core CPU saturation (event loop lag spikes to seconds)
2. SQLite write serialisation (DB becomes the bottleneck)
3. O(n) game lookups (latency compounds under load)
4. Memory pressure if container is under-provisioned
5. Log I/O becomes a bottleneck
6. Missing DB indexes make history queries unusable

---

## 6. Failure Scenarios

### 6.1 Database Down

**During startup**: `prisma.user.findUnique` in `handleInitGameAsync` will throw. The `.catch` handler in `SocketManager` calls `sendError(socket, 'Failed to join matchmaking')`. Authenticated users cannot enter matchmaking. Anonymous users (no DB query needed) can still queue and play. Auth REST endpoints (`/api/auth/*`) fail with 500.

**Mid-game**: Has no immediate impact — active games are in-memory and need no DB until they end. The clock, moves, and game logic all continue normally.

**On game end**: `historyService.saveGame` will fail. The catch block logs the error and returns `null`. The game ends correctly for both players. Ratings are **not updated**. The game is **not recorded**. This is a silent data loss event — players see no error message, but their rating doesn't change.

**Current behaviour summary**: Graceful degradation for in-flight games; silent data loss on completion; blocked matchmaking for authenticated users.

**What's missing**: No DB health check on startup that prevents the server from accepting connections when DB is unreachable. No retry logic in `saveGame`. No dead-letter queue for failed saves. No player notification that "game was played but rating update failed."

---

### 6.2 Redis Down

**Not applicable** — Redis is not currently used. This section describes what would happen _after_ Redis is added.

With a Redis-backed architecture, Redis going down would affect:

- Game state lookups (if Redis is authoritative) → all reconnections fail
- Matchmaking shared queue → falls back to per-instance queue (players only matched within same instance)
- Grace period keys → 30s reconnect window lost; disconnecting players resign immediately
- Rate limiting → bypassed if Redis is down (fail-open is safer than deny-all for chess)
- Token blacklist → bypassed (fail-open)

**Redis should be configured as a non-required dependency for active gameplay** — use `try/catch` around all Redis calls and fall back to in-memory state. Redis unavailability should degrade to single-instance mode, not crash the server.

---

### 6.3 Process Restart

This is the **most severe failure scenario** for the current architecture.

**Immediate consequences**:

- All active games (board state, clocks) are gone
- All matchmaking queues are empty
- All grace period timers are cancelled — players who were mid-grace-period now have no game to reconnect to
- All pending draw/takeback/rematch negotiations are lost

**User experience**:

- Connected players receive a WebSocket `close` event immediately
- On reconnect, `findGameByUserId` returns `undefined` — `GAME_RESUME` is never sent
- Players see the initial "Play Now" screen with no indication of what happened
- No message explaining the outage

**Data consequences**:

- Any game not yet completed is **not recorded in DB**
- Ratings not updated for in-progress games
- No way to reconstruct what happened

**What's missing**:

- Graceful shutdown handler (`SIGTERM` → stop accepting moves → save all active game states to Redis/DB → exit)
- In-progress game checkpoint (FEN + clock) saved to Redis on every move
- Startup recovery scan: on boot, find all Redis game keys with status = 'active', restore Game objects

---

### 6.4 Network Partition

A network partition separates the backend process from either the database or from some clients.

**Backend ↔ Client partition** (player loses internet):

- WebSocket `close` event fires on server side → `removeUser` → grace period starts
- If partition resolves within 30s: reconnect works, game resumes
- If partition lasts > 30s: grace timer expires → resign → game over
- **Problem**: The 30s grace timer cannot be adjusted per-user or per-game. A player on a slow mobile network in a long game loses a well-played position to a 30s timer.

**Backend ↔ Database partition**:

- New matchmaking requests for authenticated users fail (DB query in `handleInitGameAsync`)
- Game endings silently lose data (saveGame fails, catch returns null)
- Auth REST endpoints fail
- In-progress games are unaffected
- No circuit breaker — the server keeps retrying DB calls on every game end, potentially flooding the DB with retries when it recovers

**Backend ↔ Load balancer** (for multi-instance future):

- Without Redis-backed session state, a reconnecting player may hit a different backend instance that doesn't have their game → appears as "no active game" → no resume

**What's missing**:

- Configurable grace period (game-level or user-level)
- Circuit breaker pattern around DB calls (`opossum` or `cockatiel`)
- Retry queue for failed `saveGame` calls (in-memory buffer with retry on DB recovery)
- Health endpoint that returns 503 when DB is unreachable

---

### 6.5 User Reconnect Storm

Scenario: server restarts, all 1,000 connected users attempt to reconnect simultaneously within seconds.

**What happens**:

1. All WebSocket handshakes arrive at once
2. Each handshake triggers `addUser`, which calls `extractMeta` (synchronous JWT verify — fast)
3. Each authenticated user triggers `findGameByUserId` — O(n) scan over `games[]`
4. Since server just restarted, `games[]` is empty — all scans return immediately
5. All users get a fresh connection with no active game

**Actual problem**: The reconnect storm itself is not catastrophic for an empty games array. But each `addUser` also adds to `users[]` which is a simple push — O(1). No bottleneck here.

**The real concern**: if Redis-backed game recovery is added in the future, each reconnect would trigger a Redis GET + potentially a game object reconstruction. 1,000 Redis GETs in burst → manageable (Redis handles 100k+ ops/sec).

**Current gap**: There is no connection backpressure or concurrency limit on WS handshakes. `WebSocketServer` accepts all connections synchronously. Under extreme load, the event loop could saturate during handshake processing before any game logic runs. Add `verifyClient` with a connection count gate:

```ts
new WebSocketServer({
  server: httpServer,
  maxPayload: 8192,
  verifyClient: ({ req }, cb) => {
    if (socketManager.connectionCount() > MAX_CONNECTIONS) {
      cb(false, 503, 'Server at capacity');
    } else {
      cb(true);
    }
  },
});
```

---

## 7. Operational Readiness

### 7.1 What Would Prevent Deployment Today

The following are **hard blockers** — the application cannot be safely deployed to a public internet environment without addressing these:

#### Blocker 1: No Graceful Shutdown

`SIGTERM` from a container orchestrator (Kubernetes, Docker Compose `down`) kills the process immediately. Mid-game = game lost. Mid-DB write = possible corruption. **Severity: Critical.**

#### Blocker 2: JWT Secret Defaults to Source Code String

`config/env.ts`: `jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production'`. If `JWT_SECRET` is not set in the deployment environment, anyone who reads the source code (or guesses it) can forge tokens for any user. **Severity: Critical.**

#### Blocker 3: No Rate Limiting on Auth Endpoints

`POST /api/auth/login` accepts unlimited requests. Automated brute-force of passwords is unrestricted. **Severity: Critical.**

#### Blocker 4: No HTTPS/WSS

Currently runs on `ws://` and `http://`. On any non-localhost deployment, credentials and JWT tokens are transmitted in plaintext. Requires TLS termination (nginx reverse proxy, Cloudflare, or AWS ALB). **Severity: Critical.**

#### Blocker 5: SQLite in Production

SQLite has a single writer, no connection pooling, no replication. File-based storage means it cannot survive a container with ephemeral filesystem. **Severity: Critical for any persistent deployment.**

#### Blocker 6: No `unhandledRejection` / `uncaughtException` Handler

An unhandled promise rejection in any `.then` chain (e.g., a Prisma call that throws unexpectedly) will print a deprecation warning (Node 15+) or crash silently (older). There is no global safety net in `server.ts`. **Severity: High.**

#### Blocker 7: No Health Check Endpoint That Reflects Real State

`GET /api/health` returns `{ status: 'ok' }` always, even if the database is down. A load balancer or Kubernetes liveness probe cannot distinguish a healthy server from one with a broken DB connection. **Severity: High.**

#### Blocker 8: Token in WebSocket Query String

`?token=JWT` appears in nginx/server access logs, browser history, and `Referer` headers. In any shared logging infrastructure, tokens are exposed. **Severity: High.**

#### Blocker 9: No Containerisation

Without a `Dockerfile`, deployment is manual `npm install && npm start` on a raw VM. No reproducibility, no rollback, no orchestration. **Severity: High for any team deployment.**

#### Blocker 10: No Migrations in CI/CD

Prisma migrations (`prisma migrate deploy`) must run before the new server version starts. There is no entrypoint script, no init container, no migration-as-code in any deployment config. If migrations don't run, the new code crashes against an old schema. **Severity: High.**

---

## 8. Prioritised Roadmap

### Phase A — Minimum Viable Production (1–2 weeks)

_Deploy to a single server safely._

| #   | Task                                                                    | Files                  | Impact                                 |
| --- | ----------------------------------------------------------------------- | ---------------------- | -------------------------------------- |
| A1  | Add `SIGTERM` graceful shutdown to `server.ts`                          | `server.ts`            | Prevents data loss on deploy           |
| A2  | Startup assertion: fail if `JWT_SECRET === default` in production       | `config/env.ts`        | Prevent token forgery                  |
| A3  | Add `process.on('unhandledRejection')` and `uncaughtException` handlers | `server.ts`            | Prevent silent crashes                 |
| A4  | Fix `GET /api/health` to include DB ping                                | `server.ts`            | Enable real liveness probes            |
| A5  | Add `express-rate-limit` on `/api/auth/login` and `/api/auth/register`  | `authRouter.ts`        | Brute-force protection                 |
| A6  | Add `maxPayload: 8192` to `WebSocketServer`                             | `server.ts`            | Prevent memory exhaustion              |
| A7  | Write backend `Dockerfile` with multi-stage build, non-root user        | new file               | Reproducible deploys                   |
| A8  | Write `docker-compose.yml` with PostgreSQL                              | new file               | Replace SQLite in production           |
| A9  | Write `migrate-and-start.sh` entrypoint                                 | new file               | Ensure migrations run before server    |
| A10 | Add `.dockerignore`                                                     | new file               | Exclude `node_modules`, `.env`, `*.db` |
| A11 | Switch Prisma `provider` to `postgresql` for production                 | `prisma/schema.prisma` | Required for A8                        |

---

### Phase B — Observability (1 week)

_See what the server is doing._

| #   | Task                                                                        | Impact                     |
| --- | --------------------------------------------------------------------------- | -------------------------- |
| B1  | Add `prom-client` — expose `/metrics` endpoint                              | Prometheus scraping        |
| B2  | Instrument game counters, active connections gauge, matchmaking queue depth | Core product metrics       |
| B3  | Instrument DB query latency histogram                                       | DB health visibility       |
| B4  | Fix Pino arg order in `authRouter.ts` (`logger.error({ err }, msg)`)        | Fix broken structured logs |
| B5  | Move move/takeback/draw/rematch logs from `info` to `debug`                 | Reduce log noise 10×       |
| B6  | Add `matchmaking_wait_seconds` histogram (log at match time)                | UX metric                  |
| B7  | Add structured login failure logging                                        | Security audit trail       |
| B8  | Add WS token verification failure logging                                   | Security audit trail       |
| B9  | Set up Prometheus + Grafana via Docker Compose                              | Dashboard visibility       |
| B10 | Create 3 core dashboards (Server Health, Game Activity, Matchmaking)        | On-call readiness          |

---

### Phase C — Reliability (1–2 weeks)

_Survive restarts, DB hiccups, and load spikes._

| #   | Task                                                                          | Impact                     |
| --- | ----------------------------------------------------------------------------- | -------------------------- |
| C1  | Replace `Game[]` with three Maps in `GameService` (O(1) lookups)              | Performance under load     |
| C2  | Wrap `saveGame` in `prisma.$transaction()`                                    | Consistent rating updates  |
| C3  | Add circuit breaker around `historyService.saveGame` (`opossum`)              | DB failure isolation       |
| C4  | Add DB indexes: `Game(whitePlayerId)`, `Game(blackPlayerId)`, `Game(endedAt)` | Query performance          |
| C5  | Add `verifyClient` connection gate to `WebSocketServer`                       | Reconnect storm protection |
| C6  | Add `prom-client` event loop lag metric + alert > 50ms                        | Saturation detection       |
| C7  | Authorization check: `GET /api/users/:id/games` must verify own userId        | Privacy fix                |
| C8  | Validate `timeControlMs`/`incrementMs` against TIME_CONTROLS whitelist in Zod | Input safety               |

---

### Phase D — Redis + Horizontal Scaling (2–3 weeks)

_Crash recovery and multi-instance support._

| #   | Task                                                                        | Impact                     |
| --- | --------------------------------------------------------------------------- | -------------------------- |
| D1  | Add `ioredis` client, `shared/db/redis.ts` singleton                        | Redis foundation           |
| D2  | Checkpoint game state to Redis on every move (`HSET chess:game:{id}`)       | Crash recovery             |
| D3  | On server startup: scan Redis for active games, rebuild `GameService.games` | Restart recovery           |
| D4  | Move grace period from `setTimeout` to Redis key with TTL                   | Cross-instance reconnects  |
| D5  | Move matchmaking queue to Redis sorted set (score = rating)                 | Cross-instance matchmaking |
| D6  | Add Redis Pub/Sub for game events (enables multi-instance WS broadcast)     | Horizontal scaling         |
| D7  | Move JWT token to first WS message instead of query string                  | Token security             |
| D8  | Add Redis-backed rate limiting with `rate-limiter-flexible`                 | WS flood protection        |
| D9  | Add Docker Compose service for Redis                                        | Local dev parity           |
| D10 | Load test with k6 at 1,000 concurrent connections                           | Validate Phase C/D work    |

---

### Phase E — Production Polish (ongoing)

_Operational excellence._

| #   | Task                                                                         |
| --- | ---------------------------------------------------------------------------- |
| E1  | Kubernetes manifests (Deployment, Service, Ingress, HPA)                     |
| E2  | Separate `RatingService` from `HistoryService`                               |
| E3  | `PlayerSession` value object to reduce 8-arg constructors                    |
| E4  | `GameEventEmitter` to decouple `Game` from `GameService` callbacks           |
| E5  | Token revocation list in Redis                                               |
| E6  | Alertmanager rules: DB errors, event loop lag, grace period flood            |
| E7  | Log correlation ID threaded through game lifecycle                           |
| E8  | Move history in `GAME_RESUME` payload (full PGN)                             |
| E9  | Pending draw/takeback state included in `GAME_RESUME`                        |
| E10 | Abuse detection: flag users with high resign-rate or unusual rating patterns |

---

_Review conducted against codebase state of 2026-06-21. Re-run after Phase A is complete._
