# Chess Club

Real-time multiplayer chess platform — TypeScript, Node.js, React, WebSocket.

---

## Tech Stack

| Layer        | Technology                                       |
| ------------ | ------------------------------------------------ |
| Backend      | Node.js + TypeScript, `ts-node`                  |
| WebSocket    | `ws` library                                     |
| Chess engine | `chess.js`                                       |
| Validation   | `zod`                                            |
| Logging      | `pino`                                           |
| Database     | Prisma + PostgreSQL (Docker), SQLite (local dev) |
| Auth         | JWT + bcrypt                                     |
| Frontend     | React 18, Vite, Tailwind CSS                     |
| State        | Redux Toolkit                                    |

---

## Running the Project

### Option A — Docker (recommended, uses PostgreSQL)

```bash
# 1. Create your .env from the template
cp .env.example .env
# Edit .env and set POSTGRES_PASSWORD and JWT_SECRET

# 2. Start everything (postgres + backend + nginx/frontend)
docker compose up --build

# App is live at http://localhost
# To run in the background: docker compose up --build -d
```

### Option B — Local dev without Docker (uses local Node + SQLite)

```bash
# Backend — starts on ws://localhost:8080
cd backend
npm install
cp .env.example .env          # edit DATABASE_URL=file:./dev.db and JWT_SECRET
npx prisma migrate dev        # creates SQLite DB (only needed once)
npm start

# Frontend — starts on http://localhost:5173
cd frontend
npm install
cp .env.local.example .env.local   # sets VITE_API_URL and VITE_WS_URL for localhost
npm run dev
```

> **Note for Option B**: The Prisma schema now targets PostgreSQL. To use SQLite locally,
> temporarily change `provider = "postgresql"` to `provider = "sqlite"` in
> `backend/prisma/schema.prisma` before running `prisma migrate dev`.
> Do **not** commit that change.

---

## Docker Setup — Decisions Explained

### Architecture

```
Browser
  │
  ▼
nginx (port 80)              ← frontend container: serves React SPA
  ├── /api/*  ──────────────→ backend:8080   (HTTP REST proxy)
  ├── /ws     ──────────────→ backend:8080   (WebSocket proxy)
  └── /*      → index.html  (React Router SPA fallback)

backend (port 8080, internal only)
  └── postgres:5432          ← database container
```

**Why nginx in front of everything?**
The browser makes all requests to a single host (nginx on port 80). nginx routes REST calls and WebSocket upgrades to the backend, and serves static files itself. This means:

- No hardcoded `http://localhost:8080` in the frontend build — all URLs are relative (`/api`, `/ws`)
- The same Docker image works in any environment — dev, staging, production
- Backend is not exposed on any host port; it's unreachable except through nginx

### Backend Dockerfile decisions

| Decision                        | Reason                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node 22 Alpine (not Debian)     | Alpine is ~50 MB vs ~200 MB for the Debian image                                                                                                                                           |
| Multi-stage build               | Builder stage has TypeScript compiler + Prisma CLI (~500 MB); runner stage is minimal                                                                                                      |
| `dumb-init` as PID 1            | Without it, `docker stop` sends SIGTERM to PID 1 (sh or node), which Node ignores. Docker then force-kills after 10 s — losing in-flight DB writes. `dumb-init` correctly forwards signals |
| Non-root user                   | If a vulnerability is exploited, the attacker has no root access                                                                                                                           |
| `npm ci --omit=dev` in runner   | Excludes `typescript`, `prisma` CLI, `@types/*` — shaves ~150 MB off the runner image                                                                                                      |
| Copy `.prisma/` from builder    | Runner does `npm ci --omit=dev` which skips `prisma generate`. We copy the pre-built client instead of running it again                                                                    |
| `entrypoint.sh` runs migrations | `prisma migrate deploy` applies any pending migrations before the app starts. Safe to run on every restart — it's a no-op if already up to date                                            |

### Frontend Dockerfile decisions

| Decision                             | Reason                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Node 22 Alpine builder               | Same reason as backend — small + consistent                                                                         |
| nginx 1.27 Alpine runner             | ~25 MB, battle-tested for static file serving                                                                       |
| `VITE_API_URL=/api` baked at build   | Relative URL — works behind any domain without rebuilding                                                           |
| `VITE_WS_URL=""` baked at build      | Empty means `useSocket.ts` derives from `window.location.host` at runtime — connects back to nginx on the same host |
| `proxy_read_timeout 3600s` for `/ws` | A chess game can last an hour. Without this nginx closes idle WS connections after 60 s                             |

### WebSocket path `/ws`

The WS server is registered at path `/ws` in `server.ts`:

```ts
new WebSocketServer({ server: httpServer, path: '/ws' });
```

This lets nginx have a clean, unambiguous location block:

```nginx
location /ws { proxy_pass http://backend:8080; ... }
location /api/ { proxy_pass http://backend:8080; ... }
location / { try_files $uri $uri/ /index.html; }  # static + SPA
```

Without a dedicated path, the `/` location would handle both static files and WS upgrades, requiring fragile `if ($http_upgrade)` conditionals.

