/**
 * healthRouter.ts — HTTP health check endpoints for load balancers and alerting.
 *
 * Uses the HealthStatsProvider interface instead of depending on SocketManager
 * directly. This keeps the health router testable without instantiating the full
 * WebSocket stack — tests pass a plain object `{ getStats: vi.fn() }`.
 *
 * ENDPOINTS:
 *  GET /health       — shallow: always 200 { status: 'ok' }. Used by Docker
 *                      HEALTHCHECK and load balancers (no I/O, never slow).
 *  GET /health/deep  — deep: checks database (SELECT 1 with 2-second timeout),
 *                      websocket stats, and matchmaking queue size.
 *                      Returns 200 if all ok, 503 if any check fails.
 *
 * HOW IT CONNECTS:
 *  - server.ts mounts createHealthRouter(socketManager) at /health AFTER
 *    constructing SocketManager (socketManager satisfies HealthStatsProvider)
 *  - prisma.$queryRaw is the DB probe — mocked in integration tests
 *  - SocketManager.getStats() provides live WS stats
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../../shared/db/prisma';
import { logger } from '../../shared/utils/logger';

export interface HealthStatsProvider {
  getStats(): { connectedClients: number; activeGames: number; queuedPlayers: number };
}

type CheckStatus = 'ok' | 'error';

interface DbCheck {
  status: CheckStatus;
  latencyMs: number;
  error?: string;
}

const DB_TIMEOUT_MS = 2_000;

async function checkDatabase(): Promise<DbCheck> {
  const start = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS),
      ),
    ]);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    logger.error({ err }, 'health_db_check_failed');
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'unknown',
    };
  }
}

export function createHealthRouter(stats: HealthStatsProvider) {
  const router = Router();

  // Shallow — no I/O, always fast. Used by load balancers and Docker HEALTHCHECK.
  router.get('/', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Deep — checks every subsystem. Use for alerting, not load-balancer liveness.
  router.get('/deep', async (_req: Request, res: Response) => {
    const [dbCheck, wsStats] = await Promise.all([
      checkDatabase(),
      Promise.resolve(stats.getStats()),
    ]);

    const checks = {
      database: dbCheck,
      websocket: {
        status: 'ok' as CheckStatus,
        connectedClients: wsStats.connectedClients,
        activeGames: wsStats.activeGames,
      },
      matchmaking: {
        status: 'ok' as CheckStatus,
        queuedPlayers: wsStats.queuedPlayers,
      },
    };

    const allOk = dbCheck.status === 'ok';
    const status = allOk ? 'ok' : 'degraded';

    res.status(allOk ? 200 : 503).json({ status, checks });
  });

  return router;
}
