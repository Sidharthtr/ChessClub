import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';

vi.mock('../../modules/auth/AuthService', () => ({
  authService: {
    register: vi.fn(),
    login: vi.fn(),
    getMe: vi.fn(),
    verifyToken: vi.fn(),
  },
}));

vi.mock('../../modules/history/HistoryService', () => ({
  historyService: {
    saveGame: vi.fn(),
    getGame: vi.fn(),
    getUserGames: vi.fn(),
  },
}));

vi.mock('../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { app } from '../../app';
import { authService } from '../../modules/auth/AuthService';
import { historyService } from '../../modules/history/HistoryService';

const request = supertest(app);
const MOCK_TOKEN = 'mock.jwt.token';
const AUTH_HEADER = { Authorization: `Bearer ${MOCK_TOKEN}` };

const MOCK_GAME = {
  id: 'game-abc',
  winner: 'white',
  reason: 'checkmate',
  pgn: '1. e4 e5',
  finalFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  timeControlMs: 600_000,
  startedAt: new Date().toISOString(),
  endedAt: new Date().toISOString(),
  whitePlayer: { id: 'user-1', username: 'alice', rating: 1220 },
  blackPlayer: { id: 'user-2', username: 'bob', rating: 1180 },
};

describe('History routes — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: any valid-looking token passes auth
    vi.mocked(authService.verifyToken).mockReturnValue({ userId: 'user-1', username: 'alice' });
  });

  // ─── GET /api/games/:id ─────────────────────────────────────────────────────

  it('authenticated + existing gameId → 200 with game object', async () => {
    vi.mocked(historyService.getGame).mockResolvedValue(MOCK_GAME as never);

    const res = await request.get('/api/games/game-abc').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'game-abc');
    expect(res.body).toHaveProperty('whitePlayer');
    expect(res.body).toHaveProperty('blackPlayer');
    expect(historyService.getGame).toHaveBeenCalledWith('game-abc');
  });

  it('authenticated + non-existent gameId → 404', async () => {
    vi.mocked(historyService.getGame).mockResolvedValue(null);

    const res = await request.get('/api/games/nonexistent').set(AUTH_HEADER);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('unauthenticated → 401', async () => {
    const res = await request.get('/api/games/game-abc');

    expect(res.status).toBe(401);
    expect(historyService.getGame).not.toHaveBeenCalled();
  });

  it('expired token → 401', async () => {
    vi.mocked(authService.verifyToken).mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const res = await request.get('/api/games/game-abc').set(AUTH_HEADER);

    expect(res.status).toBe(401);
    expect(historyService.getGame).not.toHaveBeenCalled();
  });

  // ─── GET /api/users/:id/games ────────────────────────────────────────────────

  it('authenticated → 200 with games array', async () => {
    vi.mocked(historyService.getUserGames).mockResolvedValue([MOCK_GAME] as never);

    const res = await request.get('/api/users/user-1/games').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(historyService.getUserGames).toHaveBeenCalledWith('user-1');
  });

  it('authenticated + user with no games → 200 with empty array', async () => {
    vi.mocked(historyService.getUserGames).mockResolvedValue([]);

    const res = await request.get('/api/users/user-1/games').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('unauthenticated → 401', async () => {
    const res = await request.get('/api/users/user-1/games');

    expect(res.status).toBe(401);
    expect(historyService.getUserGames).not.toHaveBeenCalled();
  });
});
