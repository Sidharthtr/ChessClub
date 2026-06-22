/**
 * app.ts — Express application factory (HTTP layer only).
 *
 * Creates and configures the Express app with all HTTP middleware and REST routers.
 * Intentionally does NOT start the server (no app.listen / httpServer.listen here)
 * so integration tests can import `app` and pass it to supertest without binding
 * to a port.
 *
 * HOW IT CONNECTS:
 *  - server.ts imports `app` and wraps it in an http.Server + WebSocketServer
 *  - server.ts also mounts /health after constructing SocketManager (needs stats provider)
 *  - authRouter    → POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
 *  - historyRouter → GET  /api/games/:id, GET /api/users/:id/games
 *  - metricsRouter → GET  /metrics  (Prometheus scrape endpoint)
 *
 * CORS:
 *  config.corsOrigin defaults to http://localhost:5173 (Vite dev server).
 *  Set CORS_ORIGIN env var in production to the actual frontend domain.
 */

import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import { authRouter } from './modules/auth/authRouter';
import { historyRouter } from './modules/history/historyRouter';
import { metricsRouter } from './modules/metrics/metricsRouter';

export const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api', historyRouter);
app.use('/metrics', metricsRouter);