### PostgreSQL migration

The old migrations were SQLite-specific (`DATETIME`, `PRAGMA` statements). They won't run on PostgreSQL. A single clean PostgreSQL migration replaces them:

- `backend/prisma/migrations/20260621000000_init_postgresql/migration.sql`
- Also includes the missing indexes from the production review (`whitePlayerId`, `blackPlayerId`, `endedAt`)

---

## Docker Commands

### First time setup

```bash
# from ChessClub root
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD and JWT_SECRET to real values

docker compose up --build
```

### Day-to-day

```bash
# Start (detached)
docker compose up -d

# Stop
docker compose down

# Rebuild after code changes
docker compose up --build

# View logs
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend

# Open a shell in the backend container
docker compose exec backend sh

# Run Prisma Studio (visual DB browser) against the running postgres
docker compose exec backend npx prisma studio
```

### Wipe everything including database

```bash
docker compose down --volumes
```

### Production deployment (no docker-compose.override.yml)

```bash
# Use only the base compose file — skips local dev overrides
docker compose -f docker-compose.yml up --build -d
```

---

## Code Quality Setup — What Was Done and Why

### The Problem

When running:

```bash
# from the ChessClub root
npm run lint
npm run build
npm run typecheck
```

You got:

```
npm error Missing script: "lint"
npm error Missing script: "build"
npm error Missing script: "typecheck"
```

**Root cause:** The tools (`eslint`, `prettier`, `husky`, `lint-staged`) were installed at the repo root, but:

- The root `package.json` had no `scripts` section at all
- The backend had no ESLint config or lint/typecheck scripts
- The frontend had ESLint but was missing `lint:fix`, `typecheck`, and Prettier

### What Was Installed and Where

```
ChessClub/              ← git root
├── package.json        ← tools live here (eslint, prettier, husky, lint-staged)
├── backend/
│   └── package.json    ← backend app (ts-node, prisma, etc.)
└── frontend/
    └── package.json    ← frontend app (vite, react, etc.)
```

**Step 1 — Tools already installed at root by you:**

```bash
# (already done)
npm install -D eslint prettier husky lint-staged
```

**Step 2 — Install ESLint + TypeScript ESLint in backend** (backend had none):

```bash
cd backend
npm install -D eslint@^8.57.0 @typescript-eslint/eslint-plugin@^7.18.0 @typescript-eslint/parser@^7.18.0 eslint-config-prettier@^9.1.0
```

**Step 3 — Install Prettier integration in frontend** (frontend had ESLint but no Prettier config):

```bash
cd frontend
npm install -D eslint-config-prettier@^9.1.0
```

**Step 4 — Created all config files:**

| File                     | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `backend/.eslintrc.cjs`  | ESLint rules for backend TypeScript                      |
| `frontend/.eslintrc.cjs` | Updated ESLint rules for frontend + Prettier integration |
| `.prettierrc.json`       | Shared Prettier formatting rules                         |
| `.prettierignore`        | Files Prettier should skip                               |
| `.lintstagedrc.cjs`      | Maps staged files to lint/format commands                |
| `.husky/pre-commit`      | Git hook that runs on every commit                       |

**Step 5 — Initialize Husky** (creates `.husky/` directory and wires `prepare` script):

```bash
# from ChessClub root
npx husky init
```

**Step 6 — Added scripts to all three `package.json` files:**

Root `package.json` — orchestrates both workspaces:

- `lint` → runs lint in backend, then frontend
- `lint:fix` → auto-fixes lint errors in both
- `format` → formats all files with Prettier
- `format:check` → checks formatting without changing files
- `typecheck` → runs `tsc --noEmit` in both
- `prepare` → runs `husky` on `npm install`

Backend `package.json`:

- `lint` → `eslint src --ext .ts --max-warnings 0`
- `lint:fix` → `eslint src --ext .ts --fix --max-warnings 0`
- `typecheck` → `tsc --noEmit`
- `build` → `tsc`

Frontend `package.json`:

- `lint` → `eslint src --ext .ts,.tsx --max-warnings 0`
- `lint:fix` → `eslint src --ext .ts,.tsx --fix --max-warnings 0`
- `typecheck` → `tsc --noEmit`

**Step 7 — Fixed existing lint errors** (27 auto-fixable, 1 manual):

Running `npm run lint` for the first time found errors. All were auto-fixed:

```bash
# from ChessClub root
npm run lint:fix
```

Errors found and fixed:

- `@typescript-eslint/consistent-type-imports` — imports used only as types must use `import type`. ESLint auto-fixed all of these.
- `prefer-const` on `let game!: Game` in `GameService.ts` — this pattern (`let x!: T; x = ...`) is unfixable by ESLint. Manually restructured to `const game = new Game(...)`. Safe because the closure that references `game` inside the constructor is only called after the constructor returns.
- `@typescript-eslint/no-non-null-assertion` warnings — `!` assertions are used intentionally throughout the backend (e.g., `req.userId!` guaranteed by auth middleware, `queues.get(key)!` after just setting the key). Set to `'off'` in `.eslintrc.cjs`.

