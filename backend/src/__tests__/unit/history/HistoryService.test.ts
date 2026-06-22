import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../shared/db/prisma', () => ({
  prisma: {
    game: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from '../../../shared/db/prisma';
import { HistoryService } from '../../../modules/history/HistoryService';

const BASE_GAME_DATA = {
  gameId: 'game-abc',
  whiteUserId: null,
  blackUserId: null,
  winner: 'white' as const,
  reason: 'checkmate',
  pgn: '1. e4 e5',
  finalFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  timeControlMs: 600_000,
  startedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('HistoryService', () => {
  let svc: HistoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new HistoryService();
    vi.mocked(prisma.game.create).mockResolvedValue({} as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
  });

  // ─── saveGame() ────────────────────────────────────────────────────────────

  it('anonymous game (null userIds) — creates record and returns null (no rating update)', async () => {
    const result = await svc.saveGame({ ...BASE_GAME_DATA });

    expect(prisma.game.create).toHaveBeenCalledOnce();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('game with both userIds — creates record and updates both ratings', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ rating: 1200, gamesCount: 5 } as never)
      .mockResolvedValueOnce({ rating: 1300, gamesCount: 10 } as never);

    const result = await svc.saveGame({
      ...BASE_GAME_DATA,
      whiteUserId: 'user-w',
      blackUserId: 'user-b',
    });

    expect(prisma.game.create).toHaveBeenCalledOnce();
    expect(prisma.user.update).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
    expect(result?.ratingUpdates).toHaveProperty('whiteNewRating');
    expect(result?.ratingUpdates).toHaveProperty('blackNewRating');
  });

  it('game with only white userId — no rating update', async () => {
    const result = await svc.saveGame({
      ...BASE_GAME_DATA,
      whiteUserId: 'user-w',
      blackUserId: null,
    });

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('winner white causes white rating to increase', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ rating: 1200, gamesCount: 0 } as never)
      .mockResolvedValueOnce({ rating: 1200, gamesCount: 0 } as never);

    const result = await svc.saveGame({
      ...BASE_GAME_DATA,
      whiteUserId: 'user-w',
      blackUserId: 'user-b',
      winner: 'white',
    });

    expect(result?.ratingUpdates.whiteChange).toBeGreaterThan(0);
    expect(result?.ratingUpdates.blackChange).toBeLessThan(0);
  });

  it('prisma.game.create throws — saveGame returns null without crashing', async () => {
    vi.mocked(prisma.game.create).mockRejectedValue(new Error('DB error'));

    const result = await svc.saveGame({ ...BASE_GAME_DATA });

    expect(result).toBeNull();
  });

  // ─── getGame() ─────────────────────────────────────────────────────────────

  it('getGame calls prisma.game.findUnique with the gameId and player includes', async () => {
    vi.mocked(prisma.game.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'game-abc',
      whitePlayer: { id: 'u1', username: 'alice', rating: 1200 },
      blackPlayer: { id: 'u2', username: 'bob', rating: 1300 },
    } as never);

    const result = await svc.getGame('game-abc');

    expect(prisma.game.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'game-abc' } }),
    );
    expect(result).toHaveProperty('id', 'game-abc');
  });

  // ─── getUserGames() ────────────────────────────────────────────────────────

  it('getUserGames queries by whitePlayerId OR blackPlayerId', async () => {
    vi.mocked(prisma.game.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([] as never);

    await svc.getUserGames('user-1');

    expect(prisma.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ whitePlayerId: 'user-1' }, { blackPlayerId: 'user-1' }],
        },
      }),
    );
  });

  it('getUserGames returns empty array when no games exist', async () => {
    vi.mocked(prisma.game.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([] as never);

    const result = await svc.getUserGames('user-1');

    expect(result).toEqual([]);
  });
});
