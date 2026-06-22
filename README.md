# ChessClub

Real-time multiplayer chess platform built as a modular monolith.

```
TypeScript · Node.js · React · WebSocket · PostgreSQL · Docker
```

---

## Quick Start

```bash
# 1. Configure environment
cp .env.example .env
# edit .env — set POSTGRES_PASSWORD and JWT_SECRET to real values

# 2. Run everything (postgres + backend + frontend)
docker compose up --build

# 3. Open in your browser
open http://localhost
```

That's it. Open two tabs to play against yourself.

---

## What's Inside

| Layer         | Tech                                                   |
| ------------- | ------------------------------------------------------ |
| Backend       | Node.js · TypeScript · WebSocket (`ws`) · Express      |
| Chess engine  | `chess.js` (move validation, FEN, game-over detection) |
| Validation    | `zod` (every incoming message)                         |
| Logging       | `pino` (JSON in prod, pretty in dev)                   |
| Database      | PostgreSQL · Prisma ORM                                |
| Auth          | JWT (7-day expiry) · bcrypt password hashing           |
| Observability | `prom-client` metrics · `/health` and `/health/deep`   |
| Frontend      | React 18 · Vite · Redux Toolkit · Tailwind CSS         |
| Tests         | Vitest · supertest · 119 tests (unit + integration)    |
| Infra         | Docker · docker-compose · nginx reverse proxy          |
| CI            | GitHub Actions (lint, typecheck, test, build)          |

---

## Features

- Live multiplayer matches over WebSocket (sub-10 ms move latency)
- Three time controls — 10+0, 10+5, 15+10 — with server-authoritative clocks
- Resign, offer/accept draw, request/accept takeback, rematch
- JWT auth, persistent user accounts, Elo rating (FIDE-style K-factor)
- 30-second reconnection grace — close your tab, reopen, resume mid-game
- Rating-based matchmaking with widening window
- Prometheus metrics + deep health checks

---

## Documentation

| Doc                                    | What it covers                                     |
| -------------------------------------- | -------------------------------------------------- |
| [Architecture](docs/ARCHITECTURE.md)   | Module boundaries, request flows, design decisions |
| [Deployment](docs/DEPLOYMENT.md)       | Docker setup, env vars, production checklist       |
| [Contributing](docs/CONTRIBUTING.md)   | Dev workflow, lint, test, commit conventions       |
| [WebSocket Protocol](docs/PROTOCOL.md) | Every message type, direction, and payload         |
| [Observability](docs/OBSERVABILITY.md) | Health checks, metrics, Grafana dashboard panels   |

---

## Local Development

Prefer running directly on your machine (no Docker)? See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md#running-locally-without-docker).

## License

MIT
