import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

vi.mock('../../shared/db/prisma', () => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock('../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from '../../shared/db/prisma';
import { createHealthRouter } from '../../modules/health/healthRouter';
import type { HealthStatsProvider } from '../../modules/health/healthRouter';

function makeStats(
  overrides: Partial<ReturnType<HealthStatsProvider['getStats']>> = {},
): HealthStatsProvider {
  return {
    getStats: vi.fn().mockReturnValue({
      connectedClients: 2,
      activeGames: 1,
      queuedPlayers: 0,
      ...overrides,
    }),
  };
}

function makeApp(stats: HealthStatsProvider) {
  const app = express();
  app.use('/health', createHealthRouter(stats));
  return supertest(app);
}

describe('Health routes — integration', () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── GET /health ─────────────────────────────────────────────────────────────

  it('GET /health → 200 { status: "ok" }', async () => {
    const res = await makeApp(makeStats()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health does not hit the database', async () => {
    await makeApp(makeStats()).get('/health');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  // ─── GET /health/deep — database ok ──────────────────────────────────────────

  it('all checks pass → 200 with status "ok"', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as never);

    const res = await makeApp(makeStats()).get('/health/deep');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('response contains database, websocket, and matchmaking checks', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    const res = await makeApp(makeStats()).get('/health/deep');

    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('websocket');
    expect(res.body.checks).toHaveProperty('matchmaking');
  });

  it('database check includes latencyMs', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    const res = await makeApp(makeStats()).get('/health/deep');

    expect(res.body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('websocket check reflects stats provider values', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
    const stats = makeStats({ connectedClients: 5, activeGames: 3 });

    const res = await makeApp(stats).get('/health/deep');

    expect(res.body.checks.websocket.connectedClients).toBe(5);
    expect(res.body.checks.websocket.activeGames).toBe(3);
  });

  it('matchmaking check reflects queued player count', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
    const stats = makeStats({ queuedPlayers: 3 });

    const res = await makeApp(stats).get('/health/deep');

    expect(res.body.checks.matchmaking.queuedPlayers).toBe(3);
  });

  // ─── GET /health/deep — database degraded ────────────────────────────────────

  it('database error → 503 with status "degraded"', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('Connection refused'));

    const res = await makeApp(makeStats()).get('/health/deep');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database.status).toBe('error');
  });

  it('database error response includes error message', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('Connection refused'));

    const res = await makeApp(makeStats()).get('/health/deep');

    expect(res.body.checks.database.error).toBe('Connection refused');
  });

  // DB_TIMEOUT_MS = 2 000 — the real timeout fires naturally; allow 8 s headroom
  it('database timeout → 503 with error "timeout"', { timeout: 8_000 }, async () => {
    vi.mocked(prisma.$queryRaw).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 10_000)) as never,
    );

    const res = await makeApp(makeStats()).get('/health/deep');

    expect(res.status).toBe(503);
    expect(res.body.checks.database.status).toBe('error');
    expect(res.body.checks.database.error).toBe('timeout');
  });

  it('websocket and matchmaking remain ok even when database is degraded', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('down'));

    const res = await makeApp(makeStats()).get('/health/deep');

    expect(res.body.checks.websocket.status).toBe('ok');
    expect(res.body.checks.matchmaking.status).toBe('ok');
  });
});
