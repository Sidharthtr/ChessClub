# ChessClub — Testing Plan

## Framework Decision: Vitest + React Testing Library + Playwright

**Short answer: Vitest for unit/integration, Playwright for E2E. Do NOT use pytest.**

### Why not pytest

pytest is a great Python tool — wrong language for this stack. With pytest you can only test
via HTTP/WebSocket against a running server (black box). You can never:

- Call `calculateElo()` directly and assert the return value
- Use fake timers to test `ChessClock` without a real 10-minute wait
- Mock Prisma to isolate `AuthService` from a database
- Assert that `GameService.findGame()` returns the right socket reference

For E2E testing, Playwright in TypeScript is equally powerful as pytest+requests, and it stays
in the same language/toolchain.

### Why Vitest over Jest

- No `ts-jest` needed — Vitest uses Vite's transform pipeline natively (TypeScript works out of the box)
- 3–5× faster than Jest on cold starts (no babel transform)
- Same `describe` / `it` / `expect` API — zero learning curve if you know Jest
- Frontend already uses Vite — Vitest config slots directly into `vite.config.ts`
- Native ESM support (frontend `"type": "module"` works without extra flags)

### Why Playwright over Cypress

- Full TypeScript support with no special config
- Built-in WebSocket support (`page.on('websocket', ...)`)
- Runs headlessly in CI without a display server
- Parallel browser contexts in a single test — perfect for "two players play a game"
- Better trace viewer for debugging failures

---

## Installation

### Backend

```bash
cd backend
npm install -D vitest @vitest/coverage-v8 vitest-mock-extended
```

### Frontend