**Step 8 — Ran Prettier on the entire codebase once** to establish a clean baseline:

```bash
# from ChessClub root
npm run format
```

---

## Developer Workflow

### Before Every Commit

The pre-commit hook runs automatically when you `git commit`. But you should also run these manually to catch issues early:

```bash
# Run from: ChessClub root

# 1. Check and auto-fix lint
npm run lint:fix

# 2. Format all files
npm run format

# 3. Check TypeScript compiles
npm run typecheck
```

Or run all three at once:

```bash
npm run lint:fix && npm run format && npm run typecheck
```

### If You Only Changed Backend Files

```bash
# Run from: backend/
npm run lint:fix
npm run typecheck
```

### If You Only Changed Frontend Files

```bash
# Run from: frontend/
npm run lint:fix
npm run typecheck
```

### After Adding a New File

Same as above — ESLint and TypeScript will automatically pick up new `.ts`/`.tsx` files.

### After Installing a New Package

```bash
# Run from: backend/ or frontend/ depending on where you installed
npm run typecheck
```

### Checking Formatting Without Changing Files

```bash
# Run from: ChessClub root
npm run format:check
```

---

## What Happens on git commit

The `.husky/pre-commit` hook runs automatically:

```
git commit -m "your message"
         ↓
1. lint-staged runs on staged files
   ├── backend/**/*.ts       → npm run lint --prefix backend
   ├── frontend/**/*.{ts,tsx} → npm run lint --prefix frontend
   └── all staged files      → prettier --write
         ↓
2. tsc --noEmit on backend
3. tsc --noEmit on frontend
         ↓
   All pass? → commit succeeds
   Any fail? → commit is BLOCKED, errors shown
```

**If your commit is blocked:**

```bash
# See what's wrong
npm run lint
npm run typecheck

# Auto-fix what can be fixed
npm run lint:fix
npm run format

# Then re-stage and commit
git add .
git commit -m "your message"
```

---

## Available Scripts — Quick Reference

### From ChessClub root (runs on both workspaces)

| Command                | What it does                                |
| ---------------------- | ------------------------------------------- |
| `npm run lint`         | Check lint in backend + frontend            |
| `npm run lint:fix`     | Auto-fix lint errors in backend + frontend  |
| `npm run format`       | Format all files with Prettier              |
| `npm run format:check` | Check formatting without changing anything  |
| `npm run typecheck`    | TypeScript type check in backend + frontend |

### From backend/

| Command             | What it does                   |
| ------------------- | ------------------------------ |
| `npm start`         | Start backend server (ts-node) |
| `npm run build`     | Compile TypeScript to `dist/`  |
| `npm run lint`      | ESLint on `src/**/*.ts`        |
| `npm run lint:fix`  | ESLint auto-fix                |
| `npm run typecheck` | `tsc --noEmit`                 |

### From frontend/

| Command             | What it does                  |
| ------------------- | ----------------------------- |
| `npm run dev`       | Start Vite dev server         |
| `npm run build`     | Build for production          |
| `npm run lint`      | ESLint on `src/**/*.{ts,tsx}` |
| `npm run lint:fix`  | ESLint auto-fix               |
| `npm run typecheck` | `tsc --noEmit`                |

---

## ESLint Rules — What's Enforced

### Both workspaces

| Rule                                         | Level | What it catches                               |
| -------------------------------------------- | ----- | --------------------------------------------- |
| `@typescript-eslint/no-explicit-any`         | warn  | Avoid `any` — use proper types                |
| `@typescript-eslint/no-unused-vars`          | error | Variables/params starting with `_` are exempt |
| `@typescript-eslint/consistent-type-imports` | error | Use `import type` for type-only imports       |
| `prefer-const`                               | error | `let` when value never changes                |
| `no-var`                                     | error | Never use `var`                               |
| `eqeqeq`                                     | error | Always use `===` not `==`                     |
| `no-debugger`                                | error | No `debugger` statements                      |

### Backend only

| Rule         | Level | What it catches                              |
| ------------ | ----- | -------------------------------------------- |
| `no-console` | warn  | Use `logger` (Pino) instead of `console.log` |

### Frontend only

| Rule                                   | Level | What it catches              |
| -------------------------------------- | ----- | ---------------------------- |
| `react-refresh/only-export-components` | warn  | HMR compatibility            |
| `react-hooks/rules-of-hooks`           | error | React hooks used incorrectly |
| `react-hooks/exhaustive-deps`          | warn  | Missing deps in `useEffect`  |

---

## Prettier Config

Defined in `.prettierrc.json` at the root. Applied to all `.ts`, `.tsx`, `.js`, `.json`, `.css`, `.md` files.

| Setting         | Value          |
| --------------- | -------------- |
| Quotes          | Single (`'`)   |
| Semicolons      | Yes            |
| Trailing commas | All            |
| Print width     | 100 characters |
| Tab width       | 2 spaces       |
| Line endings    | LF (Unix)      |
