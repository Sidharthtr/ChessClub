# Contributing

How to set up the project locally, run the dev workflow, and avoid the common gotchas.

---

## Prerequisites

- Node.js 22+ (`node --version`)
- Docker Desktop (for the database — or install PostgreSQL natively)
- Git

---

## First-Time Setup

```bash
git clone <repo>
cd ChessClub

# Install tooling at the root (eslint, prettier, husky)
npm install

# Backend deps
cd backend && npm install && cd ..

# Frontend deps
cd frontend && npm install && cd ..
```

The root `npm install` also activates the pre-commit hook via Husky.

---

## Running Locally (with Docker)

The simplest way. All three services come up together.

```bash
cp .env.example .env
docker compose up --build
```

App at **http://localhost**. See [DEPLOYMENT.md](DEPLOYMENT.md) for day-to-day Docker commands.

---

## Running Locally (without Docker)

Useful when iterating fast on backend code — Docker rebuilds add 10–60 seconds per change.

### Postgres via Docker only

Start just the database container:

```bash
docker compose up -d postgres
```

### Backend

```bash
cd backend

# Point Prisma at the dockerized Postgres
echo 'DATABASE_URL="postgresql://chess:CHANGE_ME@localhost:5432/chessclub"' >> .env
echo 'JWT_SECRET="dev-secret"' >> .env

npx prisma migrate deploy
npm start                # ts-node, hot-reload on save
```

### Frontend

```bash
cd frontend

# Point Vite at the backend running on 8080
echo 'VITE_API_URL=http://localhost:8080/api' > .env.local
echo 'VITE_WS_URL=ws://localhost:8080' >> .env.local

npm run dev              # Vite dev server at http://localhost:5173
```

---

## Dev Workflow

### Before you commit

```bash
# From the repo root — runs both workspaces
npm run lint:fix
npm run format
npm run typecheck
npm test --prefix backend
```

Or in one go:

```bash
npm run lint:fix && npm run format && npm run typecheck && npm test --prefix backend
```

The pre-commit hook will catch any of these failing, but running them manually first is faster than the hook re-running on every fix.

### What the pre-commit hook does

Runs on `git commit` via Husky + lint-staged:

```
git commit
   ↓
1. lint-staged on staged files:
     backend/**/*.ts        → eslint --max-warnings 0
     frontend/**/*.{ts,tsx} → eslint --max-warnings 0
     all                    → prettier --write
   ↓
2. tsc --noEmit on backend
3. tsc --noEmit on frontend
   ↓
Pass → commit goes through
Fail → commit blocked, errors printed
```

### If the hook blocks your commit

```bash
npm run lint        # see what's failing
npm run lint:fix    # auto-fix what can be fixed
npm run format
git add .
git commit -m "..."
```

---

## Tests

We use **Vitest** (unit + integration) and **supertest** (HTTP integration).

```bash
# Run once
npm test --prefix backend

# Watch mode (re-runs on file change)
npm run test:watch --prefix backend

# With coverage report
npm run test:coverage --prefix backend
```

### Test layout

```
backend/src/__tests__/
├── unit/
│   ├── auth/           AuthService — bcrypt + JWT mocked
│   ├── game/           Game, GameService, ChessClock
│   ├── history/        HistoryService — Prisma mocked
│   ├── matchmaking/    MatchmakingService — fake timers for window expansion
│   └── rating/         EloService — pure function, no mocks
└── integration/
    ├── auth.integration.test.ts     supertest → real Express, services mocked
    ├── health.integration.test.ts   supertest → real router, Prisma mocked
    └── history.integration.test.ts  supertest → real Express
```

### Test conventions

- `beforeEach(() => vi.clearAllMocks())` in every file
- Mock factories must use `vi.fn(function(this, ...) {...})` for class mocks — arrow functions are not constructors
- Integration tests import `app` from `app.ts`, never `server.ts` (avoids binding a port)
- For health timeout test, real timers + `it('...', { timeout: 8_000 }, ...)` — fake timers conflict with supertest's TCP layer

---

## Code Style

| Setting         | Value        | Where              |
| --------------- | ------------ | ------------------ |
| Quotes          | Single (`'`) | `.prettierrc.json` |
| Semicolons      | Yes          |                    |
| Trailing commas | All          |                    |
| Print width     | 100 chars    |                    |
| Tab width       | 2 spaces     |                    |
| Line endings    | LF           |                    |

### Lint rules enforced

Both workspaces:

- `@typescript-eslint/no-explicit-any` (warn)
- `@typescript-eslint/no-unused-vars` (error, `_`-prefix exempt)
- `@typescript-eslint/consistent-type-imports` (error)
- `prefer-const`, `no-var`, `eqeqeq`, `no-debugger` (error)

Backend only: `no-console` (warn) — use `logger` from `shared/utils/logger.ts` instead.

Frontend only: `react-hooks/rules-of-hooks` (error), `react-hooks/exhaustive-deps` (warn).

---

## Commit Conventions

Concise, imperative mood, lowercase. Examples:

```
add increment support to chess clock
fix board orientation for black player
remove unused message.ts
```

No need for prefixes (`feat:`, `fix:`) — the diff is the source of truth.

---

## Adding a New WebSocket Message

1. Add the type string to [`shared/constants/messageTypes.ts`](../backend/src/shared/constants/messageTypes.ts) (backend enum)
2. Mirror it in [`frontend/src/shared/constants/messageTypes.ts`](../frontend/src/shared/constants/messageTypes.ts)
3. Add a Zod schema to [`shared/schemas/message.schema.ts`](../backend/src/shared/schemas/message.schema.ts)
4. Add a `case` in `SocketManager.handleMessages()` switch
5. Implement the handler on `Game.ts` (or wherever it belongs)
6. Write a unit test for the handler + an integration test if it touches HTTP

The Zod discriminated union will give you a compile error if you forget step 4.

---

## Adding a New Module

1. `mkdir backend/src/modules/yourmodule`
2. Add `YourService.ts` — pure logic, no HTTP/WS imports
3. Add `yourRouter.ts` if it exposes HTTP endpoints
4. Wire into `app.ts` with `app.use('/api/your', yourRouter)`
5. Add unit tests under `src/__tests__/unit/yourmodule/`

Keep imports inside the module — if your module imports another module's internals (not its public exports), you've broken the boundary.