```bash
cd frontend
npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

### E2E (root)

```bash
npm install -D @playwright/test
npx playwright install chromium
```

---

## Add Scripts

**`backend/package.json`** — add to `scripts`:

```json
"test":         "vitest run",
"test:watch":   "vitest",
"test:coverage": "vitest run --coverage"
```

**`frontend/package.json`** — add to `scripts`:

```json
"test":         "vitest run",
"test:watch":   "vitest",
"test:coverage": "vitest run --coverage"
```

**Root `package.json`** — add to `scripts`:

```json
"test":   "npm test --prefix backend && npm test --prefix frontend",
"test:e2e": "playwright test"
```

---

## Config Files to Create

### `backend/vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/modules/**', 'src/shared/**'],
      exclude: ['src/shared/db/**', 'src/config/**'],
    },
  },
});
```

### `frontend/vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

### `frontend/src/test/setup.ts`

```ts
import '@testing-library/jest-dom';
```

### `playwright.config.ts` (root)

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://localhost',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'cd backend && npm start',
      url: 'http://localhost:8080/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'cd frontend && npm run preview',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

---

## Test File Structure

```
backend/src/
  modules/
    rating/
      EloService.test.ts          ← pure function, zero mocks
    game/
      chess-clock.test.ts         ← fake timers
      Game.test.ts                ← mock WebSocket + mock historyService
      GameService.test.ts         ← mock WebSocket
    matchmaking/
      MatchmakingService.test.ts  ← mock WebSocket + mock GameService
    auth/
      AuthService.test.ts         ← mock Prisma
    history/
      HistoryService.test.ts      ← mock Prisma

  integration/
    auth.integration.test.ts      ← supertest + test DB
    history.integration.test.ts   ← supertest + test DB

frontend/src/
  redux/
    gameSlice.test.ts
    authSlice.test.ts
  components/
    ChessBoard.test.tsx
    GameControls.test.tsx
  screens/
    Game.test.tsx                 ← mock WebSocket hook

e2e/
  auth.spec.ts
  matchmaking.spec.ts
  game-play.spec.ts
  reconnection.spec.ts
```

---

## Unit Test Plan

### `EloService.test.ts` — 10 cases, zero mocks

| #   | Description                                                         | Key assertion                                                           |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Equal ratings (1200 vs 1200), white wins                            | whiteChange > 0, blackChange < 0, changes equal in magnitude            |
| 2   | Equal ratings, black wins                                           | blackChange > 0, whiteChange < 0                                        |
| 3   | Equal ratings, draw                                                 | both changes are 0 (expected = actual = 0.5)                            |
| 4   | Favourite (1600) beats underdog (1200)                              | whiteChange small positive (≈ +6), blackChange larger negative          |
| 5   | Underdog (1200) beats favourite (1600)                              | whiteChange large positive (≈ +34 at K=40), blackChange large negative  |
| 6   | gamesPlayed = 0 → K = 40                                            | Math.abs(whiteChange) ≤ 40                                              |
| 7   | gamesPlayed = 30 → K = 20                                           | Math.abs(whiteChange) ≤ 20                                              |
| 8   | gamesPlayed = 100 → K = 10                                          | Math.abs(whiteChange) ≤ 10                                              |
| 9   | Rating floor: loser at 110, K=40, large gap loss → new rating ≥ 100 | whiteNewRating >= 100                                                   |
| 10  | Different K-factors each side                                       | white uses K=40 (5 games), black uses K=10 (200 games) — changes differ |

```ts
import { describe, it, expect } from 'vitest';
import { calculateElo } from './EloService';

describe('calculateElo', () => {
  it('equal ratings, white wins — symmetric change', () => {
    const r = calculateElo(1200, 1200, 0, 0, 'white');
    expect(r.whiteChange).toBe(-r.blackChange);
    expect(r.whiteChange).toBeGreaterThan(0);
  });

  it('rating floor enforced', () => {
    const r = calculateElo(105, 2000, 0, 0, 'black');
    expect(r.whiteNewRating).toBeGreaterThanOrEqual(100);
  });

  // ... etc
});
```

---

### `chess-clock.test.ts` — 9 cases, fake timers

Use `vi.useFakeTimers()` so tests don't actually wait.

| #   | Description                                                                              |
| --- | ---------------------------------------------------------------------------------------- |
| 1   | `getSnapshot()` before `start()` returns initial times untouched                         |
| 2   | After `start()` + advance 5s, `getSnapshot().white` ≈ initial − 5000                     |
| 3   | `recordMove()` after 3s with increment=0: white loses 3s, switches to black              |
| 4   | `recordMove()` with increment=5000: white loses 3s, gains 5s → net +2s                   |
| 5   | Two `recordMove()` calls: each player time decremented independently                     |
| 6   | `onTimeout` fires when `vi.advanceTimersByTime(initialTime)`                             |
| 7   | `stop()` prevents `onTimeout` from firing after time would expire                        |
| 8   | `undoMove()` switches active color back; new `scheduleTimeout` fires for previous player |
| 9   | `start()` called twice → only one timer running (idempotent)                             |

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChessClock } from './chess-clock';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('deducts white time after 5s', () => {
  const clock = new ChessClock(60_000, vi.fn());
  clock.start();
  vi.advanceTimersByTime(5_000);
  const snap = clock.getSnapshot();
  expect(snap.white).toBeCloseTo(55_000, -2);
  expect(snap.black).toBe(60_000);
});
```

---

### `Game.test.ts` — 13 cases

Mock WebSocket using `vitest-mock-extended` or a hand-written stub:

```ts
function mockSocket(): WebSocket {
  return { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
}
```

| #   | Description                                                                                      | What to assert                                                     |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1   | Constructor sends `INIT_GAME` to both players                                                    | `player1.send` and `player2.send` called with correct color/gameId |
| 2   | `makeMove` — valid move on white's turn                                                          | Both players receive `MOVE` message                                |
| 3   | `makeMove` — player2 tries to move on white's turn                                               | player2 receives `GAME_ALERT 'not your turn'`                      |
| 4   | `makeMove` — invalid move (e.g., `{ from: 'e2', to: 'e5' }`)                                     | Moving player receives `GAME_ALERT 'invalid move'`                 |
| 5   | `makeMove` after game is over                                                                    | No messages sent (no-op)                                           |
| 6   | Scholar's mate sequence → `game_over` with `reason: 'checkmate'`                                 | Both players receive `GAME_OVER`                                   |
| 7   | `resign()` by white → `game_over` with `winner: 'black'`                                         | Both players receive `GAME_OVER`                                   |
| 8   | `requestDraw` → opponent gets `DRAW_REQUEST`                                                     | player2.send called with draw_request                              |
| 9   | `acceptDraw` when pending → `game_over` with `winner: null`                                      | Both receive `GAME_OVER`                                           |
| 10  | `rejectDraw` → both get `DRAW_REJECT`                                                            | Both.send called                                                   |
| 11  | `requestTakeback` when not last mover → `GAME_ALERT`                                             |                                                                    |
| 12  | `acceptTakeback` → both players get `TAKEBACK_ACCEPT` with correct fen and moveCount decremented |                                                                    |
| 13  | `requestRematch` by both players → `onRematch` callback fired with swapped colors                |                                                                    |

---

### `GameService.test.ts` — 7 cases

| #   | Description                                                                     |
| --- | ------------------------------------------------------------------------------- |
| 1   | `createGame` adds game, `getActiveCount()` returns 1                            |
| 2   | `findGame(player1Socket)` returns the game                                      |
| 3   | `findGame(unknownSocket)` returns undefined                                     |
| 4   | `findGameById(id)` returns correct game                                         |
| 5   | `findGameByUserId(id)` returns game where user is white or black                |
| 6   | `removeGame` → `getActiveCount()` drops to 0                                    |
| 7   | `onEnd` callback (passed to Game constructor) calls `removeGame` when game ends |

---

### `MatchmakingService.test.ts` — 9 cases

| #   | Description                                                                            |
| --- | -------------------------------------------------------------------------------------- |
| 1   | Single player queued — `gameService.createGame` NOT called                             |
| 2   | Two equal-rated players (1200 each) → matched immediately, `createGame` called         |
| 3   | Player already in queue → `sendError` called, not queued twice                         |
| 4   | Same userId can't self-match (two sockets, same userId)                                |
| 5   | Rating 1200 vs 1400 at t=0 (window=100) → no match; advance 10s (window=150) → matched |
| 6   | Different time controls (`10+0` vs `10+5`) never cross-match                           |
| 7   | `removePendingUser` removes player before match found                                  |
| 8   | After match, queue is empty                                                            |
| 9   | Color assignment is random — over 100 runs, roughly 50/50 white/black distribution     |

---

### `AuthService.test.ts` — 8 cases (mock Prisma)

Use `vi.mock('../../shared/db/prisma')` to replace `prisma.*` calls.

| #   | Description                                                     | Expected                                   |
| --- | --------------------------------------------------------------- | ------------------------------------------ |
| 1   | `register` new user → returns `{ user, token }`                 | user has id/username/email, token is a JWT |
| 2   | `register` duplicate email → throws AppError with status 409    |                                            |
| 3   | `register` duplicate username → throws AppError with status 409 |                                            |
| 4   | `login` correct email+password → returns `{ user, token }`      | passwordHash NOT in user object            |
| 5   | `login` wrong password → throws AppError with status 401        |                                            |
| 6   | `login` non-existent email → throws AppError with status 401    |                                            |
| 7   | `verifyToken` with valid token → returns `{ userId, username }` |                                            |
| 8   | `verifyToken` with garbage → throws                             |                                            |

---

### `HistoryService.test.ts` — 5 cases (mock Prisma)

| #   | Description                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------ |
| 1   | `saveGame` anonymous game (both userIds null) → `prisma.game.create` called, returns null (no rating update) |
| 2   | `saveGame` with both userIds → `prisma.user.update` called twice with new ratings                            |
| 3   | `saveGame` prisma throws → returns null (no crash)                                                           |
| 4   | `getGame` returns `prisma.game.findUnique` result with player includes                                       |
| 5   | `getUserGames` queries by `whitePlayerId OR blackPlayerId`, ordered `endedAt desc`, limit 50                 |

---

## Integration Test Plan

These hit a real test database (SQLite for speed) via supertest. They test the full
HTTP request → Express router → service → Prisma → response chain.

### Setup (create once)

```ts
// src/integration/helpers/testApp.ts
import { app } from '../../server'; // export app separately from server.ts
import { prisma } from '../../shared/db/prisma';

export async function clearDb() {
  await prisma.game.deleteMany();
  await prisma.user.deleteMany();
}
```

### `auth.integration.test.ts` — 8 cases

| #   | Route                     | Scenario            | Expected                |
| --- | ------------------------- | ------------------- | ----------------------- |
| 1   | POST `/api/auth/register` | Valid payload       | 201 + `{ token, user }` |
| 2   | POST `/api/auth/register` | Duplicate email     | 409 `{ message }`       |
| 3   | POST `/api/auth/register` | Missing `username`  | 400 (Zod validation)    |
| 4   | POST `/api/auth/login`    | Correct credentials | 200 + `{ token, user }` |
| 5   | POST `/api/auth/login`    | Wrong password      | 401                     |
| 6   | GET `/api/auth/me`        | Valid Bearer token  | 200 + user profile      |
| 7   | GET `/api/auth/me`        | No token            | 401                     |
| 8   | GET `/api/auth/me`        | Malformed token     | 401                     |

### `history.integration.test.ts` — 5 cases

| #   | Route                        | Scenario        | Expected          |
| --- | ---------------------------- | --------------- | ----------------- |
| 1   | GET `/api/history/games`     | Authenticated   | 200 + array       |
| 2   | GET `/api/history/games`     | Unauthenticated | 401               |
| 3   | GET `/api/history/games/:id` | Valid gameId    | 200 + game object |
| 4   | GET `/api/history/games/:id` | Non-existent id | 404               |
| 5   | GET `/api/history/games/:id` | Unauthenticated | 401               |

---

## Frontend Unit Test Plan

### `gameSlice.test.ts` — 7 cases

| #   | Action                                                  | Assertion                                                               |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | initial state                                           | `{ fen: startingFen, color: null, gameId: null, gameOver: false, ... }` |
| 2   | `setGameData({ color: 'white', gameId: 'abc' })`        | slice updated                                                           |
| 3   | `moveMade({ fen: newFen, ... })`                        | fen updated                                                             |
| 4   | `setGameOver({ winner: 'black', reason: 'checkmate' })` | gameOver=true, winner='black'                                           |
| 5   | `setPendingDraw(true)`                                  | pendingDraw=true                                                        |
| 6   | `setPendingTakeback(true)`                              | pendingTakeback=true                                                    |
| 7   | `resetGame()`                                           | returns to initial state                                                |

### `authSlice.test.ts` — 5 cases

| #   | Action            | Assertion                                     |
| --- | ----------------- | --------------------------------------------- |
| 1   | initial state     | `{ user: null, token: null, loading: false }` |
| 2   | `setUser(user)`   | user stored                                   |
| 3   | `clearUser()`     | user/token cleared                            |
| 4   | `login.fulfilled` | loading=false, user+token stored              |
| 5   | `login.rejected`  | loading=false, error set                      |

### `ChessBoard.test.tsx` — 6 cases

| #   | Description                                                            |
| --- | ---------------------------------------------------------------------- |
| 1   | Renders 64 squares                                                     |
| 2   | Starting position shows white pawn on e2 (piece image rendered)        |
| 3   | White's turn: clicking e2 (own pawn) → highlights legal moves (e3, e4) |
| 4   | White's turn: clicking e7 (opponent pawn) → no selection               |
| 5   | Black player (colour='black') → a1 is bottom-right, h8 is bottom-left  |
| 6   | After `gameOver=true`: clicking any piece → no interaction             |

### `GameControls.test.tsx` — 5 cases

| #   | Description                                                 |
| --- | ----------------------------------------------------------- |
| 1   | Renders Resign, Offer Draw, Request Takeback buttons        |
| 2   | Clicking Resign calls `onResign` prop                       |
| 3   | Clicking Offer Draw calls `onDrawOffer` prop                |
| 4   | `pendingDraw=true` → shows Accept/Reject Draw modal         |
| 5   | `pendingTakeback=true` → shows Accept/Reject Takeback modal |

---

## E2E Test Plan (Playwright)

All E2E tests use two browser contexts (`browser.newContext()`) to simulate two players.

### `auth.spec.ts` — 4 scenarios

| #   | Scenario                                                 |
| --- | -------------------------------------------------------- |
| 1   | Register → redirected to lobby                           |
| 2   | Login with registered user → sees dashboard with rating  |
| 3   | Visit protected route without auth → redirected to login |
| 4   | Login with wrong password → error message shown          |

### `matchmaking.spec.ts` — 2 scenarios

| #   | Scenario                                                                                  |
| --- | ----------------------------------------------------------------------------------------- |
| 1   | Two players click "Play" → both enter waiting state → matched → game screen shown to both |
| 2   | One player disconnects during queue → no match; second player stays waiting               |

### `game-play.spec.ts` — 7 scenarios

| #   | Scenario                                                                    |
| --- | --------------------------------------------------------------------------- |
| 1   | White moves e2-e4 → black's board updates with that move                    |
| 2   | Scholar's mate sequence → game-over banner shows on both screens            |
| 3   | White resigns → both screens show "Black wins by resignation"               |
| 4   | White offers draw → black sees offer modal → accepts → both see draw result |
| 5   | White offers draw → black rejects → game continues                          |
| 6   | White makes a move → requests takeback → black accepts → board reverts      |
| 7   | Clock counts down on active player's screen; opponent clock is frozen       |

### `reconnection.spec.ts` — 2 scenarios

| #   | Scenario                                                                                   |
| --- | ------------------------------------------------------------------------------------------ |
| 1   | Player closes tab mid-game → reopens within 30s → game resumes from correct position       |
| 2   | Player closes tab → opponent sees waiting state → grace period expires → timeout game-over |

---

## Coverage Targets

| Layer                | Target | Focus                                  |
| -------------------- | ------ | -------------------------------------- |
| `EloService`         | 100%   | Pure function, zero branches uncovered |
| `ChessClock`         | 90%+   | All state transitions                  |
| `Game`               | 80%+   | All message paths                      |
| `AuthService`        | 85%+   | All error paths                        |
| `MatchmakingService` | 80%+   | Window expansion, self-match guard     |
| Frontend Redux       | 90%+   | All reducers and thunks                |
| Frontend Components  | 70%+   | Key user interactions                  |

Run coverage:

```bash
# Backend
cd backend && npm run test:coverage

# Frontend
cd frontend && npm run test:coverage
```

---

## CI Integration (GitHub Actions sketch)

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm' }
      - run: npm ci --prefix backend
      - run: npm ci --prefix frontend
      - run: npm test --prefix backend
      - run: npm test --prefix frontend

  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: chessclub_test
          POSTGRES_USER: chess
          POSTGRES_PASSWORD: test
        options: --health-cmd pg_isready
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npx playwright install --with-deps chromium
      - run: npm ci && npm run test:e2e
        env:
          DATABASE_URL: postgresql://chess:test@localhost:5432/chessclub_test
          JWT_SECRET: test-secret
```

---

## Recommended Implementation Order

1. **`EloService.test.ts`** — start here, zero setup, immediate confidence
2. **`chess-clock.test.ts`** — add fake timers, tests the trickiest server logic
3. **`gameSlice.test.ts`** + **`authSlice.test.ts`** — pure Redux reducers, fast wins
4. **`GameService.test.ts`** — introduces the mock socket helper you'll reuse
5. **`Game.test.ts`** — most complex, builds on mock socket helper
6. **`MatchmakingService.test.ts`** — builds on mock socket + mock GameService
7. **`AuthService.test.ts`** + **`HistoryService.test.ts`** — introduces Prisma mocking
8. **Integration tests** — needs test DB setup, validates routing layer
9. **Component tests** — needs jsdom + RTL setup
10. **E2E tests** — needs both servers running, write last
